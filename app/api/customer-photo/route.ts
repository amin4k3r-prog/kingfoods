import {requireUser, audit} from '@/lib/auth';
import {bucket,failure} from '@/lib/server';

export async function GET(request:Request){try{
    const authUser=await requireUser(request);
 const key=new URL(request.url).searchParams.get('id')??'';if(!key.startsWith('customer-photos/')||key.includes('..'))return new Response('Foto não encontrada.',{status:404});
 const object=await bucket().get(key);if(!object)return new Response('Foto não encontrada.',{status:404});
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType??'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
