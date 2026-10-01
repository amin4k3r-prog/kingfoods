import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {initialInput,newWeights} from '../lib/credit-policy.ts';

test('API: rascunho, envio, aprovação, histórico e proteção concorrente',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(`
 CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT,tax_id TEXT,photo_key TEXT,payer_name TEXT,phone TEXT,payer_contact TEXT,delivery_address TEXT,address TEXT,address_confirmed INTEGER,credit_limit INTEGER,credit_term_days INTEGER,portfolio_curve TEXT,last_sale_date TEXT,risk_class TEXT,updated_at TEXT);
 INSERT INTO customers VALUES('c','Cliente teste','123','photo','Pagador','62999999999','pagador@test','Rua A','Rua A',1,0,0,'B',NULL,NULL,'2026-09-30');
 CREATE TABLE cards(customer_id TEXT,kind TEXT,paid INTEGER,archived_at TEXT,amount INTEGER,due TEXT);
 CREATE TABLE credit_analyses(id TEXT PRIMARY KEY,customer_id TEXT,status TEXT,mode TEXT,started_at TEXT,started_by TEXT,notes TEXT,outcome TEXT,proposed_limit INTEGER,proposed_term_days INTEGER,submitted_at TEXT,submitted_by TEXT,approved_at TEXT,approved_by TEXT);
 CREATE TABLE analysis_events(id TEXT PRIMARY KEY,customer_id TEXT,analysis_id TEXT,event_type TEXT,from_state TEXT,to_state TEXT,responsible TEXT,note TEXT,occurred_at TEXT);
 CREATE TABLE audit_events(id TEXT PRIMARY KEY,user_id TEXT,user_name TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details TEXT,occurred_at TEXT);`);
 const d={prepare(query){let args=[];return {bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}}},async batch(ops){sql.exec('BEGIN');try{const results=[];for(const op of ops)results.push(await op.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};
 globalThis.__creditTestDb=d;
 let source=readFileSync(new URL('../app/api/credit-assessment/route.ts',import.meta.url),'utf8');
 source=source.replace("import {requireUser} from '@/lib/auth';","const requireUser=async()=>({id:'u',name:'Tester',login:'tester'});").replace("import {db,failure,sameOrigin} from '@/lib/server';","const db=()=>globalThis.__creditTestDb;const failure=e=>Response.json({error:e.message},{status:400});const sameOrigin=()=>{};").replace("import {today} from '@/lib/board';","const today=()=> '2026-09-30';").replace("'@/lib/credit-policy'",JSON.stringify(new URL('../lib/credit-policy.ts',import.meta.url).href));
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const api=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 const get=async()=>await (await api.GET(new Request('https://test/api?id=c'))).json();
 const input={...initialInput,weekly:10000,order:5000,portfolio:1000000,dailyRevenue:100000,otherGroup:0,pendingOrder:0,requested:8000,spc:700,spcDate:'2026-09-30',points:Object.fromEntries(newWeights.map(([k,,v])=>[k,v])),justification:'Evidências por critério',checks:'Fontes e datas conferidas',risks:'Riscos documentados',contactValidated:true,contactEvidence:'30/09 10h WhatsApp confirmado',categoryConfirmed:true,groupChecked:true,portfolioChecked:true,conditionsChecked:true};
 const post=(body)=>api.POST(new Request('https://test/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'c',input,...body})}));
 const initial=await get();let r=await post({action:'draft',revision:initial.revision});assert.equal(r.status,200,JSON.stringify(await r.json()));
 assert.equal(sql.prepare('SELECT credit_limit FROM customers').get().credit_limit,0);
 r=await post({action:'submit',revision:initial.revision});assert.equal(r.status,400);
 r=await post({action:'submit',revision:(await get()).revision});assert.equal(r.status,200,JSON.stringify(await r.json()));
 const waiting=await get();r=await post({action:'approve',revision:waiting.revision,authority:'Crédito e Cobrança',approver:'Pessoa',evidence:'Ata 01'});assert.equal(r.status,400);
 r=await post({action:'approve',revision:waiting.revision,authority:'Financeiro',approver:'Pessoa do Financeiro',evidence:'Ata 01 de 30/09/2026'});assert.equal(r.status,200,JSON.stringify(await r.json()));
 const customer=sql.prepare('SELECT * FROM customers').get();assert.equal(customer.credit_limit,800000);assert.equal(customer.credit_term_days,7);assert.equal(customer.risk_class,'A');
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM analysis_events WHERE event_type='previous_snapshot'").get().n,2);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n,3);
 // New analysis keeps the approved version and gets a new cycle.
 r=await post({action:'draft',revision:(await get()).revision});assert.equal(r.status,200,JSON.stringify(await r.json()));assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM credit_analyses').get().n,2);
 // Optional input: submitting and recording an empty assessment must not zero credit.
 r=await post({action:'submit',input:initialInput,revision:(await get()).revision});assert.equal(r.status,200,JSON.stringify(await r.json()));
 const partial=await get();r=await post({action:'approve',revision:partial.revision,authority:'Financeiro'});assert.equal(r.status,200,JSON.stringify(await r.json()));
 const preserved=sql.prepare('SELECT credit_limit,credit_term_days,risk_class FROM customers').get();assert.deepEqual({...preserved},{credit_limit:800000,credit_term_days:7,risk_class:'A'});
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM credit_analyses WHERE status='recorded'").get().n,1);
 sql.close();delete globalThis.__creditTestDb;
});
