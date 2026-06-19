"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction  = "LONG" | "SHORT";
type Result     = "WIN" | "LOSS" | "BE";
type SMCConcept = "OB"|"FVG"|"BOS"|"CHoCH"|"Liquidity"|"MSB"|"W-Pattern"|"M-Pattern"|"Other";
type Session    = "Tokyo"|"London"|"New York"|"Overlap";

type RawOrder = {
  symbol: string;
  direction: Direction;
  lot: number;
  exitPrice: number;
  entryPrice: number;
  pl: number;
  result: Result;
};

type Trade = {
  id: string;
  date: string;
  time: string;
  symbol: string;
  direction: Direction;
  session: Session;
  avgEntry: number;
  avgExit: number;
  slPrice: number;
  tpPrice: number;
  totalLot: number;
  orderCount: number;
  totalPL: number;
  rr: number;
  result: Result;
  smcConcept: SMCConcept[];
  htfBias: "Bullish"|"Bearish"|"Neutral";
  entryModel: string;
  notes: string;
  imageUrl?: string;
  createdAt: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (v: number) => {
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
};
const uid = () => Math.random().toString(36).slice(2,10);
const STORAGE_KEY = "yok_journal_v2";
const loadTrades  = (): Trade[] => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch { return []; } };
const saveTrades  = (t: Trade[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(t));

const SMC_LIST: SMCConcept[] = ["OB","FVG","BOS","CHoCH","Liquidity","MSB","W-Pattern","M-Pattern","Other"];
const SESSIONS: Session[]    = ["Tokyo","London","New York","Overlap"];

// ─── Parse broker screenshot text ────────────────────────────────────────────
function parseBrokerText(text: string): RawOrder[] {
  const orders: RawOrder[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Patterns for this broker format:
  // "XAU/USD  TP  +68.20 USC"
  // "ขาย 0.10 ล็อต ที่ 4,178.018   4,171.200"
  // USC = cents → divide by 100 to get USD

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect symbol line: XAU/USD or XAUUSD
    const symMatch = line.match(/XAU\/?USD/i);
    if (symMatch) {
      // P/L on same line or next
      const plMatch = line.match(/([+-][\d,]+\.?\d*)\s*USC/i) ||
                      (lines[i+1]||"").match(/([+-][\d,]+\.?\d*)\s*USC/i);
      const plRaw = plMatch ? parseFloat(plMatch[1].replace(/,/g,"")) / 100 : 0;
      const result: Result = plRaw > 0 ? "WIN" : plRaw < 0 ? "LOSS" : "BE";

      // Find direction + lot + exit price line
      let dirLine = "";
      for (let j = i; j < Math.min(i+4, lines.length); j++) {
        if (lines[j].match(/ขาย|ซื้อ|sell|buy/i)) { dirLine = lines[j]; break; }
      }

      const direction: Direction = dirLine.match(/ขาย|sell/i) ? "SHORT" : "LONG";
      const lotMatch   = dirLine.match(/([\d.]+)\s*ล็อต/i) || dirLine.match(/([\d.]+)\s*lot/i);
      const lot        = lotMatch ? parseFloat(lotMatch[1]) : 0.1;

      // Prices: "ที่ 4,178.018   4,171.200"
      const priceMatches = dirLine.match(/([\d,]+\.[\d]+)/g) || [];
      const exitPrice  = priceMatches[0] ? parseFloat(priceMatches[0].replace(/,/g,"")) : 0;
      const entryPrice = priceMatches[1] ? parseFloat(priceMatches[1].replace(/,/g,"")) : 0;

      if (exitPrice > 0) {
        orders.push({ symbol:"XAUUSD", direction, lot, exitPrice, entryPrice, pl: plRaw, result });
      }
    }
    i++;
  }
  return orders;
}

// ─── Group orders into 1 trade session ───────────────────────────────────────
function groupOrders(orders: RawOrder[], date: string, time: string, session: Session): Partial<Trade> {
  if (!orders.length) return {};
  const totalLot   = orders.reduce((s,o) => s + o.lot, 0);
  const totalPL    = orders.reduce((s,o) => s + o.pl, 0);
  const avgEntry   = orders.reduce((s,o) => s + o.entryPrice * o.lot, 0) / totalLot;
  const avgExit    = orders.reduce((s,o) => s + o.exitPrice  * o.lot, 0) / totalLot;
  const direction  = orders[0].direction;
  const result: Result = totalPL > 0.01 ? "WIN" : totalPL < -0.01 ? "LOSS" : "BE";
  return {
    date, time, session,
    symbol: orders[0].symbol,
    direction, totalLot,
    orderCount: orders.length,
    avgEntry: Math.round(avgEntry * 1000)/1000,
    avgExit:  Math.round(avgExit  * 1000)/1000,
    totalPL:  Math.round(totalPL  * 100)/100,
    result,
    slPrice: 0, tpPrice: 0, rr: 0,
    smcConcept: [], htfBias: "Bullish", entryModel: "", notes: "",
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function calcStats(trades: Trade[]) {
  if (!trades.length) return { total:0, wins:0, losses:0, be:0, winRate:0, totalPL:0, avgRR:0, bestTrade:0, worstTrade:0, streak:0, streakType:"" };
  const wins   = trades.filter(t=>t.result==="WIN").length;
  const losses = trades.filter(t=>t.result==="LOSS").length;
  const be     = trades.filter(t=>t.result==="BE").length;
  const totalPL = trades.reduce((s,t)=>s+t.totalPL,0);
  const avgRR   = trades.reduce((s,t)=>s+(t.rr||0),0)/trades.length;
  const pls     = trades.map(t=>t.totalPL);
  const sorted  = [...trades].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  let streak=0; const first=sorted[0]?.result;
  for(const t of sorted){ if(t.result===first) streak++; else break; }
  return { total:trades.length, wins, losses, be,
    winRate: wins/trades.length*100, totalPL, avgRR,
    bestTrade:  Math.max(...pls),
    worstTrade: Math.min(...pls),
    streak, streakType: first||"" };
}

// ─── PLChart ──────────────────────────────────────────────────────────────────
function PLChart({ trades }: { trades: Trade[] }) {
  if (trades.length < 2) return <p className="text-xs text-zinc-600 text-center py-6">ต้องการอย่างน้อย 2 session</p>;
  const sorted = [...trades].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  let cum=0; const pts = sorted.map(t=>{ cum+=t.totalPL; return cum; });
  const mn=Math.min(0,...pts), mx=Math.max(...pts), range=mx-mn||1;
  const W=300,H=80;
  const svgPts = pts.map((v,i)=>`${(i/(pts.length-1))*W},${H-((v-mn)/range)*H}`).join(" ");
  const fill   = pts.map((v,i)=>`${(i/(pts.length-1))*W},${H-((v-mn)/range)*H}`).join(" ");
  const color  = pts[pts.length-1]>=0?"#10b981":"#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs><linearGradient id="plg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
        <stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      <line x1="0" y1={H-((0-mn)/range)*H} x2={W} y2={H-((0-mn)/range)*H} stroke="#27272a" strokeWidth="1" strokeDasharray="4"/>
      <polygon points={`0,${H} ${fill} ${W},${H}`} fill="url(#plg)"/>
      <polyline points={svgPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [trades,  setTrades]  = useState<Trade[]>([]);
  const [view,    setView]    = useState<"dashboard"|"list"|"add">("dashboard");
  const [imgFile, setImgFile] = useState<File|null>(null);
  const [imgPreview, setImgPreview] = useState("");
  const [scanning, setScanning]    = useState(false);
  const [rawOrders, setRawOrders]  = useState<RawOrder[]>([]);
  const [scanMsg,   setScanMsg]    = useState("");

  // Form
  const [form, setForm] = useState<Partial<Trade>>({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toTimeString().slice(0,5),
    symbol:"XAUUSD", direction:"LONG", session:"Tokyo",
    avgEntry:0, avgExit:0, slPrice:0, tpPrice:0,
    totalLot:0, orderCount:1, totalPL:0, rr:0, result:"WIN",
    smcConcept:[], htfBias:"Bullish", entryModel:"", notes:"",
  });
  const [editId, setEditId] = useState<string|null>(null);
  const [filterResult, setFilter] = useState<"ALL"|Result>("ALL");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ setTrades(loadTrades()); },[]);

  const stats = calcStats(trades);
  const f = (k: keyof Trade, v: any) => setForm(p=>({...p,[k]:v}));

  // ── OCR via Tesseract.js (CDN) ────────────────────────────────────────────
  const scanImage = async () => {
    if (!imgFile) return;
    setScanning(true); setScanMsg("กำลังโหลด OCR engine..."); setRawOrders([]);

    try {
      // Load Tesseract from CDN dynamically
      const w = window as any;
      if (!w.Tesseract) {
        await new Promise<void>((res,rej)=>{
          const s=document.createElement("script");
          s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
          s.onload=()=>res(); s.onerror=rej;
          document.head.appendChild(s);
        });
      }

      setScanMsg("กำลังอ่านข้อมูลจากรูป... (อาจใช้เวลา 10-20 วินาที)");

      const result = await w.Tesseract.recognize(imgFile, "tha+eng", {
        logger: (m: any) => {
          if (m.status==="recognizing text")
            setScanMsg(`กำลังอ่าน... ${Math.round(m.progress*100)}%`);
        }
      });

      const text: string = result.data.text;
      console.log("OCR text:", text);

      const orders = parseBrokerText(text);
      if (orders.length > 0) {
        setRawOrders(orders);
        const grouped = groupOrders(orders, form.date||"", form.time||"", form.session as Session||"Tokyo");
        setForm(p=>({...p,...grouped, imageUrl: imgPreview}));
        setScanMsg(`✅ พบ ${orders.length} ออเดอร์ รวม P/L: ${money(grouped.totalPL||0)}`);
      } else {
        setScanMsg("⚠️ อ่านข้อมูลไม่ครบ กรุณากรอกเอง หรือลองรูปที่คมชัดขึ้น");
      }
    } catch(e) {
      console.error(e);
      setScanMsg("❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    }
    setScanning(false);
  };

  const handleFile = (file: File) => {
    setImgFile(file); setScanMsg(""); setRawOrders([]);
    const r=new FileReader();
    r.onload=e=>setImgPreview(e.target?.result as string);
    r.readAsDataURL(file);
  };

  const saveTrade = () => {
    const trade: Trade = {
      id: editId||uid(),
      createdAt: new Date().toISOString(),
      date:       form.date||"",
      time:       form.time||"",
      symbol:     form.symbol||"XAUUSD",
      direction:  form.direction||"LONG",
      session:    form.session||"Tokyo",
      avgEntry:   Number(form.avgEntry)||0,
      avgExit:    Number(form.avgExit)||0,
      slPrice:    Number(form.slPrice)||0,
      tpPrice:    Number(form.tpPrice)||0,
      totalLot:   Number(form.totalLot)||0,
      orderCount: Number(form.orderCount)||1,
      totalPL:    Number(form.totalPL)||0,
      rr:         Number(form.rr)||0,
      result:     form.result||"WIN",
      smcConcept: form.smcConcept||[],
      htfBias:    form.htfBias||"Bullish",
      entryModel: form.entryModel||"",
      notes:      form.notes||"",
      imageUrl:   form.imageUrl||imgPreview||undefined,
    };
    const updated = editId ? trades.map(t=>t.id===editId?trade:t) : [trade,...trades];
    setTrades(updated); saveTrades(updated);
    setForm({ date:new Date().toISOString().split("T")[0], time:new Date().toTimeString().slice(0,5),
      symbol:"XAUUSD",direction:"LONG",session:"Tokyo",avgEntry:0,avgExit:0,
      slPrice:0,tpPrice:0,totalLot:0,orderCount:1,totalPL:0,rr:0,result:"WIN",
      smcConcept:[],htfBias:"Bullish",entryModel:"",notes:"" });
    setImgFile(null); setImgPreview(""); setEditId(null); setRawOrders([]); setScanMsg("");
    setView("list");
  };

  const deleteTrade = (id:string) => {
    if(!confirm("ลบ session นี้?")) return;
    const u=trades.filter(t=>t.id!==id); setTrades(u); saveTrades(u);
  };
  const editTrade = (t:Trade) => {
    setForm(t); setImgPreview(t.imageUrl||""); setEditId(t.id); setView("add");
  };
  const filtered = filterResult==="ALL" ? trades : trades.filter(t=>t.result===filterResult);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0d0d0f] text-white pb-20"
      style={{fontFamily:"'Inter','Noto Sans Thai',sans-serif"}}>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0d0d0f]/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-500 hover:text-white text-sm">← หน้าแรก</Link>
          <span className="text-zinc-700">|</span>
          <h1 className="text-sm font-bold">📓 Trading Journal · XAUUSD</h1>
        </div>
        <button onClick={()=>{ setForm({date:new Date().toISOString().split("T")[0],time:new Date().toTimeString().slice(0,5),symbol:"XAUUSD",direction:"LONG",session:"Tokyo",avgEntry:0,avgExit:0,slPrice:0,tpPrice:0,totalLot:0,orderCount:1,totalPL:0,rr:0,result:"WIN",smcConcept:[],htfBias:"Bullish",entryModel:"",notes:""}); setImgFile(null); setImgPreview(""); setEditId(null); setRawOrders([]); setScanMsg(""); setView("add"); }}
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
              {label:"Win Rate",  value:`${stats.winRate.toFixed(1)}%`, color:stats.winRate>=50?"text-emerald-400":"text-red-400"},
              {label:"Total P/L", value:money(stats.totalPL), color:stats.totalPL>=0?"text-emerald-400":"text-red-400"},
              {label:"Sessions",  value:String(stats.total), color:"text-white"},
              {label:"Avg R:R",   value:`${stats.avgRR.toFixed(2)}R`, color:"text-purple-400"},
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
                <div><span className="text-zinc-500">Best: </span><span className="text-emerald-400 font-bold">{money(stats.bestTrade)}</span></div>
                <div><span className="text-zinc-500">Worst: </span><span className="text-red-400 font-bold">{money(stats.worstTrade)}</span></div>
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
                <div className="flex-1">
                  <p className="text-xs font-bold">{t.date} · {t.session}</p>
                  <p className="text-[10px] text-zinc-500">{t.orderCount} ออเดอร์ · Avg {t.avgEntry} → {t.avgExit}</p>
                </div>
                <span className={`font-black text-sm ${t.totalPL>=0?"text-emerald-400":"text-red-400"}`}>{money(t.totalPL)}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${t.result==="WIN"?"bg-emerald-400/10 text-emerald-400":t.result==="LOSS"?"bg-red-400/10 text-red-400":"bg-zinc-600 text-zinc-300"}`}>{t.result}</span>
              </div>
            ))}
            {!trades.length && <p className="text-center text-zinc-600 text-sm py-8">ยังไม่มี session</p>}
          </div>
        </div>
      )}

      {/* ── LIST ── */}
      {view==="list" && (
        <div className="px-4 py-5 max-w-3xl mx-auto space-y-3">
          <div className="flex gap-2">
            {(["ALL","WIN","LOSS","BE"] as const).map(r=>(
              <button key={r} onClick={()=>setFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterResult===r?r==="WIN"?"bg-emerald-500 text-black":r==="LOSS"?"bg-red-500 text-white":r==="BE"?"bg-zinc-500 text-white":"bg-yellow-400 text-black":"bg-zinc-800 text-zinc-400"}`}>
                {r}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-500 self-center">{filtered.length} sessions</span>
          </div>

          {filtered.map(t=>(
            <div key={t.id} className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800/50">
                <span className={`text-xs font-black px-2 py-0.5 rounded ${t.direction==="LONG"?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>{t.direction}</span>
                <span className="font-bold text-sm">{t.symbol}</span>
                <span className="text-xs text-zinc-500">{t.date} · {t.session}</span>
                <span className="flex-1"/>
                <span className={`font-black ${t.totalPL>=0?"text-emerald-400":"text-red-400"}`}>{money(t.totalPL)}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${t.result==="WIN"?"bg-emerald-400/10 text-emerald-400":t.result==="LOSS"?"bg-red-400/10 text-red-400":"bg-zinc-600 text-zinc-300"}`}>{t.result}</span>
                <button onClick={()=>editTrade(t)} className="text-xs text-yellow-400">แก้</button>
                <button onClick={()=>deleteTrade(t.id)} className="text-xs text-red-400">ลบ</button>
              </div>
              <div className="px-4 py-3 grid grid-cols-3 gap-3 text-xs">
                <div><span className="text-zinc-500">ออเดอร์: </span><span className="font-bold">{t.orderCount} รายการ</span></div>
                <div><span className="text-zinc-500">Lot รวม: </span><span className="font-bold">{t.totalLot.toFixed(2)}</span></div>
                <div><span className="text-zinc-500">R:R: </span><span className="text-purple-400 font-bold">{t.rr.toFixed(2)}R</span></div>
                <div><span className="text-zinc-500">Avg Entry: </span><span className="font-mono">{t.avgEntry}</span></div>
                <div><span className="text-zinc-500">Avg Exit: </span><span className="font-mono">{t.avgExit}</span></div>
                <div><span className="text-zinc-500">HTF: </span><span className={t.htfBias==="Bullish"?"text-emerald-400":t.htfBias==="Bearish"?"text-red-400":"text-zinc-400"}>{t.htfBias}</span></div>
              </div>
              {t.smcConcept.length>0 && (
                <div className="px-4 pb-2 flex flex-wrap gap-1">
                  {t.smcConcept.map(c=><span key={c} className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">{c}</span>)}
                </div>
              )}
              {t.entryModel && <p className="px-4 pb-1 text-xs text-yellow-400">Model: {t.entryModel}</p>}
              {t.notes && <p className="px-4 pb-3 text-xs text-zinc-500 italic">"{t.notes}"</p>}
              {t.imageUrl && <div className="px-4 pb-3"><img src={t.imageUrl} alt="broker" className="rounded-lg max-h-40 object-cover border border-zinc-700"/></div>}
            </div>
          ))}
          {!filtered.length && <p className="text-center text-zinc-600 py-12">ไม่มี session ที่ตรงกับ filter</p>}
        </div>
      )}

      {/* ── ADD / EDIT ── */}
      {view==="add" && (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={()=>{setView("dashboard");setEditId(null);}} className="text-zinc-500 text-sm">← ยกเลิก</button>
            <h2 className="text-sm font-bold">{editId?"แก้ไข Session":"บันทึก Session ใหม่"}</h2>
          </div>

          {/* ── Upload + OCR ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">📸 สแกน History จาก Broker</p>
            <p className="text-xs text-zinc-500">อัปโหลด screenshot หน้าบัญชี → OCR อ่านข้อมูลให้อัตโนมัติ ฟรี 100%</p>

            <div onClick={()=>fileRef.current?.click()}
              onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
              onDragOver={e=>e.preventDefault()}
              className="border-2 border-dashed border-zinc-700 hover:border-yellow-400/50 rounded-xl p-5 text-center cursor-pointer transition-colors">
              {imgPreview
                ? <img src={imgPreview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain"/>
                : <div><p className="text-3xl mb-2">📱</p><p className="text-sm text-zinc-400">วาง / คลิกเพื่ออัปโหลด</p><p className="text-xs text-zinc-600 mt-1">Screenshot หน้า "บัญชี" จาก App Broker</p></div>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);}}/>

            {imgFile && !scanning && (
              <button onClick={scanImage}
                className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl transition-colors">
                🔍 สแกนอ่านข้อมูล (ฟรี)
              </button>
            )}

            {scanning && (
              <div className="w-full py-3 bg-zinc-800 rounded-xl text-center">
                <span className="animate-spin inline-block mr-2">⟳</span>
                <span className="text-sm text-zinc-300">{scanMsg}</span>
              </div>
            )}

            {scanMsg && !scanning && (
              <div className={`p-3 rounded-xl text-sm text-center ${scanMsg.startsWith("✅")?"bg-emerald-500/10 text-emerald-400":scanMsg.startsWith("⚠")?"bg-yellow-500/10 text-yellow-400":"bg-red-500/10 text-red-400"}`}>
                {scanMsg}
              </div>
            )}

            {/* Raw orders preview */}
            {rawOrders.length > 0 && (
              <div className="bg-[#111113] rounded-xl p-3 space-y-1">
                <p className="text-xs text-zinc-500 mb-2">ออเดอร์ที่ตรวจพบ ({rawOrders.length} รายการ):</p>
                {rawOrders.map((o,i)=>(
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${o.direction==="LONG"?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>{o.direction}</span>
                    <span className="text-zinc-400">{o.lot} lot</span>
                    <span className="text-zinc-500">Entry {o.entryPrice} → Exit {o.exitPrice}</span>
                    <span className={`ml-auto font-bold ${o.pl>=0?"text-emerald-400":"text-red-400"}`}>{money(o.pl)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Meta ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">ข้อมูล Session</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">วันที่</label>
                <input type="date" value={form.date||""} onChange={e=>f("date",e.target.value)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"/>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">เวลา</label>
                <input type="time" value={form.time||""} onChange={e=>f("time",e.target.value)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"/>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Session</label>
                <select value={form.session||"Tokyo"} onChange={e=>f("session",e.target.value)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400">
                  {SESSIONS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Direction */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Direction</label>
              <div className="flex gap-2">
                {(["LONG","SHORT"] as Direction[]).map(d=>(
                  <button key={d} onClick={()=>f("direction",d)}
                    className={`flex-1 py-2 rounded-lg text-sm font-black transition-colors ${form.direction===d?d==="LONG"?"bg-emerald-500 text-black":"bg-red-500 text-white":"bg-zinc-800 text-zinc-400"}`}>
                    {d==="LONG"?"▲ LONG":"▼ SHORT"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Prices (auto-filled) ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">ราคา (คำนวณจาก OCR อัตโนมัติ)</p>
            <div className="grid grid-cols-2 gap-3">
              {[["avgEntry","Avg Entry (เฉลี่ย)"],["avgExit","Avg Exit (เฉลี่ย)"],["slPrice","Stop Loss"],["tpPrice","Take Profit"]].map(([k,l])=>(
                <div key={k}>
                  <label className="text-xs text-zinc-500 mb-1 block">{l}</label>
                  <input type="number" step="0.001" value={(form as any)[k]||""}
                    onChange={e=>f(k as any, parseFloat(e.target.value)||0)}
                    className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono"/>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">จำนวนออเดอร์</label>
                <input type="number" value={form.orderCount||""} onChange={e=>f("orderCount",parseInt(e.target.value)||1)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono"/>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Lot รวม</label>
                <input type="number" step="0.01" value={form.totalLot||""} onChange={e=>f("totalLot",parseFloat(e.target.value)||0)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono"/>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">R:R</label>
                <input type="number" step="0.1" value={form.rr||""} onChange={e=>f("rr",parseFloat(e.target.value)||0)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono text-purple-400"/>
              </div>
            </div>

            {/* P/L + Result */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">P/L รวม ($)</label>
                <input type="number" step="0.01" value={form.totalPL||""}
                  onChange={e=>f("totalPL",parseFloat(e.target.value)||0)}
                  className={`w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono font-black ${(form.totalPL||0)>=0?"text-emerald-400":"text-red-400"}`}/>
              </div>
              <div className="flex gap-2">
                {(["WIN","LOSS","BE"] as Result[]).map(r=>(
                  <button key={r} onClick={()=>f("result",r)}
                    className={`flex-1 py-2 rounded-lg text-xs font-black transition-colors ${form.result===r?r==="WIN"?"bg-emerald-500 text-black":r==="LOSS"?"bg-red-500 text-white":"bg-zinc-500 text-white":"bg-zinc-800 text-zinc-400"}`}>
                    {r==="WIN"?"✅":r==="LOSS"?"❌":"🟡"} {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── SMC ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">SMC Analysis</p>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">HTF Bias</label>
              <div className="flex gap-2">
                {(["Bullish","Bearish","Neutral"] as const).map(b=>(
                  <button key={b} onClick={()=>f("htfBias",b)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors border ${form.htfBias===b?b==="Bullish"?"bg-emerald-500/20 border-emerald-500 text-emerald-400":b==="Bearish"?"bg-red-500/20 border-red-500 text-red-400":"bg-zinc-500/20 border-zinc-500 text-zinc-300":"bg-zinc-800 border-zinc-700 text-zinc-500"}`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-2 block">SMC Concept</label>
              <div className="flex flex-wrap gap-2">
                {SMC_LIST.map(c=>{
                  const active=(form.smcConcept||[]).includes(c);
                  return <button key={c} onClick={()=>f("smcConcept",active?(form.smcConcept||[]).filter((x:string)=>x!==c):[...(form.smcConcept||[]),c])}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${active?"bg-purple-500/30 border border-purple-500 text-purple-300":"bg-zinc-800 border border-zinc-700 text-zinc-500 hover:border-zinc-500"}`}>{c}</button>;
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Entry Model</label>
              <input value={form.entryModel||""} onChange={e=>f("entryModel",e.target.value)}
                placeholder="เช่น W2, M2, BOS+OB, CHoCH+FVG"
                className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"/>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Notes</label>
              <textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)} rows={3}
                placeholder="บทเรียน, ข้อผิดพลาด, สิ่งที่ทำได้ดี..."
                className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"/>
            </div>
          </div>

          <button onClick={saveTrade}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-base rounded-xl transition-colors">
            {editId?"✓ อัปเดต Session":"✓ บันทึก Session"}
          </button>
        </div>
      )}
    </main>
  );
}
