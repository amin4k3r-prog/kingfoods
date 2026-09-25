import {db,failure} from '@/lib/server';
import {requireUser} from '@/lib/auth';
export async function GET(request:Request){try{await requireUser(request);const rows=await db().prepare('SELECT id,user_name,action,entity_type,entity_id,details,occurred_at FROM audit_events ORDER BY occurred_at DESC LIMIT 200').all();return Response.json({events:rows.results});}catch(e){return failure(e);}}
