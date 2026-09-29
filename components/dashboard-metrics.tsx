'use client';
import {Wallet,CheckCheck,Clock3} from 'lucide-react';
import {useMemo,useId} from 'react';
import {money,type Card} from '@/lib/board';
import {dashboardMetrics} from '@/lib/dashboard-metrics';
import type {MetricPoint} from '@/lib/metric-history';

function Sparkline({history,metric}:{history:MetricPoint[]|null;metric:'open'|'resolved'|'overdue'}) {
 const gradient=useId().replace(/:/g,'');
 if(!history||history.length<2)return <div className="metric-chart-empty">{history?'Histórico iniciado · a linha aparecerá após a próxima hora com acesso ao painel.':'Histórico indisponível no momento.'}</div>;
 const values=history.map(p=>p[metric]),min=Math.min(...values),max=Math.max(...values),span=max-min;
 const first=Date.parse(history[0].at),last=Date.parse(history[history.length-1].at);
 const points=history.map((p,i)=>({x:8+(Date.parse(p.at)-first)/Math.max(1,last-first)*304,y:span?82-(values[i]-min)/span*64:50,p}));
 const line=points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ');
 const label=(at:string)=>new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 return <div className="metric-chart"><svg viewBox="0 0 320 100" role="img" aria-label={`Evolução dos saldos observados: ${money(values[0])} a ${money(values[values.length-1])}`}>
 <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity=".4"/><stop offset="100%" stopColor="white" stopOpacity=".03"/></linearGradient></defs>
 <path d="M8 25 H312 M8 55 H312 M8 85 H312" stroke="white" strokeOpacity=".12" strokeDasharray="3 5" fill="none"/>
 <path d={`${line} L312 96 L8 96 Z`} fill={`url(#${gradient})`}/><path d={line} stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
 {points.map(({x,y,p})=><circle key={p.at} cx={x} cy={y} r="3" fill="white"><title>{label(p.at)}: {money(p[metric])}</title></circle>)}
 </svg><div className="metric-chart-labels"><span>{label(history[0].at)}</span><span>{label(history[history.length-1].at)}</span></div><small>Saldos observados · últimos 7 dias</small></div>;
}

export function DashboardMetrics({cards,date,loaded,history}:{cards:Card[];date:string;loaded:boolean;history:MetricPoint[]|null}) {
  const totals=useMemo(()=>dashboardMetrics(cards,date),[cards,date]);
  const total=totals.open.amount+totals.resolved.amount;
  const items=[
    {key:'open',label:'Em Aberto',icon:Wallet,data:totals.open,caption:'títulos em aberto',note:'A vencer e vencidos'},
    {key:'resolved',label:'Resolvidos',icon:CheckCheck,data:totals.resolved,caption:'títulos resolvidos',note:'Pagamentos confirmados'},
    {key:'overdue',label:'Vencidos',icon:Clock3,data:totals.overdue,caption:'títulos vencidos',note:'Vencidos e ainda não pagos'},
  ];
  return <section className="dashboard-metric-grid" aria-label="Resumo financeiro dos títulos" aria-busy={!loaded}>
    {items.map(({key,label,icon:Icon,data,caption,note})=>{const base=key==='overdue'?totals.open.amount:total;const percentage=base>0?data.amount/base*100:0;return <article className={`dashboard-metric-card metric-${key}`} key={key}>
      <header><h2>{label}</h2><span className="dashboard-metric-icon"><Icon size={23} aria-hidden="true"/></span></header>
      <strong className="dashboard-metric-value">{loaded?money(data.amount):'—'}</strong>
      <div className="dashboard-metric-count"><b>{loaded?data.count.toLocaleString('pt-BR'):'—'}</b><span>{caption}</span></div>
      <div className="metric-percentage"><strong>{loaded?percentage.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'}</strong><span>{key==='overdue'?'do valor em aberto':'do valor total dos títulos'}</span></div>
      {loaded&&<Sparkline history={history} metric={key as 'open'|'resolved'|'overdue'}/>}
      <p>{loaded?note:'Carregando títulos…'}</p>
    </article>})}
  </section>;
}
