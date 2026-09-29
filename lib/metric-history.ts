import {dashboardMetrics} from './dashboard-metrics';
import type {Card} from './board';
export type MetricPoint={at:string;open:number;resolved:number;overdue:number};

// Observações reais, no máximo uma por hora, preservadas na auditoria existente.
// Não reconstruímos saldos passados a partir do estado atual dos títulos.
export async function recordMetricHistory(d:D1Database,cards:Card[],date:string):Promise<MetricPoint[]> {
 const now=new Date().toISOString(),hour=now.slice(0,13),id='dashboard-balance:'+hour;
 const totals=dashboardMetrics(cards,date);
 const point:MetricPoint={at:now,open:totals.open.amount,resolved:totals.resolved.amount,overdue:totals.overdue.amount};
 await d.prepare("INSERT OR IGNORE INTO audit_events(id,user_id,user_name,action,entity_type,entity_id,details,occurred_at) VALUES(?,NULL,'Sistema','snapshot','dashboard_balance',?,?,?)").bind(id,hour,JSON.stringify(point),now).run();
 const rows=await d.prepare("SELECT details FROM audit_events WHERE entity_type='dashboard_balance' AND entity_id>=? ORDER BY entity_id DESC LIMIT 168").bind(new Date(Date.now()-7*86400000).toISOString().slice(0,13)).all<{details:string}>();
 return rows.results.map(row=>JSON.parse(row.details) as MetricPoint).filter(p=>Number.isFinite(Date.parse(p.at))&&[p.open,p.resolved,p.overdue].every(v=>Number.isSafeInteger(v)&&v>=0)).reverse();
}
