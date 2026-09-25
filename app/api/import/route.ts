import {requireUser, audit as recordAudit} from '@/lib/auth';
import { db, failure, sameOrigin, bucket } from "@/lib/server";

function validDue(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export async function POST(request: Request) {
  try {
    const authUser=await requireUser(request);
    sameOrigin(request);
    const body = (await request.json()) as any;
    const sourceRows = body.rows,
      presentRaw = body.presentDocuments;
    if (
      !Array.isArray(sourceRows) ||
      sourceRows.length > 5000 ||
      !Array.isArray(presentRaw) ||
      presentRaw.length > 20000
    )
      throw new Error("O relatório precisa conter até 5.000 títulos válidos.");
    const documents = new Set<string>();
    for (const document of presentRaw) {
      if (
        typeof document !== "string" ||
        !document.trim() ||
        document.length > 200
      )
        continue;
      documents.add(document.trim());
    }
    const rows: any[] = [],
      seen = new Set<string>();
    for (const row of sourceRows) {
      if (
        !row ||
        typeof row.document !== "string" ||
        !row.document.trim() ||
        row.document.length > 200 ||
        typeof row.customer !== "string" ||
        !row.customer.trim() ||
        row.customer.length > 200 ||
        !validDue(row.due) ||
        !Number.isSafeInteger(row.amount) ||
        row.amount <= 0 ||
        typeof row.balance_display !== "string" ||
        row.balance_display.length > 80 ||
        typeof row.charge_type !== "string" ||
        row.charge_type.length > 200 ||
        typeof row.seller !== "string" ||
        row.seller.length > 200 ||
        (row.customer_id !== null &&
          row.customer_id !== undefined &&
          typeof row.customer_id !== "string")
      )
        throw new Error(
          "A prévia contém títulos inválidos. Selecione novamente o CSV e confira os dados.",
        );
      const document = row.document.trim();
      if (seen.has(document)) continue;
      seen.add(document);
      documents.add(document);
      rows.push({ ...row, customer_id: row.customer_id || null, document });
    }
    const d = db();
    const [allCustomers, existing] = await Promise.all([
      d.prepare("SELECT id FROM customers").all(),
      d
        .prepare(
          "SELECT id,document,due,amount,paid,archived_at FROM cards WHERE kind='title' AND document IS NOT NULL",
        )
        .all(),
    ]);
    const customerIds = new Set(
      (allCustomers.results as any[]).map((c) => String(c.id)),
    );
    for (const row of rows)
      if (row.customer_id && !customerIds.has(row.customer_id))
        throw new Error(
          "Um cliente selecionado não existe mais. Atualize a prévia e tente novamente.",
        );
    const oldByDocument = new Map<string, any>(
      (existing.results as any[]).map((c) => [String(c.document), c]),
    );
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 40) {
      const batch = rows.slice(i, i + 40).map((row) =>
        d
          .prepare(
            `INSERT INTO cards(id,title,notes,due,amount,kind,paid,created,document,customer,charge_type,seller,balance_display,customer_id,archived_at,policy_stage)
 VALUES(?,?,'',?,?,'title',0,?,?,?,?,?,?,?,NULL,NULL)
 ON CONFLICT(document) DO UPDATE SET title=excluded.title,due=excluded.due,amount=excluded.amount,kind='title',paid=0,customer=excluded.customer,charge_type=excluded.charge_type,seller=excluded.seller,balance_display=excluded.balance_display,customer_id=COALESCE(cards.customer_id,excluded.customer_id),archived_at=NULL`,
          )
          .bind(
            crypto.randomUUID(),
            row.document,
            row.due,
            row.amount,
            now,
            row.document,
            row.customer,
            row.charge_type,
            row.seller,
            row.balance_display,
            row.customer_id,
          ),
      );
      await d.batch(batch);
    }
    const audit: any[] = [];
    for (const row of rows) {
      const previous = oldByDocument.get(row.document);
      if (previous && previous.archived_at)
        audit.push(
          d
            .prepare(
              "INSERT INTO title_events(id,card_id,event_type,stage,note,created_at) SELECT ?,id,?,?,?,? FROM cards WHERE document=?",
            )
            .bind(
              crypto.randomUUID(),
              "report_restored",
              "import",
              `Título ${row.document} retornou à carteira ativa pelo relatório.`,
              now,
              row.document,
            ),
        );
      else if (
        previous &&
        (previous.due !== row.due || Number(previous.amount) !== row.amount)
      )
        audit.push(
          d
            .prepare(
              "INSERT INTO title_events(id,card_id,event_type,stage,note,created_at) SELECT ?,id,?,?,?,? FROM cards WHERE document=?",
            )
            .bind(
              crypto.randomUUID(),
              "report_updated",
              "import",
              `Dados atualizados pelo relatório: vencimento ${row.due} e saldo ${row.balance_display}.`,
              now,
              row.document,
            ),
        );
    }
    const removed = (existing.results as any[]).filter(
      (c) =>
        !c.archived_at &&
        !c.paid &&
        c.document &&
        !documents.has(String(c.document)),
    );
    const removedIds = removed.map((c) => String(c.id));
    if (removedIds.length) {
      for (let i = 0; i < removedIds.length; i += 80) {
        const ids = removedIds.slice(i, i + 80),
          marks = ids.map(() => "?").join(","),
          fileRows = await d
            .prepare(`SELECT id FROM files WHERE card_id IN (${marks})`)
            .bind(...ids)
            .all(),
          fileIds = (fileRows.results as any[]).map((file) => String(file.id));
        for (let j = 0; j < fileIds.length; j += 1000)
          await bucket().delete(fileIds.slice(j, j + 1000));
        await d.batch([
          d
            .prepare(`DELETE FROM files WHERE card_id IN (${marks})`)
            .bind(...ids),
          d
            .prepare(`DELETE FROM title_events WHERE card_id IN (${marks})`)
            .bind(...ids),
          d.prepare(`DELETE FROM cards WHERE id IN (${marks})`).bind(...ids),
        ]);
      }
    }
    for (let i = 0; i < audit.length; i += 50)
      await d.batch(audit.slice(i, i + 50));
    const created = rows.filter(
      (row) => !oldByDocument.has(row.document),
    ).length;
    await recordAudit(authUser,'import_titles','card',null,`Criados: ${created}; atualizados: ${rows.length-created}; excluídos: ${removed.length}`);
    return Response.json({
      created,
      updated: rows.length - created,
      removed: removed.length,
    });
  } catch (e) {
    return failure(e);
  }
}
