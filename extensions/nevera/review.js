import {validatePayload,currency} from './shared.js';
const status=document.querySelector('#status'),fill=document.querySelector('#fill');let request;
async function load(){try{
 const {pending}=await chrome.storage.session.get('pending');request=validatePayload(pending);document.querySelector('#data').hidden=false;
 const details=document.querySelector('#details');for(const [label,value]of [['Cliente',request.name],['Código',request.code],['CPF/CNPJ',request.taxId],['Limite aprovado',currency(request.limitCents)],['Responsável',request.actor],['Origem',request.sourceOrigin]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;details.append(dt,dd);}
 document.querySelector('#note').value=request.observation;
 const tabs=await chrome.tabs.query({url:'https://app.nevera.io/meat4/*'});if(!tabs.length)throw Error('Abra o Nevera e faça login. Depois reabra esta solicitação pelo ícone da extensão.');
 for(const tab of tabs){const option=document.createElement('option');option.value=tab.id;option.textContent=tab.title+' (aba '+tab.id+')';document.querySelector('#tab').append(option);}
 if(tabs.length>1){const o=document.createElement('option');o.value='';o.textContent='Selecione a aba correta';document.querySelector('#tab').prepend(o);document.querySelector('#tab').value='';}
}catch(e){status.textContent=e.message;status.className='error';}}
document.querySelector('#confirm').onchange=()=>fill.disabled=!document.querySelector('#confirm').checked;
fill.onclick=async()=>{fill.disabled=true;status.className='';status.textContent='Localizando e conferindo o cliente…';try{const r=await chrome.runtime.sendMessage({action:'fill',requestId:request.requestId,tabId:Number(document.querySelector('#tab').value)});if(!r.ok)throw Error(r.error);status.textContent=r.message;}catch(e){status.className='error';status.textContent=e.message;}finally{fill.disabled=false;}};
document.querySelector('#cancel').onclick=async()=>{await chrome.runtime.sendMessage({action:'cancel',requestId:request?.requestId});document.querySelector('#data').hidden=true;status.textContent='Solicitação descartada.';};
load();
