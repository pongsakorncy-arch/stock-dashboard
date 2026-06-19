"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction  = "LONG" | "SHORT";
type Result     = "WIN" | "LOSS" | "BE";
type SMCConcept = "OB"|"FVG"|"BOS"|"CHoCH"|"Liquidity"|"MSB"|"W-Pattern"|"M-Pattern"|"Other";
type TF = "M1"|"M5"|"M15";
type Session    = "Tokyo"|"London"|"New York"|"Overlap";

type Trade = {
  id: string;
  date: string;
  time: string;
  symbol: string;
  direction: Direction;
  session: Session;
  entryPrice: number;
  exitPrices: number[];   // ราคา exit แต่ละออเดอร์
  avgExit: number;
  lotPerOrder: number;
  orderCount: number;
  totalLot: number;
  totalPL: number;
  slPrice: number;
  tpPrice: number;
  rr: number;
  result: Result;
  smcConcept: SMCConcept[];
  htfBias: "Bullish"|"Bearish"|"Neutral";
  entryModel: string;
  tf: TF;
  notes: string;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (v: number) => {
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);
const KEY = "yok_journal_v3";
const load = (): Trade[] => { try { return JSON.parse(localStorage.getItem(KEY)||"[]"); } catch { return []; } };
const save = (t: Trade[]) => localStorage.setItem(KEY, JSON.stringify(t));

const SMC_LIST: SMCConcept[] = ["OB","FVG","BOS","CHoCH","Liquidity","MSB","W-Pattern","M-Pattern","Other"];
const SESSIONS: Session[]    = ["Tokyo","London","New York","Overlap"];

// ─── P/L per order (XAUUSD: 1 lot = $100/point, 0.1 lot = $10/point) ────────
// point = 0.001 for gold
function calcPL(direction: Direction, entry: number, exit: number, lot: number): number {
  const diff = direction === "LONG" ? exit - entry : entry - exit;
  // XAUUSD: $1 per 0.01 lot per 1 point (1 point = $1 per 0.1 lot)
  return Math.round(diff * lot * 100 * 100) / 100;
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function calcStats(trades: Trade[]) {
  if (!trades.length) return { total:0, wins:0, losses:0, be:0, winRate:0, totalPL:0, avgRR:0, best:0, worst:0, streak:0, streakType:"" };
  const wins   = trades.filter(t=>t.result==="WIN").length;
  const losses = trades.filter(t=>t.result==="LOSS").length;
  const be     = trades.filter(t=>t.result==="BE").length;
  const totalPL = trades.reduce((s,t)=>s+t.totalPL, 0);
  const avgRR   = trades.reduce((s,t)=>s+(t.rr||0), 0) / trades.length;
  const pls     = trades.map(t=>t.totalPL);
  const sorted  = [...trades].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  let streak=0; const first=sorted[0]?.result;
  for(const t of sorted){ if(t.result===first) streak++; else break; }
  return { total:trades.length, wins, losses, be, winRate:wins/trades.length*100, totalPL, avgRR, best:Math.max(...pls), worst:Math.min(...pls), streak, streakType:first||"" };
}

// ─── Equity Curve ─────────────────────────────────────────────────────────────
function PLChart({ trades }: { trades: Trade[] }) {
  if (trades.length < 2) return <p className="text-xs text-zinc-600 text-center py-6">ต้องการอย่างน้อย 2 session</p>;
  const sorted = [...trades].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  let cum=0;
  const pts = sorted.map(t=>{ cum+=t.totalPL; return cum; });
  const mn=Math.min(0,...pts), mx=Math.max(...pts), range=mx-mn||1;
  const W=300,H=80;
  const svgPts = pts.map((v,i)=>`${(i/(pts.length-1))*W},${H-((v-mn)/range)*H}`).join(" ");
  const fillPts = pts.map((v,i)=>`${(i/(pts.length-1))*W},${H-((v-mn)/range)*H}`).join(" ");
  const color = pts[pts.length-1]>=0?"#10b981":"#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs><linearGradient id="plg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <line x1="0" y1={H-((0-mn)/range)*H} x2={W} y2={H-((0-mn)/range)*H} stroke="#27272a" strokeWidth="1" strokeDasharray="4"/>
      <polygon points={`0,${H} ${fillPts} ${W},${H}`} fill="url(#plg)"/>
      <polyline points={svgPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Default form ─────────────────────────────────────────────────────────────
const defaultForm = () => ({
  date: new Date().toISOString().split("T")[0],
  time: new Date().toTimeString().slice(0,5),
  symbol: "XAUUSD",
  direction: "SHORT" as Direction,
  session: "Tokyo" as Session,
  entryPrice: 0,
  exitPrices: [] as number[],
  lotPerOrder: 0.10,
  slPrice: 0,
  tpPrice: 0,
  rr: 0,
  htfBias: "Bearish" as "Bullish"|"Bearish"|"Neutral",
  smcConcept: [] as SMCConcept[],
  tf: "M5" as TF,
  entryModel: "",
  notes: "",
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [trades,  setTrades]  = useState<Trade[]>([]);
  const [view,    setView]    = useState<"dashboard"|"list"|"add">("dashboard");
  const [form,    setForm]    = useState(defaultForm());
  const [editId,  setEditId]  = useState<string|null>(null);
  const [filter,  setFilter]  = useState<"ALL"|Result>("ALL");

  // Exit price inputs
  const [exitInput, setExitInput]   = useState(""); // single input
  const [pasteInput, setPasteInput] = useState(""); // bulk paste

  useEffect(()=>{ setTrades(load()); },[]);
  const stats = calcStats(trades);

  const f = (k: keyof ReturnType<typeof defaultForm> | string, v: any) => setForm((p:any)=>({...p,[k]:v}));

  // ── Computed from form ────────────────────────────────────────────────────
  const exits     = form.exitPrices;
  const avgExit   = exits.length ? exits.reduce((a,b)=>a+b,0)/exits.length : 0;
  const perOrderPLs = exits.map(ex => calcPL(form.direction, form.entryPrice, ex, form.lotPerOrder));
  const totalPL   = perOrderPLs.reduce((a,b)=>a+b, 0);
  const totalLot  = exits.length * form.lotPerOrder;
  const result: Result = totalPL > 0.01 ? "WIN" : totalPL < -0.01 ? "LOSS" : "BE";

  // Auto-calc R:R from Entry/SL/TP
  const autoRR = (() => {
    const e = form.entryPrice, sl = form.slPrice, tp = form.tpPrice;
    if (!e || !sl || !tp) return 0;
    const risk   = Math.abs(e - sl);
    const reward = Math.abs(tp - e);
    return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
  })();

  // ── Add one exit price ────────────────────────────────────────────────────
  const addExit = () => {
    const v = parseFloat(exitInput);
    if (!isNaN(v) && v > 0) {
      f("exitPrices", [...exits, v]);
      setExitInput("");
    }
  };

  // ── Paste multiple exits ──────────────────────────────────────────────────
  const parsePaste = () => {
    const nums = pasteInput
      .split(/[\n,\s]+/)
      .map(s => parseFloat(s.replace(/,/g,"")))
      .filter(n => !isNaN(n) && n > 0);
    if (nums.length) {
      f("exitPrices", [...exits, ...nums]);
      setPasteInput("");
    }
  };

  const removeExit = (i: number) =>
    f("exitPrices", exits.filter((_,j)=>j!==i));

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveTrade = () => {
    if (!exits.length || !form.entryPrice) return;
    const trade: Trade = {
      id: editId||uid(),
      createdAt: new Date().toISOString(),
      date: form.date, time: form.time,
      symbol: form.symbol, direction: form.direction, session: form.session,
      entryPrice: form.entryPrice, exitPrices: exits,
      avgExit: Math.round(avgExit*1000)/1000,
      lotPerOrder: form.lotPerOrder,
      orderCount: exits.length, totalLot,
      totalPL: Math.round(totalPL*100)/100,
      slPrice: form.slPrice, rr: form.rr, result,
      smcConcept: form.smcConcept, htfBias: form.htfBias,
      entryModel: form.entryModel, tf: (form as any).tf ?? "M5",
      notes: form.notes, tpPrice: (form as any).tpPrice ?? 0,
    };
    const updated = editId ? trades.map(t=>t.id===editId?trade:t) : [trade,...trades];
    setTrades(updated); save(updated);
    setForm(defaultForm()); setExitInput(""); setPasteInput(""); setEditId(null);
    setView("list");
  };

  const deleteTrade = (id: string) => {
    if(!confirm("ลบ session นี้?")) return;
    const u=trades.filter(t=>t.id!==id); setTrades(u); save(u);
  };
  const editTrade = (t: Trade) => {
    (setForm as any)({
      ...defaultForm(),
      date: t.date, time: t.time, symbol: t.symbol,
      direction: t.direction, session: t.session,
      entryPrice: t.entryPrice, exitPrices: t.exitPrices,
      lotPerOrder: t.lotPerOrder, slPrice: t.slPrice,
      tpPrice: (t as any).tpPrice ?? 0,
      rr: t.rr, result: t.result,
      htfBias: t.htfBias, smcConcept: t.smcConcept,
      entryModel: t.entryModel,
      tf: (t as any).tf ?? "M5",
      notes: t.notes,
    });
    setEditId(t.id); setView("add");
  };

  const filtered = filter==="ALL" ? trades : trades.filter(t=>t.result===filter);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0d0d0f] text-white pb-24"
      style={{fontFamily:"'Inter','Noto Sans Thai',sans-serif"}}>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0d0d0f]/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-500 hover:text-white text-sm">← หน้าแรก</Link>
          <span className="text-zinc-700">|</span>
          <h1 className="text-sm font-bold">📓 Trading Journal · XAUUSD</h1>
        </div>
        <button onClick={()=>{ setForm(defaultForm()); setExitInput(""); setPasteInput(""); setEditId(null); setView("add"); }}
          className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-black rounded-lg">
          + บันทึก Session
        </button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-[#0a0a0c] px-4">
        {(["dashboard","list"] as const).map(v=>(
          <button key={v} onClick={()=>setView(v)}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${view===v?"text-yellow-400 border-yellow-400":"text-zinc-500 border-transparent"}`}>
            {v==="dashboard"?"📊 Dashboard":"📋 Sessions"}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {view==="dashboard" && (
        <div className="px-4 py-5 max-w-3xl mx-auto space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {label:"Win Rate",   value:`${stats.winRate.toFixed(1)}%`, color:stats.winRate>=50?"text-emerald-400":"text-red-400"},
              {label:"Total P/L",  value:money(stats.totalPL), color:stats.totalPL>=0?"text-emerald-400":"text-red-400"},
              {label:"Sessions",   value:String(stats.total), color:"text-white"},
              {label:"Avg R:R",    value:`${stats.avgRR.toFixed(2)}R`, color:"text-purple-400"},
            ].map(s=>(
              <div key={s.label} className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-3">Win / Loss / BE</p>
              <div className="flex gap-4 mb-3">
                <div className="text-center"><p className="text-2xl font-black text-emerald-400">{stats.wins}</p><p className="text-xs text-zinc-500">Win</p></div>
                <div className="text-center"><p className="text-2xl font-black text-red-400">{stats.losses}</p><p className="text-xs text-zinc-500">Loss</p></div>
                <div className="text-center"><p className="text-2xl font-black text-zinc-400">{stats.be}</p><p className="text-xs text-zinc-500">BE</p></div>
              </div>
              {stats.total>0 && (
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{width:`${stats.winRate}%`}}/>
                  <div className="h-full bg-zinc-600" style={{width:`${stats.be/stats.total*100}%`}}/>
                  <div className="h-full bg-red-500 flex-1"/>
                </div>
              )}
            </div>
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Streak</p>
              <p className={`text-3xl font-black ${stats.streakType==="WIN"?"text-emerald-400":stats.streakType==="LOSS"?"text-red-400":"text-zinc-400"}`}>
                {stats.streakType==="WIN"?`🔥 ${stats.streak}W`:stats.streakType==="LOSS"?`❄️ ${stats.streak}L`:"-"}
              </p>
              <div className="mt-2 space-y-1 text-xs">
                <div><span className="text-zinc-500">Best: </span><span className="text-emerald-400 font-bold">{money(stats.best)}</span></div>
                <div><span className="text-zinc-500">Worst: </span><span className="text-red-400 font-bold">{money(stats.worst)}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-3">Equity Curve</p>
            <PLChart trades={trades}/>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center">
              <p className="text-sm font-bold">Sessions ล่าสุด</p>
              <button onClick={()=>setView("list")} className="text-xs text-yellow-400">ดูทั้งหมด →</button>
            </div>
            {trades.slice(0,5).map(t=>(
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/40 hover:bg-zinc-800/20">
                <span className={`text-xs font-black px-2 py-0.5 rounded ${t.direction==="LONG"?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>{t.direction}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{t.date} · {t.session}</p>
                  <p className="text-[10px] text-zinc-500">{t.orderCount} ออเดอร์ · Entry {t.entryPrice} → Avg {t.avgExit}</p>
                </div>
                <span className={`font-black text-sm ${t.totalPL>=0?"text-emerald-400":"text-red-400"}`}>{money(t.totalPL)}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${t.result==="WIN"?"bg-emerald-400/10 text-emerald-400":t.result==="LOSS"?"bg-red-400/10 text-red-400":"bg-zinc-600 text-zinc-300"}`}>{t.result}</span>
              </div>
            ))}
            {!trades.length && <p className="text-center text-zinc-600 text-sm py-8">ยังไม่มี session · กด + บันทึก Session</p>}
          </div>
        </div>
      )}

      {/* ── LIST ── */}
      {view==="list" && (
        <div className="px-4 py-5 max-w-3xl mx-auto space-y-3">
          <div className="flex gap-2 items-center">
            {(["ALL","WIN","LOSS","BE"] as const).map(r=>(
              <button key={r} onClick={()=>setFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filter===r?r==="WIN"?"bg-emerald-500 text-black":r==="LOSS"?"bg-red-500 text-white":r==="BE"?"bg-zinc-500 text-white":"bg-yellow-400 text-black":"bg-zinc-800 text-zinc-400"}`}>
                {r}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-500">{filtered.length} sessions</span>
          </div>

          {filtered.map(t=>(
            <div key={t.id} className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/50">
                <span className={`text-xs font-black px-2 py-0.5 rounded ${t.direction==="LONG"?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>{t.direction}</span>
                <span className="font-bold text-sm">{t.symbol}</span>
                <span className="text-xs text-zinc-500">{t.date} · {t.time} · {t.session}</span>
                <span className="flex-1"/>
                <span className={`font-black ${t.totalPL>=0?"text-emerald-400":"text-red-400"}`}>{money(t.totalPL)}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${t.result==="WIN"?"bg-emerald-400/10 text-emerald-400":t.result==="LOSS"?"bg-red-400/10 text-red-400":"bg-zinc-600 text-zinc-300"}`}>{t.result}</span>
                <button onClick={()=>editTrade(t)} className="text-xs text-yellow-400 hover:underline ml-1">แก้</button>
                <button onClick={()=>deleteTrade(t.id)} className="text-xs text-red-400 hover:underline">ลบ</button>
              </div>

              {/* Stats */}
              <div className="px-4 py-3 grid grid-cols-3 gap-2 text-xs border-b border-zinc-800/30">
                <div><span className="text-zinc-500">Entry: </span><span className="font-mono font-bold">{t.entryPrice}</span></div>
                <div><span className="text-zinc-500">Avg Exit: </span><span className="font-mono font-bold">{t.avgExit}</span></div>
                <div><span className="text-zinc-500">SL: </span><span className="font-mono text-red-400">{t.slPrice||"-"}</span></div>
                <div><span className="text-zinc-500">ออเดอร์: </span><span className="font-bold">{t.orderCount} × {t.lotPerOrder} lot</span></div>
                <div><span className="text-zinc-500">Lot รวม: </span><span className="font-bold">{t.totalLot.toFixed(2)}</span></div>
                <div><span className="text-zinc-500">R:R: </span><span className="text-purple-400 font-bold">{t.rr?`${t.rr.toFixed(1)}R`:"-"}</span></div>
              </div>

              {/* Exit prices */}
              <div className="px-4 py-2 border-b border-zinc-800/30">
                <p className="text-[10px] text-zinc-500 mb-1.5">Exit prices ({t.exitPrices.length} ออเดอร์)</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.exitPrices.map((ex,i)=>(
                    <span key={i} className={`text-[10px] font-mono px-2 py-0.5 rounded ${t.direction==="SHORT"&&ex>t.entryPrice?"bg-emerald-400/10 text-emerald-400":t.direction==="LONG"&&ex>t.entryPrice?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>
                      {ex}
                    </span>
                  ))}
                </div>
              </div>

              {/* SMC + notes */}
              <div className="px-4 py-2">
                <div className="flex flex-wrap gap-1 mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.htfBias==="Bullish"?"bg-emerald-400/10 text-emerald-400":t.htfBias==="Bearish"?"bg-red-400/10 text-red-400":"bg-zinc-700 text-zinc-400"}`}>{t.htfBias}</span>
                  {t.tf && <span className="text-[10px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full font-bold">{t.tf}</span>}
                  {t.entryModel && <span className="text-[10px] bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full font-bold">{t.entryModel}</span>}
                  {t.smcConcept.map(c=><span key={c} className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">{c}</span>)}
                </div>
                {t.notes && <p className="text-xs text-zinc-500 italic">"{t.notes}"</p>}
              </div>
            </div>
          ))}
          {!filtered.length && <p className="text-center text-zinc-600 py-12">ไม่มี session</p>}
        </div>
      )}

      {/* ── ADD / EDIT FORM ── */}
      {view==="add" && (
        <div className="px-4 py-5 max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={()=>{setView("dashboard");setEditId(null);}} className="text-zinc-500 text-sm">← ยกเลิก</button>
            <h2 className="text-sm font-bold">{editId?"แก้ไข Session":"บันทึก Session ใหม่"}</h2>
          </div>

          {/* ── Step 1: Meta ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">① Session Info</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">วันที่</label>
                <input type="date" value={form.date} onChange={e=>f("date",e.target.value)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-2 py-2 text-xs outline-none focus:border-yellow-400"/>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">เวลา</label>
                <input type="time" value={form.time} onChange={e=>f("time",e.target.value)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-2 py-2 text-xs outline-none focus:border-yellow-400"/>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Session</label>
                <select value={form.session} onChange={e=>f("session",e.target.value)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-2 py-2 text-xs outline-none focus:border-yellow-400">
                  {SESSIONS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Direction */}
            <div className="flex gap-2">
              {(["LONG","SHORT"] as Direction[]).map(d=>(
                <button key={d} onClick={()=>f("direction",d)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-colors ${form.direction===d?d==="LONG"?"bg-emerald-500 text-black":"bg-red-500 text-white":"bg-zinc-800 text-zinc-400"}`}>
                  {d==="LONG"?"▲ LONG":"▼ SHORT"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Entry / Exit / TP / SL ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">② ราคา & Lot</p>

            {/* Entry */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Entry Price</label>
              <input type="number" step="0.001" value={form.entryPrice||""} placeholder="เช่น 4171.200"
                onChange={e=>f("entryPrice",parseFloat(e.target.value)||0)}
                className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-base outline-none font-mono font-black text-yellow-300"/>
            </div>

            {/* TP / SL / BE row */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Take Profit 🟢</label>
                <input type="number" step="0.001" value={form.tpPrice||""} placeholder="TP"
                  onChange={e=>f("tpPrice",parseFloat(e.target.value)||0)}
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-emerald-400 rounded-lg px-2 py-2 text-sm outline-none font-mono text-emerald-400"/>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Stop Loss 🔴</label>
                <input type="number" step="0.001" value={form.slPrice||""} placeholder="SL"
                  onChange={e=>f("slPrice",parseFloat(e.target.value)||0)}
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-red-400 rounded-lg px-2 py-2 text-sm outline-none font-mono text-red-400"/>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Lot / Order</label>
                <input type="number" step="0.01" value={form.lotPerOrder||""} placeholder="0.10"
                  onChange={e=>f("lotPerOrder",parseFloat(e.target.value)||0.1)}
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-2 py-2 text-sm outline-none font-mono"/>
              </div>
            </div>

            {/* Auto R:R preview */}
            {autoRR > 0 && (
              <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                <span className="text-xs text-zinc-400">R:R อัตโนมัติ</span>
                <span className="text-lg font-black text-purple-400 ml-auto">1 : {autoRR}</span>
              </div>
            )}

            {/* Result quick select */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">ผลลัพธ์</label>
              <div className="flex gap-2">
                {(["WIN","LOSS","BE"] as Result[]).map(r=>(
                  <button key={r} onClick={()=>f("result",r)}
                    className={`flex-1 py-2 rounded-lg text-sm font-black transition-colors ${
                      form.result===r
                        ? r==="WIN"?"bg-emerald-500 text-black":r==="LOSS"?"bg-red-500 text-white":"bg-zinc-500 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}>
                    {r==="WIN"?"✅ WIN":r==="LOSS"?"❌ LOSS":"🟡 BE"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Step 3: Exit prices ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">③ Exit Prices (กรอกทีละออเดอร์)</p>

            {/* Single add */}
            <div className="flex gap-2">
              <input type="number" step="0.001" value={exitInput} placeholder="ราคา exit เช่น 4178.018"
                onChange={e=>setExitInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addExit()}
                className="flex-1 bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-emerald-400 font-mono"/>
              <button onClick={addExit}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-lg text-sm transition-colors">
                + เพิ่ม
              </button>
            </div>

            {/* Bulk paste */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">หรือ Paste หลายราคาพร้อมกัน (เว้นวรรค หรือ Enter)</label>
              <div className="flex gap-2">
                <textarea value={pasteInput} placeholder={"4177.027\n4178.018\n4178.044\n4178.011"}
                  onChange={e=>setPasteInput(e.target.value)} rows={3}
                  className="flex-1 bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-yellow-400 font-mono resize-none"/>
                <button onClick={parsePaste}
                  className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-lg text-xs transition-colors self-end">
                  Paste<br/>ทั้งหมด
                </button>
              </div>
            </div>

            {/* Exit list */}
            {exits.length > 0 && (
              <div className="bg-[#111113] rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-zinc-500">{exits.length} ออเดอร์</p>
                  <button onClick={()=>f("exitPrices",[])} className="text-[10px] text-red-400 hover:underline">ล้างทั้งหมด</button>
                </div>
                {exits.map((ex,i)=>{
                  const pl = calcPL(form.direction, form.entryPrice, ex, form.lotPerOrder);
                  const isPos = pl >= 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600 w-4">{i+1}.</span>
                      <span className="font-mono text-xs font-bold flex-1">{ex}</span>
                      <span className={`text-xs font-bold ${isPos?"text-emerald-400":"text-red-400"}`}>{money(pl)}</span>
                      <button onClick={()=>removeExit(i)} className="text-zinc-600 hover:text-red-400 text-xs ml-1">✕</button>
                    </div>
                  );
                })}

                {/* Summary */}
                <div className="border-t border-zinc-800 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Avg Exit</span>
                    <span className="font-mono font-bold">{avgExit.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Lot รวม</span>
                    <span className="font-bold">{totalLot.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-zinc-500">Total P/L</span>
                    <span className={`text-base font-black ${totalPL>=0?"text-emerald-400":"text-red-400"}`}>{money(totalPL)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Result</span>
                    <span className={`font-black px-2 py-0.5 rounded text-xs ${result==="WIN"?"bg-emerald-400/10 text-emerald-400":result==="LOSS"?"bg-red-400/10 text-red-400":"bg-zinc-600 text-zinc-300"}`}>{result}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Step 4: SMC ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">④ SMC Analysis</p>

            {/* TF */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1.5 block">Timeframe (Entry)</label>
              <div className="flex gap-2">
                {(["M1","M5","M15"] as TF[]).map(t=>(
                  <button key={t} onClick={()=>f("tf",t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-black border transition-colors ${
                      form.tf===t
                        ? "bg-yellow-400/20 border-yellow-400 text-yellow-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}>{t}</button>
                ))}
              </div>
            </div>

            {/* HTF Bias */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1.5 block">HTF Bias</label>
              <div className="flex gap-2">
                {(["Bullish","Bearish","Neutral"] as const).map(b=>(
                  <button key={b} onClick={()=>f("htfBias",b)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.htfBias===b?b==="Bullish"?"bg-emerald-500/20 border-emerald-500 text-emerald-400":b==="Bearish"?"bg-red-500/20 border-red-500 text-red-400":"bg-zinc-500/20 border-zinc-500 text-zinc-300":"bg-zinc-800 border-zinc-700 text-zinc-500"}`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* SMC Concepts */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1.5 block">SMC Concept</label>
              <div className="flex flex-wrap gap-1.5">
                {SMC_LIST.map(c=>{
                  const active=(form.smcConcept||[]).includes(c);
                  return <button key={c} onClick={()=>f("smcConcept",active?form.smcConcept.filter(x=>x!==c):[...form.smcConcept,c])}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${active?"bg-purple-500/30 border border-purple-500 text-purple-300":"bg-zinc-800 border border-zinc-700 text-zinc-500"}`}>{c}</button>;
                })}
              </div>
            </div>

            {/* Entry Model */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Entry Model</label>
              <input value={form.entryModel} onChange={e=>f("entryModel",e.target.value)}
                placeholder="W2, M2, BOS+OB, CHoCH+FVG"
                className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-xs outline-none focus:border-yellow-400"/>
            </div>

            {/* R:R — แสดง auto หรือกรอกเอง */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">
                R:R {autoRR > 0 ? <span className="text-purple-400 ml-1">← คำนวณจาก TP/SL อัตโนมัติ: 1:{autoRR}</span> : "(กรอกเองถ้าไม่มี TP/SL)"}
              </label>
              <input type="number" step="0.1"
                value={autoRR > 0 ? autoRR : (form.rr||"")}
                readOnly={autoRR > 0}
                placeholder="เช่น 2.5"
                onChange={e=>f("rr",parseFloat(e.target.value)||0)}
                className={`w-full bg-[#111113] border rounded-lg px-3 py-2 text-sm outline-none font-mono font-black ${autoRR>0?"border-purple-500/40 text-purple-400 opacity-80 cursor-default":"border-zinc-700 focus:border-purple-400 text-purple-400"}`}/>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Notes / บทเรียน</label>
              <textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={3}
                placeholder="บทเรียน, ข้อผิดพลาด, จุดที่ดี..."
                className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"/>
            </div>
          </div>

          {/* Save */}
          <button onClick={saveTrade}
            disabled={!exits.length || !form.entryPrice}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-base rounded-xl transition-colors">
            {editId?"✓ อัปเดต Session":`✓ บันทึก Session (${exits.length} ออเดอร์ · ${money(totalPL)})`}
          </button>
        </div>
      )}
    </main>
  );
}
