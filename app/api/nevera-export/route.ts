import {requireUser,audit} from '@/lib/auth';
import {db,failure,sameOrigin} from '@/lib/server';
import {neveraPayload} from '@/lib/nevera-export';
export async function POST(request:Request){try{
 const user=await requireUser(request);sameOrigin(request);
 const body=await request.json() as {id?:unknown};const id=String(body?.id??'');
 const customer=await db().prepare('SELECT id,customer_code,tax_id,name,credit_limit FROM customers WHERE id=?').bind(id).first<Record<string,any>>();
 if(!customer)throw new Error('Cliente não encontrado.');
 const payload=neveraPayload(customer,`${user.name} (${user.login})`);
 await audit(user,'prepare_nevera','customer',id,`Preparação para Nevera; limite ${payload.limitCents} centavos; referência ${payload.requestId}. Não confirma gravação no Nevera.`);
 return Response.json(payload,{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return failure(e);}}
