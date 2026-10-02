import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareNevera} from '../extensions/nevera/adapter.js';
function fixture(tax='12345678901',code='4048'){
 let tab='initial';const clicks=[];
 class Input{constructor(value='',text=''){this._value=value;this.textContent=text;this.disabled=false;this.readOnly=false;this.tagName='INPUT';}get value(){return this._value}set value(v){this._value=v}dispatchEvent(){}getClientRects(){return [{}]}}
 class Textarea extends Input{constructor(value){super(value);this.tagName='TEXTAREA'}get value(){return this._value}set value(v){this._value=v}}
 const id=new Input(tax),name=new Input('Cliente'),limit=new Input('100,00'),note=new Textarea('');
 const buttons=['Limite do cliente','Observação','Gravar','Adicionar'].map(text=>({textContent:text,getClientRects:()=>[{}],click(){clicks.push(text);tab=text==='Limite do cliente'?'limit':'note';}}));
 const row={querySelector:()=>({textContent:'Valor *'}),querySelectorAll:()=>[limit]};
 const d={body:{innerText:'Código do cliente'+code+'Tipo pessoa'},getElementById(key){return {'form:CNPJ':id,'form:nome':name,'form:observacaoCliente':tab==='note'?note:null,'form:observacaoVO':{textContent:''}}[key]},querySelectorAll(q){return q==='tr'&&tab==='limit'?[row]:buttons}};
 globalThis.document={body:{innerText:'PROATIVA 10.680.812/0001-89'},getElementById:()=>({contentDocument:d})};globalThis.HTMLInputElement=Input;globalThis.HTMLTextAreaElement=Textarea;
 return {limit,note,clicks};
}
const p={code:'4048',taxId:'12345678901',limitCents:8382171,observation:'Limite atualizado por Operador. Referência: teste',requestId:'teste'};
test('adapter fills exact cents and new note, never presses Add or Save',async()=>{const f=fixture();const r=await prepareNevera(p);assert.equal(f.limit.value,'83821,71');assert.equal(f.note.value,p.observation);assert.deepEqual(f.clicks,['Limite do cliente','Observação']);assert.match(r.message,/Gravar/);});
test('wrong CPF or code stops before any clicks or field mutation',async()=>{for(const [tax,code]of [['99999999999','4048'],['12345678901','5000']]){const f=fixture(tax,code);await assert.rejects(prepareNevera(p),/CPF/);assert.equal(f.limit.value,'100,00');assert.deepEqual(f.clicks,[]);}});
test('preserves a note already being edited',async()=>{const f=fixture();f.note.value='Não apagar';await assert.rejects(prepareNevera(p),/preservada/);assert.equal(f.note.value,'Não apagar');assert.ok(!f.clicks.includes('Gravar'));});
