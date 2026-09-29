import type {Card} from './board';

export function dashboardMetrics(cards: Card[], date: string) {
  const result = {open:{amount:0,count:0},resolved:{amount:0,count:0},overdue:{amount:0,count:0}};
  for (const card of cards) {
    if (card.kind !== 'title' || card.archived_at) continue;
    const group = card.paid ? result.resolved : card.due < date ? result.overdue : result.open;
    group.amount += card.amount;
    group.count++;
  }
  return result;
}
