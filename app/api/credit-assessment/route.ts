import {requireUser} from '@/lib/auth';
import {db,failure,sameOrigin} from '@/lib/server';
import {today} from '@/lib/board';
import type {AnalysisRecord} from '@/lib/analysis';
import {calculate,initialInput,MODEL,marker,unpack,displayNotes,type Input,type Context} from '@/lib/credit-policy';
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function data(id:string){
 const d=db(),customer=await d.prepare('SELECT * FROM customers WHERE id=?').bind(id).first<Record<string,any>>();if(!customer)throw new Error('Cliente não encontrado.');
 const requirements:[string,boolean][]=[['Código do cliente',!!String(customer.customer_code??'').trim()],['Nome do titular',!!String(customer.name??'').trim()],['CPF/CNPJ',!!String(customer.tax_id??'').trim()],['Responsável pelo pagamento',!!String(customer.payer_name??'').trim()],['Telefone',!!String(customer.phone??'').trim()],['WhatsApp ou e-mail',!!String(customer.payer_contact??'').trim()],['Endereço de entrega',!!String(customer.delivery_address??'').trim()],['Endereço confirmado',customer.address_confirmed===1],['Foto da fachada/local',!!String(customer.photo_key??'').trim()]];
 const missingRegistration=requirements.filter(([,present])=>!present).map(([label])=>label);
 const context:Context={day:today(),customerId:id,registrationComplete:missingRegistration.length===0,missingRegistration};
 const result=await d.prepare('SELECT * FROM credit_analyses WHERE customer_id=? ORDER BY started_at DESC,id DESC LIMIT 30').bind(id).all<AnalysisRecord>();
 const records=result.results.map(row=>({...row,payload:unpack(String(row.notes)),report:displayNotes(String(row.notes))}));
 const revision=await hash(JSON.stringify({customerUpdated:customer.updated_at,latest:records[0]??null}));
 return {customer,context,records,revision};
}
export async function GET(request:Request){try{await requireUser(request);return Response.json(await data(new URL(request.url).searchParams.get('id')??''),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const user=await requireUser(request);sameOrigin(request);const text=await request.text();if(text.length>1_200_000)throw new Error('Relatórios muito extensos. Reduza o arquivo para até 5.000 linhas.');
 const body=JSON.parse(text),id=String(body.id??''),current=await data(id),d=db(),now=new Date().toISOString(),actor=`${user.name} (${user.login})`;
 if(!['save','apply'].includes(body.action))throw new Error('Ação inválida para o novo modelo de crédito.');
 if(body.revision!==current.revision)throw new Error('O cadastro ou a análise mudou. Reabra a tela para carregar os dados atuais.');
 const input:Input={...initialInput,...body.input};const result=calculate(input,current.context);
 if(body.action==='apply'&&result.rank===null&&result.limit.value===null)throw new Error('Não há Rank ou limite calculado para atualizar. Você pode salvar o rascunho.');
 const applied=body.action==='apply',status=applied?(result.rankReady?'approved':'recorded'):'in_progress';
 const money=(v:number|null)=>v===null?'não calculado':(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const report=[`Modelo ${MODEL} · ${now} · ${actor}`,`Tipo: ${input.kind==='new'?'Cliente Novo':input.kind==='history'?'Cliente com Histórico / Reanálise':'não selecionado'}`,...result.criteria.map(r=>`${r.label}: ${r.points??'não informado'} pontos`),`Total: ${result.totalScore??'parcial ('+result.subtotal+')'}; Rank: ${result.rank??'não calculado'} ${result.rankLabel??''}.`, `Pontualidade: ${result.punctuality.onTime} no prazo / ${result.punctuality.analyzed} analisados; ${result.punctuality.late} atrasados.`,`Compras únicas de ${result.limit.start} a ${result.limit.end}: ${result.limit.count}.`,`Total comprado (somente Valor Parcela): ${money(result.limit.total)}; média por compra: ${money(result.limit.average)}.`,`Máximo de compras em aberto: ${input.maxOpenPurchases??'não informado'}; limite sugerido: ${money(result.limit.value)}.`,`Limite independente do Rank e das consultas externas. Nenhuma fórmula ou teto anterior aplicado.`,`Arquivo de compras: ${input.purchases?.fileName??'não importado'}; títulos pagos: ${input.paid?.fileName??'não importado'}.`,applied?'Resultados calculados aplicados ao cadastro. Campos sem resultado preservados.':'Rascunho; cadastro não alterado.'].join('\n');
 const notes=marker+JSON.stringify({model:MODEL,savedAt:now,input,result,report,context:current.context});
 if(new TextEncoder().encode(notes).length>1_500_000)throw new Error('O histórico importado ficou muito extenso. Use relatórios menores para esta análise.');
 const open=current.records.find(r=>['in_progress','awaiting_approval'].includes(r.status)),analysisId=open?.id??crypto.randomUUID();
 const ops:any[]=[];
 ops.push(d.prepare('INSERT INTO analysis_events(id,customer_id,analysis_id,event_type,from_state,to_state,responsible,note,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)').bind('credit-v2:'+id+':'+current.revision,id,open?.id??null,'version_guard',open?.status??null,status,actor,'Gravação da versão atual.',now));
 if(open){
  ops.push(d.prepare('INSERT INTO analysis_events(id,customer_id,analysis_id,event_type,from_state,to_state,responsible,note,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,analysisId,'previous_snapshot',open.status,open.status,actor,open.notes,now));
  ops.push(d.prepare('UPDATE credit_analyses SET status=?,notes=?,outcome=?,proposed_limit=?,proposed_term_days=NULL,submitted_at=?,submitted_by=?,approved_at=?,approved_by=? WHERE id=?').bind(status,notes,result.limit.value===null?'manter':'aprovar',result.limit.value,applied?now:null,applied?actor:null,applied?now:null,applied?actor:null,analysisId));
 }else ops.push(d.prepare('INSERT INTO credit_analyses(id,customer_id,status,mode,started_at,started_by,notes,outcome,proposed_limit,proposed_term_days,approved_at,approved_by) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?)').bind(analysisId,id,status,'individual',now,actor,notes,result.limit.value===null?'manter':'aprovar',result.limit.value,applied?now:null,applied?actor:null));
 if(applied)ops.push(d.prepare('UPDATE customers SET risk_class=COALESCE(?,risk_class),credit_limit=COALESCE(?,credit_limit),updated_at=? WHERE id=?').bind(result.rank,result.limit.value,now,id));
 ops.push(d.prepare('INSERT INTO analysis_events(id,customer_id,analysis_id,event_type,from_state,to_state,responsible,note,occurred_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,analysisId,'credit_v2_'+body.action,open?.status??null,status,actor,report,now));
 ops.push(d.prepare('INSERT INTO audit_events(id,user_id,user_name,action,entity_type,entity_id,details,occurred_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,user.name,'credit_v2_'+body.action,'analysis',id,report.slice(0,3000),now));
 await d.batch(ops);return Response.json({ok:true,result});
}catch(e){return failure(e);}}
