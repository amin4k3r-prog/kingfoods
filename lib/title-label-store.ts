import type { Card } from './board';
import { titleDocumentKey, type TitleLabel } from './title-labels';

// Deliberately no foreign key to cards: deletion/import must not erase labels.
// Idempotent initialization also supports existing Git-connected deployments.
export async function ensureTitleLabels(d: D1Database) {
  await d.prepare(`CREATE TABLE IF NOT EXISTS title_labels (
    document TEXT PRIMARY KEY NOT NULL,
    text TEXT NOT NULL,
    color TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
}

export async function withTitleLabels(d: D1Database, cards: Card[]): Promise<Card[]> {
  await ensureTitleLabels(d);
  const rows = await d.prepare('SELECT document,text,color FROM title_labels')
    .all<TitleLabel & { document: string }>();
  const labels = new Map(rows.results.map(({ document, text, color }) => [document, { text, color }]));
  return cards.map(card => ({
    ...card,
    label: card.kind === 'title' && card.document
      ? labels.get(titleDocumentKey(card.document)) ?? null
      : null,
  }));
}
