// Runs in an isolated extension world; never reads cookies or login fields.
export async function prepareNevera(p){
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const normalize=s=>(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
 const digits=s=>String(s??'').replace(/\D/g,'');
 const visible=e=>!!e&&e.getClientRects().length>0;
 const wait=async(fn,message)=>{for(let i=0;i<60;i++){const v=fn();if(v)return v;await sleep(200);}throw Error(message);};
 const frameDoc=()=>{const frame=document.getElementById('appFrame');return frame?.contentDocument??document;};
 const textLink=(d,text)=>[...d.querySelectorAll('a,button,[role="button"],td[id$="_lbl"],div[id$="_lbl"]')].filter(visible).filter(e=>normalize(e.textContent).replace(/^[^a-zA-Z]+/,'')===text);
 const clickText=(d,text)=>{const candidates=textLink(d,text);if(candidates.length!==1)throw Error('Não foi possível identificar '+text+'. Abra o cadastro correto no Nevera e tente novamente.');candidates[0].click();};
 const setValue=(el,value)=>{if(!el||el.disabled||el.readOnly)throw Error('Campo indisponível para edição.');const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));};
 const identity=()=>{const d=frameDoc(),tax=d.getElementById('form:CNPJ')??d.getElementById('form:CPF');if(!tax||!visible(tax))return null;const code=(d.body.innerText.match(/Código do cliente\s*(\d+)/i)??[])[1];return code?{code,taxId:digits(tax.value),name:d.getElementById('form:nome')?.value}:null;};
 const requireIdentity=()=>{const a=identity();if(!a||a.code.replace(/^0+(?=\d)/,'')!==p.code.replace(/^0+(?=\d)/,'')||a.taxId!==p.taxId)throw Error('Código ou CPF/CNPJ diferente do cadastro King Foods. Nenhum limite foi preenchido.');return a;};
 const topText=document.body.innerText;
 if(!topText.includes('10.680.812/0001-89'))throw Error('Confirme o login na empresa PROATIVA ALIMENTOS LTDA (10.680.812/0001-89) no Nevera.');
 if(!identity()){
  // Only navigate menus when a customer editor is not already open.
  for(const text of ['Cadastros','Parceiros','Cliente','Cadastro de cliente']){
   if(frameDoc().body.innerText.includes('Consultar por')&&frameDoc().body.innerText.includes('CNPJ/CPF'))break;
   const candidates=textLink(document,text);if(candidates.length===1){candidates[0].click();await sleep(300);}
  }
  const d=await wait(()=>{const d=frameDoc();return d.body.innerText.includes('Consultar por')&&d.body.innerText.includes('CNPJ/CPF')?d:null;},'Abra Cadastros → Parceiros → Cliente → Cadastro de cliente no Nevera.');
  const selects=[...d.querySelectorAll('select')].filter(visible).filter(s=>[...s.options].some(o=>normalize(o.text)==='Codigo'));
  if(selects.length!==1)throw Error('Selecione manualmente o cliente no Nevera e tente novamente.');
  const select=selects[0];select.value=[...select.options].find(o=>normalize(o.text)==='Codigo').value;select.dispatchEvent(new Event('change',{bubbles:true}));await sleep(500);
  const inputs=[...frameDoc().querySelectorAll('input[type="text"]')].filter(visible);
  if(inputs.length!==1)throw Error('Abra a consulta de clientes por Código e tente novamente.');
  setValue(inputs[0],p.code);clickText(frameDoc(),'Consultar');
  const row=await wait(()=>[...frameDoc().querySelectorAll('tr')].find(r=>{const cells=[...r.children].filter(c=>c.tagName==='TD');return cells.length>=3&&cells[0].textContent.trim().replace(/^0+(?=\d)/,'')===p.code.replace(/^0+(?=\d)/,'')&&digits(cells[1].textContent)===p.taxId;}),'Cliente não localizado com o mesmo código e CPF/CNPJ. Confira os dois cadastros.');
  const links=[...row.querySelectorAll('a')].filter(visible);const named=links.filter(a=>normalize(a.textContent)===normalize(p.name)||/editar|alterar/i.test(a.title??''));const target=named.length===1?named[0]:links.length===1?links[0]:null;
  if(!target)throw Error('Cliente localizado. Abra o cadastro encontrado no Nevera e clique novamente em preencher.');
  target.click();await wait(identity,'Abra o cadastro encontrado e tente novamente.');
 }
 const actual=requireIdentity();
 // Never change a different already-open customer or submit Gravar automatically.
 clickText(frameDoc(),'Limite do cliente');
 const limit=await wait(()=>{const d=frameDoc();const rows=[...d.querySelectorAll('tr')].filter(r=>{const c=r.querySelector('td');return c&&/^Valor\s*\*?$/.test(c.textContent.trim());});const inputs=rows.flatMap(r=>[...r.querySelectorAll('input[type="text"]')]).filter(visible);return inputs.length===1?inputs[0]:null;},'Campo Valor do limite não encontrado. O layout do Nevera pode ter mudado.');
 requireIdentity();const previous=limit.value;const amount=(p.limitCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
 setValue(limit,amount);
 const parseMoney=s=>Math.round(Number(String(s).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'))*100);
 if(parseMoney(limit.value)!==p.limitCents)throw Error('O campo de limite não aceitou o valor exato. Confira manualmente antes de gravar.');
 clickText(frameDoc(),'Observacao');
 const note=await wait(()=>{const el=frameDoc().getElementById('form:observacaoCliente');return visible(el)?el:null;},'Limite preenchido, mas não foi possível abrir a observação. Confira o formulário antes de gravar.');
 requireIdentity();
 if(note.value.trim()&&note.value!==p.observation)throw Error('Já existe uma observação sendo digitada. Ela foi preservada. Confira o limite preenchido e finalize ou cancele sua edição antes de tentar novamente.');
 const history=frameDoc().getElementById('form:observacaoVO');
 if(history?.textContent.includes(p.requestId))throw Error('Esta referência já consta no histórico. Confira se a atualização já foi gravada.');
 setValue(note,p.observation);
 if(note.value!==p.observation)throw Error('A observação não foi preenchida integralmente. Confira no Nevera.');
 return {previous,name:actual.name,message:'Cliente conferido. Limite e observação preenchidos. No Nevera, clique em Adicionar na observação e em Gravar no cadastro. A extensão não afirma que os dados foram salvos.'};
}
