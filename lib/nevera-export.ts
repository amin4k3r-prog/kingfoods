export function neveraPayload(customer:Record<string,any>,actor:string,now=new Date()){
 const code=String(customer.customer_code??'').trim(),taxId=String(customer.tax_id??'').replace(/\D/g,''),limitCents=customer.credit_limit;
 if(!/^\d{1,20}$/.test(code)||![11,14].includes(taxId.length))throw new Error('Confira o código numérico e o CPF/CNPJ do cliente antes de enviar ao Nevera.');
 if(!Number.isSafeInteger(limitCents)||limitCents<0)throw new Error('O cliente precisa ter um limite válido salvo no cadastro.');
 const requestId=crypto.randomUUID(),createdAt=now.toISOString(),limit=(limitCents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 return {version:1,requestId,createdAt,customerId:String(customer.id),code,taxId,name:String(customer.name),limitCents,actor,observation:`King Foods — atualização de limite. Limite aprovado no cadastro: ${limit}. Data: ${now.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}. Responsável: ${actor}. Referência: ${requestId}.`};
}
