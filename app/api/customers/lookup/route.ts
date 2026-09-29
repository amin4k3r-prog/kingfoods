import {requireUser} from '@/lib/auth';
import {db,failure,sameOrigin} from '@/lib/server';
import {normalizeCustomerName} from '@/lib/policy';

// Normalização no banco: busca somente os candidatos do CSV, não a carteira inteira.
function normalizedNameSql() {
 let expression='name';
 const groups=[['áàâãäÁÀÂÃÄ','a'],['éèêëÉÈÊË','e'],['íìîïÍÌÎÏ','i'],['óòôõöÓÒÔÕÖ','o'],['úùûüÚÙÛÜ','u'],['çÇ','c']];
 for(const [chars,replacement] of groups)for(const char of chars)expression=`replace(${expression},'${char}','${replacement}')`;
 expression=`lower(${expression})`;
 for(const char of ['.',',','-','–','/','&','(',')',':',';','_'])expression=`replace(${expression},'${char}',' ')`;
 for(let i=0;i<8;i++)expression=`replace(${expression},'  ',' ')`;
 return `trim(${expression})`;
}
export async function POST(request:Request) {
 try {
  await requireUser(request);sameOrigin(request);
  const body=await request.json() as {scan?:boolean;cursor?:string;rows?:{customer_code?:string;customer_names?:string[]}[]};
  if(!Array.isArray(body.rows)||body.rows.length>(body.scan?5000:20))throw new Error('Quantidade de títulos excedida.');
  const codes=new Set<string>(),names=new Set<string>();
  for(const row of body.rows){
   if(typeof row.customer_code==='string'&&row.customer_code.trim().length<=80&&row.customer_code.trim())codes.add(row.customer_code.trim());
   if(Array.isArray(row.customer_names))for(const name of row.customer_names.slice(0,2))if(typeof name==='string'&&name.length<=200&&normalizeCustomerName(name))names.add(normalizeCustomerName(name));
  }
  if(body.scan){
   if(body.cursor!==undefined&&(typeof body.cursor!=='string'||body.cursor.length>200))throw new Error('Cursor inválido.');
   // Percorre a base por chave, em lotes pequenos. Não depende da página da carteira
   // e usa exatamente a mesma normalização da prévia, inclusive prefixos e pontuação.
   const result=await db().prepare('SELECT id,name,customer_code,tax_id FROM customers WHERE id > ? ORDER BY id LIMIT 250').bind(body.cursor??'').all();
   const profiles=result.results as {id:string;name:string;customer_code:string|null;tax_id:string}[];
   const customers=profiles.filter(customer=>codes.has(String(customer.customer_code??'').trim())||names.has(normalizeCustomerName(customer.name)));
   return Response.json({customers,scanned:profiles.length,nextCursor:profiles.length===250?profiles[profiles.length-1].id:null},{headers:{'Cache-Control':'private, no-store'}});
  }
  const conditions:string[]=[],values:string[]=[];
  if(codes.size){conditions.push(`customer_code IN (${[...codes].map(()=>'?').join(',')})`);values.push(...codes);}
  if(names.size){conditions.push(`${normalizedNameSql()} IN (${[...names].map(()=>'?').join(',')})`);values.push(...names);}
  if(!conditions.length)return Response.json({customers:[]});
  const result=await db().prepare(`SELECT id,name,customer_code,tax_id FROM customers WHERE ${conditions.join(' OR ')} LIMIT 1001`).bind(...values).all();
  if(result.results.length>1000)throw new Error('Muitos clientes com nomes semelhantes. Informe os códigos no CSV.');
  return Response.json({customers:result.results},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return failure(e);}
}
