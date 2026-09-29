"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  Check,
  Paperclip,
  CalendarDays,
  FileText,
  CheckCheck,
  Wallet,
  Clock3,
  X,
  Upload,
  Trash2,
  Search,
  Archive,
  ClipboardList,
  ClipboardCheck,
  History,
  Bell,
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ThemeToggle } from "./theme";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  Attachment,
  Customer,
  TitleEvent,
  today,
  daysLate,
  money,
} from "@/lib/board";
import {
  decodeCsv,
  previewReceivablesCsv,
  type CsvImportPreview,
} from "@/lib/csv-import";
import { TITLE_EVENT_OPTIONS } from "@/lib/policy";
import { collectionStage, columnDays, inDayColumn } from "@/lib/columns";
import { ScrollableBoard } from "@/components/scrollable-board";
import { DashboardMetrics } from "@/components/dashboard-metrics";
import type {MetricPoint} from '@/lib/metric-history';
import { CustomerWallet } from "@/components/customer-wallet";
import { AnalysisWorkspace } from "@/components/analysis-workspace";
import { UserSettings } from "@/components/user-settings";
import type { AuthUser } from "@/lib/auth";
import { readApiResponse } from "@/lib/api-response";
const blank = () => ({
  id: "",
  title: "",
  document: "",
  customer_id: null,
  customer: "",
  notes: "",
  due: today(),
  amount: 0,
  kind: "title",
  paid: 0,
  created: "",
});
function parseAmount(raw: string): number | null {
  const value = raw.trim();
  if (!value) return 0;
  if (!/^[\sRr$0-9.,-]+$/.test(value)) return null;
  let s = value.replace(/[^\d,.-]/g, "");
  const comma = s.lastIndexOf(","),
    dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? comma : dot;
    s = s.slice(0, decimal).replace(/[.,]/g, "") + "." + s.slice(decimal + 1);
  } else if (comma >= 0) {
    const decimals = s.length - comma - 1;
    s =
      decimals <= 2
        ? s.slice(0, comma).replace(/,/g, "") + "." + s.slice(comma + 1)
        : s.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = s.length - dot - 1;
    if (s.indexOf(".") !== dot || decimals > 2)
      s =
        decimals === 2
          ? s.slice(0, dot).replace(/\./g, "") + "." + s.slice(dot + 1)
          : s.replace(/\./g, "");
  }
  const n = Number(s);
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    !Number.isSafeInteger(Math.round(n * 100))
  )
    return null;
  return Math.round(n * 100);
}
async function api(body: unknown) {
  const r = await fetch("/api/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {window.location.assign("/entrar");throw new Error("Sessão encerrada.");}
  return readApiResponse<any>(r);
}
async function importApi(body: unknown) {
  const r = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {window.location.assign("/entrar");throw new Error("Sessão encerrada.");}
  return readApiResponse<any>(r);
}
export default function Home({user}:{user:AuthUser}) {
  const [metricHistory,setMetricHistory]=useState<MetricPoint[]|null>(null);
  const [customerSearch,setCustomerSearch]=useState('');
  const [customerOptions,setCustomerOptions]=useState<Customer[]>([]);
  const [customerSearchError,setCustomerSearchError]=useState('');
  const [customerPage,setCustomerPage]=useState(1);
  const [customerPages,setCustomerPages]=useState(1);
  const [customerTotal,setCustomerTotal]=useState(0);
  const [customerLoading,setCustomerLoading]=useState(false);
  function searchCustomers(value:string){setCustomerSearch(value);setCustomerPage(1);setCustomerOptions([]);setCustomerLoading(true);}
  const [importLookupBusy,setImportLookupBusy]=useState(false);
  const importLookupVersion=useRef(0);
  const [view, setView] = useState("tasks");
  const [maximizedLabel, setMaximizedLabel] = useState<string | null>(null);
  const [columnMaximized, setColumnMaximized] = useState(false);
  const maximizeTrigger = useRef<HTMLButtonElement | null>(null);
  const [cards, setCards] = useState<Card[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [analysisOverdue, setAnalysisOverdue] = useState(0),
    [files, setFiles] = useState<Attachment[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(today()),
    [edit, setEdit] = useState<Card | null>(null),
    [amountText, setAmountText] = useState(""),
    [searchQuery, setSearchQuery] = useState(""),
    [pending, setPending] = useState<File[]>([]),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState(false),
    [deleteAllOpen, setDeleteAllOpen] = useState(false),
    [deleteAllBusy, setDeleteAllBusy] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null),
    [importName, setImportName] = useState(""),
    [importError, setImportError] = useState(""),
    [importBusy, setImportBusy] = useState(false),
    [savedColumns, setSavedColumns] = useState<number[]>([]),
    [columnOpen, setColumnOpen] = useState(false),
    [columnDay, setColumnDay] = useState("6"),
    [columnBusy, setColumnBusy] = useState(false),
    [columnError, setColumnError] = useState(""),
    [importLinkPage, setImportLinkPage] = useState(0),
    [importLinkOpen, setImportLinkOpen] = useState<string | null>(null),
    [titleEvents, setTitleEvents] = useState<TitleEvent[]>([]),
    [eventType, setEventType] = useState("message_sent"),
    [eventNote, setEventNote] = useState(""),
    [eventBusy, setEventBusy] = useState(false);
  useEffect(()=>{
    if(!edit&&!importOpen)return;
    const controller=new AbortController();
    setCustomerLoading(true);
    setCustomerOptions([]);
    const timer=setTimeout(()=>{
      fetch('/api/customers?'+new URLSearchParams({q:customerSearch,page:String(customerPage)}),{signal:controller.signal,cache:'no-store'})
        .then(readApiResponse<{customers:Customer[];page:number;pages:number;total:number}>)
        .then(data=>{if(!controller.signal.aborted){setCustomerOptions(data.customers);setCustomerPage(data.page);setCustomerPages(data.pages);setCustomerTotal(data.total);setCustomerSearchError('');}})
        .catch(e=>{if(!controller.signal.aborted)setCustomerSearchError(e.message)})
        .finally(()=>{if(!controller.signal.aborted)setCustomerLoading(false);});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[customerSearch,customerPage,edit?.id,!!edit,importOpen]);
  function customerPagination(){return <div className="flex flex-wrap items-center gap-2" aria-label="Páginas de clientes">
    <button type="button" className="btn secondary" disabled={customerLoading||customerPage<=1} onClick={()=>{setCustomerLoading(true);setCustomerPage(p=>p-1);}}>Clientes anteriores</button>
    <span role="status">{customerLoading?'Buscando clientes…':customerSearchError?'Busca indisponível':customerTotal===0?'Nenhum cliente encontrado':`${customerTotal} clientes · Página ${customerPage} de ${customerPages}`}</span>
    <button type="button" className="btn secondary" disabled={customerLoading||!!customerSearchError||customerPage>=customerPages} onClick={()=>{setCustomerLoading(true);setCustomerPage(p=>p+1);}}>Próximos clientes</button>
  </div>;}
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/board");
      if (r.status === 401) {window.location.assign("/entrar");throw new Error("Sessão encerrada.");}
      const d = await readApiResponse<any>(r);
      setCards(d.cards);
      setMetricHistory(d.metricHistory??null);
      setSavedColumns(d.columns ?? []);
      setCustomers(d.customers ?? []);
      setFiles(d.files);
      setLoaded(true);
      setError("");
      setNow(today());
      return d;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, []);
  useEffect(() => {
    if(view !== 'tasks' && view !== 'paid')return;
    refresh().catch(() => {});
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh().catch(() => {});
    };
    const t = setInterval(refreshWhenVisible, 120000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh,view]);
  useEffect(()=>{
    if(view==='analyses')fetch('/api/analyses?summary=1').then(readApiResponse<{overdue:number}>).then(data=>setAnalysisOverdue(Number(data.overdue)||0)).catch(()=>{});
  },[view]);
  useEffect(() => {
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const ctl = new AbortController();
    Promise.resolve(
      ctx.registerTool(
        {
          name: "read_financial_board",
          description: "Lê tarefas, clientes e títulos do sistema Fluxo.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: async (input: any) => {
            if (!input || Object.keys(input).length)
              throw new Error("Nenhum parâmetro esperado");
            return refresh();
          },
        },
        { signal: ctl.signal },
      ),
    ).catch(() => {});
    return () => ctl.abort();
  }, [refresh]);
  const open = (c?: Card, d?: number) => {
    let b = c ? { ...c } : blank();
    if (d !== undefined) {
      const dt = new Date(today() + "T12:00:00Z");
      dt.setUTCDate(dt.getUTCDate() - d);
      b.due = dt.toISOString().slice(0, 10);
    }
    setEdit(b);
    setAmountText(
      c ? String((c.amount / 100).toFixed(2)).replace(".", ",") : "",
    );
    setPending([]);
  };
  async function mark(c: Card) {
    try {
      await api({ action: "paid", id: c.id, paid: c.paid ? 0 : 1 });
      await refresh();
      toast.success(
        c.paid
          ? "Cartão reaberto"
          : c.kind === "title"
            ? "Título marcado como pago"
            : "Tarefa concluída",
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const amount = parseAmount(amountText);
    if (amount === null) {
      toast.error("Digite um valor válido.");
      return;
    }
    if (edit.kind === "title" && !String(edit.document ?? "").trim()) {
      toast.error("Informe o número único do título.");
      return;
    }
    if (edit.kind === "title" && !edit.id && !edit.customer_id) {
      toast.error("Vincule o título a um cliente.");
      return;
    }
    const draft = {
      ...edit,
      amount: edit.kind === "title" ? amount : edit.amount,
    };
    setBusy(true);
    try {
      const r = await api({ action: "save", card: draft });
      setEdit({ ...draft, id: r.id });
      for (const file of pending) {
        const form = new FormData();
        form.append("file", file);
        form.append("card", r.id);
        const res = await fetch("/api/files", { method: "POST", body: form });
        if (!res.ok) throw new Error(((await res.json()) as any).error);
        setPending((p) => p.filter((x) => x !== file));
      }
      await refresh();
      setEdit(null);
      toast.success("Cartão salvo");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function readImportFile(file?: File) {
    const lookupVersion=++importLookupVersion.current;
    setImportPreview(null);
    setImportLinkPage(0);
    setImportLinkOpen(null);
    setImportError("");
    if (!file) return;
    setImportLookupBusy(true);
    setImportName(file.name);
    try {
      const text = decodeCsv(await file.arrayBuffer());
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const initial=previewReceivablesCsv(text,cards,[]);
      const candidates=new Map<string,{id:string;name:string;customer_code?:string|null;tax_id?:string}>();
      const uniqueRows=[...new Map(initial.rows.map(row=>[JSON.stringify([row.customer_code,row.customer_names]),row])).values()];
      for(let offset=0;offset<uniqueRows.length;offset+=20){
        if(lookupVersion!==importLookupVersion.current)return;
        const response=await fetch('/api/customers/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:uniqueRows.slice(offset,offset+20).map(row=>({customer_code:row.customer_code,customer_names:row.customer_names}))})});
        const result=await readApiResponse<{customers:{id:string;name:string;customer_code?:string|null;tax_id?:string}[]}>(response);
        for(const customer of result.customers)candidates.set(customer.id,customer);
      }
      if(lookupVersion===importLookupVersion.current)setImportPreview(previewReceivablesCsv(text,cards,[...candidates.values()]));
    } catch (e) {
      if(lookupVersion===importLookupVersion.current)setImportError((e as Error).message || "Não foi possível ler este CSV.");
    } finally {
      if(lookupVersion===importLookupVersion.current)setImportLookupBusy(false);
    }
  }
  async function importTitles() {
    if (
      !importPreview ||
      (!importPreview.rows.length && !importPreview.absent.length)
    )
      return;
    setImportBusy(true);
    setImportError("");
    try {
      const result = await importApi({
        rows: importPreview.rows,
        presentDocuments: importPreview.presentDocuments,
      });
      await refresh();
      setImportOpen(false);
      setImportPreview(null);
      toast.success(
        `${result.created} novo(s), ${result.updated} atualizado(s) e ${result.removed} removido(s) da carteira.`,
      );
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  }
  async function deleteAllTitles() {
    setDeleteAllBusy(true);
    try {
      const result = await api({ action: "delete_all_titles" });
      setDeleteAllOpen(false);
      await refresh();
      toast.success(`${result.deleted} título(s) excluído(s).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteAllBusy(false);
    }
  }
  useEffect(() => {
    if (!edit?.id || edit.kind !== "title") {
      setTitleEvents([]);
      return;
    }
    fetch("/api/title-history?card=" + encodeURIComponent(edit.id))
      .then(async (r) => (await r.json()) as { events?: TitleEvent[] })
      .then((d) => setTitleEvents(d.events ?? []))
      .catch(() => setTitleEvents([]));
  }, [edit?.id, edit?.kind]);
  async function recordTitleEvent() {
    if (!edit?.id) return;
    setEventBusy(true);
    try {
      const r = await fetch("/api/title-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: edit.id,
          event_type: eventType,
          note: eventNote,
        }),
      });
      const d = (await r.json()) as any;
      if (r.status === 401) {window.location.assign("/entrar");throw new Error("Sessão encerrada.");}
  if (!r.ok) throw new Error(d.error);
      setTitleEvents((list) => [d, ...list]);
      setEventNote("");
      toast.success("Registro adicionado ao histórico deste título.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEventBusy(false);
    }
  }
  const unlinkedImportRows = importPreview?.rows.filter((row) => !row.customer_id) ?? [];
  const importLinkPages = Math.max(1, Math.ceil(unlinkedImportRows.length / 10));
  const currentImportLinkPage = Math.min(importLinkPage, importLinkPages - 1);
  const activeCards = cards.filter((c) => !c.archived_at),
    unpaid = activeCards.filter((c) => !c.paid),
    overdue = unpaid.filter((c) => daysLate(c.due, now) > 0),
    paid = activeCards.filter((c) => c.paid),
    archived = cards.filter((c) => !!c.archived_at),
    customerById = new Map(customers.map((c) => [c.id, c]));
  const normalizedQuery = searchQuery
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  const openTitles = unpaid.filter((c) => c.kind === "title"),
    taskCards = unpaid.filter((c) => c.kind === "task");
  const matchesTitle = (c: Card) => {
    if (!normalizedQuery) return true;
    const customer = c.customer_id ? customerById.get(c.customer_id) : null;
    const due = c.due.split("-").reverse().join("/");
    const status = c.archived_at
      ? "arquivado"
      : c.paid
        ? "pago"
        : daysLate(c.due, now) > 0
          ? "vencido"
          : "aberto";
    return `${c.document ?? c.title} ${customer?.customer_code ?? ""} ${customer?.name ?? c.customer ?? ""} ${customer?.tax_id ?? ""} ${customer?.tax_id?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") ?? ""} ${status} ${due} ${c.due}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedQuery);
  };
  const visibleTitles = (
    normalizedQuery ? activeCards.filter((c) => c.kind === "title") : openTitles
  ).filter(matchesTitle);
  const visiblePaid = paid.filter(matchesTitle),
    visibleArchived = archived.filter(matchesTitle);
  const visibleTaskCards = taskCards.filter(
    (c) =>
      !normalizedQuery ||
      `${c.title} ${c.notes}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery),
  );
  const kanbanCards = [...visibleTitles, ...visibleTaskCards];
  const days = columnDays(savedColumns);
  const stageTitle = (day: number) => {
    if (day === -2) return "Lembrete de vencimento";
    if (day < 0) return "A vencer";
    if (day === 0) return "Vence hoje";
    if (day === 2) return "Segunda cobrança";
    if (day === 3) return "Terceira cobrança";
    if (day === 4) return "Quarta cobrança";
    if (day < 5) return "Primeira cobrança e bloqueio de novos pedidos";
    if (day < 10) return "Negociação e aviso de protesto";
    if (day < 15) return "Negociação (A/B) · Cartório (C/D/E)";
    if (day < 45) return "Encaminhamento ao cartório";
    if (day < 60) return "Negativação";
    if (day < 90) return "Negativação (A/B) · Jurídico (C/D/E)";
    return "Encaminhamento ao jurídico";
  };
  const stageTone = (day: number) => day === -2 ? "stage-reminder" : day >= 90 ? "stage-legal" : day >= 45 ? "stage-negative" : day >= 15 ? "stage-registry" : day >= 5 ? "stage-negotiation" : day >= 1 ? "stage-first" : "stage-upcoming";
  const kanbanColumns = [
    {
      label: "A Vencer",
      caption: "Próximos vencimentos",
      tone: "gold",
      day: -1,
      cards: kanbanCards.filter((c) => daysLate(c.due, now) < 0 && daysLate(c.due, now) !== -2),
    },
    {
      label: "D-2",
      caption: "Lembrete de vencimento",
      tone: "reminder",
      day: -2,
      cards: kanbanCards.filter((c) => daysLate(c.due, now) === -2),
    },
    {
      label: "Hoje",
      caption: "Vence hoje",
      tone: "today",
      day: 0,
      cards: kanbanCards.filter((c) => daysLate(c.due, now) === 0),
    },
    ...days.map((day, i) => {
      return {
        label: `D+${day}`,
        caption: ({1:"Primeira cobrança",5:"Negociação",10:"Cartório · classes C, D e E",15:"Cartório · classes A e B",45:"Negativação · classes A e B",60:"Jurídico · classes C, D e E",90:"Jurídico · classes A e B"} as Record<number,string>)[day] ?? (days[i + 1] === undefined ? `${day} dias ou mais em atraso` : days[i + 1] > day + 1 ? `${day} a ${days[i + 1] - 1} dias em atraso` : `${day} dias em atraso`),
        tone: "late",
        day,
        cards: kanbanCards.filter((c) =>
          inDayColumn(daysLate(c.due, now), day, days[i + 1]),
        ),
      };
    }),
  ];
  const maximizedColumn = kanbanColumns.find(column => column.label === maximizedLabel);
  function maximizeColumn(label: string, trigger: HTMLButtonElement) {
    maximizeTrigger.current = trigger;
    setMaximizedLabel(label);
    setColumnMaximized(true);
  }
  function renderCard(c: Card) {
    const customer = c.customer_id ? customerById.get(c.customer_id) : null;
    return (
      <article className="card" key={c.id}>
        <div className="card-top card-top-outside">
          <span className={`tag ${c.kind === "task" ? "task" : ""}`}>
            {c.kind === "title" ? "Título" : "Tarefa"}
          </span>
        </div>
        <button className="card-body" onClick={() => open(c)}>
          <h4>{c.kind === "title" ? `Título #${c.document}` : c.title}</h4>
          {c.kind === "title" && (
            <div className="imported-details">
              <span>
                <b>Cliente:</b>{" "}
                {customer
                  ? `#${customer.customer_code} · ${customer.name}`
                  : c.customer || "Sem vínculo"}
              </span>
              <span>
                <b>Número:</b> {c.document}
              </span>
            </div>
          )}
          {c.notes && <p>{c.notes}</p>}
          {c.kind === "title" && (
            <strong className="amount">
              {money(c.amount)}
            </strong>
          )}
          <div className="card-meta">
            <span>
              <CalendarDays size={14} />
              {c.due.split("-").reverse().slice(0, 2).join("/")}
            </span>
            <span>
              <Paperclip size={14} />
              {files.filter((f) => f.card_id === c.id).length}
            </span>
          </div>
        </button>
        <button
          className={`pay ${c.paid ? "done" : ""} ${!c.paid && c.kind === "title" ? "payment-action" : ""}`}
          onClick={() => mark(c)}
        >
          <Check size={15} />
          {c.paid
            ? c.kind === "title"
              ? "Reabrir título"
              : "Reabrir tarefa"
            : c.kind === "title"
              ? "Marcar como pago"
              : "Concluir tarefa"}
        </button>
      </article>
    );
  }
  function renderTitleTask(c: Card) {
    const customer = c.customer_id ? customerById.get(c.customer_id) : null;
    return (
      <article className={`card collection-task stage-${collectionStage(daysLate(c.due, now), customer?.risk_class)}`} key={c.id}>
        <div className="card-top card-top-outside">
          <span className="tag task">Tarefa de cobrança</span>
        </div>
        <button className="card-body" onClick={() => open(c)}>
          <h4>
            {customer
              ? `Cliente #${customer.customer_code} — ${customer.name}`
              : c.customer || "Cliente sem vínculo"}
          </h4>
          <div className="imported-details">
            <span>
              <b>Título #{c.document}</b>
            </span>
            {customer && (
              <span>
                <b>{customer.tax_id.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'}:</b> {customer.tax_id}
              </span>
            )}
            {c.charge_type && (
              <span>
                <b>Cobrança:</b> {c.charge_type}
              </span>
            )}
            {(c.seller || customer?.seller_name) && (
              <span>
                <b>Vendedor:</b> {c.seller || customer?.seller_name}
              </span>
            )}
          </div>
          <strong className="amount">
            {money(c.amount)}
          </strong>
          <div className="card-meta">
            <span>
              <CalendarDays size={14} />
              {c.due.split("-").reverse().join("/")}
              {daysLate(c.due, now) > 0 &&
                ` · vencido há ${daysLate(c.due, now)}d`}
            </span>
            <span>
              <Paperclip size={14} />
              {files.filter((f) => f.card_id === c.id).length}
            </span>
          </div>
        </button>
        <div className="collection-task-actions">
          <button className="secondary-button" onClick={() => open(c)}>
            <FileText size={15} /> Abrir tarefa e histórico
          </button>
          <button
            className={`pay ${c.paid ? "done" : "payment-action"}`}
            onClick={() => mark(c)}
          >
            <Check size={15} />
            {c.paid ? "Reabrir título" : "Marcar como pago"}
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="app">
      <Toaster position="bottom-right" />
      <header className="topbar">
        <label className="global-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar títulos, clientes ou CPF/CNPJ"
            aria-label="Buscar títulos, clientes ou CPF/CNPJ"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-button" aria-label="Notificações">
            <Bell size={18} />
            <span className="notification-dot" />
          </button>
          <span className="private">
            <span className="private-icon">AM</span>
            <span className="profile-copy">
              <b>{user.name}</b>
              <small>Administrador</small>
            </span>
          </span>
          <button className="icon-button" title="Sair" aria-label="Sair" onClick={async()=>{await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});window.location.assign('/entrar')}}><LogOut size={18}/></button>
        </div>
      </header>
      <main>
        {view === "tasks" && <>
        <div className="breadcrumb">
          Visão geral <span>/</span> Financeiro
        </div>
        <section className="heading">
          <div>
            <div className="eyebrow">PAINEL FINANCEIRO · KING FOODS</div>
            <h1>Gestão financeira</h1>
            <p>
              Prioridades, cobranças e recebimentos organizados em uma única
              visão.
            </p>
          </div>
          <div className="heading-actions">
            <button
              className="secondary-button import-button"
              onClick={() => {
                setImportOpen(true);
                setImportPreview(null);
                setImportError("");
                setImportName("");
              }}
            >
              <Upload size={17} /> Importar CSV
            </button>
            <button
              className="secondary-button"
              onClick={() => setDeleteAllOpen(true)}
            >
              <Trash2 size={17} /> Excluir títulos
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                open({
                  id: "",
                  title: "",
                  notes: "",
                  due: today(),
                  amount: 0,
                  kind: "task",
                  paid: 0,
                  created: "",
                })
              }
            >
              <Plus size={17} /> Nova tarefa
            </button>
            <button className="primary" onClick={() => open()}>
              <Plus size={19} /> Novo cartão
            </button>
          </div>
        </section>
        <DashboardMetrics cards={cards} date={now} loaded={loaded} history={metricHistory}/>
        </>}
        <Tabs value={view} onValueChange={(v) => setView(v)}>
          <div className="workspace-shell">
            <aside className="app-sidebar" aria-label="Navegação principal">
              <a className="brand" href="/" aria-label="King Foods — início">
                <img className="brand-logo-image" src="/king-foods-logo-transparent.png" alt="King Foods" />
              </a>
              <span className="sidebar-label">GESTÃO</span>
              <button
                className={view === "tasks" ? "active" : ""}
                onClick={() => setView("tasks")}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </button>
              <button
                className={view === "customers" ? "active" : ""}
                onClick={() => setView("customers")}
              >
                <Users size={18} />
                Carteira de clientes
              </button>
              <button
                className={view === "analyses" ? "active" : ""}
                onClick={() => setView("analyses")}
              >
                <ClipboardCheck size={18} />
                Análises
                {analysisOverdue>0&&<span className="sidebar-alert-count" aria-label={`${analysisOverdue} revisões vencidas`}>{analysisOverdue}</span>}
              </button>
              <button
                className={view === "paid" ? "active" : ""}
                onClick={() => setView("paid")}
              >
                <CheckCheck size={18} />
                Pagos e concluídos
              </button>
              <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={18}/> Configurações · Usuários</button>
              <div className="sidebar-foot">
                <span className="sync-dot" />
                Sistema atualizado
              </div>
            </aside>
            <div className="workspace-content">
              {view === "tasks" && <div className="board-toolbar">
                <div className="board-title">
                  <ClipboardList size={18} />
                  <h2>Quadro de vencimentos</h2>
                  <span>{kanbanCards.length}</span>
                </div>
                <div className="board-actions">{view === "tasks" && <button className="secondary-button" onClick={() => {
                  setColumnDay(String(days[days.length - 1] + 1)); setColumnError(""); setColumnOpen(true);
                }}><Plus size={16} /> Nova coluna D+</button>}</div>
              </div>}
              {error && (
                <div className="error" role="alert">
                  Não foi possível atualizar o quadro. {error}{" "}
                  <button onClick={() => refresh().catch(() => {})}>
                    Tentar novamente
                  </button>
                </div>
              )}
              <TabsContent value="tasks">
                <p className="drag-instructions">
                  Segure o botão esquerdo do mouse e arraste o quadro para os lados.
                  Os títulos avançam automaticamente conforme os dias de atraso.
                </p>
                <ScrollableBoard>
                  {kanbanColumns.map((column) => {
                    const shownCards = column.cards.slice(0, 1);
                    return (
                      <section
                        className={`column ${column.tone} ${stageTone(column.day)}`}
                        key={column.label}
                      >
                        <div className="column-header">
                          <h3 className="stage-heading">
                            <span className="dot" />
                            <span className="stage-heading-text"><strong>{stageTitle(column.day)}</strong><small>{column.label}</small></span>
                          </h3>
                          <div className="column-tools">
                            <b>{column.cards.length}</b>
                            <button type="button" title="Maximizar coluna" aria-label={`Maximizar coluna ${column.label}`} aria-haspopup="dialog" onClick={e => maximizeColumn(column.label, e.currentTarget)}><Maximize2 size={16} /></button>
                            <button
                              aria-label={`Adicionar em ${column.label}`}
                              onClick={() => open(undefined, column.day)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                        <p className="column-sub">{column.day > 0 && ![1, 5, 10, 15, 45, 60, 90].includes(column.day) ? column.caption : "\u00a0"}</p>
                        <div className="cards">
                          {shownCards.map((card) =>
                            card.kind === "title"
                              ? renderTitleTask(card)
                              : renderCard(card),
                          )}
                          {!column.cards.length && (
                            <div className="empty-column">
                              <CalendarDays size={22} />
                              <p>Nenhum cartão nesta etapa.</p>
                            </div>
                          )}
                        </div>
                        {column.cards.length > 1 && <button type="button" className="maximize-column-button" aria-haspopup="dialog" onClick={e => maximizeColumn(column.label, e.currentTarget)}><Maximize2 size={16} /> Ver todos os {column.cards.length} cartões</button>}
                        <button
                          className="add-card"
                          onClick={() => open(undefined, column.day)}
                        >
                          <Plus size={15} />
                          Adicionar cartão
                        </button>
                      </section>
                    );
                  })}
                </ScrollableBoard>
              </TabsContent>
              <TabsContent value="customers">
                {view === "customers" && <CustomerWallet
                  cards={cards.filter((c) => c.kind === "title")}
                  onSaved={() => refresh().then(() => undefined)}
                  onOpenTitle={(card) => open(card)}
                />}
              </TabsContent>
              <TabsContent value="analyses">
                {view === "analyses" && <AnalysisWorkspace onChanged={() => refresh().then(() => undefined)} />}
              </TabsContent>
              <TabsContent value="settings">{view === "settings" && <UserSettings me={{...user,active:1}}/>}</TabsContent>
              <TabsContent value="paid">
                <div className="resolved-heading">
                  <h2>Pagos e concluídos</h2>
                  <p>
                    Consulte os cartões resolvidos ou reabra quando precisar.
                  </p>
                </div>
                <div className="resolved-grid">
                  {visiblePaid.map(renderCard)}
                </div>
                {!visiblePaid.length && (
                  <div className="empty-column">
                    <CheckCheck size={28} />
                    <p>Os cartões pagos e concluídos aparecerão aqui.</p>
                  </div>
                )}
                {visibleArchived.length > 0 && (
                  <>
                    <div className="resolved-heading archive-heading">
                      <h2>
                        <Archive size={19} /> Histórico de títulos ausentes
                      </h2>
                      <p>
                        Arquivados quando não aparecem no relatório mais
                        recente. Os registros permanecem consultáveis.
                      </p>
                    </div>
                    <div className="resolved-grid">
                      {visibleArchived.map((c) => (
                        <article className="card archived-card" key={c.id}>
                          <span className="tag">Histórico</span>
                          <h4>Título #{c.document || c.title}</h4>
                          <div className="imported-details">
                            <span>
                              <b>Cliente:</b>{" "}
                              {c.customer_id
                                ? `#${customerById.get(c.customer_id)?.customer_code ?? ""} · ${customerById.get(c.customer_id)?.name ?? c.customer ?? ""}`
                                : c.customer || "Sem vínculo"}
                            </span>
                            <span>
                              <b>Vencimento:</b>{" "}
                              {c.due.split("-").reverse().join("/")}
                            </span>
                            <span>
                              <b>Saldo:</b>{" "}
                              {money(c.amount)}
                            </span>
                          </div>
                          <button
                            className="card-body archive-history"
                            onClick={() => open(c)}
                          >
                            Ver título e histórico
                          </button>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </TabsContent>
              <footer>
                <span>
                  <span className="sync-dot" />
                  {error
                    ? "Atualização pendente"
                    : "Salvo e atualizado automaticamente"}
                </span>
                <span>Dias corridos · Horário de Brasília</span>
              </footer>
            </div>
          </div>
        </Tabs>
      </main>
      <Dialog open={columnMaximized} onOpenChange={setColumnMaximized}>
        <DialogContent className={`premium-board column-maximized ${maximizedColumn ? stageTone(maximizedColumn.day) : ""}`} showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); maximizeTrigger.current?.focus(); }}>
          {maximizedColumn && <>
            <div className="maximized-header">
              <div>
                <DialogTitle className="maximized-title">{stageTitle(maximizedColumn.day)}</DialogTitle>
                <DialogDescription className="maximized-description"><span>{maximizedColumn.label}</span> · {maximizedColumn.cards.length} cartões{normalizedQuery ? " encontrados na busca" : " nesta etapa"}</DialogDescription>
              </div>
              <button type="button" className="secondary-button" onClick={() => setColumnMaximized(false)}><Minimize2 size={18} /> Voltar ao quadro</button>
            </div>
            <div className="maximized-scroll">
              <div className="maximized-card-grid">
                {maximizedColumn.cards.map(card => card.kind === "title" ? renderTitleTask(card) : renderCard(card))}
              </div>
              {!maximizedColumn.cards.length && <div className="empty-column"><CalendarDays size={30} /><p>Nenhum cartão nesta etapa.</p></div>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={columnOpen} onOpenChange={value => { if (!columnBusy) setColumnOpen(value); }}>
        <DialogContent className="editor">
          <DialogTitle>Nova coluna D+</DialogTitle>
          <DialogDescription>Defina a partir de quantos dias de atraso os títulos entram nesta coluna. Eles permanecem nela até a próxima coluna.</DialogDescription>
          <form onSubmit={async e => {
            e.preventDefault();
            const day = Number(columnDay);
            if (!Number.isInteger(day) || day < 1 || day > 3650) { setColumnError("Informe um número inteiro entre 1 e 3.650."); return; }
            if (days.includes(day)) { setColumnError("Essa coluna já existe."); return; }
            setColumnBusy(true); setColumnError("");
            try {
              await api({ action: "add_column", day });
              setSavedColumns(current => [...new Set([...current, day])]);
              setColumnOpen(false); toast.success(`Coluna D+${day} criada`);
            } catch (error) { setColumnError((error as Error).message); }
            finally { setColumnBusy(false); }
          }}>
            <label className="new-column-field" htmlFor="column-day">Dias de atraso (D+)
              <input id="column-day" type="number" min="1" max="3650" step="1" required value={columnDay} disabled={columnBusy} onChange={e => setColumnDay(e.target.value)} />
            </label>
            {columnError && <p className="error" role="alert">{columnError}</p>}
            <button type="submit" className="primary" disabled={columnBusy}>{columnBusy ? "Criando…" : "Criar coluna"}</button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={importOpen}
        onOpenChange={(v) => {
          if (!importBusy) setImportOpen(v);
        }}
      >
        <DialogContent className="editor import-dialog">
          <DialogTitle>Importar títulos em aberto</DialogTitle>
          <input aria-label="Buscar cliente para vincular na importação" placeholder="Buscar em todos os clientes por nome, código ou CPF/CNPJ" value={customerSearch} onChange={e=>searchCustomers(e.target.value)}/>
          {customerSearchError&&<p role="alert">{customerSearchError}</p>}
          <DialogDescription>
            Selecione o relatório CSV. A carteira será sincronizada com os
            títulos presentes no arquivo.
          </DialogDescription>
          <label className="csv-upload">
            <Upload size={18} />
            <span>{importName || "Escolher arquivo CSV"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void readImportFile(file);
              }}
            />
          </label>
          {importLookupBusy&&<p role="status">Consultando cadastros e vinculando os títulos…</p>}
          {importError && (
            <div className="error" role="alert">
              {importError}
            </div>
          )}
          {importPreview && (
            <>
              <div className="import-summary">
                <div>
                  <strong>{importPreview.valid.length}</strong>
                  <span>Válidos novos</span>
                </div>
                <div>
                  <strong>{importPreview.duplicates}</strong>
                  <span>Já existentes</span>
                </div>
                <div>
                  <strong>{importPreview.invalid.length}</strong>
                  <span>Dados inválidos</span>
                </div>
                <div>
                  <strong>{importPreview.unlinked}</strong>
                  <span>Sem cliente vinculado</span>
                </div>
                <div>
                  <strong>{importPreview.absent.length}</strong>
                  <span>Serão removidos</span>
                </div>
              </div>
              <p className="import-excluded">
                {importPreview.absent.length} título(s) ausentes serão excluídos
                de Títulos e Cobranças.{" "}
                {importPreview.unlinked > 0 &&
                  `${importPreview.unlinked} título(s) serão importados sem vínculo automático; você pode selecionar o cliente agora ou vincular depois.`}
              </p>
              {importPreview.excluded > 0 && (
                <p className="import-excluded">
                  {importPreview.excluded} título(s) com saldo zerado ou
                  negativo serão ignorados.
                </p>
              )}
              {importPreview.unlinked > 0 && (
                <div className="unlinked-import-list">
                  <b>Vínculos opcionais para revisar antes de importar</b>
                  {unlinkedImportRows
                    .slice(currentImportLinkPage * 10, (currentImportLinkPage + 1) * 10)
                    .map((row) => (
                      <div key={row.document}>
                        Título #{row.document}
                        <input aria-label={`Buscar cliente do título ${row.document}`} placeholder="Buscar em todos os clientes por nome, código ou CPF/CNPJ" value={customerSearch} onChange={e=>searchCustomers(e.target.value)}/>
                        {customerPagination()}
                        <Select
                          disabled={customerLoading||!!customerSearchError}
                          value="__none"
                          open={importLinkOpen === row.document}
                          onOpenChange={(open) => setImportLinkOpen(open ? row.document : null)}
                          onValueChange={(value) => {
                            setImportPreview((current) => {
                              if (!current) return current;
                              const rows = current.rows.map((item) =>
                                item.document === row.document
                                  ? {
                                      ...item,
                                      customer_id:
                                        value === "__none" ? null : value,
                                    }
                                  : item,
                              );
                              const byDocument = new Map(
                                rows.map((item) => [item.document, item]),
                              );
                              return {
                                ...current,
                                rows,
                                valid: current.valid.map(
                                  (item) =>
                                    byDocument.get(item.document) ?? item,
                                ),
                                unlinked: rows.filter(
                                  (item) => !item.customer_id,
                                ).length,
                              };
                            });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecionar cliente" />
                          </SelectTrigger>
                          {importLinkOpen === row.document && <SelectContent>
                            <SelectItem value="__none">
                              Selecionar cliente
                            </SelectItem>
                            {Array.from(new Map([...customers.filter(c=>c.id===edit?.customer_id),...customerOptions].map(c=>[c.id,c])).values()).map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                #{customer.customer_code} · {customer.name} ·{" "}
                                {customer.tax_id}
                              </SelectItem>
                            ))}
                          </SelectContent>}
                        </Select>
                      </div>
                    ))}
                  {importLinkPages > 1 && (
                    <div className="flex items-center justify-between gap-3">
                      <button type="button" className="btn secondary" disabled={currentImportLinkPage === 0 || importBusy}
                        onClick={() => { setImportLinkOpen(null); setImportLinkPage(currentImportLinkPage - 1); }}>Anterior</button>
                      <span>Página {currentImportLinkPage + 1} de {importLinkPages}</span>
                      <button type="button" className="btn secondary" disabled={currentImportLinkPage + 1 >= importLinkPages || importBusy}
                        onClick={() => { setImportLinkOpen(null); setImportLinkPage(currentImportLinkPage + 1); }}>Próxima</button>
                    </div>
                  )}
                  <small>Todos os {importPreview.rows.length} títulos da prévia serão processados ao importar.</small>
                </div>
              )}
              {importPreview.valid.length > 0 && (
                <div className="import-preview-wrap">
                  <table className="import-preview-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Documento</th>
                        <th>Vencimento</th>
                        <th>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.valid.slice(0, 8).map((row) => (
                        <tr key={row.document}>
                          <td>
                            {row.customer_id
                              ? `#${customers.find((customer) => customer.id === row.customer_id)?.customer_code ?? ""} · ${customers.find((customer) => customer.id === row.customer_id)?.name ?? row.customer}`
                              : row.customer}
                          </td>
                          <td>{row.document}</td>
                          <td>{row.due.split("-").reverse().join("/")}</td>
                          <td>{money(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.valid.length > 8 && (
                    <small>
                      + {importPreview.valid.length - 8} título(s) válido(s) na
                      importação
                    </small>
                  )}
                </div>
              )}
              {importPreview.invalid.length > 0 && (
                <div className="import-invalid-list">
                  <b>Exemplos de dados inválidos</b>
                  {importPreview.invalid.slice(0, 4).map((item) => (
                    <span key={`${item.line}-${item.reason}`}>
                      Linha {item.line}: {item.reason}
                    </span>
                  ))}
                  {importPreview.invalid.length > 4 && (
                    <span>
                      e mais {importPreview.invalid.length - 4} linha(s)
                    </span>
                  )}
                </div>
              )}
              <div className="form-footer">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={importBusy}
                  onClick={() => setImportOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    importBusy ||
                    (!importPreview.rows.length && !importPreview.absent.length)
                  }
                  onClick={() => void importTitles()}
                >
                  {importBusy ? "Importando…" : "Sincronizar relatório"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v && !busy) setEdit(null);
        }}
      >
        <DialogContent className="editor">
          <DialogTitle>
            {edit?.kind === "title"
              ? edit?.id
                ? `Título #${edit.document}`
                : "Novo título"
              : edit?.id
                ? "Detalhes da tarefa"
                : "Nova tarefa"}
          </DialogTitle>
          <DialogDescription>
            Notas, vencimento e arquivos. Tudo no mesmo lugar.
          </DialogDescription>
          {edit && (
            <form onSubmit={save}>
              <label>
                Título
                <input
                  required
                  maxLength={200}
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  placeholder="Ex.: Título vencido 10"
                />
              </label>
              <div className="form-row">
                <label>
                  Tipo
                  <Select
                    value={edit.kind}
                    onValueChange={(kind) =>
                      setEdit(
                        kind === "task"
                          ? { ...edit, kind, document: null, customer_id: null }
                          : { ...edit, kind, document: edit.document || "" },
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="title">Título financeiro</SelectItem>
                      <SelectItem value="task">Tarefa</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  Vencimento
                  <input
                    type="date"
                    required
                    value={edit.due}
                    onChange={(e) => setEdit({ ...edit, due: e.target.value })}
                  />
                </label>
              </div>
              {edit.kind === "title" && (
                <label>
                  Número único do título
                  <input
                    required
                    maxLength={200}
                    value={edit.document ?? ""}
                    onChange={(e) =>
                      setEdit({ ...edit, document: e.target.value })
                    }
                    placeholder="Número ou Documento do CSV"
                  />
                </label>
              )}
              {edit.kind === "title" && (
                <label>
                  Cliente vinculado
                  <input aria-label="Buscar cliente para vincular" placeholder="Buscar em todos os clientes por nome, código ou CPF/CNPJ" value={customerSearch} onChange={e=>searchCustomers(e.target.value)}/>
                  {customerPagination()}
                  {customerSearchError&&<span role="alert">{customerSearchError}</span>}
                  <Select
                    disabled={customerLoading||!!customerSearchError}
                    value={edit.customer_id || "__none"}
                    onValueChange={(value) =>
                      setEdit({
                        ...edit,
                        customer_id: value === "__none" ? null : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">
                        Sem cliente vinculado
                      </SelectItem>
                      {Array.from(new Map([...customers.filter(c=>c.id===edit?.customer_id),...customerOptions].map(c=>[c.id,c])).values()).map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          #{customer.customer_code} · {customer.name} ·{" "}
                          {customer.tax_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              )}
              {edit.kind === "title" && (
                <label>
                  Valor (R$)
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="Digite ou cole o valor"
                  />
                </label>
              )}
              {edit.kind === "title" && edit.customer_id && (
                <div className="linked-customer-label">
                  Cliente vinculado: #
                  {customerById.get(edit.customer_id)?.customer_code} —{" "}
                  {customerById.get(edit.customer_id)?.name}
                </div>
              )}
              <label>
                Anotações
                <textarea
                  rows={3}
                  maxLength={20000}
                  placeholder="Descreva os detalhes, contatos ou próximos passos…"
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </label>
              <div className="attachment-title">
                <Paperclip size={16} /> Arquivos anexados
              </div>
              {files
                .filter((f) => f.card_id === edit.id)
                .map((f) => (
                  <a className="file" key={f.id} href={"/api/files?id=" + f.id}>
                    <FileText size={16} />
                    <span>{f.name}</span>
                    <ArrowUpRight size={15} />
                  </a>
                ))}
              {pending.map((f, i) => (
                <div className="file" key={i}>
                  <FileText size={16} />
                  <span>{f.name}</span>
                  <button
                    type="button"
                    aria-label={"Remover " + f.name}
                    onClick={() =>
                      setPending((p) => p.filter((_, j) => j !== i))
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <label className="upload">
                <Upload size={18} /> Anexar arquivos{" "}
                <small>Até 20 MB por arquivo</small>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const f = Array.from(e.target.files ?? []);
                    if (f.some((x) => x.size > 20 * 1024 * 1024)) {
                      toast.error("O limite é 20 MB por arquivo.");
                      return;
                    }
                    setPending((p) => [...p, ...f]);
                    e.target.value = "";
                  }}
                />
              </label>
              {edit.kind === "title" && edit.id && (
                <section className="title-history">
                  <h3>
                    <History size={17} /> Histórico individual do título
                  </h3>
                  <p>
                    Registros de contato, acordos e pagamentos vinculados a este
                    título.
                  </p>
                  <div className="event-form">
                    <Select value={eventType} onValueChange={setEventType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TITLE_EVENT_OPTIONS.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <textarea
                      rows={2}
                      maxLength={2000}
                      placeholder="Observação, contato, acordo ou aprovação…"
                      value={eventNote}
                      onChange={(e) => setEventNote(e.target.value)}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={eventBusy}
                      onClick={() => void recordTitleEvent()}
                    >
                      {eventBusy ? "Salvando…" : "Registrar no histórico"}
                    </button>
                  </div>
                  <div className="event-list">
                    {titleEvents.map((event) => (
                      <div key={event.id}>
                        <b>
                          {TITLE_EVENT_OPTIONS.find(
                            (x) => x.id === event.event_type,
                          )?.label || event.event_type}
                        </b>
                        <span>
                          {new Date(event.created_at).toLocaleString("pt-BR")}
                        </span>
                        {event.note && <p>{event.note}</p>}
                      </div>
                    ))}
                    {!titleEvents.length && (
                      <span>Nenhum registro individual ainda.</span>
                    )}
                  </div>
                </section>
              )}
              <div className="form-footer">
                {edit.id && (
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => setDeleting(true)}
                    aria-label="Excluir cartão"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setEdit(null)}
                >
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar cartão"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Excluir todos os títulos?</AlertDialogTitle>
          <AlertDialogDescription>
            Todos os títulos financeiros, históricos e anexos vinculados serão
            excluídos. As tarefas e os clientes serão preservados. Esta ação não
            pode ser desfeita.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllBusy}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAllBusy}
              onClick={() => void deleteAllTitles()}
            >
              {deleteAllBusy ? "Excluindo…" : "Excluir todos os títulos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogTitle>Excluir este cartão?</AlertDialogTitle>
          <AlertDialogDescription>
            O cartão e todos os seus arquivos serão removidos. Esta ação não
            pode ser desfeita.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await api({ action: "delete", id: edit?.id });
                  setEdit(null);
                  await refresh();
                  toast.success("Cartão excluído");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Excluir cartão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
