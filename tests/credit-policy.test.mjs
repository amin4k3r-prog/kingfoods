import assert from 'node:assert/strict';
import {test} from 'node:test';
import {calculate,initialInput,newWeights,existingWeights} from '../lib/credit-policy.ts';
const context={complete:true,currentLimit:5000,currentTerm:7,exposure:1000,overdue:0,curve:'B',reactivated:false,groupOverdue:false,day:'2026-09-30'};
const base={...initialInput,weekly:10000,order:5000,portfolio:1000000,dailyRevenue:100000,otherGroup:0,pendingOrder:0,requested:8000,spc:700,spcDate:'2026-09-30',points:Object.fromEntries(newWeights.map(([k,,v])=>[k,v])),justification:'Evidências registradas',checks:'Consultas e documentos conferidos',risks:'Riscos e mitigadores registrados',contactValidated:true,contactEvidence:'30/09 10h WhatsApp confirmado',categoryConfirmed:true,groupChecked:true,portfolioChecked:true,conditionsChecked:true};
test('primeiro limite A: teto inicial, não 130 mil',()=>{const r=calculate(base,context);assert.equal(r.ready,true);assert.equal(r.limit,8000);assert.equal(r.term,7);assert.equal(r.authority,'Financeiro');});
test('revenda aplica fator uma única vez e arredonda para baixo',()=>{assert.equal(calculate({...base,segment:'resale'},context).limit,4500)});
test('consumo próprio não recebe crédito mesmo com nota 100',()=>{const r=calculate({...base,segment:'personal'},context);assert.equal(r.limit,0);assert.equal(r.term,0)});
test('faltas não viram zero: pontuação e carteira pendentes',()=>{assert.equal(calculate({...base,points:{},portfolio:null},context).ready,false)});
test('consulta vencida impede conclusão e SPC substitui Serasa',()=>{assert.equal(calculate({...base,spcDate:'2026-01-01'},context).ready,false);assert.equal(calculate({...base,serasa:900,serasaDate:'2026-09-30'},context).source,'Serasa')});
test('concentração de 5% limita a recomendação inteira',()=>{assert.equal(calculate({...base,portfolio:50000},context).limit,2500)});
test('teto menor que 500 resulta em zero sem piso artificial',()=>{assert.equal(calculate({...base,portfolio:9000},context).limit,0)});
test('título vencido do cliente ou grupo bloqueia venda',()=>{assert.equal(calculate(base,{...context,overdue:1}).blocked,true);assert.equal(calculate({...base,groupOverdue:true},context).limit,0)});
test('cliente novo restrito permanece à vista',()=>{assert.equal(calculate({...base,restriction:'small'},context).term,0)});
const existing={...base,kind:'existing',received:260000,peak:50000,months2:6,months4:6,onTime:100,lateEvents:0,maxDelay:0,shortEvents:0,requestedTerm:28,points:Object.fromEntries(existingWeights.map(([k,,v])=>[k,v]))};
test('prazo não salta degraus apesar de elegibilidade para 28',()=>{assert.equal(calculate(existing,context).term,14)});
test('revenda nunca passa de 14 dias',()=>{assert.equal(calculate({...existing,segment:'resale'},{...context,currentTerm:21}).term,14)});
test('histórico conciliado obrigatório para existente',()=>{assert.equal(calculate({...existing,received:0,peak:0},context).ready,false)});
test('mais de 180 dias usa teto de novo',()=>{assert.equal(calculate(base,{...context,reactivated:true}).limit,8000)});
test('documentação adicional só acima do gatilho',()=>{assert.equal(calculate({...base,requested:30000},context).ready,true);assert.equal(calculate({...base,requested:30001},context).ready,false)});
test('validade A e agenda separados, com fim de mês',()=>{const r=calculate(base,context);assert.equal(r.validity,'2027-09-30');assert.equal(r.nextReview,'2027-03-30')});
test('restrição pequena exige revisão em 30 dias',()=>{const r=calculate({...existing,restriction:'small',goodHistory:true},context);assert.equal(r.nextReview,'2026-10-30');assert.ok(r.limit<=context.currentLimit)});

test('segundo atraso reduz a condição anterior, sem dupla redução',()=>{const r=calculate({...existing,lateEvents:2,maxDelay:8,incidentDate:'2026-09-01',settlementDate:'2026-09-03',prePenaltyTerm:21},context);assert.equal(r.term,7);assert.ok(r.limit<=context.currentLimit)});
test('retorno após baixa de 6 a 15 dias mantém à vista por 15 dias',()=>{assert.equal(calculate({...existing,lateEvents:1,maxDelay:8,incidentDate:'2026-09-20',settlementDate:'2026-09-25'},context).term,0)});

import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('fila SQL respeita revisão de 30 dias salva no parecer',()=>{
 const d=new DatabaseSync(':memory:');d.exec('CREATE TABLE customers(id TEXT,risk_class TEXT,portfolio_curve TEXT,created_at TEXT); CREATE TABLE credit_analyses(id TEXT,customer_id TEXT,status TEXT,approved_at TEXT,notes TEXT,started_at TEXT)');
 d.prepare('INSERT INTO customers VALUES(?,?,?,?)').run('c','A','B','2026-09-30T12:00:00Z');
 d.prepare('INSERT INTO credit_analyses VALUES(?,?,?,?,?,?)').run('a','c','approved','2026-09-30T12:00:00Z','KF_POLICY_V6\n'+JSON.stringify({result:{nextReview:'2026-10-30'}}),'2026-09-30T12:00:00Z');
 const sql=readFileSync(new URL('../lib/analysis.ts',import.meta.url),'utf8').match(/export const analysisQueueSql=`([\s\S]*?)`;/)[1];
 assert.equal(d.prepare(sql+' SELECT next_analysis FROM queue').get({'?1':'2026-09-30'}).next_analysis,'2026-10-30');
 d.prepare('UPDATE credit_analyses SET notes=?').run('Análise anterior sem JSON');assert.equal(d.prepare(sql+' SELECT next_analysis FROM queue').get({'?1':'2026-09-30'}).next_analysis,'2027-03-30');d.close();
});
