/** Sole active credit model: user rules of 01/10/2026. All money is integer cents. */
export const MODEL='kingfoods-credit-2026-10-01';
export const marker='KF_CREDIT_V2\n';
export type Rank='A'|'B'|'C'|'D';
export const rankNames:Record<Rank,string>={A:'Estruturado',B:'Food Service',C:'Revenda de carne',D:'Consumo próprio'};
export type PaidRow={document:string;date:string;delay:number};
export type PurchaseRow={document:string;purchase:string;date:string;amount:number};
export type Report<T>={customerId:string;fileName:string;customerLabel:string;rows:T[]};
export type Input={kind:'new'|'history'|null;restriction:'clear'|'restricted'|null;openingDate:string;otherSupplier:boolean;creditScore:number|null;firstPurchaseDate:string;maxOpenPurchases:number|null;latestPurchaseCount:number|null;paid:Report<PaidRow>|null;purchases:Report<PurchaseRow>|null};
export const initialInput:Input={kind:null,restriction:null,openingDate:'',otherSupplier:false,creditScore:null,firstPurchaseDate:'',maxOpenPurchases:null,latestPurchaseCount:null,paid:null,purchases:null};
export type Context={day:string;customerId:string;registrationComplete:boolean;missingRegistration:string[];firstPurchaseDate?:string|null};
export function validDay(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;}
export function completeMonths(from:string,to:string){const [y,m,d]=from.split('-').map(Number),[yy,mm,dd]=to.split('-').map(Number);return (yy-y)*12+mm-m-(dd<d?1:0);}
export function monthsBefore(day:string,count:number){const [y,m,d]=day.split('-').map(Number),target=new Date(Date.UTC(y,m-1-count,1));target.setUTCDate(Math.min(d,new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate()));return target.toISOString().slice(0,10);}
export const rankFor=(total:number):Rank=>total>=70?'A':total>=50?'B':total>=35?'C':'D';
export const activityPoints=(months:number)=>months>=60?15:months>=36?12:months>=24?9:months>=12?6:months>=6?3:0;
export const relationshipPoints=(months:number)=>months>=24?10:months>=18?8:months>=12?6:months>=6?4:months>=3?2:0;
export const frequencyPoints=(count:number)=>count>=12?10:count>=9?8:count>=6?6:count>=3?3:0;
export function purchaseKey(document:string){return /^.+-\d+-\d+$/.test(document)?document.replace(/-\d+$/,''):document;}
function checkReport<T extends PaidRow|PurchaseRow>(report:Report<T>|null,c:Context,kind:'paid'|'purchases'){
 if(report===null)return [] as T[];
 if(!report||report.customerId!==c.customerId||!Array.isArray(report.rows)||report.rows.length>5000||typeof report.fileName!=='string'||report.fileName.length>200||typeof report.customerLabel!=='string'||report.customerLabel.length>300)throw new Error('Relatório inválido ou pertencente a outro cadastro.');
 const unique=new Map<string,T>();
 for(const r of report.rows){
  if(!r||typeof r.document!=='string'||!r.document.trim()||r.document.length>150||!validDay(r.date)||r.date>c.day)throw new Error('Confira documento e data dos registros importados.');
  if(kind==='paid'){const p=r as PaidRow;if(!Number.isInteger(p.delay)||p.delay<0)throw new Error('Atraso deve ser um número inteiro de dias, maior ou igual a zero.');}
  else{const p=r as PurchaseRow;if(typeof p.purchase!=='string'||!p.purchase.trim()||p.purchase.length>150||!Number.isSafeInteger(p.amount)||p.amount<0)throw new Error('Confira o documento da compra e o Valor Parcela.');}
  const previous=unique.get(r.document);if(previous&&JSON.stringify(previous)!==JSON.stringify(r))throw new Error(`Documento duplicado com dados divergentes: ${r.document}.`);unique.set(r.document,r);
 }
 return [...unique.values()];
}
export function calculate(raw:Input,c:Context){
 const i={...initialInput,...raw};
 if(!validDay(c.day)||!['new','history',null].includes(i.kind)||!['clear','restricted',null].includes(i.restriction)||typeof i.otherSupplier!=='boolean')throw new Error('Tipo de análise ou situação de crédito inválida.');
 for(const value of [i.openingDate,i.firstPurchaseDate])if(typeof value!=='string'||value&&(!validDay(value)||value>c.day))throw new Error('Informe uma data válida, sem estar no futuro.');
 if(i.creditScore!==null&&(!Number.isFinite(i.creditScore)||i.creditScore<0||i.creditScore>1000))throw new Error('Pontuação de crédito: informe um número de 0 a 1.000.');
 if(i.maxOpenPurchases!==null&&(!Number.isSafeInteger(i.maxOpenPurchases)||i.maxOpenPurchases<0))throw new Error('Quantidade máxima de compras em aberto: informe um inteiro não negativo.');
 if(i.latestPurchaseCount!==null&&(!Number.isSafeInteger(i.latestPurchaseCount)||i.latestPurchaseCount<1))throw new Error('Compras únicas analisadas: informe um inteiro maior que zero ou deixe vazio para usar todas.');
 const paidRows=checkReport(i.paid,c,'paid'),purchaseRows=checkReport(i.purchases,c,'purchases');
 const start=monthsBefore(c.day,6),groups=new Map<string,{document:string;date:string;amount:number;installments:number}>();
 // Group all installments before applying the purchase-date window.
 for(const row of purchaseRows){const current=groups.get(row.purchase);if(current){current.amount+=row.amount;current.installments++;if(row.date<current.date)current.date=row.date;}else groups.set(row.purchase,{document:row.purchase,date:row.date,amount:row.amount,installments:1});}
 const periodPurchases=[...groups.values()].filter(g=>g.date>=start&&g.date<=c.day).sort((a,b)=>b.date.localeCompare(a.date)||a.document.localeCompare(b.document));
 const availableCount=periodPurchases.length;
 const purchases=i.latestPurchaseCount===null?periodPurchases:periodPurchases.slice(0,i.latestPurchaseCount);
 const total=purchases.reduce((n,p)=>n+p.amount,0);if(!Number.isSafeInteger(total))throw new Error('Total comprado ultrapassa a precisão monetária suportada.');
 const count=purchases.length,average=count?Math.round(total/count):null;
 // Round the final currency amount only; do not alter the formula by rounding the mean first.
 const limit=count&&i.maxOpenPurchases!==null?Number((BigInt(total)*BigInt(i.maxOpenPurchases)+BigInt(count)/BigInt(2))/BigInt(count)):null;
 if(limit!==null&&!Number.isSafeInteger(limit))throw new Error('Limite sugerido ultrapassa a precisão monetária suportada.');
 const recent=[...paidRows].sort((a,b)=>b.date.localeCompare(a.date)||a.document.localeCompare(b.document)).slice(0,25);
 const onTime=recent.filter(r=>r.delay<=2).length,late=recent.length-onTime;
 const punctuality=recent.length?Math.round(onTime/recent.length*25):null;
 const earliest=[...purchaseRows.map(r=>r.date),...paidRows.map(r=>r.date),...(c.firstPurchaseDate&&validDay(c.firstPurchaseDate)?[c.firstPurchaseDate]:[])].sort()[0]??null;
 const firstPurchase=i.firstPurchaseDate||earliest;
 const activityMonths=i.openingDate?completeMonths(i.openingDate,c.day):null;
 const relationshipMonths=firstPurchase?completeMonths(firstPurchase,c.day):null;
 const restriction=i.restriction==='clear'?25:i.restriction==='restricted'?-75:null;
 const credit=i.creditScore===null?null:Math.round(i.creditScore*30/1000);
 const criteria=i.kind==='new'?[{key:'restriction',label:'SPC/Serasa',points:restriction,max:25},{key:'activity',label:'Tempo de atividade',points:activityMonths===null?null:activityPoints(activityMonths),max:15},{key:'supplier',label:'Compra a prazo em outro vendedor',points:i.otherSupplier?10:0,max:10},{key:'registration',label:'Cadastro completo',points:c.registrationComplete?20:0,max:20},{key:'credit',label:'Pontuação de crédito',points:credit,max:30}]:i.kind==='history'?[{key:'punctuality',label:'Pontualidade dos últimos 25 títulos',points:punctuality,max:25},{key:'restriction',label:'SPC/Serasa',points:restriction,max:25},{key:'credit',label:'Pontuação de crédito',points:credit,max:30},{key:'frequency',label:'Frequência de compras',points:i.purchases?frequencyPoints(availableCount):null,max:10},{key:'relationship',label:'Tempo de relacionamento',points:relationshipMonths===null?null:relationshipPoints(relationshipMonths),max:10}]:[];
 const rankReady=criteria.length>0&&criteria.every(r=>r.points!==null);
 const subtotal=criteria.reduce((n,r)=>n+(r.points??0),0),rank=rankReady?rankFor(subtotal):null;
 return {model:MODEL,criteria,subtotal,totalScore:rankReady?subtotal:null,rank,rankLabel:rank?rankNames[rank]:null,rankReady,activityMonths,relationshipMonths,firstPurchase,firstPurchaseSource:i.firstPurchaseDate?'informada':'primeira data disponível nos registros',punctuality:{analyzed:recent.length,onTime,late,percent:recent.length?onTime/recent.length*100:null,points:punctuality,rows:recent},frequency:{count:availableCount,points:i.purchases?frequencyPoints(availableCount):null},limit:{count,availableCount,requestedCount:i.latestPurchaseCount,total,average,maxOpenPurchases:i.maxOpenPurchases,value:limit,start,end:c.day,purchases},nextReview:null};
}
export type Result=ReturnType<typeof calculate>;
export type Snapshot={model:string;input:Input;result:Result;report:string;savedAt:string;context:Context};
export function unpack(notes:string):Snapshot|null{if(!notes.startsWith(marker))return null;try{const p=JSON.parse(notes.slice(marker.length));return p.model===MODEL?p:null;}catch{return null;}}
export function displayNotes(notes:string){const current=unpack(notes);if(current)return current.report;if(notes.startsWith('KF_POLICY_V6\n')){try{return JSON.parse(notes.slice('KF_POLICY_V6\n'.length)).report??'Análise histórica (modelo anterior).';}catch{return 'Análise histórica (modelo anterior).';}}return notes;}
