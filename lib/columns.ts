export const DEFAULT_DAYS = [1, 2, 3, 4, 5, 10, 15, 45, 60, 90];
export function columnDays(saved: number[]) {
  return [...new Set([...DEFAULT_DAYS, ...saved.filter(day => Number.isInteger(day) && day > 0 && day <= 3650)])].sort((a, b) => a - b);
}
export function collectionStage(daysLate: number, riskClass?: string | null) {
  const higherRisk = /(?:^|\s)[CDE]$/i.test((riskClass ?? "").trim());
  if (daysLate === -2) return "reminder";
  if (daysLate <= 0) return "upcoming";
  if (daysLate < 5) return "first";
  if (daysLate < (higherRisk ? 10 : 15)) return "negotiation";
  if (higherRisk) return daysLate < 60 ? "registry" : "legal";
  if (daysLate < 45) return "registry";
  return daysLate < 90 ? "negative" : "legal";
}
export function inDayColumn(late: number, day: number, nextDay?: number) {
  return late >= day && (nextDay === undefined || late < nextDay);
}
