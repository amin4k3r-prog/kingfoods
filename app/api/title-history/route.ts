import {requireUser, audit} from '@/lib/auth';
import {db,failure,sameOrigin} from '@/lib/server';

const EVENT_TYPES=new Set(['message_sent','call_made','negotiation','agreement_created','agreement_payment','payment_confirmed','promise_to_pay','other']);

export async function GET(request:Request){try{
    const authUser=await requireUser(request);const id=new URL(request.url).searchParams.get('card');if(!id)return Response.json({events:[]});const result=await db().prepare('SELECT id,card_id,event_type,stage,note,created_at FROM title_events WHERE card_id=? ORDER BY created_at DESC').bind(id).all();return Response.json({events:result.results});}catch(e){return failure(e);}}

export async function POST(request:Request){try{
    const authUser=await requireUser(request);sameOrigin(request);const body=await request.json() as any;const id=String(body.card??'');const type=String(body.event_type??'');const note=typeof body.note==='string'?body.note.trim():'';if(!id||!EVENT_TYPES.has(type)||note.length>2000)throw new Error('Confira o tipo de registro e as observações.');const d=db();const card=await d.prepare("SELECT id FROM cards WHERE id=? AND kind='title'").bind(id).first() as any;if(!card)throw new Error('Título não encontrado.');const eventId=crypto.randomUUID(),createdAt=new Date().toISOString();await d.prepare('INSERT INTO title_events(id,card_id,event_type,stage,note,created_at) VALUES (?,?,?,?,?,?)').bind(eventId,id,type,'task',note,createdAt).run();await audit(authUser,'title_event','card',id,`${type}: ${note}`);return Response.json({id:eventId,card_id:id,event_type:type,stage:'task',note,created_at:createdAt});}catch(e){return failure(e);}}
