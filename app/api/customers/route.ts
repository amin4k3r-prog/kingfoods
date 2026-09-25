import {requireUser, audit} from '@/lib/auth';
import {db,bucket,failure,sameOrigin} from '@/lib/server';
import {normalizeCustomerName,validRiskClass,validTaxId} from '@/lib/policy';

const imageTypes=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp']]);

async function linkUnassignedTitles(d:any){
 const [profiles,titles]=await Promise.all([
  d.prepare('SELECT id,name FROM customers').all(),
  d.prepare("SELECT id,customer FROM cards WHERE customer_id IS NULL AND document IS NOT NULL AND customer IS NOT NULL").all()
 ]);
 const byName=new Map<string,string[]>();for(const p of profiles.results as any[]){const key=normalizeCustomerName(String(p.name));if(key)byName.set(key,[...(byName.get(key)??[]),String(p.id)]);}
 const changes:any[]=[];for(const t of titles.results as any[]){const ids=byName.get(normalizeCustomerName(String(t.customer)));if(ids?.length===1)changes.push(d.prepare('UPDATE cards SET customer_id=? WHERE id=? AND customer_id IS NULL').bind(ids[0],t.id));}
 for(let i=0;i<changes.length;i+=50)await d.batch(changes.slice(i,i+50));
}

export async function POST(request:Request){let newPhotoKey:string|null=null;try{
    const authUser=await requireUser(request);
 sameOrigin(request);const form=await request.formData();const d=db();const id=String(form.get('id')??'').trim()||crypto.randomUUID();const taxId=String(form.get('tax_id')??'');const normalized=taxId.replace(/\D/g,'');const name=String(form.get('name')??'').trim();const payerName=String(form.get('payer_name')??'').trim();const phone=String(form.get('phone')??'').trim();const payerContact=String(form.get('payer_contact')??'').trim();const address=String(form.get('delivery_address')??'').trim();const confirmed=form.get('address_confirmed')==='1';const suppliedRisk=String(form.get('risk_class')??'').trim().toUpperCase();const creditLimitRaw=String(form.get('credit_limit')??'0').trim();const customerCodeRaw=String(form.get('customer_code')??'').trim();const riskClass=validRiskClass(suppliedRisk)?suppliedRisk:null;const photo=form.get('photo');
 const existing=await d.prepare('SELECT id,photo_key,customer_code,payer_name,phone,payer_contact,delivery_address,address_confirmed,risk_class,credit_limit,created_at FROM customers WHERE id=?').bind(id).first() as any;
 if(!validTaxId(normalized))throw new Error('Informe um CPF ou CNPJ válido.');
 if(!name||name.length>200)throw new Error('Informe o nome do cliente.');
 if(!existing&&phone.replace(/\D/g,'').length<10)throw new Error('Informe o telefone do responsável pelo pagamento.');
 if(!existing&&(!payerContact||payerContact.length>200||(!payerContact.includes('@')&&payerContact.replace(/\D/g,'').length<10)))throw new Error('Informe o WhatsApp ou e-mail do responsável pelo pagamento.');
 if(!existing&&(!address||address.length>500||!confirmed))throw new Error('Informe o endereço de entrega e confirme que ele foi conferido no local.');
 if(suppliedRisk&&!riskClass)throw new Error('A classe deve ser A, B, C, D ou E.');
 if(form.get('id')&&!existing)throw new Error('Cadastro não encontrado. Atualize a carteira e tente novamente.');if(!existing&&(!customerCodeRaw||customerCodeRaw.length>80))throw new Error('Informe o código único do cliente.');if(!/^\d+$/.test(creditLimitRaw))throw new Error('Informe um limite válido.');let creditLimit=Number(creditLimitRaw);if(!Number.isSafeInteger(creditLimit)||creditLimit<0)throw new Error('Informe um limite válido.');
 if(riskClass==='E')creditLimit=0; const duplicate=await d.prepare('SELECT id FROM customers WHERE tax_id=? AND id<>?').bind(normalized,id).first();if(duplicate)throw new Error('Já existe um cliente cadastrado com este CPF ou CNPJ.');if(!existing){const codeDuplicate=await d.prepare('SELECT id FROM customers WHERE customer_code=?').bind(customerCodeRaw).first();if(codeDuplicate)throw new Error('Já existe um cliente cadastrado com este código.');}
 let photoKey=existing?.photo_key??null;
 if(photo instanceof File&&photo.size>0){const ext=imageTypes.get(photo.type);if(!ext)throw new Error('Envie uma foto JPG, PNG ou WebP.');if(photo.size>10*1024*1024)throw new Error('A foto deve ter no máximo 10 MB.');newPhotoKey=`customer-photos/${id}/${crypto.randomUUID()}.${ext}`;await bucket().put(newPhotoKey,await photo.arrayBuffer(),{httpMetadata:{contentType:photo.type}});photoKey=newPhotoKey;}
 if(!photoKey&&!existing)throw new Error('Adicione uma foto da fachada ou do local de entrega.');
 const now=new Date().toISOString();
 try{if(existing){await d.prepare(`UPDATE customers SET tax_id=?,name=?,payer_name=?,phone=?,payer_contact=?,delivery_address=?,address_confirmed=?,photo_key=?,risk_class=?,credit_limit=?,credit_term_days=CASE WHEN ?='E' THEN 0 ELSE credit_term_days END,updated_at=? WHERE id=?`)
  .bind(normalized,name,payerName||existing.payer_name,phone||existing.phone,payerContact||existing.payer_contact,address||existing.delivery_address,address?Number(confirmed):Number(existing.address_confirmed),photoKey,riskClass,creditLimit,riskClass,now,id).run();}
 else{await d.prepare(`INSERT INTO customers(id,tax_id,name,payer_name,phone,payer_contact,delivery_address,address_confirmed,photo_key,risk_class,customer_code,credit_limit,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,normalized,name,payerName,phone,payerContact,address,1,photoKey,riskClass,customerCodeRaw,creditLimit,now,now).run();}}
 catch(e){if(newPhotoKey)await bucket().delete(newPhotoKey).catch(()=>{});throw e;}
 await linkUnassignedTitles(d);if(existing?.photo_key&&newPhotoKey)await bucket().delete(String(existing.photo_key)).catch(()=>{});
 await audit(authUser,existing?'edit_customer':'create_customer','customer',id,`${name}; rank: ${existing?.risk_class??'—'} → ${riskClass??'—'}; limite: ${existing?.credit_limit??0} → ${creditLimit}`);return Response.json({id,linked:true});
}catch(e){const message=e instanceof Error?e.message:'';if(message.includes('UNIQUE constraint failed')&&message.includes('tax_id'))return Response.json({error:'Já existe um cliente cadastrado com este CPF ou CNPJ.'},{status:400});if(message.includes('UNIQUE constraint failed')&&message.includes('customer_code'))return Response.json({error:'Já existe um cliente cadastrado com este código.'},{status:400});return failure(e);}}

export async function DELETE(request:Request){try{
    const authUser=await requireUser(request);
 sameOrigin(request);const {id}=await request.json() as {id?:unknown};if(typeof id!=='string'||!id.trim())throw new Error('Selecione um cliente válido.');
 const d=db();const customer=await d.prepare('SELECT id,photo_key FROM customers WHERE id=?').bind(id).first() as {id:string;photo_key:string|null}|null;
 if(!customer)return Response.json({error:'Cadastro não encontrado. Atualize a carteira.'},{status:404});
 const linked=await d.prepare('SELECT COUNT(*) AS total FROM cards WHERE customer_id=?').bind(id).first() as {total:number}|null;
 await d.batch([
  d.prepare('UPDATE cards SET customer_id=NULL WHERE customer_id=?').bind(id),
  d.prepare('DELETE FROM customers WHERE id=?').bind(id)
 ]);
 if(customer.photo_key)await bucket().delete(customer.photo_key).catch(e=>console.error('Não foi possível remover a foto do cliente:',e));
 await audit(authUser,'delete_customer','customer',id);return Response.json({deleted:true,unlinked:Number(linked?.total??0)});
}catch(e){return failure(e);}}
