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
  const body=await request.json() as {rows?:{customer_code?:string;customer_names?:string[]}[]};
  if(!Array.isArray(body.rows)||body.rows.length>20)throw new Error('Consulte até 20 títulos por lote.');
  const codes=new Set<string>(),names=new Set<string>();
  for(const row of body.rows){
   if(typeof row.customer_code==='string'&&row.customer_code.trim().length<=80&&row.customer_code.trim())codes.add(row.customer_code.trim());
   if(Array.isArray(row.customer_names))for(const name of row.customer_names.slice(0,2))if(typeof name==='string'&&name.length<=200&&normalizeCustomerName(name))names.add(normalizeCustomerName(name));
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