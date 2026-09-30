export type SellerTitle={id:string;document:string|null;title:string;customer_id:string|null;customer:string|null;due:string;amount:number;seller:string|null;customer_code:string|null;customer_name:string|null;customer_seller:string|null};
export type ReportTitle=SellerTitle&{sellerLabel:string;clientLabel:string;days:number;status:string;level:number};
export const reportMoney=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const reportDate=(date:string)=>date.split('-').reverse().join('/');
export const reportDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const daysLabel=(days:number)=>`${days} ${days===1?'dia':'dias'}`;
const sellerName=(value:string|null)=>value?.trim()&& !['não informado','nao informado'].includes(value.trim().toLocaleLowerCase('pt-BR'))?value.trim():'';
export function prepareSellerTitles(rows:SellerTitle[],day=reportDay()):ReportTitle[]{
 return [...new Map(rows.map(row=>[row.id,row])).values()].map(row=>{
  const days=Math.max(0,Math.floor((Date.parse(day+'T12:00:00Z')-Date.parse(row.due+'T12:00:00Z'))/86400000));
  if(!Number.isFinite(days)||!Number.isSafeInteger(row.amount)||row.amount<0)throw new Error('Há um título com data ou valor inválido. Confira o cadastro antes de exportar.');
  return {...row,sellerLabel:sellerName(row.seller)||sellerName(row.customer_seller)||'Sem vendedor informado',clientLabel:row.customer_name||row.customer||'Cliente não informado',days,status:row.due<day?'Vencido':row.due===day?'Vence hoje':'A vencer',level:days>=30?3:days>=15?2:days>=5?1:0};
 }).sort((a,b)=>b.days-a.days||a.due.localeCompare(b.due)||(a.document??a.title).localeCompare(b.document??b.title,'pt-BR')||a.id.localeCompare(b.id));
}
export function groupSellerTitles(rows:ReportTitle[]){
 const groups=new Map<string,ReportTitle[]>();
 for(const row of rows){const list=groups.get(row.sellerLabel)??[];list.push(row);groups.set(row.sellerLabel,list);}
 return [...groups].sort(([a],[b])=>a.localeCompare(b,'pt-BR'));
}

// Small client-side vector PDF writer: no server rendering or external service.
// Standard embedded PDF font encoding supports Portuguese and selectable text.
const winAnsi:Record<string,number>={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'€':128,'•':149};
function pdfText(value:string){return '('+Array.from(value.normalize('NFC').replace(/[\r\n\t]/g,' ')).map(char=>{const code=winAnsi[char]??char.charCodeAt(0);return code>255?'?':code<32?' ':`\\${code.toString(8).padStart(3,'0')}`;}).join('')+')';}
function textWidth(value:string,size:number){return Array.from(value).reduce((sum,c)=>sum+(/[MWmw@%]/.test(c)?1:/[ilI.,:;!'| ]/.test(c)?.3:/[A-ZÀ-Ý]/.test(c)?.78:.62)*size,0);}
function wrap(value:string,width:number,size:number){
 const lines:string[]=[];let line='';
 for(const word of value.replace(/\s+/g,' ').trim().split(' ')){
  if(line&&textWidth(line+' '+word,size)>width){lines.push(line);line='';}
  for(const char of (line?' ':'')+word){if(textWidth(line+char,size)>width&&line){lines.push(line);line='';}line+=char;}
 }if(line)lines.push(line);return lines.length?lines:[''];
}
export function buildSellerPdf(rows:ReportTitle[],issued=new Date()):Uint8Array{
 if(!rows.length)throw new Error('Selecione ao menos um título.');
 const groups=groupSellerTitles(rows),pages:string[][]=[];let commands:string[]=[],y=0;
 const emission=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short',hour12:false}).format(issued);
 const ink='0.12 0.14 0.18',purple='0.24 0.16 0.39';
 const colors=[['0.90 0.96 0.92','0.08 0.34 0.18'],['1 0.96 0.78','0.42 0.29 0'],['1 0.90 0.78','0.58 0.23 0.02'],['1 0.86 0.86','0.62 0.06 0.08']];
 const rect=(x:number,top:number,w:number,h:number,color:string)=>commands.push(`${color} rg ${x} ${842-top-h} ${w} ${h} re f`);
 const text=(value:string,x:number,top:number,size=9,bold=false,color=ink)=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${842-top-size} Tm ${pdfText(value)} Tj ET`);
 const page=()=>{commands=[];pages.push(commands);rect(32,30,531,4,purple);text('KING FOODS',32,46,18,true,purple);text('RELATÓRIO DE TÍTULOS EM ABERTO',32,71,12,true);text('Data de emissão: '+emission+' (Brasília)',32,93,9);text('Dias em Aberto = atraso desde o vencimento. A vencer / vence hoje: 0 dias.',32,109,8);y=137;};
 const columns=[32,112,292,364,444,511],widths=[80,180,72,80,67,52];
 const tableHeader=()=>{rect(32,y,531,28,purple);['Título','Cliente','Vencimento','Dias em Aberto','Valor','Status'].forEach((label,i)=>{wrap(label,widths[i]-10,8).forEach((line,n)=>text(line,columns[i]+5,y+5+n*9,8,true,'1 1 1'));});y+=28;};
 const sellerHeader=(seller:string,continuation=false)=>{const lines=wrap('VENDEDOR: '+seller+(continuation?' (continuação)':''),515,11);const h=lines.length*14+14;rect(32,y,531,h,'0.94 0.92 0.97');lines.forEach((line,i)=>text(line,40,y+7+i*14,11,true,purple));y+=h+6;tableHeader();};
 page();
 for(const [seller,titles] of groups){
  if(y>625)page();sellerHeader(seller);
  for(const row of titles){
   const cells=[row.document||row.title,(row.customer_code?'#'+row.customer_code+' · ':'')+row.clientLabel,reportDate(row.due),daysLabel(row.days),reportMoney(row.amount),row.status];
   const lines=cells.map((value,i)=>wrap(value,widths[i]-10,i===3?10:8));
   const height=Math.max(32,...lines.map(cell=>cell.length*12+14));
   if(y+height>750){page();sellerHeader(seller,true);}
   rect(32,y,531,height,'0.98 0.98 0.99');rect(columns[3],y,widths[3],height,colors[row.level][0]);
   if(row.level===3)rect(columns[3],y,3,height,colors[3][1]);
   lines.forEach((cell,i)=>cell.forEach((line,n)=>text(line,columns[i]+5,y+7+n*12,i===3?10:8,i===3,i===3?colors[row.level][1]:ink)));
   rect(32,y+height-0.5,531,0.5,'0.83 0.84 0.86');y+=height;
  }
  if(y+44>775){page();text('VENDEDOR: '+seller+' - totais',32,y,10,true);y+=24;}
  text('Quantidade de títulos: '+titles.length,32,y+9,10,true);text('Valor total em aberto: '+reportMoney(titles.reduce((sum,row)=>sum+row.amount,0)),285,y+9,10,true);y+=48;
 }
 if(y+94>780)page();rect(32,y,531,90,purple);text('TOTAL GERAL',44,y+12,12,true,'1 1 1');text('Total de vendedores: '+groups.length+'    |    Total de títulos: '+rows.length,44,y+37,10,true,'1 1 1');text('Valor total em aberto: '+reportMoney(rows.reduce((sum,row)=>sum+row.amount,0)),44,y+59,13,true,'1 1 1');
 pages.forEach((p,index)=>{commands=p;rect(32,801,531,0.5,'0.8 0.8 0.84');text('KING FOODS · Relatório de cobrança · Valores em reais',32,810,8);text(`Página ${index+1} de ${pages.length}`,476,810,8);});
 const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const kids:number[]=[];
 for(const p of pages){const stream=p.join('\n'),pageId=objects.length+1; kids.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId+1} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);}
 objects[1]=`<< /Type /Pages /Kids [${kids.map(id=>id+' 0 R').join(' ')}] /Count ${kids.length} >>`;
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=pdf.length;
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Uint8Array.from(pdf,char=>char.charCodeAt(0));
}
