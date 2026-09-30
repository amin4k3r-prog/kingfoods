import {requireUser} from '@/lib/auth';
import {db,failure} from '@/lib/server';

export async function GET(request:Request){
 try{
  await requireUser(request);
  const result=await db().prepare(`SELECT t.id,t.document,t.title,t.customer_id,t.customer,t.due,t.amount,t.seller,
   c.customer_code,c.name AS customer_name,c.seller_name AS customer_seller
   FROM cards t LEFT JOIN customers c ON c.id=t.customer_id
   WHERE t.kind='title' AND t.paid=0 AND t.archived_at IS NULL
   ORDER BY t.due,t.id`).all();
  return Response.json({rows:result.results},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return failure(error);}
}
