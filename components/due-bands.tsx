'use client';
import {useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {animate} from 'animejs';
import {Maximize2,Minimize2,Plus,FileText,Check,Paperclip,Tag} from 'lucide-react';
import {daysLate,money,type Card,type Customer,type Attachment} from '@/lib/board';
import './due-bands.css';
import {TitleLabelBadge} from './title-label';

type Band={label:string;caption:string;day:number;cards:Card[]};
type Props={columns:Band[];customers:Customer[];files:Attachment[];day:string;onOpen:(card:Card)=>void;onMark:(card:Card)=>void;onLabel:(card:Card)=>void;onAdd:(day:number)=>void};
// Keep React children mounted until the closing animation has finished.
function BandPanel({open,id,headingId,children}:{open:boolean;id:string;headingId:string;children:ReactNode}){
 const panel=useRef<HTMLDivElement>(null);
 const [retained,setRetained]=useState(open);
 if(open&&!retained)setRetained(true);
 useLayoutEffect(()=>{
  const node=panel.current;
  if(!node)return;
  // Freeze an auto height before animating back to zero; interrupted toggles
  // continue from the current rendered height.
  node.style.height=node.getBoundingClientRect().height+'px';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation=animate(node,{
   height:open?node.scrollHeight:0,
   opacity:open?1:0,
   duration:reduced?0:open?440:320,
   ease:'out(3)',
   onComplete:()=>{
    if(open)node.style.height='auto';
    else setRetained(false);
   },
  });
  return()=>{animation.pause();};
 },[open]);
 return <div ref={panel} className="due-band-panel" id={id} role="region" aria-labelledby={headingId} aria-hidden={!open} inert={!open}>
  <div className="due-band-clip">{(open||retained)&&children}</div>
 </div>;
}
export function DueBands({columns,customers,files,day,onOpen,onMark,onLabel,onAdd}:Props){
 const [expanded,setExpanded]=useState<string|null>(null);
 function toggle(label:string){setExpanded(current=>current===label?null:label);}
 const clients=useMemo(()=>new Map(customers.map(c=>[c.id,c])),[customers]);
 const attachments=useMemo(()=>{const counts=new Map<string,number>();for(const file of files)counts.set(file.card_id,(counts.get(file.card_id)??0)+1);return counts;},[files]);
 return <div className="due-bands" aria-label="Faixas de vencimento">
  {columns.map((band,index)=>{const isOpen=expanded===band.label;const titles=band.cards.filter(c=>c.kind==='title');const tasks=band.cards.length-titles.length;const total=titles.reduce((sum,c)=>sum+c.amount,0);const tone=band.day<0?'future':band.day===0?'today':band.day<5?'early':band.day<15?'medium':band.day<45?'high':'critical';const panelId=`due-band-panel-${index}`,headingId=`due-band-heading-${index}`;
   return <section className={`due-band due-tone-${tone}${isOpen?' is-open':''}`} key={band.label}>
    <header className="due-band-header"><button type="button" id={headingId} className="due-band-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={()=>toggle(band.label)}>
     <span className="due-band-name"><b>{band.label}</b><small>{band.caption}</small></span><span className="due-band-count">{titles.length} títulos{tasks>0&&<small> + {tasks} tarefa(s)</small>}</span><strong className="due-band-total"><small>Total em aberto</small>{money(total)}</strong><span className="due-band-expand">{isOpen?<Minimize2 size={17}/>:<Maximize2 size={17}/>}<span>{isOpen?'Recolher':'Expandir'}</span></span>
    </button><button type="button" className="due-band-add" aria-label={`Adicionar em ${band.label}`} title={`Adicionar em ${band.label}`} onClick={()=>onAdd(band.day)}><Plus size={18}/></button></header>
    <BandPanel open={isOpen} id={panelId} headingId={headingId}>
     <div className="due-band-scroll" tabIndex={0} aria-label={`Títulos ${band.label}; rolagem vertical`}>
      {band.cards.length?<table className="due-lines"><thead><tr><th scope="col">Nº Título</th><th scope="col">Cliente</th><th scope="col">Valor</th><th scope="col" className="due-secondary">Vencimento</th><th scope="col">Dias em Aberto</th><th scope="col" className="due-secondary">Vendedor</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead><tbody>
       {band.cards.map(card=>{const client=card.customer_id?clients.get(card.customer_id):null;const late=Math.max(0,daysLate(card.due,day));const level=late>=30?3:late>=15?2:late>=5?1:0;const status=daysLate(card.due,day)>0?'Vencido':card.due===day?'Vence hoje':'A vencer';const number=card.kind==='title'?(card.document||card.title):card.title;
        return <tr key={card.id} data-dialog-origin><td><button type="button" className="due-link due-number" onClick={()=>onOpen(card)} title={`Abrir ${number}`}>{number}</button>{card.kind==='task'&&<small className="due-task-label">Tarefa</small>}{!!attachments.get(card.id)&&<small className="due-attachments"><Paperclip size={11}/>{attachments.get(card.id)}</small>}</td>
         <td className="due-client"><button type="button" className="due-link" onClick={()=>onOpen(card)}>{client?.name||card.customer||(card.kind==='task'?card.title:'Cliente sem vínculo')}</button>{client?.customer_code&&<small>#{client.customer_code}</small>}<TitleLabelBadge label={card.label}/></td>
         <td className="due-value">{card.kind==='title'?money(card.amount):'—'}</td><td className="due-secondary">{card.due.split('-').reverse().join('/')}</td><td><span className={`due-age due-age-${level}`}>{late} {late===1?'dia':'dias'}</span></td><td className="due-secondary due-seller">{card.seller&&card.seller!=='Não informado'?card.seller:client?.seller_name||'Não informado'}</td><td><span className={`due-status due-age-${level}`}>{status}</span></td>
         <td><div className="due-row-actions">{card.kind==='title'&&card.document&&<button type="button" title={card.label?'Editar marcação':'Adicionar marcação'} aria-label={`${card.label?'Editar':'Adicionar'} marcação do título ${number}`} onClick={()=>onLabel(card)}><Tag size={16}/></button>}<button type="button" title="Visualizar, editar e ver histórico" aria-label={`Abrir título ou tarefa ${number}: detalhes, edição e histórico`} onClick={()=>onOpen(card)}><FileText size={16}/></button><button type="button" title={card.kind==='title'?'Marcar como pago':'Concluir tarefa'} aria-label={`${card.kind==='title'?'Marcar como pago':'Concluir tarefa'} ${number}`} onClick={()=>onMark(card)}><Check size={17}/></button></div></td></tr>;
       })}
      </tbody></table>:<p className="due-empty">Nenhum título ou tarefa nesta faixa.</p>}
     </div>
    </BandPanel>
   </section>;
  })}
 </div>;
}
