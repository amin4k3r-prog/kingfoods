import { requireUser } from '@/lib/auth';
import { db, failure, sameOrigin } from '@/lib/server';
import { ensureTitleLabels } from '@/lib/title-label-store';
import { titleDocumentKey, validateTitleLabel } from '@/lib/title-labels';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    sameOrigin(request);
    const body = await request.json() as Record<string, unknown>;
    if (!body || !['save', 'remove'].includes(String(body.action)) ||
        typeof body.id !== 'string' || !body.id ||
        typeof body.document !== 'string' || !body.document.trim() || body.document.length > 200)
      throw new Error('Selecione um título válido.');
    const label = body.action === 'save' ? validateTitleLabel(body.text, body.color) : null;
    const d = db();
    const card = await d.prepare('SELECT document,kind FROM cards WHERE id=?')
      .bind(body.id).first<{ document: string | null; kind: string }>();
    if (!card || card.kind !== 'title' || !card.document)
      throw new Error('Este título não está mais disponível. Atualize o quadro.');
    const document = titleDocumentKey(card.document);
    if (document !== titleDocumentKey(body.document))
      throw new Error('O número deste título foi alterado. Atualize o quadro antes de marcar.');
    await ensureTitleLabels(d);
    const now = new Date().toISOString();
    // Save the label and its audit entry together. Only this explicit remove
    // action deletes labels; title deletion and CSV synchronization never do.
    await d.batch([
      label
        ? d.prepare(`INSERT INTO title_labels(document,text,color,updated_at) VALUES(?,?,?,?)
            ON CONFLICT(document) DO UPDATE SET text=excluded.text,color=excluded.color,updated_at=excluded.updated_at`)
          .bind(document, label.text, label.color, now)
        : d.prepare('DELETE FROM title_labels WHERE document=?').bind(document),
      d.prepare(`INSERT INTO audit_events(id,user_id,user_name,action,entity_type,entity_id,details,occurred_at)
        VALUES(?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), user.id, user.name,
        label ? 'save_title_label' : 'remove_title_label', 'title_label', document,
        label ? JSON.stringify(label) : 'Marcação removida', now),
    ]);
    return Response.json({ document, label });
  } catch (error) {
    return failure(error);
  }
}
