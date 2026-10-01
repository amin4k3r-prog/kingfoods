import {today} from './board';

export type Risk='A'|'B'|'C'|'D'|'E';
export type Curve='A'|'B'|'C'|null;
export type AnalysisState='unclassified'|'pending_first'|'current'|'soon'|'overdue'|'in_progress'|'awaiting_approval';
export type AnalysisCustomer={id:string;name:string;customer_code:string;risk_class:string|null;portfolio_curve:string|null;credit_limit:number;credit_term_days:number;created_at:string;tax_id:string;phone:string;payer_name:string;payer_contact:string;delivery_address:string;address:string|null;city:string|null;category:string|null;seller_name:string|null};
export type AnalysisRecord={id:string;customer_id:string;batch_id:string|null;status:string;mode:string;started_at:string;started_by:string;submitted_at:string|null;submitted_by:string|null;approved_at:string|null;approved_by:string|null;notes:string;outcome:string|null;proposed_limit:number|null;proposed_term_days:number|null};

export function schedule(rank:string|null,curve:string|null){
 if(!rank||!['A','B','C','D','E'].includes(rank))return null;
 const mode=curve==='A'||!curve?'individual':'batch';
 const months=rank==='A'||rank==='B'?6:rank==='D'||curve==='A'||!curve?1:3;
 return {months,mode:mode as 'individual'|'batch'};
}
export function addMonths(date:string,months:number){
 const [year,month,day]=date.slice(0,10).split('-').map(Number);
 const target=new Date(Date.UTC(year,month-1+months,1));
 const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
 return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
const localDateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
export function localDate(instant:string){return localDateFormatter.format(new Date(instant));}
export function summary(customer:AnalysisCustomer,records:AnalysisRecord[],day=today()){
 const rule=schedule(customer.risk_class,customer.portfolio_curve);
 const open=records.find(r=>r.status==='in_progress'||r.status==='awaiting_approval')??null;
 const last=records.find(r=>r.status==='approved')??null;
 const lastDate=last?.approved_at?localDate(last.approved_at):null;
 const anchor=lastDate??localDate(customer.created_at);
 const nextDue=rule?addMonths(anchor,rule.months):null;
 const daysRemaining=nextDue?Math.round((Date.parse(nextDue+'T12:00:00Z')-Date.parse(day+'T12:00:00Z'))/86400000):null;
 const state:AnalysisState=!rule?'unclassified':open?.status==='awaiting_approval'?'awaiting_approval':open?'in_progress':(daysRemaining??0)<0?'overdue':(daysRemaining??0)<=30?'soon':last?'current':'pending_first';
 return {state,last_analysis:lastDate,next_analysis:nextDue,days_remaining:daysRemaining,mode:rule?.mode??null,period_months:rule?.months??null,open_analysis:open,latest_analysis:last,alert:daysRemaining!==null&&daysRemaining<0,automatic_increase_blocked:false};
}

export function paginateAnalyses<T extends AnalysisCustomer & ReturnType<typeof summary>>(customers:T[],params:URLSearchParams){
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
 const query=normalize((params.get('q')??'').slice(0,200)),filter=params.get('state')??'all';
 const digits=query.replace(/\D/g,'');
 const priority:Record<string,number>={overdue:0,awaiting_approval:1,in_progress:2,soon:3,pending_first:4,unclassified:5,current:6};
 const filtered=customers.filter(item=>(filter==='all'||item.state===filter)&&(!query||normalize(`${item.name} ${item.customer_code} ${item.tax_id} ${item.risk_class??''}`).includes(query)||(/^[\d\s./-]+$/.test(query)&&!!digits&&item.tax_id.replace(/\D/g,'').includes(digits))));
 filtered.sort((a,b)=>(priority[a.state]??9)-(priority[b.state]??9)||(a.next_analysis??'9999').localeCompare(b.next_analysis??'9999')||a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(filtered.length/10));
 const requested=Number(params.get('page'))||1;
 const page=Math.max(1,Math.min(pages,Math.floor(requested)));
 return {customers:filtered.slice((page-1)*10,page*10),page,pages,total:filtered.length,totalCustomers:customers.length,overdue:customers.filter(item=>item.state==='overdue').length};
}

// Compute the queue in D1. Only the requested ten customers reach the Worker.
// Calendar arithmetic clamps month ends, matching addMonths (not SQLite's rollover).
export const analysisQueueSql=`WITH
 ranked AS (
  SELECT id,customer_id,status,approved_at,notes,
   ROW_NUMBER() OVER (PARTITION BY customer_id,CASE WHEN status='approved' THEN 'approved' ELSE 'open' END ORDER BY started_at DESC,id DESC) AS rn
  FROM credit_analyses WHERE status IN ('approved','in_progress','awaiting_approval')
 ), anchors AS (
  SELECT c.*,o.id AS open_id,o.status AS open_status,a.id AS approved_id,a.notes AS approved_notes,
   date(COALESCE(a.approved_at,c.created_at),'-3 hours') AS anchor,
   CASE WHEN c.risk_class IN ('A','B') THEN 6 WHEN c.risk_class='D' OR c.portfolio_curve='A' OR c.portfolio_curve IS NULL OR c.portfolio_curve='' THEN 1 ELSE 3 END AS months
  FROM customers c LEFT JOIN ranked o ON o.customer_id=c.id AND o.rn=1 AND o.status IN ('in_progress','awaiting_approval')
   LEFT JOIN ranked a ON a.customer_id=c.id AND a.rn=1 AND a.status='approved'
 ), due AS (
  SELECT *,CASE WHEN risk_class IN ('A','B','C','D','E') THEN
   date(anchor,'start of month','+'||months||' months','+'||(min(CAST(strftime('%d',anchor) AS INTEGER),CAST(strftime('%d',date(anchor,'start of month','+'||(months+1)||' months','-1 day')) AS INTEGER))-1)||' days')
   ELSE NULL END AS next_analysis FROM anchors
 ), queue AS (
  SELECT *,CASE WHEN next_analysis IS NULL THEN 'unclassified'
   WHEN open_status='awaiting_approval' THEN 'awaiting_approval' WHEN open_id IS NOT NULL THEN 'in_progress'
   WHEN next_analysis < ?1 THEN 'overdue' WHEN next_analysis <= date(?1,'+30 days') THEN 'soon'
   WHEN approved_id IS NOT NULL THEN 'current' ELSE 'pending_first' END AS state FROM due
 )`;

export function analysisSearchSql(params:URLSearchParams){
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
 const query=normalize((params.get('q')??'').slice(0,200));
 let expression="coalesce(name,'')||' '||coalesce(customer_code,'')||' '||coalesce(tax_id,'')||' '||coalesce(risk_class,'')";
 for(const [chars,replacement] of [['áàâãäÁÀÂÃÄ','a'],['éèêëÉÈÊË','e'],['íìîïÍÌÎÏ','i'],['óòôõöÓÒÔÕÖ','o'],['úùûüÚÙÛÜ','u'],['çÇ','c']])for(const char of chars)expression=`replace(${expression},'${char}','${replacement}')`;
 const clauses:string[]=[],values:string[]=[];
 if(query){const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';const digits=query.replace(/\D/g,'');clauses.push(`(lower(${expression}) LIKE ? ESCAPE '\\'${/^[\d\s./-]+$/.test(query)&&digits?" OR replace(replace(replace(tax_id,'.',''),'-',''),'/','') LIKE ?":''})`);values.push(pattern);if(/^[\d\s./-]+$/.test(query)&&digits)values.push('%'+digits+'%');}
 const state=params.get('state')??'all';if(state!=='all'){clauses.push('state=?');values.push(state);}
 return {where:clauses.length?'WHERE '+clauses.join(' AND '):'',values};
}
