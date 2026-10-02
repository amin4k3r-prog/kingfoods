'use client';
import {useState} from 'react';
import {readApiResponse} from '@/lib/api-response';
export function NeveraButton({customerId}:{customerId:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function send(){setBusy(true);setMessage('');try{
  await new Promise<void>((resolve,reject)=>{const id=crypto.randomUUID();const timeout=setTimeout(()=>{window.removeEventListener('message',listener);reject(new Error('Instale a extensão King Foods → Nevera, conecte este site pelo ícone da extensão e atualize a página.'));},1800);function listener(e:MessageEvent){if(e.source===window&&e.origin===location.origin&&e.data?.channel==='KF_NEVERA_REPLY'&&e.data.id===id){clearTimeout(timeout);window.removeEventListener('message',listener);e.data.ok?resolve():reject(new Error(e.data.error));}}window.addEventListener('message',listener);window.postMessage({channel:'KF_NEVERA_REQUEST',id,action:'ping'},location.origin);});
  const payload=await readApiResponse(await fetch('/api/nevera-export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:customerId})}));
  await new Promise<void>((resolve,reject)=>{const id=crypto.randomUUID();const timeout=setTimeout(()=>{window.removeEventListener('message',listener);reject(new Error('A extensão não respondeu. Abra seu ícone para conferir a solicitação antes de tentar novamente.'));},8000);function listener(e:MessageEvent){if(e.source===window&&e.origin===location.origin&&e.data?.channel==='KF_NEVERA_REPLY'&&e.data.id===id){clearTimeout(timeout);window.removeEventListener('message',listener);e.data.ok?resolve():reject(new Error(e.data.error));}}window.addEventListener('message',listener);window.postMessage({channel:'KF_NEVERA_REQUEST',id,action:'prepare',payload},location.origin);});
  setMessage('Enviado à extensão. Confira os dados na aba aberta e preencha o Nevera. A gravação será feita por você no Nevera.');
 }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <div><button type="button" className="secondary-button" disabled={busy} onClick={()=>void send()}>{busy?'Preparando…':'Atualizar no Nevera'}</button>{message&&<p role="status">{message}</p>}</div>;
}
