import {purchaseKey,validDay,type PaidRow,type PurchaseRow,type Report} from './credit-policy';
export const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function decodeReport(buffer:ArrayBuffer){try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}catch{return new TextDecoder('windows-1252').decode(buffer).replace(/^\uFEFF/,'');}}
export function parseReport(text:string){
 if(text.length>5_000_000)throw new Error('O CSV deve ter até 5 MB.');
 const candidates=[';',',','\t'];const headerLine=text.split(/\r?\n/).filter(Boolean)[0]??'';
 const count=(sep:string)=>{let quote=false,n=0;for(let x=0;x<headerLine.length;x++){if(headerLine[x]==='"'){if(quote&&headerLine[x+1]==='"')x++;else quote=!quote;}else if(!quote&&headerLine[x]===sep)n++;}return n;};
 const delimiter=candidates.sort((a,b)=>count(b)-count(a))[0];const all:string[][]=[];let row:string[]=[],value='',quoted=false;
 for(let x=0;x<text.length;x++){const ch=text[x];if(ch==='"'){if(quoted&&text[x+1]==='"'){value+='"';x++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(value.trim());value='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[x+1]==='\n')x++;row.push(value.trim());if(row.some(Boolean))all.push(row);row=[];value='';}else value+=ch;}
 if(quoted)throw new Error('CSV com aspas não fechadas.');row.push(value.trim());if(row.some(Boolean))all.push(row);
 if(all.length<2)throw new Error('O CSV precisa de cabeçalho e registros.');if(all.length>5001)throw new Error('Importe até 5.000 linhas por relatório.');
 return tableFromRows(all);
}
export type Mapping={document:number;date:number;delay:number;amount:number;purchase:number;customer:number};
export function suggestMapping(headers:string[]):Mapping{const index=(names:string[])=>headers.findIndex(h=>names.includes(normalize(h)));return {document:index(['doc','documento','titulo','numero titulo','numero documento','documento parcela']),date:index(['data compra','data da compra','data emissao','emissao','data pedido','data de emissao','dt emissao','data do pedido','data venda','data da venda','data']),delay:index(['atraso','dias atraso','dias de atraso']),amount:index(['valor parcela','valor da parcela']),purchase:index(['pedido','numero pedido','numero do pedido','documento original']),customer:index(['cliente','nome cliente','nome do cliente','razao social','codigo cliente','codigo do cliente','cpf cnpj'])};}
export function reportDate(raw:string){let value=raw.trim().split(/[ T]/)[0];const match=value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);if(match)value=`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;return validDay(value)?value:null;}
export function parcelaCents(raw:string){let v=raw.replace(/R\$|\s/g,'');if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(v)&&!/^\d+(?:\.\d{1,2})?$/.test(v))return null;if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(?:\.\d{3})+$/.test(v))v=v.replace(/\./g,'');const amount=Math.round(Number(v)*100);return Number.isSafeInteger(amount)&&amount>=0?amount:null;}
export function convertReport(table:ReturnType<typeof parseReport>,mapping:Mapping,kind:'paid'|'purchases',customerValue:string,customerId:string,fileName:string,day:string){
 if(mapping.document<0||mapping.date<0||kind==='paid'&&mapping.delay<0)throw new Error('Selecione as colunas de documento, data e atraso (para títulos pagos).');
 if(kind==='purchases'&&(mapping.amount<0||!['valor parcela','valor da parcela'].includes(normalize(table.headers[mapping.amount]??''))))throw new Error('O valor deve vir exclusivamente da coluna Valor Parcela.');
 if(mapping.customer>=0&&!customerValue)throw new Error('Selecione o cliente do relatório.');
 const rows:(PaidRow|PurchaseRow)[]=[],invalid:{line:number;reason:string}[]=[],seen=new Map<string,string>();let duplicates=0,excluded=0;
 table.rows.forEach((cells,index)=>{
  if(mapping.customer>=0&&cells[mapping.customer]!==customerValue){excluded++;return;}
  if(kind==='paid'){const col=table.headers.findIndex(h=>['baixa','data baixa','data de baixa','data pagamento'].includes(normalize(h)));if(col>=0){const raw=(cells[col]??'').trim();if(!raw){excluded++;return;}const paidDate=reportDate(raw);if(!paidDate||paidDate>day){invalid.push({line:table.lines?.[index]??index+2,reason:'Data de baixa inválida ou futura.'});return;}}}
  const document=cells[mapping.document]?.trim(),date=reportDate(cells[mapping.date]??'');
  if(!document||!date||date>day){invalid.push({line:table.lines?.[index]??index+2,reason:'Documento vazio ou data inválida/futura.'});return;}
  let row:PaidRow|PurchaseRow;
  if(kind==='paid'){const raw=(cells[mapping.delay]??'').trim();if(!/^\d+(?:\s*dia(?:\(s\)|s)?)?$/i.test(raw)){invalid.push({line:table.lines?.[index]??index+2,reason:'Atraso deve ser um inteiro não negativo.'});return;}row={document,date,delay:parseInt(raw,10)};}
  else{const amount=parcelaCents(cells[mapping.amount]??'');if(amount===null){invalid.push({line:table.lines?.[index]??index+2,reason:'Valor Parcela inválido.'});return;}const purchase=mapping.purchase>=0?cells[mapping.purchase]?.trim():purchaseKey(document);if(!purchase){invalid.push({line:table.lines?.[index]??index+2,reason:'Pedido/documento original vazio.'});return;}row={document,date,amount,purchase};}
  const prior=seen.get(document),json=JSON.stringify(row);if(prior){if(prior===json)duplicates++;else invalid.push({line:table.lines?.[index]??index+2,reason:`Documento ${document} repetido com dados divergentes.`});return;}seen.set(document,json);rows.push(row);
 });
 return {report:{customerId,fileName,customerLabel:customerValue||'Relatório individual confirmado',rows} as Report<PaidRow>|Report<PurchaseRow>,invalid,duplicates,excluded};
}

// Recognize the accounting export, while retaining malformed detail rows for validation.
export function tableFromRows(all:string[][]){
 const header=all.findIndex(c=>{const m=suggestMapping(c);return m.document>=0&&m.date>=0&&(m.amount>=0||m.delay>=0);});
 const start=header<0?0:header,headers=all[start]??[],mapping=suggestMapping(headers);
 const known=['cliente','conta','data emissao','vencimento','baixa','atraso','doc','valor parcela'].every(h=>headers.some(v=>normalize(v)===h));
 const rows:string[][]=[],lines:number[]=[];let summaries=0;
 for(let i=start+1;i<all.length;i++){
  const cells=all[i];if(!cells.some(v=>v.trim()))continue;
  if(known){
   if(headers.every((h,n)=>normalize(cells[n]??'')===normalize(h))){summaries++;continue;}
   const doc=(cells[mapping.document]??'').trim(),date=(cells[mapping.date]??'').trim();
   const first=(cells[0]??'').trim();
   const total=!doc&&!date&&cells.slice(0,7).every(v=>!v.trim()||/^total(?: geral)?[: ]*$/i.test(v.trim()));
   const account=!doc&&!cells.slice(3).some(v=>v.trim())&&/^\d+(?:\.\d+){2,}$/.test(first)&&!!cells[1]?.trim()&&parcelaCents(date)!==null;
   if(total||account){summaries++;continue;}
  }
  rows.push(cells);lines.push(i+1);
 }
 if(!rows.length)throw new Error('O relatório não contém títulos.');
 if(rows.length>5000)throw new Error('Importe até 5.000 títulos por relatório.');
 return {headers,rows,lines,summaries,recognized:known};
}
export function matchReportCustomer(values:string[],customer:{name:string;customer_code:string;tax_id:string}){
 const code=customer.customer_code.trim(),name=normalize(customer.name),tax=customer.tax_id.replace(/\D/g,'');
 const matches=values.filter(v=>{
  const split=v.match(/^\s*(\d+)\s*[-–]\s*(.+)$/);
  return (!!code&&(v.trim()===code||split?.[1]===code))||normalize(v)===name||!!split&&normalize(split[2])===name||!!tax&&v.replace(/\D/g,'')===tax;
 });
 return matches.length===1?matches[0]:values.length===1?values[0]:'';
}
export function paidFromPurchases(table:ReturnType<typeof parseReport>,mapping:Mapping,customerValue:string,customerId:string,fileName:string,day:string){
 const paidColumn=table.headers.findIndex(h=>['baixa','data baixa','data de baixa','data pagamento'].includes(normalize(h)));
 if(paidColumn<0||mapping.delay<0)return null;
 const rows:string[][]=[],lines:number[]=[];
 table.rows.forEach((r,i)=>{if(mapping.customer>=0&&r[mapping.customer]!==customerValue)return;
  const raw=(r[paidColumn]??'').trim();if(!raw)return;
  const date=reportDate(raw);if(!date||date>day)throw new Error('Existe uma data de baixa inválida ou futura. Confira o relatório de títulos pagos.');
  rows.push(r);lines.push(table.lines?.[i]??i+2);
 });
 if(!rows.length)return null;
 return convertReport({...table,rows,lines},mapping,'paid',customerValue,customerId,fileName,day);
}
