(()=>{if(window.__kfNeveraBridge)return;window.__kfNeveraBridge=true;
window.addEventListener('message',async e=>{
 if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='KF_NEVERA_REQUEST'||!['ping','prepare'].includes(e.data.action)||typeof e.data.id!=='string')return;
 const {id,action,payload}=e.data;try{const result=await chrome.runtime.sendMessage({action,payload});window.postMessage({channel:'KF_NEVERA_REPLY',id,...result},location.origin);}catch{window.postMessage({channel:'KF_NEVERA_REPLY',id,ok:false,error:'Atualize a página e reconecte a extensão.'},location.origin);}
});})();
