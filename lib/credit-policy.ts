/** King Foods v6.0, 23/09/2026. Monetary inputs are reais; persisted limits are cents. */
export const newWeights = [['external','SPC, Serasa e cartórios',25],['score','Pontuação de crédito',30],['activity','Tempo de atividade',15],['registration','Cadastro completo',20],['supplier','Compra a prazo em outro fornecedor',10]] as const;
export const existingWeights = [['punctuality','Títulos pagos no prazo (6 meses)',25],['delay','Atraso médio ponderado pelo valor',15],['incidents','Atrasos acima de 5 dias (6 meses)',10],['trend','Tendência recente de pagamento',10],['relationship','Tempo de relacionamento',10],['frequency','Frequência de compra',10],['external','SPC, Serasa e cartórios',10],['score','Pontuação de crédito',10]] as const;
export const segments={structured:{label:'Estruturado',factor:1,max:28},food:{label:'Food service',factor:.8,max:28},resale:{label:'Revenda de carne',factor:.6,max:14},personal:{label:'Consumo próprio',factor:0,max:0}};
export type Input={kind:'new'|'existing';segment:keyof typeof segments;points:Record<string,number|null>;justification:string;spc:number|null;spcDate:string;serasa:number|null;serasaDate:string;weekly:number|null;order:number|null;received:number|null;peak:number|null;portfolio:number|null;dailyRevenue:number|null;otherGroup:number|null;pendingOrder:number|null;months2:number|null;months4:number|null;onTime:number|null;lateEvents:number|null;growing:boolean;categoryConfirmed:boolean;portfolioChecked:boolean;groupChecked:boolean;groupOverdue:boolean;conditionsChecked:boolean;documentsDoubt:boolean;contactValidated:boolean;contactEvidence:string;additionalDocuments:boolean;requested:number|null;restriction:'none'|'small'|'relevant'|'protest'|'judicial';goodHistory:boolean;agreement:'none'|'performing'|'blocked';permanentBlock:boolean;cashUntil:string;freezeUntil:string;requestedTerm:number;incidentDate:string;settlementDate:string;maxDelay:number|null;shortEvents:number|null;prePenaltyTerm:number;checks:string;risks:string;directorReferred:boolean};
export type Context={complete:boolean;currentLimit:number;currentTerm:number;exposure:number;overdue:number;curve:string|null;reactivated:boolean;groupOverdue:boolean;day:string};
export const initialInput:Input={kind:'new',segment:'structured',points:{},justification:'',spc:null,spcDate:'',serasa:null,serasaDate:'',weekly:null,order:null,received:null,peak:null,portfolio:null,dailyRevenue:null,otherGroup:null,pendingOrder:null,months2:null,months4:null,onTime:null,lateEvents:null,growing:false,categoryConfirmed:false,portfolioChecked:false,groupChecked:false,groupOverdue:false,conditionsChecked:false,documentsDoubt:false,contactValidated:false,contactEvidence:'',additionalDocuments:false,requested:null,restriction:'none',goodHistory:false,agreement:'none',permanentBlock:false,cashUntil:'',freezeUntil:'',requestedTerm:7,incidentDate:'',settlementDate:'',maxDelay:null,shortEvents:null,prePenaltyTerm:7,checks:'',risks:'',directorReferred:false};
function months(day:string,n:number){const d=new Date(day+'T12:00:00Z'),date=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(date,last));return d.toISOString().slice(0,10);}
const days=(date:string,day:string)=>Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
export function calculatePolicy(input:Input,c:Context){
 const i={...initialInput,...input},pending:string[]=[],warnings:string[]=[];
 for(const [key,defaultValue] of Object.entries(initialInput)){const value=(i as unknown as Record<string,unknown>)[key];if(defaultValue!==null&&key!=='points'&&typeof value!==typeof defaultValue)throw new Error('Tipo de dado inválido: '+key);}
 if(!i.points||typeof i.points!=='object'||Array.isArray(i.points))throw new Error('Pontuação inválida.');
 for(const date of [i.cashUntil,i.freezeUntil,i.incidentDate,i.settlementDate])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))pending.push('Confira as datas de penalidade.');
 const segment=segments[i.segment];if(!segment)throw new Error('Segmento inválido.');
 if(!['new','existing'].includes(i.kind)||!['none','small','relevant','protest','judicial'].includes(i.restriction)||!['none','performing','blocked'].includes(i.agreement))throw new Error('Condição inválida.');
 const isNew=i.kind==='new'||c.reactivated,weights=isNew?newWeights:existingWeights;
 if(!c.complete)pending.push('Complete o cadastro: foto, titular, CPF/CNPJ, pagador, contatos e endereço confirmado (5.1).');
 if(!i.contactValidated||!i.contactEvidence.trim())pending.push('Valide o contato do pagador e registre data, hora, canal e confirmação (5.1).');
 if(!i.categoryConfirmed)pending.push('Confirme a categoria e o segmento (8).');
 if(!i.groupChecked)pending.push('Confira e registre vínculos de grupo econômico (8.1).');
 if(!i.portfolioChecked)pending.push('Confira a posição completa da carteira, inclusive duplicatas descontadas com risco retido (9.6).');
 if(!i.conditionsChecked)pending.push('Confira validade cadastral, consultas, acordos, protestos, retorno após pagamento e períodos de penalidade (5, 6, 14 e 16).');
 if(!i.checks.trim()||!i.risks.trim())pending.push('Registre fontes, datas, documentos, histórico, riscos e mitigadores no parecer (6 e 11).');
 const valid=(score:number|null,date:string)=>score!==null&&Number.isFinite(score)&&score>=0&&score<=1000&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&days(date,c.day)>=0&&days(date,c.day)<=90;
 const source=valid(i.serasa,i.serasaDate)?'Serasa':valid(i.spc,i.spcDate)?'SPC':null;
 if(!source)pending.push('Informe ao menos uma nota válida SPC/Serasa, de 0 a 1.000, com até 90 dias (6 e 7.2).');
 if(source==='SPC')warnings.push('SPC substitui Serasa; as notas não são somadas (7.2).');
 let score=0;for(const [key,label,max] of weights){const value=i.points[key];if(value==null||!Number.isFinite(value)||value<0||value>max)pending.push(`Avalie ${label}: de 0 a ${max} pontos (7.2).`);else score+=value;}
 if(!i.justification.trim())pending.push('Justifique os pontos: a política informa pesos, mas não fornece faixas para converter indicadores em pontos (7.2).');
 const numeric=['weekly','order','portfolio','dailyRevenue','otherGroup','pendingOrder','requested'] as const;
 for(const key of numeric)if(i[key]===null||!Number.isFinite(i[key])||i[key]!<0)pending.push(`Informe um valor não negativo para ${numericLabels[key]}.`);
 if(!isNew){for(const key of ['received','peak','months2','months4','onTime','lateEvents','maxDelay','shortEvents'] as const)if(i[key]===null||!Number.isFinite(i[key])||i[key]!<0)pending.push(`Informe ${numericLabels[key]}.`);if(!(Number(i.received)>0||Number(i.peak)>0))pending.push('Falta evidência de principal recebido ou exposição quitada corretamente (9.3).');}
 if(Number(i.months2)>6||Number(i.months4)>6||Number(i.months4)>Number(i.months2)||Number(i.onTime)>100||[i.months2,i.months4,i.lateEvents,i.maxDelay,i.shortEvents].some(v=>v!==null&&!Number.isInteger(v)))pending.push('Confira os meses (0–6), ocorrências inteiras e pontualidade (0–100%).');
 if(![0,7,14,21,28].includes(i.requestedTerm))pending.push('Use um dos cinco degraus de prazo (10).');
 const rank=score>=85?'A':score>=70?'B':score>=55?'C':score>=40?'D':'E';
 const steps=[0,7,14,21,28],currentStep=steps.find(v=>v>=c.currentTerm)??28;
 let eligible=7;if(!isNew&&Number(i.lateEvents)===0){if(rank!=='D'&&rank!=='E'&&Number(i.months2)>=4)eligible=14;if(['A','B'].includes(rank)&&Number(i.months4)>=5&&Number(i.onTime)>=95)eligible=21;if(rank==='A'&&Number(i.months4)===6&&Number(i.onTime)>=98)eligible=28;}
 let term=Math.min(i.requestedTerm,eligible,segment.max,isNew?7:steps[Math.min(4,steps.indexOf(currentStep)+1)]);
 let cash=rank==='E'||i.segment==='personal'||i.agreement==='performing'||!!i.cashUntil&&i.cashUntil>=c.day||isNew&&i.restriction!=='none';
 const blocked=i.permanentBlock||i.restriction==='judicial'||i.agreement==='blocked'||c.overdue>0||c.groupOverdue||i.groupOverdue;
 if(blocked)pending.push('Há impedimento de venda. Regularize ou registre a decisão aplicável antes de concluir uma nova concessão; o rascunho preserva as condições vigentes (2.1, 7.4 e 16).');
 if(c.overdue>0||c.groupOverdue||i.groupOverdue)warnings.push('Título vencido: pedidos bloqueados, inclusive no grupo econômico (8.1 e 16).');
 let penaltyOrderCap=false,penaltyFreeze=false;
 const addDays=(date:string,n:number)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 const previous=steps.find(v=>v>=i.prePenaltyTerm)??28;
 if(!isNew&&(Number(i.lateEvents)>=2||Number(i.shortEvents)>=3||Number(i.maxDelay)>5)){
  if(!i.incidentDate||!Number.isFinite(Date.parse(i.incidentDate))||i.incidentDate>c.day)pending.push('Informe a data do evento e o prazo anterior à penalidade (16.3).');
  else {
   if(Number(i.lateEvents)>=4||Number(i.maxDelay)>30){const end=months(i.incidentDate,6);if(end>=c.day)cash=true;warnings.push('Quarto atraso ou atraso acima de 30 dias: à vista até '+end+'; retorno exige nova análise completa e Gerência (16.3).');if(end<c.day)pending.push('Retorno após atraso grave exige análise completa como novo e aprovação da Gerência.');}
   else if(Number(i.lateEvents)===3){const end=addDays(i.incidentDate,60);if(end>=c.day){cash=true;penaltyOrderCap=true;}warnings.push('Terceiro atraso: à vista por 60 dias, até '+end+' (16.3).');}
   else if(Number(i.lateEvents)===2){const end=addDays(i.incidentDate,60);term=Math.min(term,steps[Math.max(0,steps.indexOf(previous)-1)]);penaltyFreeze=end>=c.day;warnings.push('Segundo atraso: desce um degrau a partir da condição anterior; limite congelado até '+end+' (16.3).');}
   if(Number(i.shortEvents)>=3&&Number(i.maxDelay)<=5){term=Math.min(term,steps[Math.max(0,steps.indexOf(previous)-1)]);warnings.push('Terceiro atraso de até 5 dias: desce um degrau, com decisão do Financeiro (16.4).');}
  }
  if(Number(i.maxDelay)>5&&c.overdue===0){if(!i.settlementDate||!Number.isFinite(Date.parse(i.settlementDate))||i.settlementDate>c.day)pending.push('Informe a data da baixa para calcular o retorno após pagamento (16.4).');else if(Number(i.maxDelay)<=30){const end=addDays(i.settlementDate,Number(i.maxDelay)<=15?15:60);if(end>=c.day)cash=true;warnings.push('Retorno após pagamento: à vista até '+end+'; reavaliar sem aumento automático (16.4).');}}
 }

 if(i.restriction==='small'&&!isNew&&!i.goodHistory)pending.push('Restrição até R$ 5.000 sem bom histórico: a política exige avaliação específica; não há regra automática definida (7.4).');
 if(['relevant','protest'].includes(i.restriction)&&!isNew)term=Math.min(term,steps[Math.max(0,steps.indexOf(currentStep)-1)]);
 if(cash||blocked)term=0;
 const weeks=term/7,need=((i.weekly??0)*weeks+(i.order??0))*(i.growing?1.25:1.15);
 const classCap={A:130000,B:80000,C:40000,D:8000,E:0}[rank]*segment.factor;
 const initialCap={A:8000,B:5000,C:3000,D:1500,E:0}[rank]*segment.factor;
 const history=Math.max(i.peak??0,(i.received??0)/26*(weeks+1))*{A:1.5,B:1.3,C:1.1,D:.8,E:0}[rank];
 if((i.portfolio??0)>(i.dailyRevenue??0)*20)pending.push('Carteira acima de 20 dias de faturamento: aumentos suspensos; eventual exceção exige parecer e Gerência (9.6).');
 const caps={necessidade:need,classe_segmento:classCap,[isNew?'primeiro_limite':'historico']:isNew?initialCap:history,grupo_classe:Math.max(0,classCap-(i.otherGroup??0)),cliente_5:(i.portfolio??0)*.05,grupo_8:Math.max(0,(i.portfolio??0)*.08-(i.otherGroup??0)),carteira_20:Math.max(0,(i.dailyRevenue??0)*20-(i.portfolio??0)+c.exposure)};
 let limit=Math.floor(Math.max(0,Math.min(...Object.values(caps)))/500)*500;
 if(!isNew&&['relevant','protest'].includes(i.restriction))limit=Math.min(limit,Math.floor((i.order??0)/500)*500);
 if(penaltyOrderCap)limit=Math.min(limit,Math.floor((i.order??0)/500)*500);
 if(penaltyFreeze){limit=Math.min(limit,c.currentLimit);term=Math.min(term,c.currentTerm);}
 if(!isNew&&i.restriction==='small'&&i.goodHistory){if(c.currentLimit>Math.min(...Object.values(caps)))pending.push('Condição atual excede os tetos calculados: conferir o conflito antes de manter (7.4 e 9.3).');limit=c.currentLimit;term=Math.min(term,c.currentTerm);warnings.push('Restrição até R$ 5.000 com bom histórico: manter condição atual, congelar limite e rever em 30 dias (7.4).');}
 if(!isNew&&!!i.freezeUntil&&i.freezeUntil>=c.day){limit=Math.min(limit,c.currentLimit);term=Math.min(term,c.currentTerm);warnings.push('Limite congelado: sem aumento (16.3).');}
 const assessedTerm=term;
 if(cash||blocked||term===0)limit=0;if(limit===0)term=0;
 const extra=i.documentsDoubt||(i.requested??0)>(i.segment==='resale'?15000:30000);
 if(extra&&!i.additionalDocuments)pending.push('Confira comprovante de compra a prazo, identidade e documento da atividade (5.4).');
 if(i.requestedTerm>term)warnings.push(`Prazo solicitado de ${i.requestedTerm} dias limitado a ${term} dias pelas regras do capítulo 10 e impedimentos.`);
 let authority=limit>30000||term===28||rank==='D'||rank==='E'||i.restriction==='protest'||i.restriction==='judicial'||Number(i.maxDelay)>30||Number(i.lateEvents)>=4?'Gerência':isNew||limit>5000||term>=14||limit<c.currentLimit||i.restriction==='relevant'||Number(i.maxDelay)>5||Number(i.shortEvents)>=3?'Financeiro':'Crédito e Cobrança';if(i.directorReferred)authority='Diretoria';
 const reviewMonths=rank==='A'||rank==='B'?6:rank==='D'||c.curve==='A'||!c.curve?1:3;
 const nextReview=i.restriction==='small'&&!isNew?new Date(Date.parse(c.day+'T12:00:00Z')+30*86400000).toISOString().slice(0,10):months(c.day,reviewMonths);
 const validity=rank==='E'?null:months(c.day,rank==='A'||rank==='B'?12:rank==='C'?6:3);
 return {assessedTerm,version:'6.0',score,rank,source,limit,term,authority,caps,pending,warnings,ready:pending.length===0,blocked,cash,nextReview,validity,used:c.exposure+(i.pendingOrder??0),available:limit-c.exposure-(i.pendingOrder??0)};
}
/** Optional analysis: absence is not zero and cannot overwrite a known customer value. */
export function calculate(input:Input,c:Context){
 const i={...initialInput,...input},base=calculatePolicy(i,c);
 const isNew=i.kind==='new'||c.reactivated,weights=isNew?newWeights:existingWeights;
 const has=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const supplied=weights.filter(([key])=>i.points[key]!=null);
 const scoreComplete=weights.every(([key,,max])=>has(i.points[key])&&i.points[key]!<=max);
 const score=supplied.length?supplied.reduce((sum,[key])=>sum+(has(i.points[key])?i.points[key]!:0),0):null;
 const rank=scoreComplete?base.rank as 'A'|'B'|'C'|'D'|'E':null;
 const pending:string[]=[];
 for(const [key,label] of Object.entries(numericLabels)){const value=(i as unknown as Record<string,unknown>)[key];if(value!=null&&!has(value))pending.push(`Confira ${label}: informe um número não negativo ou deixe em branco.`);}
 for(const [key,label,max] of weights)if(i.points[key]!=null&&(!has(i.points[key])||i.points[key]!>max))pending.push(`${label}: use de 0 a ${max} pontos ou deixe em branco.`);
 if((has(i.months2)&&i.months2>6)||(has(i.months4)&&i.months4>6)||(has(i.months2)&&has(i.months4)&&i.months4>i.months2)||(has(i.onTime)&&i.onTime>100)||[i.months2,i.months4,i.lateEvents,i.maxDelay,i.shortEvents].some(v=>v!==null&&!Number.isInteger(v)))pending.push('Confira os meses (0–6), contadores inteiros e pontualidade (0–100%).');
 for(const key of ['spc','serasa'] as const)if(i[key]!=null&&(!has(i[key])||i[key]!>1000))pending.push(`Nota ${key.toUpperCase()}: use de 0 a 1.000 ou deixe em branco.`);
 for(const date of [i.spcDate,i.serasaDate,i.cashUntil,i.freezeUntil,i.incidentDate,i.settlementDate])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))))pending.push('Confira a data informada ou deixe em branco.');
 if(![0,7,14,21,28].includes(i.requestedTerm))pending.push('Selecione um prazo válido.');
 const knownCash=i.segment==='personal'||rank==='E'||i.agreement==='performing'||!!i.cashUntil&&i.cashUntil>=c.day||isNew&&i.restriction!=='none';
 const penaltyNeedsDates=!isNew&&(Number(i.lateEvents)>=2||Number(i.shortEvents)>=3||Number(i.maxDelay)>5)&&(!i.incidentDate||(Number(i.maxDelay)>5&&c.overdue===0&&!i.settlementDate));
 let term:number|null=knownCash?0:rank&&!penaltyNeedsDates?base.assessedTerm:null;
 if(base.blocked)term=null;
 const exposureTerm=term??i.requestedTerm, weeks=exposureTerm/7;
 const need=has(i.weekly)&&has(i.order)?Math.round((i.weekly*weeks+i.order)*(i.growing?1.25:1.15)*100)/100:null;
 const classCap=rank?{A:130000,B:80000,C:40000,D:8000,E:0}[rank]*segments[i.segment].factor:null;
 const history=rank&&(has(i.peak)||has(i.received))?Math.max(i.peak??0,(i.received??0)/26*(weeks+1))*{A:1.5,B:1.3,C:1.1,D:.8,E:0}[rank]:null;
 const caps:Record<string,number|null>={necessidade:need,classe_segmento:classCap,[isNew?'primeiro_limite':'historico']:isNew&&rank?{A:8000,B:5000,C:3000,D:1500,E:0}[rank]*segments[i.segment].factor:history,grupo_classe:classCap!==null&&has(i.otherGroup)?Math.max(0,classCap-i.otherGroup):null,cliente_5:has(i.portfolio)?i.portfolio*.05:null,grupo_8:has(i.portfolio)&&has(i.otherGroup)?Math.max(0,i.portfolio*.08-i.otherGroup):null,carteira_20:has(i.dailyRevenue)&&has(i.portfolio)?Math.max(0,i.dailyRevenue*20-i.portfolio+c.exposure):null};
 const knownCaps=Object.values(caps).filter(has);
 let limit:number|null=knownCash?0:rank&&term!==null&&need!==null&&knownCaps.length?Math.floor(Math.max(0,Math.min(...knownCaps))/500)*500:null;
 if(!isNew&&['relevant','protest'].includes(i.restriction)){if(has(i.order)&&limit!==null)limit=Math.min(limit,Math.floor(i.order/500)*500);else limit=null;}
 if(!isNew&&i.restriction==='small'&&i.goodHistory){limit=c.currentLimit;term=c.currentTerm;}
 if(limit!==null&&((i.freezeUntil&&i.freezeUntil>=c.day)||(!isNew&&i.lateEvents===2&&i.incidentDate&&Date.parse(i.incidentDate)+60*86400000>=Date.parse(c.day))))limit=Math.min(limit,c.currentLimit);
 if(base.blocked||penaltyNeedsDates)limit=null;
 if(limit===0)term=0;
 const omitted=Object.entries(caps).filter(([,v])=>v===null).map(([key])=>key);
 const partial=!scoreComplete||limit===null||term===null||omitted.length>0;
 const warnings:string[]=[];
 if(partial)warnings.push('Análise parcial: somente os dados preenchidos foram utilizados. Campos sem informação não foram considerados zero.');
 if(omitted.length)warnings.push('Há tetos não calculados por falta de dados. O limite estimado considera somente os tetos disponíveis.');
 if(base.blocked)warnings.push('Há impedimento de venda registrado. A análise pode ser salva; limite e prazo atuais serão preservados.');
 if(penaltyNeedsDates)warnings.push('Sem as datas do atraso e da baixa, o período da penalidade não foi calculado.');
 if(!base.source&&(i.spc!==null||i.serasa!==null))warnings.push('Nota externa registrada, mas sem data válida de até 90 dias; não utilizada como fonte válida.');
 if(!scoreComplete&&supplied.length)warnings.push('Pontuação parcial: a classe não é atribuída até que todos os itens da pontuação sejam informados.');
 if(!partial)warnings.push(...base.warnings);
 const authority=i.directorReferred?'Diretoria':rank==='D'||rank==='E'||(limit??0)>30000||term===28||['protest','judicial'].includes(i.restriction)?'Gerência':isNew||(limit??0)>5000||(term??0)>=14||limit!==null&&limit<c.currentLimit||i.restriction==='relevant'?'Financeiro':'Crédito e Cobrança';
 return {...base,score,scoreComplete,rank,limit,term,authority,caps,partial,omitted,pending,warnings,ready:pending.length===0,nextReview:rank?base.nextReview:null,validity:rank?base.validity:null,used:c.exposure+(i.pendingOrder??0),available:limit===null?null:limit-c.exposure-(i.pendingOrder??0)};
}
export const numericLabels:Record<string,string>={weekly:'Compra média semanal (R$)',order:'Pedido médio (R$)',received:'Principal recebido em 6 meses (R$)',peak:'Maior exposição quitada corretamente (R$)',portfolio:'Carteira aberta completa (R$)',dailyRevenue:'Faturamento médio diário (R$)',otherGroup:'Exposição dos outros integrantes do grupo (R$)',pendingOrder:'Pedido em análise (R$)',requested:'Limite solicitado (R$)',months2:'Meses com 2 ou mais pedidos (últimos 6)',months4:'Meses com 4 ou mais pedidos (últimos 6)',onTime:'Títulos pagos no prazo (%)',maxDelay:'Maior atraso do evento em análise (dias)',shortEvents:'Atrasos de até 5 dias no semestre',lateEvents:'Atrasos acima de 5 dias (últimos 6 meses)'};
export const marker='KF_POLICY_V6\n';
export function unpack(notes:string){if(!notes.startsWith(marker))return null;try{return JSON.parse(notes.slice(marker.length)) as {input:Input;result:ReturnType<typeof calculate>;report:string;context:Context;approval?:{authority:string;name:string;evidence:string}};}catch{return null;}}
export function displayNotes(notes:string){return unpack(notes)?.report??notes;}
