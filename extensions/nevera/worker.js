import {validatePayload} from './shared.js';
import {prepareNevera} from './adapter.js';
let filling=false;
const internal=s=>!s.tab&&s.url?.startsWith(chrome.runtime.getURL(''));
async function configure(origin){
 if(!/^https:\/\/[^/]+$/.test(origin)||origin==='https://app.nevera.io'||!await chrome.permissions.contains({origins:[origin+'/*']}))throw Error('Origem não autorizada.');
 const old=(await chrome.storage.local.get('origin')).origin;
 const scripts=await chrome.scripting.getRegisteredContentScripts();if(scripts.some(s=>s.id==='kingfoods'))await chrome.scripting.unregisterContentScripts({ids:['kingfoods']});
 await chrome.scripting.registerContentScripts([{id:'kingfoods',matches:[origin+'/*'],js:['bridge.js'],runAt:'document_idle'}]);
 await chrome.storage.local.set({origin});await chrome.storage.session.clear();
 if(old&&old!==origin)await chrome.permissions.remove({origins:[old+'/*']});
}
async function handle(m,s){
 if(s.id!==chrome.runtime.id)throw Error('Origem inválida.');
 if(['configure','disconnect','fill','cancel'].includes(m.action)&&!internal(s))throw Error('Use a janela da extensão.');
 if(m.action==='configure'){await configure(m.origin);return {ok:true};}
 if(m.action==='disconnect'){const {origin}=await chrome.storage.local.get('origin');await chrome.scripting.unregisterContentScripts({ids:['kingfoods']}).catch(()=>{});await chrome.storage.local.clear();await chrome.storage.session.clear();if(origin)await chrome.permissions.remove({origins:[origin+'/*']});return {ok:true};}
 if(m.action==='cancel'){const {pending}=await chrome.storage.session.get('pending');if(pending?.requestId===m.requestId)await chrome.storage.session.clear();return {ok:true};}
 if(m.action==='fill'){
  if(filling)throw Error('Já existe um preenchimento em andamento.');
  const {pending,filled}=await chrome.storage.session.get(['pending','filled']);const p=validatePayload(pending);
  if(p.requestId!==m.requestId||filled===p.requestId)throw Error('Solicitação já preenchida ou substituída. Confira no Nevera.');
  if(!Number.isInteger(m.tabId)||m.tabId<=0)throw Error('Selecione a aba do Nevera.');
  const tab=await chrome.tabs.get(m.tabId);if(!tab.url?.startsWith('https://app.nevera.io/meat4/'))throw Error('A aba selecionada não é o Nevera.');
  filling=true;try{const result=await chrome.scripting.executeScript({target:{tabId:m.tabId},func:prepareNevera,args:[p]});
   if(!result[0]?.result?.message)throw Error('Não foi possível confirmar o preenchimento. Confira no Nevera.');
   await chrome.storage.session.set({filled:p.requestId});await chrome.tabs.update(m.tabId,{active:true});return {ok:true,message:result[0].result.message};
  }finally{filling=false;}
 }
 const {origin}=await chrome.storage.local.get('origin');if(!s.tab||s.frameId!==0||!origin||new URL(s.url).origin!==origin)throw Error('Conecte este site pelo ícone da extensão.');
 if(m.action==='ping')return {ok:true};
 if(m.action==='prepare'){
  if(filling)throw Error('Aguarde o preenchimento atual.');
  const p=validatePayload(m.payload);await chrome.storage.session.set({pending:{...p,sourceOrigin:origin},filled:null});await chrome.tabs.create({url:chrome.runtime.getURL('review.html')});return {ok:true};
 }
 throw Error('Ação desconhecida.');
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{handle(m,s).then(reply,e=>reply({ok:false,error:e.message||'Falha na extensão.'}));return true;});
