import {requireUser, audit} from '@/lib/auth';
import {db,failure,sameOrigin} from '@/lib/server';
import {summary,schedule,analysisQueueSql,analysisSearchSql,type AnalysisCustomer,type AnalysisRecord} from '@/lib/analysis';
import {today} from '@/lib/board';



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
 const action=String(body.action??'');if(action==='submit'||action==='approve')throw new Error('Use o novo cálculo de Rank e limite no cartão individual do cliente.');const ids=Array.isArray(body.customer_ids)?body.customer_ids:typeof body.customer_id==='string'?[body.customer_id]:[];
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
 }else throw new Error('Ação de análise inválida.');
 await d.batch(operations);await audit(authUser,action,'analysis',ids.length===1?String(ids[0]):null,`Clientes: ${ids.join(', ')}; responsável informado: ${responsible}`);return Response.json({ok:true,affected:ids.length});
}catch(e){return failure(e);}}
