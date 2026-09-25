export const validRiskClass=(risk:string|null|undefined):risk is 'A'|'B'|'C'|'D'|'E'=>!!risk&&['A','B','C','D','E'].includes(risk);
export const normalizeCustomerName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^\s*\d+\s*[-–]\s*/,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export const normalizeTaxId=(value:string)=>value.replace(/\D/g,'');
export function validTaxId(value:string){
 const digits=normalizeTaxId(value);if(/^([0-9])\1+$/.test(digits))return false;
 if(digits.length===11){const check=(base:string,mults:number[])=>{const sum=[...base].reduce((n,d,i)=>n+Number(d)*mults[i],0);const remainder=sum%11;return remainder<2?0:11-remainder;};const first=check(digits.slice(0,9),[10,9,8,7,6,5,4,3,2]);const second=check(digits.slice(0,9)+first,[11,10,9,8,7,6,5,4,3,2]);return digits===digits.slice(0,9)+first+second;}
 if(digits.length===14){const check=(base:string,mults:number[])=>{const sum=[...base].reduce((n,d,i)=>n+Number(d)*mults[i],0);const remainder=sum%11;return remainder<2?0:11-remainder;};const first=check(digits.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);const second=check(digits.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2]);return digits===digits.slice(0,12)+first+second;}
 return false;
}
export const TITLE_EVENT_OPTIONS=[
 {id:'message_sent',label:'Mensagem enviada'},
 {id:'call_made',label:'Ligação realizada'},
 {id:'negotiation',label:'Negociação registrada'},
 {id:'agreement_created',label:'Acordo registrado'},
 {id:'agreement_payment',label:'Pagamento do acordo registrado'},
 {id:'promise_to_pay',label:'Promessa de pagamento'},
 {id:'payment_confirmed',label:'Pagamento confirmado'},
 {id:'other',label:'Outro contato ou observação'}
] as const;
