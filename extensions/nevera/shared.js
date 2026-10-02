export function validatePayload(p,now=Date.now()){
 if(!p||p.version!==1||typeof p.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(p.requestId))throw Error('Solicitação inválida.');
 if(typeof p.code!=='string'||!/^\d{1,20}$/.test(p.code)||typeof p.taxId!=='string'||!/^\d{11}(?:\d{3})?$/.test(p.taxId))throw Error('Código ou CPF/CNPJ inválido.');
 if(!Number.isSafeInteger(p.limitCents)||p.limitCents<0)throw Error('Limite inválido.');
 if(typeof p.name!=='string'||!p.name||p.name.length>200||typeof p.observation!=='string'||!p.observation||p.observation.length>2000)throw Error('Identificação ou observação inválida.');
 const age=now-Date.parse(p.createdAt);if(!Number.isFinite(age)||age< -60000||age>15*60*1000)throw Error('Solicitação expirada. Clique novamente no botão do cadastro.');
 return p;
}
export const currency=n=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function sameIdentity(actual,p){return actual.code.replace(/^0+(?=\d)/,'')===p.code.replace(/^0+(?=\d)/,'')&&actual.taxId.replace(/\D/g,'')===p.taxId;}
