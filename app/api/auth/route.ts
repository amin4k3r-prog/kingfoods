import { db, failure, sameOrigin } from '@/lib/server';
import {env} from 'cloudflare:workers';
import {audit,clearSession,createSession,currentUser,hashPassword,requireUser,revokeSession,revokeUserSessions,validateIdentity,validatePassword,verifyPassword} from '@/lib/auth';

function safeEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export async function GET(request:Request){try{const user=await currentUser(request);if(user)return Response.json({user});const row=await db().prepare('SELECT id FROM users LIMIT 1').first();const ownerMatch=!!env.BOOTSTRAP_OWNER_EMAIL&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.BOOTSTRAP_OWNER_EMAIL.toLowerCase();return Response.json({setup:!row,user:null,setupAllowed:!row&&(ownerMatch||!!env.BOOTSTRAP_TOKEN)},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{sameOrigin(request);const body=await request.json() as Record<string,unknown>;const action=String(body.action??'');const d=db();
 if(action==='setup'){
  const ownerMatch=!!env.BOOTSTRAP_OWNER_EMAIL&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.BOOTSTRAP_OWNER_EMAIL.toLowerCase();const tokenMatch=!!env.BOOTSTRAP_TOKEN&&typeof body.bootstrap_token==='string'&&safeEqual(body.bootstrap_token,env.BOOTSTRAP_TOKEN);if(!ownerMatch&&!tokenMatch)return Response.json({error:'Token inicial inválido. Configure BOOTSTRAP_TOKEN no ambiente da hospedagem.'},{status:403});
  const {name,login}=validateIdentity(body.name,body.login);validatePassword(body.password);if(body.password!==body.confirmation)throw new Error('As senhas não conferem.');
  const id=crypto.randomUUID(),now=new Date().toISOString(),passwordHash=await hashPassword(body.password as string);
  const result=await d.prepare("INSERT INTO users(id,name,login,password_hash,role,active,bootstrap_slot,created_at,updated_at) SELECT ?,?,?,?,'admin',1,1,?,? WHERE NOT EXISTS(SELECT 1 FROM users)").bind(id,name,login,passwordHash,now,now).run();
  if(!result.meta.changes)return Response.json({error:'O primeiro administrador já foi criado. Entre com sua conta.'},{status:409});
  await audit({id,name,login,role:'admin'},'setup','user',id,'Primeiro administrador criado');return Response.json({ok:true});
 }
 if(action==='login'){
  const login=String(body.login??'').trim().toLowerCase(),password=String(body.password??'');
  if(login.length>50||password.length>128)return Response.json({error:'Login ou senha inválidos.'},{status:401});
  const row=await d.prepare('SELECT id,name,login,role,active,password_hash,failed_logins,locked_until FROM users WHERE login=?').bind(login).first() as any;
  const locked=row?.locked_until&&row.locked_until>new Date().toISOString();
  if(!row||!row.active||locked||!await verifyPassword(password,row.password_hash)){
   if(row?.active&&!locked){const failures=Number(row.failed_logins||0)+1;await d.prepare('UPDATE users SET failed_logins=?,locked_until=? WHERE id=?').bind(failures>=5?0:failures,failures>=5?new Date(Date.now()+15*60000).toISOString():null,row.id).run();}
   return Response.json({error:'Login ou senha inválidos. Após cinco tentativas, aguarde 15 minutos.'},{status:401});
  }
  await d.prepare('UPDATE users SET failed_logins=0,locked_until=NULL WHERE id=?').bind(row.id).run();const cookie=await createSession(row.id);await audit(row,'login','user',row.id);return Response.json({user:{id:row.id,name:row.name,login:row.login,role:row.role}},{headers:{'Set-Cookie':cookie,'Cache-Control':'no-store'}});
 }
 const user=await requireUser(request);
 if(action==='logout'){await revokeSession(request);await audit(user,'logout','user',user.id);return Response.json({ok:true},{headers:{'Set-Cookie':clearSession()}});}
 if(action==='change_password'){
  validatePassword(body.password);if(body.password!==body.confirmation)throw new Error('As senhas não conferem.');const row=await d.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first() as any;
  if(!await verifyPassword(String(body.current_password??''),row.password_hash))return Response.json({error:'Senha atual incorreta.'},{status:400});
  await d.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(await hashPassword(body.password as string),new Date().toISOString(),user.id).run();await revokeUserSessions(user.id);await audit(user,'change_password','user',user.id);return Response.json({ok:true},{headers:{'Set-Cookie':clearSession()}});
 }
 return Response.json({error:'Ação inválida.'},{status:400});
}catch(e){if(e instanceof Error&&e.message.includes('UNIQUE constraint failed'))return Response.json({error:'Login já cadastrado ou administrador inicial já criado.'},{status:409});return failure(e);}}
