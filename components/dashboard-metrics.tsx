'use client';
import {Wallet,CheckCheck,Clock3} from 'lucide-react';
import {useMemo} from 'react';
import {money,type Card} from '@/lib/board';
import {dashboardMetrics} from '@/lib/dashboard-metrics';

export function DashboardMetrics({cards,date,loaded}:{cards:Card[];date:string;loaded:boolean}) {
  const totals=useMemo(()=>dashboardMetrics(cards,date),[cards,date]);
  const items=[
    {key:'open',label:'Em Aberto',icon:Wallet,data:totals.open,caption:'títulos em aberto',note:'A vencer e vencidos'},
    {key:'resolved',label:'Resolvidos',icon:CheckCheck,data:totals.resolved,caption:'títulos resolvidos',note:'Pagamentos confirmados'},
    {key:'overdue',label:'Vencidos',icon:Clock3,data:totals.overdue,caption:'títulos vencidos',note:'Vencidos e ainda não pagos'},
  ];
  return <section className="dashboard-metric-grid" aria-label="Resumo financeiro dos títulos" aria-busy={!loaded}>
    {items.map(({key,label,icon:Icon,data,caption,note})=><article className={`dashboard-metric-card metric-${key}`} key={key}>
      <header><h2>{label}</h2><span className="dashboard-metric-icon"><Icon size={23} aria-hidden="true"/></span></header>
      <strong className="dashboard-metric-value">{loaded?money(data.amount):'—'}</strong>
      <div className="dashboard-metric-count"><b>{loaded?data.count.toLocaleString('pt-BR'):'—'}</b><span>{caption}</span></div>
      <p>{loaded?note:'Carregando títulos…'}</p>
    </article>)}
  </section>;
}
