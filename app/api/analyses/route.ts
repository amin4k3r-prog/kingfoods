import {requireUser, audit} from '@/lib/auth';
import {db,failure,sameOrigin} from '@/lib/server';
import {summary,schedule,analysisQueueSql,analysisSearchSql,type AnalysisCustomer,type AnalysisRecord} from '@/lib/analysis';
import {today} from '@/lib/board';

const outcomes=['manter','aprovar','reduzir','suspender','sem_credito'] as const;
const labels:Record<string,string>={manter:'Condições mantidas',aprovar:'Crédito aprovado',reduzir:'Limite reduzido',suspender:'Prazo suspenso',sem_credito:'Sem crédito'};
export async function GET(request:Request){try{
 await requireUser(request);
 const d=db(),params=new URL(request.url).searchParams,day=today();const requested=params.get('customer_id');
 if(requested){
  const [customer,events,records]=await Promise.all([
   d.prepare('SELECT id,name FROM customers WHERE id=?').bind(requested).first(),
   d.prepare('SELECT * FROM analysis_events WHERE customer_id=? ORDER BY occurred_at DESC,id DESC').bind(requested).all(),
   d.prepare('SELECT * FROM credit_analyses WHERE customer_id=? ORDER BY started_at DESC,id DESC').bind(requested).all()
  ]);
  if(!customer)return Response.json({error:'Cliente não encontrado.'},{status:404});
  return Response.json({events:events.results,analyses:records.results});
 }
 const totals=await d.prepare(`${analysisQueueSql} SELECT COUNT(*) AS totalCustomers,COALESCE(SUM(state='overdue'),0) AS overdue,COALESCE(SUM(next_analysis < ?1),0) AS alerts FROM queue`).bind(day).first<{totalCustomers:number;overdue:number;alerts:number}>();
 if(params.has('summary'))return Response.json({overdue:Number(totals?.alerts??0)},{headers:{'Cache-Control':'private, no-store'}});
 const search=analysisSearchSql(params);
 const count=search.where?await d.prepare(`${analysisQueueSql} SELECT COUNT(*) AS total FROM queue ${search.where}`).bind(day,...search.values).first<{total:number}>():{total:Number(totals?.totalCustomers??0)};
 const total=Number(count?.total??0),pages=Math.max(1,Math.ceil(total/10));
 const page=Math.max(1,Math.min(pages,Math.floor(Number(params.get('page'))||1)));
 const customerRows=await d.prepare(`${analysisQueueSql} SELECT * FROM queue ${search.where} ORDER BY CASE state WHEN 'overdue' THEN 0 WHEN 'awaiting_approval' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'soon' THEN 3 WHEN 'pending_first' THEN 4 WHEN 'unclassified' THEN 5 ELSE 6 END,COALESCE(next_analysis,'9999'),name COLLATE NOCASE,id LIMIT 10 OFFSET ?`).bind(day,...search.values,(page-1)*10).all();
 const profiles=customerRows.results as (AnalysisCustomer&{open_id:string|null;approved_id:string|null})[];
 const recordIds=profiles.flatMap(c=>[c.open_id,c.approved_id]).filter((id):id is string=>!!id);
 const recordRows=recordIds.length?await d.prepare(`SELECT * FROM credit_analyses WHERE id IN (${recordIds.map(()=>'?').join(',')}) ORDER BY started_at DESC,id DESC`).bind(...recordIds).all():{results:[]};
 const records=recordRows.results as AnalysisRecord[];
 const customers=profiles.map(customer=>({...customer,...summary(customer,records.filter(record=>record.customer_id===customer.id),day)}));
 return Response.json({customers,page,pages,total,totalCustomers:Number(totals?.totalCustomers??0),overdue:Number(totals?.overdue??0)},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}

export async function POST(request:Request){try{
    const authUser=await requireUser(request);
 sameOrigin(request);const body=await request.json() as Record<string,unknown>;
 const action=String(body.action??'');const ids=Array.isArray(body.customer_ids)?body.customer_ids:typeof body.customer_id==='string'?[body.customer_id]:[];
 if(!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)throw new Error('Selecione de 1 a 50 clientes diferentes.');
 const responsible=String(body.responsible??'').trim();if(!responsible||responsible.length>120)throw new Error('Informe o responsável pela análise.');
 const actor=`${authUser.name} (${authUser.login})`;
 const d=db();const now=new Date().toISOString();const placeholders=ids.map(()=>'?').join(',');
 const result=await d.prepare(`SELECT id,name,customer_code,tax_id,phone,payer_name,payer_contact,delivery_address,address,city,category,seller_name,risk_class,portfolio_curve,credit_limit,credit_term_days,created_at FROM customers WHERE id IN (${placeholders})`).bind(...ids).all();
 const customers=result.results as AnalysisCustomer[];if(customers.length!==ids.length)throw new Error('Um cadastro não existe mais. Atualize a lista.');
 const byId=new Map(customers.map(c=>[c.id,c]));
 const rows=await d.prepare(`SELECT * FROM credit_analyses WHERE customer_id IN (${placeholders}) ORDER BY started_at DESC,id DESC`).bind(...ids).all();
 const records=new Map<string,AnalysisRecord[]>();for(const row of rows.results as AnalysisRecord[])records.set(row.customer_id,[...(records.get(row.customer_id)??[]),row]);
 const operations:any[]=[];
 const addEvent=(customer:AnalysisCustomer,analysisId:string|null,from:string,to:string,eventType:string,note:string)=>operations.push(d.prepare('INSERT INTO analysis_events(id,customer_id,analysis_id,event_type,from_state,to_state,responsible,note,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),customer.id,analysisId,eventType,from,to,actor,note,now));
 if(action==='set_curve'){
  if(ids.length!==1)throw new Error('Altere a curva de um cliente por vez.');
  const curve=body.curve===null||body.curve===''?null:body.curve;if(curve!==null&&!['A','B','C'].includes(String(curve)))throw new Error('A curva deve ser A, B ou C.');
  const customer=customers[0];const previous=summary(customer,records.get(customer.id)??[]).state;
  operations.push(d.prepare('UPDATE customers SET portfolio_curve=?,updated_at=? WHERE id=?').bind(curve,now,customer.id));
  const next=summary({...customer,portfolio_curve:curve as string|null},records.get(customer.id)??[]).state;
  addEvent(customer,null,previous,next,'curve',`Curva alterada de ${customer.portfolio_curve??'não informada'} para ${curve??'não informada'}.`);
 }else if(action==='start'){
  const batchId=ids.length>1?crypto.randomUUID():null;
  for(const id of ids){const customer=byId.get(id)!;const rule=schedule(customer.risk_class,customer.portfolio_curve);if(!rule)throw new Error(`${customer.name}: informe o rank antes de iniciar.`);
   if(batchId&&rule.mode!=='batch')throw new Error(`${customer.name} exige análise individual.`);
   const list=records.get(id)??[];if(list.some(r=>r.status==='in_progress'||r.status==='awaiting_approval'))throw new Error(`${customer.name} já tem uma análise em andamento.`);
   const analysisId=crypto.randomUUID();operations.push(d.prepare('INSERT INTO credit_analyses(id,customer_id,batch_id,status,mode,started_at,started_by) VALUES(?,?,?,?,?,?,?)').bind(analysisId,id,batchId,'in_progress',rule.mode,now,actor));
   addEvent(customer,analysisId,summary(customer,list).state,'in_progress','started',batchId?'Análise iniciada em lote.':'Análise individual iniciada.');
  }
 }else if(action==='submit'){
  const notes=String(body.notes??'').trim(),outcome=String(body.outcome??'');if(!notes||notes.length>10000)throw new Error('Registre as anotações da análise.');if(!outcomes.includes(outcome as typeof outcomes[number]))throw new Error('Selecione o resultado da análise.');
  const limit=body.proposed_limit===null||body.proposed_limit===undefined||body.proposed_limit===''?null:Number(body.proposed_limit);
  const term=body.proposed_term_days===null||body.proposed_term_days===undefined||body.proposed_term_days===''?null:Number(body.proposed_term_days);
  if(limit!==null&&(!Number.isSafeInteger(limit)||limit<0))throw new Error('Informe um limite válido em centavos.');
  if(term!==null&&(!Number.isInteger(term)||term<0||term>365))throw new Error('Informe um prazo entre 0 e 365 dias.');
  if((outcome==='aprovar'||outcome==='reduzir')&&limit===null)throw new Error('Informe o limite proposto para esta decisão.');
  for(const id of ids){const customer=byId.get(id)!;const open=(records.get(id)??[]).find(r=>r.status==='in_progress');if(!open)throw new Error(`${customer.name} não tem análise iniciada.`);
   if(customer.risk_class==='E'&&(outcome!=='sem_credito'||(limit??0)>0||(term??0)>0))throw new Error(`${customer.name} está na classe E e permanece sem crédito.`);
   operations.push(d.prepare("UPDATE credit_analyses SET status='awaiting_approval',submitted_at=?,submitted_by=?,notes=?,outcome=?,proposed_limit=?,proposed_term_days=? WHERE id=? AND status='in_progress'").bind(now,actor,notes,outcome,limit,term,open.id));
   addEvent(customer,open.id,'in_progress','awaiting_approval','submitted',`${labels[outcome]}. ${notes}`);
  }
 }else if(action==='approve'){
  for(const id of ids){const customer=byId.get(id)!;const list=records.get(id)??[];const open=list.find(r=>r.status==='awaiting_approval');if(!open)throw new Error(`${customer.name} não está aguardando aprovação.`);
   if(customer.risk_class==='E'&&open.outcome!=='sem_credito')throw new Error(`${customer.name} está na classe E e permanece sem crédito.`);
   operations.push(d.prepare("UPDATE credit_analyses SET status='approved',approved_at=?,approved_by=? WHERE id=? AND status='awaiting_approval'").bind(now,actor,open.id));
   let limit=customer.credit_limit,term=customer.credit_term_days;
   if(open.outcome==='sem_credito'){limit=0;term=0;}
   else if(open.outcome==='suspender'){term=0;}
   else if(open.outcome==='aprovar'||open.outcome==='reduzir'){limit=open.proposed_limit??limit;term=open.proposed_term_days??term;}
   if(limit!==customer.credit_limit||term!==customer.credit_term_days)operations.push(d.prepare('UPDATE customers SET credit_limit=?,credit_term_days=?,updated_at=? WHERE id=?').bind(limit,term,now,id));
   const next=summary({...customer,credit_limit:limit,credit_term_days:term},[{...open,status:'approved',approved_at:now},...list.filter(r=>r.id!==open.id)]);
   addEvent(customer,open.id,'awaiting_approval',next.state,'approved',`${labels[open.outcome??'']??'Decisão aprovada'}. Próxima análise: ${next.next_analysis??'não definida'}. ${open.notes}`);
  }
 }else throw new Error('Ação de análise inválida.');
 await d.batch(operations);await audit(authUser,action,'analysis',ids.length===1?String(ids[0]):null,`Clientes: ${ids.join(', ')}; responsável informado: ${responsible}`);return Response.json({ok:true,affected:ids.length});
}catch(e){return failure(e);}}
