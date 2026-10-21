export const TITLE_LABEL_COLORS = ['green', 'yellow', 'red'] as const;
export type TitleLabelColor = typeof TITLE_LABEL_COLORS[number];
export type TitleLabel = { text: string; color: TitleLabelColor };
export const TITLE_LABEL_MAX_LENGTH = 120;

// Keep every part of the document (including installment and leading zeros).
// CSV exports may differ only in spaces around the hyphens.
export function titleDocumentKey(document: string): string {
  return document.trim().replace(/\s*-\s*/g, '-');
}

export function validateTitleLabel(text: unknown, color: unknown): TitleLabel {
  if (typeof text !== 'string' || !text.trim() || text.trim().length > TITLE_LABEL_MAX_LENGTH)
    throw new Error(`Digite uma marcação de 1 a ${TITLE_LABEL_MAX_LENGTH} caracteres.`);
  if (!TITLE_LABEL_COLORS.includes(color as TitleLabelColor))
    throw new Error('Escolha verde, amarelo ou vermelho.');
  return { text: text.trim(), color: color as TitleLabelColor };
}
