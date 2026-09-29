import {requireUser, audit} from '@/lib/auth';
import { DEFAULT_DAYS } from "@/lib/columns";
import { db, failure, sameOrigin, bucket } from "@/lib/server";
export async function GET(request:Request) {
  try {
    await requireUser(request);
    const d = db();
    const [c, f, u, columns] = await Promise.all([
      d
        .prepare("SELECT * FROM cards ORDER BY position ASC, created DESC")
        .all(),
      d.prepare("SELECT * FROM files").all(),
      d
        .prepare(
          "SELECT id,tax_id,name,payer_name,phone,payer_contact,delivery_address,address_confirmed,risk_class,portfolio_curve,customer_code,seller_name,last_sale_date,address,city,category,credit_limit,credit_term_days,created_at,updated_at,photo_key FROM customers WHERE id IN (SELECT DISTINCT customer_id FROM cards WHERE customer_id IS NOT NULL) ORDER BY name COLLATE NOCASE",
        )
        .all(),
      d.prepare('SELECT day FROM "columns" ORDER BY day').all(),
    ]);
    const customers = (u.results as any[]).map(
      ({ photo_key, ...customer }) => ({
        ...customer,
        photo_url: photo_key
          ? "/api/customer-photo?id=" + encodeURIComponent(photo_key)
          : null,
      }),
    );
    return Response.json({ cards: c.results, files: f.results, customers, columns: columns.results.map((row: any) => row.day) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: Request) {
  try {
    const authUser=await requireUser(r);
    sameOrigin(r);
    const b = (await r.json()) as any;
    const d = db();
    if (b.action === "add_column") {
      if (!Number.isInteger(b.day) || b.day < 1 || b.day > 3650)
        throw new Error("Informe um número inteiro entre 1 e 3.650 dias.");
      if (DEFAULT_DAYS.includes(b.day)) throw new Error("Essa coluna já existe.");
      const result = await d.prepare('INSERT INTO "columns" (day) VALUES (?) ON CONFLICT(day) DO NOTHING').bind(b.day).run();
      if (!result.meta.changes) throw new Error("Essa coluna já existe.");
      return Response.json({ ok: true, day: b.day });
    }
    if (b.action === "save") {
      const c = b.card;
      if (
        !c ||
        typeof c.title !== "string" ||
        !c.title.trim() ||
        c.title.length > 200 ||
        typeof c.notes !== "string" ||
        c.notes.length > 20000 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(c.due) ||
        isNaN(Date.parse(c.due)) ||
        new Date(c.due).toISOString().slice(0, 10) !== c.due ||
        !Number.isSafeInteger(c.amount) ||
        c.amount < 0 ||
        !["title", "task"].includes(c.kind) ||
        (c.kind === "title" &&
          (!String(c.document ?? "").trim() ||
            String(c.document).length > 200)) ||
        (c.kind === "title" && !c.customer_id) ||
        (c.kind === "task" &&
          c.document !== undefined &&
          c.document !== null &&
          String(c.document).trim() !== "") ||
        (c.customer_id !== undefined &&
          c.customer_id !== null &&
          typeof c.customer_id !== "string")
      )
        throw new Error("Confira o título, a data e o valor.");
      if (c.document && c.kind === "title") {
        const duplicate = await d
          .prepare("SELECT id FROM cards WHERE document=? AND id<>?")
          .bind(String(c.document).trim(), c.id ?? "")
          .first();
        if (duplicate)
          throw new Error("Este número de título já está cadastrado.");
      }
      if (c.customer_id) {
        const customer = await d
          .prepare("SELECT id FROM customers WHERE id=?")
          .bind(c.customer_id)
          .first();
        if (!customer)
          throw new Error(
            "O cliente selecionado não existe mais. Atualize a carteira.",
          );
      }
      const wasExisting=Boolean(c.id);
      if (c.id) {
        await d
          .prepare(
            "UPDATE cards SET manual_lane=CASE WHEN due<>? THEN NULL ELSE manual_lane END, manual_date=CASE WHEN due<>? THEN NULL ELSE manual_date END,title=?,notes=?,due=?,amount=?,kind=?,document=?,customer_id=? WHERE id=?",
          )
          .bind(
            c.due,
            c.due,
            c.title.trim(),
            c.notes,
            c.due,
            c.amount,
            c.kind,
            c.kind === "title" ? String(c.document).trim() : null,
            c.kind === "title" ? (c.customer_id ?? null) : null,
            c.id,
          )
          .run();
      } else {
        c.id = crypto.randomUUID();
        await d
          .prepare(
            "INSERT INTO cards(id,title,notes,due,amount,kind,paid,created,customer_id,document) VALUES (?,?,?,?,?,?,0,?,?,?)",
          )
          .bind(
            c.id,
            c.title.trim(),
            c.notes,
            c.due,
            c.amount,
            c.kind,
            new Date().toISOString(),
            c.kind === "title" ? (c.customer_id ?? null) : null,
            c.kind === "title" ? String(c.document).trim() : null,
          )
          .run();
      }
      await audit(authUser,wasExisting?'edit_card':'create_card','card',c.id,c.title);return Response.json({ id: c.id });
    } else if (b.action === "paid") {
      if (![0, 1].includes(b.paid)) throw new Error("Status inválido");
      const title = (await d
        .prepare("SELECT kind FROM cards WHERE id=?")
        .bind(b.id)
        .first()) as any;
      if (title?.kind === "title") {
        const eventType = b.paid ? "payment_confirmed" : "reopened";
        await d.batch([
          d.prepare("UPDATE cards SET paid=? WHERE id=?").bind(b.paid, b.id),
          d
            .prepare(
              "INSERT INTO title_events(id,card_id,event_type,stage,note,created_at) VALUES (?,?,?,?,?,?)",
            )
            .bind(
              crypto.randomUUID(),
              b.id,
              eventType,
              "task",
              b.paid
                ? "Pagamento marcado no site; confirmar a baixa no Financeiro."
                : "Título reaberto manualmente.",
              new Date().toISOString(),
            ),
        ]);
      } else
        await d
          .prepare("UPDATE cards SET paid=? WHERE id=?")
          .bind(b.paid, b.id)
          .run();
    } else if (b.action === "delete") {
      const f = await d
        .prepare("SELECT id FROM files WHERE card_id=?")
        .bind(b.id)
        .all();
      for (const x of f.results) await bucket().delete(String(x.id));
      await d.batch([
        d.prepare("DELETE FROM files WHERE card_id=?").bind(b.id),
        d.prepare("DELETE FROM cards WHERE id=?").bind(b.id),
      ]);
    } else if (b.action === "delete_all_titles") {
      const f = await d
          .prepare(
            "SELECT files.id FROM files JOIN cards ON cards.id=files.card_id WHERE cards.kind='title'",
          )
          .all(),
        fileIds = (f.results as any[]).map((x) => String(x.id));
      for (let i = 0; i < fileIds.length; i += 1000)
        await bucket().delete(fileIds.slice(i, i + 1000));
      const count = (await d
        .prepare("SELECT COUNT(*) AS total FROM cards WHERE kind='title'")
        .first()) as any;
      await d.batch([
        d.prepare(
          "DELETE FROM files WHERE card_id IN (SELECT id FROM cards WHERE kind='title')",
        ),
        d.prepare(
          "DELETE FROM title_events WHERE card_id IN (SELECT id FROM cards WHERE kind='title')",
        ),
        d.prepare("DELETE FROM cards WHERE kind='title'"),
      ]);
      await audit(authUser,'delete_all_titles','card',null,`Quantidade: ${count?.total??0}`);return Response.json({ ok: true, deleted: Number(count?.total ?? 0) });
    } else throw new Error("Ação inválida");
    await audit(authUser,String(b.action),'card',String(b.id??''),String(b.action));
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
