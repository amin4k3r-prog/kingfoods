import {decodeReport,parseReport,tableFromRows} from './credit-import';

export async function readCreditFile(buffer:ArrayBuffer,fileName:string){
 if(buffer.byteLength>5_000_000)throw new Error('Importe um relatório de até 5 MB.');
 if(/\.csv$/i.test(fileName))return parseReport(decodeReport(buffer));
 if(!/\.xlsx?$/i.test(fileName))throw new Error('Selecione um arquivo XLS, XLSX ou CSV.');
 const {read,utils}=await import('xlsx');
 const book=read(buffer,{type:'array',cellDates:true,sheetRows:5102,cellFormula:false});
 const tables:ReturnType<typeof parseReport>[]=[];
 for(const name of book.SheetNames){
  const sheet=book.Sheets[name];
  const range=utils.decode_range(sheet['!fullref']??sheet['!ref']??'A1');
  if(range.e.r>5100||range.e.c>100)throw new Error('A planilha excede o limite de 5.000 títulos ou 100 colunas.');
  const rows=utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:'',blankrows:true}).map(row=>row.map(cell=>cell instanceof Date?cell.toISOString().slice(0,10):typeof cell==='number'?String(Number(cell.toFixed(8))):String(cell??'')));
  try{const table=tableFromRows(rows);if(table.headers.some(h=>/^(doc|documento|título|titulo)$/i.test(h.trim())))tables.push(table);}catch(e){if(rows.length>5001)throw e;}
 }
 if(tables.length!==1)throw new Error(tables.length?'Há mais de uma aba de títulos. Importe uma planilha com apenas o relatório desejado.':'Não foi possível identificar as colunas do relatório Excel.');
 return tables[0];
}
