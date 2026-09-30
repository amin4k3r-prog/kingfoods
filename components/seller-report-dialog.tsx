'use client';
import {useEffect,useMemo,useState} from 'react';
import {FileDown} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {readApiResponse} from '@/lib/api-response';
import {prepareSellerTitles,groupSellerTitles,reportDay,reportDate,reportMoney,daysLabel,type SellerTitle} from '@/lib/seller-report';

export function SellerReportDialog(){
 const [open,setOpen]=useState(false),[rows,setRows]=useState<SellerTitle[]>([]),[seller,setSeller]=useState(''),[selected,setSelected]=useState<Set<string>>(new Set()),[loading,setLoading]=useState(false),[generating,setGenerating]=useState(false),[error,setError]=useState('');
 const [day,setDay]=useState(reportDay);
 useEffect(()=>{if(!open)return;const controller=new AbortController();setLoading(true);setError('');setSelected(new Set());setDay(reportDay());
  fetch('/api/seller-report',{cache:'no-store',signal:controller.signal}).then(readApiResponse<{rows:SellerTitle[]}>).then(data=>{if(controller.signal.aborted)return;const groups=groupSellerTitles(prepareSellerTitles(data.rows));setRows(data.rows);setSeller(groups[0]?.[0]??'');}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[open]);
 const titles=useMemo(()=>prepareSellerTitles(rows,day),[rows,day]);
 const groups=useMemo(()=>groupSellerTitles(titles),[titles]);
 const visible=titles.filter(row=>row.sellerLabel===seller),chosen=titles.filter(row=>selected.has(row.id));
 function toggle(id:string){setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 async function generate(){setGenerating(true);setError('');try{
  const response=await fetch('/api/seller-report',{cache:'no-store'});const data=await readApiResponse<{rows:SellerTitle[]}>(response);const currentDay=reportDay();const fresh=prepareSellerTitles(data.rows,currentDay);const exportRows=fresh.filter(row=>selected.has(row.id));
  setRows(data.rows);setDay(currentDay);
  if(exportRows.length!==selected.size){setSelected(new Set(exportRows.map(row=>row.id)));throw new Error('Alguns títulos deixaram de estar em aberto e foram retirados da seleção. Confira os totais e clique novamente em Gerar PDF.');}
  if(!exportRows.length)throw new Error('Selecione ao menos um título.');
  const {buildSellerPdf}=await import('@/lib/seller-report');const bytes=buildSellerPdf(exportRows,new Date());
  const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`KING-FOODS-titulos-por-vendedor-${currentDay}.pdf`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){setError((e as Error).message||'Não foi possível gerar o PDF.');}finally{setGenerating(false);}}
 return <><button type="button" className="secondary-button" onClick={()=>setOpen(true)}><FileDown size={17}/> Exportar PDF por Vendedor</button>
 <Dialog open={open} onOpenChange={value=>{if(!generating)setOpen(value);}}><DialogContent className="seller-report-dialog">
  <DialogTitle>Exportar PDF por Vendedor</DialogTitle><DialogDescription>Selecione títulos de um ou mais vendedores. A seleção é mantida ao trocar de vendedor. Somente títulos não pagos e não arquivados.</DialogDescription>
  {loading?<p role="status">Carregando títulos em aberto…</p>:<>
   <label>Vendedor<select value={seller} disabled={generating} onChange={e=>setSeller(e.target.value)}>{groups.map(([name,list])=><option key={name} value={name}>{name} · {list.length} títulos · {list.filter(row=>selected.has(row.id)).length} selecionados</option>)}</select></label>
   <div className="seller-report-actions"><button type="button" className="secondary-button" disabled={!visible.length||generating} onClick={()=>setSelected(current=>new Set([...current,...visible.map(row=>row.id)]))}>Selecionar todos</button><button type="button" className="secondary-button" disabled={!visible.some(row=>selected.has(row.id))||generating} onClick={()=>setSelected(current=>new Set([...current].filter(id=>!visible.some(row=>row.id===id))))}>Limpar seleção</button><small>Ações aplicadas ao vendedor exibido. A seleção dos demais é preservada.</small></div>
   <div className="seller-report-legend"><span className="report-age report-age-0">0–4 dias</span><span className="report-age report-age-1">5–14 dias</span><span className="report-age report-age-2">15–29 dias</span><span className="report-age report-age-3">30+ dias</span><small>Dias desde o vencimento; a vencer e vence hoje = 0.</small></div>
   <div className="seller-report-table"><table><thead><tr>{['Selecionar','Título','Código do cliente','Cliente / Razão Social','Vencimento','Dias em Aberto','Valor','Status','Vendedor'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><input type="checkbox" aria-label={`Selecionar título ${row.document||row.title}`} checked={selected.has(row.id)} disabled={generating} onChange={()=>toggle(row.id)}/></td><td>{row.document||row.title}</td><td>{row.customer_code||'—'}</td><td>{row.clientLabel}{!row.customer_id&&<small className="seller-report-unlinked">Sem cadastro vinculado</small>}</td><td>{reportDate(row.due)}</td><td><span className={`report-age report-age-${row.level}`}>{daysLabel(row.days)}</span></td><td className="seller-report-value">{reportMoney(row.amount)}</td><td>{row.status}</td><td>{row.sellerLabel}</td></tr>)}</tbody></table>{!visible.length&&<p>Nenhum título em aberto para este vendedor.</p>}</div>
  </>}
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="seller-report-footer"><div aria-live="polite"><strong>Títulos selecionados: {chosen.length}</strong><strong>Valor selecionado: {reportMoney(chosen.reduce((sum,row)=>sum+row.amount,0))}</strong><small>{new Set(chosen.map(row=>row.sellerLabel)).size} vendedor(es) no relatório</small></div><button type="button" className="primary" disabled={loading||generating||!chosen.length} onClick={()=>void generate()}><FileDown size={17}/>{generating?'Gerando…':'Gerar PDF'}</button></div>
 </DialogContent></Dialog></>;
}
