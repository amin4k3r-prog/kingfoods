const status=document.querySelector('#status');
document.querySelector('#connect').onclick=async()=>{try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const origin=new URL(tab.url).origin;
 if(!origin.startsWith('https://')||origin==='https://app.nevera.io')throw Error('Abra a aba do seu site King Foods (GitHub/Cloudflare).');
 const granted=await chrome.permissions.request({origins:[origin+'/*']});if(!granted)throw Error('Permissão não concedida.');
 const result=await chrome.runtime.sendMessage({action:'configure',origin});if(!result.ok)throw Error(result.error);
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['bridge.js']});status.textContent='Conectado: '+origin+'. Use Atualizar no Nevera no cadastro do cliente.';
}catch(e){status.textContent=e.message;}};
document.querySelector('#review').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('review.html')});
document.querySelector('#disconnect').onclick=async()=>{const r=await chrome.runtime.sendMessage({action:'disconnect'});status.textContent=r.ok?'Site desconectado.':r.error;};
chrome.storage.local.get('origin').then(v=>status.textContent=v.origin?'Site conectado: '+v.origin:'Nenhum site conectado.');
