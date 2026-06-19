"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction = "LONG" | "SHORT";
type Result    = "WIN" | "LOSS" | "BE";
type SMCConcept = "OB" | "FVG" | "BOS" | "CHoCH" | "Liquidity" | "MSB" | "W-Pattern" | "M-Pattern" | "Other";
type Session    = "Tokyo" | "London" | "New York" | "Overlap";

type Trade = {
  id: string;
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM
  symbol: string;
  direction: Direction;
  session: Session;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  exitPrice: number;
  lotSize: number;
  pl: number;             // USD
  rr: number;             // Risk:Reward achieved
  result: Result;
  smcConcept: SMCConcept[];
  htfBias: "Bullish" | "Bearish" | "Neutral";
  entryModel: string;     // e.g. "W2", "M2", "BOS+OB"
  notes: string;
  imageUrl?: string;      // base64 or URL
  createdAt: string;
};

type AnalyzedData = Partial<Omit<Trade, "id"|"createdAt">>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (v: number) => {
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);

const SMC_CONCEPTS: SMCConcept[] = ["OB","FVG","BOS","CHoCH","Liquidity","MSB","W-Pattern","M-Pattern","Other"];
const SESSIONS: Session[]         = ["Tokyo","London","New York","Overlap"];
const HTF_BIAS                    = ["Bullish","Bearish","Neutral"] as const;

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "yok_journal_v1";
const loadTrades  = (): Trade[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const saveTrades  = (trades: Trade[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));

// ─── Empty form ───────────────────────────────────────────────────────────────
const emptyForm = (): AnalyzedData => ({
  date: new Date().toISOString().split("T")[0],
  time: new Date().toTimeString().slice(0, 5),
  symbol: "XAUUSD",
  direction: "LONG",
  session: "Tokyo",
  entryPrice: 0,
  slPrice: 0,
  tpPrice: 0,
  exitPrice: 0,
  lotSize: 0.01,
  pl: 0,
  rr: 0,
  result: "WIN",
  smcConcept: [],
  htfBias: "Bullish",
  entryModel: "",
  notes: "",
});

// ─── Stats ────────────────────────────────────────────────────────────────────
function calcStats(trades: Trade[]) {
  if (!trades.length) return { total: 0, wins: 0, losses: 0, be: 0, winRate: 0, totalPL: 0, avgRR: 0, bestTrade: 0, worstTrade: 0, streak: 0 };
  const wins    = trades.filter(t => t.result === "WIN").length;
  const losses  = trades.filter(t => t.result === "LOSS").length;
  const be      = trades.filter(t => t.result === "BE").length;
  const totalPL = trades.reduce((s, t) => s + t.pl, 0);
  const avgRR   = trades.reduce((s, t) => s + (t.rr || 0), 0) / trades.length;
  const bestTrade  = Math.max(...trades.map(t => t.pl));
  const worstTrade = Math.min(...trades.map(t => t.pl));
  // current streak
  let streak = 0;
  const sorted = [...trades].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const first = sorted[0]?.result;
  for (const t of sorted) {
    if (t.result === first) streak++; else break;
  }
  return { total: trades.length, wins, losses, be, winRate: wins / trades.length * 100, totalPL, avgRR, bestTrade, worstTrade, streak: first === "WIN" ? streak : -streak };
}

// ─── Mini P/L chart ───────────────────────────────────────────────────────────
function PLChart({ trades }: { trades: Trade[] }) {
  if (trades.length < 2) return <p className="text-xs text-zinc-600 text-center py-4">ต้องการอย่างน้อย 2 trade</p>;
  const sorted = [...trades].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  let cum = 0;
  const points = sorted.map(t => { cum += t.pl; return cum; });
  const mn = Math.min(0, ...points), mx = Math.max(...points);
  const range = mx - mn || 1;
  const W = 300, H = 80;
  const pts = points.map((v,i) => `${(i/(points.length-1))*W},${H - ((v-mn)/range)*H}`).join(" ");
  const fill = points.map((v,i) => `${(i/(points.length-1))*W},${H - ((v-mn)/range)*H}`).join(" ");
  const isPos = points[points.length-1] >= 0;
  const color = isPos ? "#10b981" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="plgrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1="0" y1={H - ((0-mn)/range)*H} x2={W} y2={H - ((0-mn)/range)*H}
        stroke="#27272a" strokeWidth="1" strokeDasharray="4"/>
      <polygon points={`0,${H} ${fill} ${W},${H}`} fill="url(#plgrad)"/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [trades,   setTrades]   = useState<Trade[]>([]);
  const [view,     setView]     = useState<"dashboard"|"list"|"add">("dashboard");
  const [form,     setForm]     = useState<AnalyzedData>(emptyForm());
  const [imgFile,  setImgFile]  = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string>("");
  const [analyzing, setAnalyzing]   = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [filterResult, setFilterResult] = useState<"ALL"|Result>("ALL");
  const [editId, setEditId] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTrades(loadTrades()); }, []);

  const stats = calcStats(trades);

  // ── Image upload & analyze ─────────────────────────────────────────────────
  const handleFile = (file: File) => {
    setImgFile(file);
    const reader = new FileReader();
    reader.onload = e => setImgPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setAnalyzeError("");
  };

  const analyzeImage = async () => {
    if (!imgFile) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(imgFile);
      });

      const res = await fetch("/api/analyze-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: imgFile.type }),
      });

      if (!res.ok) throw new Error("API error");
      const data: AnalyzedData = await res.json();

      setForm(prev => ({ ...prev, ...data, imageUrl: imgPreview }));
    } catch (e) {
      setAnalyzeError("วิเคราะห์รูปไม่สำเร็จ กรุณากรอกข้อมูลเอง");
    }
    setAnalyzing(false);
  };

  // ── Save trade ─────────────────────────────────────────────────────────────
  const saveTrade = () => {
    const trade: Trade = {
      id: editId || uid(),
      createdAt: new Date().toISOString(),
      date:       form.date       || new Date().toISOString().split("T")[0],
      time:       form.time       || "00:00",
      symbol:     form.symbol     || "XAUUSD",
      direction:  form.direction  || "LONG",
      session:    form.session    || "Tokyo",
      entryPrice: Number(form.entryPrice) || 0,
      slPrice:    Number(form.slPrice)    || 0,
      tpPrice:    Number(form.tpPrice)    || 0,
      exitPrice:  Number(form.exitPrice)  || 0,
      lotSize:    Number(form.lotSize)    || 0.01,
      pl:         Number(form.pl)         || 0,
      rr:         Number(form.rr)         || 0,
      result:     form.result     || "WIN",
      smcConcept: form.smcConcept || [],
      htfBias:    form.htfBias    || "Bullish",
      entryModel: form.entryModel || "",
      notes:      form.notes      || "",
      imageUrl:   form.imageUrl   || imgPreview || undefined,
    };

    const updated = editId
      ? trades.map(t => t.id === editId ? trade : t)
      : [trade, ...trades];

    setTrades(updated);
    saveTrades(updated);
    setForm(emptyForm());
    setImgFile(null);
    setImgPreview("");
    setEditId(null);
    setView("list");
  };

  const deleteTrade = (id: string) => {
    if (!confirm("ลบ trade นี้?")) return;
    const updated = trades.filter(t => t.id !== id);
    setTrades(updated);
    saveTrades(updated);
  };

  const editTrade = (t: Trade) => {
    setForm(t);
    setImgPreview(t.imageUrl || "");
    setEditId(t.id);
    setView("add");
  };

  const filteredTrades = filterResult === "ALL"
    ? trades
    : trades.filter(t => t.result === filterResult);

  const f = (key: keyof AnalyzedData, val: any) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0d0d0f] text-white pb-20"
      style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0d0d0f]/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-zinc-500 hover:text-white text-sm">← หน้าแรก</Link>
          <span className="text-zinc-700">|</span>
          <h1 className="text-sm font-bold">📓 Trading Journal · XAUUSD</h1>
        </div>
        <button onClick={() => { setForm(emptyForm()); setImgFile(null); setImgPreview(""); setEditId(null); setView("add"); }}
          className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-black rounded-lg transition-colors">
          + บันทึก Trade
        </button>
      </header>

      {/* Nav tabs */}
      <div className="flex border-b border-zinc-800 bg-[#0a0a0c] px-4">
        {(["dashboard","list"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              view === v
                ? "text-yellow-400 border-yellow-400"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}>
            {v === "dashboard" ? "📊 Dashboard" : "📋 รายการ"}
          </button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="px-4 py-5 max-w-4xl mx-auto space-y-5">

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Win Rate",   value: `${stats.winRate.toFixed(1)}%`, color: stats.winRate >= 50 ? "text-emerald-400" : "text-red-400" },
              { label: "Total P/L",  value: money(stats.totalPL), color: stats.totalPL >= 0 ? "text-emerald-400" : "text-red-400" },
              { label: "Avg R:R",    value: `${stats.avgRR.toFixed(2)}R`, color: "text-purple-400" },
              { label: "Total Trade",value: String(stats.total), color: "text-white" },
            ].map(s => (
              <div key={s.label} className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* W/L/BE + Streak */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-3">Win / Loss / BE</p>
              <div className="flex gap-3 items-end mb-2">
                <div className="text-center">
                  <p className="text-2xl font-black text-emerald-400">{stats.wins}</p>
                  <p className="text-xs text-zinc-500">Win</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-red-400">{stats.losses}</p>
                  <p className="text-xs text-zinc-500">Loss</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-zinc-400">{stats.be}</p>
                  <p className="text-xs text-zinc-500">BE</p>
                </div>
              </div>
              {stats.total > 0 && (
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${stats.winRate}%` }}/>
                  <div className="h-full bg-zinc-600" style={{ width: `${stats.be/stats.total*100}%` }}/>
                  <div className="h-full bg-red-500 flex-1"/>
                </div>
              )}
            </div>

            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Current Streak</p>
              <p className={`text-3xl font-black ${stats.streak > 0 ? "text-emerald-400" : stats.streak < 0 ? "text-red-400" : "text-zinc-400"}`}>
                {stats.streak > 0 ? `🔥 ${stats.streak}W` : stats.streak < 0 ? `❄️ ${Math.abs(stats.streak)}L` : "-"}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-zinc-500">Best: </span><span className="text-emerald-400 font-bold">{money(stats.bestTrade)}</span></div>
                <div><span className="text-zinc-500">Worst: </span><span className="text-red-400 font-bold">{money(stats.worstTrade)}</span></div>
              </div>
            </div>
          </div>

          {/* P/L Equity Curve */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
            <p className="text-xs text-zinc-500 mb-3">Equity Curve (Cumulative P/L)</p>
            <PLChart trades={trades}/>
          </div>

          {/* Recent trades */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-bold">Trade ล่าสุด</p>
              <button onClick={() => setView("list")} className="text-xs text-yellow-400 hover:underline">ดูทั้งหมด →</button>
            </div>
            {trades.slice(0,5).map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/20">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.result==="WIN"?"bg-emerald-400":t.result==="LOSS"?"bg-red-400":"bg-zinc-400"}`}/>
                <span className={`text-xs font-black px-2 py-0.5 rounded ${t.direction==="LONG"?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>{t.direction}</span>
                <span className="text-sm font-bold">{t.symbol}</span>
                <span className="text-xs text-zinc-500">{t.date} {t.time}</span>
                <span className="text-xs text-zinc-600">{t.session}</span>
                <span className="flex-1"/>
                <span className={`text-sm font-black ${t.pl>=0?"text-emerald-400":"text-red-400"}`}>{money(t.pl)}</span>
                <span className="text-xs text-zinc-600">{t.rr.toFixed(1)}R</span>
              </div>
            ))}
            {trades.length === 0 && (
              <p className="text-center text-zinc-600 text-sm py-8">ยังไม่มี trade · กด "+ บันทึก Trade" เลยครับ</p>
            )}
          </div>
        </div>
      )}

      {/* ── LIST ── */}
      {view === "list" && (
        <div className="px-4 py-5 max-w-4xl mx-auto space-y-4">
          {/* Filter */}
          <div className="flex gap-2">
            {(["ALL","WIN","LOSS","BE"] as const).map(r => (
              <button key={r} onClick={() => setFilterResult(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  filterResult === r
                    ? r==="WIN" ? "bg-emerald-500 text-black"
                    : r==="LOSS" ? "bg-red-500 text-white"
                    : r==="BE" ? "bg-zinc-500 text-white"
                    : "bg-yellow-400 text-black"
                    : "bg-zinc-800 text-zinc-400"
                }`}>
                {r}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-500 self-center">{filteredTrades.length} trades</span>
          </div>

          {filteredTrades.map(t => (
            <div key={t.id} className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50">
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${t.direction==="LONG"?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>{t.direction}</span>
                <span className="font-black">{t.symbol}</span>
                <span className="text-xs text-zinc-500">{t.date} · {t.time} · {t.session}</span>
                <span className="flex-1"/>
                <span className={`text-sm font-black ${t.pl>=0?"text-emerald-400":"text-red-400"}`}>{money(t.pl)}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${t.result==="WIN"?"bg-emerald-400/10 text-emerald-400":t.result==="LOSS"?"bg-red-400/10 text-red-400":"bg-zinc-600 text-zinc-300"}`}>{t.result}</span>
                <button onClick={() => editTrade(t)} className="text-xs text-yellow-400 hover:underline">แก้</button>
                <button onClick={() => deleteTrade(t.id)} className="text-xs text-red-400 hover:underline">ลบ</button>
              </div>
              <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-zinc-500">Entry: </span><span className="font-mono">{t.entryPrice}</span></div>
                <div><span className="text-zinc-500">SL: </span><span className="font-mono text-red-400">{t.slPrice}</span></div>
                <div><span className="text-zinc-500">TP: </span><span className="font-mono text-emerald-400">{t.tpPrice}</span></div>
                <div><span className="text-zinc-500">Exit: </span><span className="font-mono">{t.exitPrice}</span></div>
                <div><span className="text-zinc-500">Lot: </span><span>{t.lotSize}</span></div>
                <div><span className="text-zinc-500">R:R: </span><span className="text-purple-400 font-bold">{t.rr.toFixed(2)}R</span></div>
                <div><span className="text-zinc-500">HTF: </span><span className={t.htfBias==="Bullish"?"text-emerald-400":t.htfBias==="Bearish"?"text-red-400":"text-zinc-400"}>{t.htfBias}</span></div>
                <div><span className="text-zinc-500">Model: </span><span className="text-yellow-400">{t.entryModel||"-"}</span></div>
              </div>
              {t.smcConcept.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-1">
                  {t.smcConcept.map(c => (
                    <span key={c} className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">{c}</span>
                  ))}
                </div>
              )}
              {t.notes && <p className="px-4 pb-3 text-xs text-zinc-500 italic">"{t.notes}"</p>}
              {t.imageUrl && (
                <div className="px-4 pb-3">
                  <img src={t.imageUrl} alt="trade" className="rounded-lg max-h-48 object-cover border border-zinc-700"/>
                </div>
              )}
            </div>
          ))}

          {filteredTrades.length === 0 && (
            <p className="text-center text-zinc-600 py-12">ไม่มี trade ที่ตรงกับ filter</p>
          )}
        </div>
      )}

      {/* ── ADD / EDIT FORM ── */}
      {view === "add" && (
        <div className="px-4 py-5 max-w-2xl mx-auto space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView("dashboard"); setEditId(null); }} className="text-zinc-500 hover:text-white text-sm">← ยกเลิก</button>
            <h2 className="text-sm font-bold">{editId ? "แก้ไข Trade" : "บันทึก Trade ใหม่"}</h2>
          </div>

          {/* ── Upload image ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">📸 อัปโหลดรูป → AI วิเคราะห์</p>

            <div
              onClick={() => fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) handleFile(f); }}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-zinc-700 hover:border-yellow-400/50 rounded-xl p-6 text-center cursor-pointer transition-colors">
              {imgPreview ? (
                <img src={imgPreview} alt="preview" className="max-h-48 mx-auto rounded-lg object-contain"/>
              ) : (
                <div>
                  <p className="text-3xl mb-2">📷</p>
                  <p className="text-sm text-zinc-400">วาง / คลิกเพื่ออัปโหลด</p>
                  <p className="text-xs text-zinc-600 mt-1">Chart screenshot หรือ Order history</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if(f) handleFile(f); }}/>

            {imgFile && (
              <button onClick={analyzeImage} disabled={analyzing}
                className="w-full py-3 bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2">
                {analyzing ? (
                  <><span className="animate-spin">⟳</span> กำลังวิเคราะห์...</>
                ) : (
                  <>✨ ให้ AI วิเคราะห์รูป</>
                )}
              </button>
            )}
            {analyzeError && <p className="text-red-400 text-sm text-center">{analyzeError}</p>}
          </div>

          {/* ── Form fields ── */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-4">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">ข้อมูล Trade</p>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Symbol</label>
                <input value={form.symbol||""} onChange={e=>f("symbol",e.target.value.toUpperCase())}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 uppercase"
                  placeholder="XAUUSD"/>
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
                    className={`flex-1 py-2 rounded-lg text-sm font-black transition-colors ${
                      form.direction===d
                        ? d==="LONG" ? "bg-emerald-500 text-black" : "bg-red-500 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}>{d==="LONG"?"▲ LONG":"▼ SHORT"}</button>
                ))}
              </div>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3">
              {[
                ["entryPrice","Entry Price",""],
                ["slPrice","Stop Loss 🔴",""],
                ["tpPrice","Take Profit 🟢",""],
                ["exitPrice","Exit Price",""],
              ].map(([key,label])=>(
                <div key={key}>
                  <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
                  <input type="number" step="0.01" value={(form as any)[key]||""}
                    onChange={e=>f(key as any, parseFloat(e.target.value)||0)}
                    className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono"/>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">Lot Size</label>
                <input type="number" step="0.01" value={form.lotSize||""}
                  onChange={e=>f("lotSize",parseFloat(e.target.value)||0)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono"/>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">P/L ($)</label>
                <input type="number" step="0.01" value={form.pl||""}
                  onChange={e=>f("pl",parseFloat(e.target.value)||0)}
                  className={`w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono ${(form.pl||0)>=0?"text-emerald-400":"text-red-400"}`}/>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1 block">R:R Achieved</label>
                <input type="number" step="0.1" value={form.rr||""}
                  onChange={e=>f("rr",parseFloat(e.target.value)||0)}
                  className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 font-mono text-purple-400"/>
              </div>
            </div>

            {/* Result */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Result</label>
              <div className="flex gap-2">
                {(["WIN","LOSS","BE"] as Result[]).map(r=>(
                  <button key={r} onClick={()=>f("result",r)}
                    className={`flex-1 py-2 rounded-lg text-sm font-black transition-colors ${
                      form.result===r
                        ? r==="WIN"?"bg-emerald-500 text-black":r==="LOSS"?"bg-red-500 text-white":"bg-zinc-500 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}>{r==="WIN"?"✅ WIN":r==="LOSS"?"❌ LOSS":"🟡 BE"}</button>
                ))}
              </div>
            </div>
          </div>

          {/* SMC Analysis */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 space-y-4">
            <p className="text-xs font-bold text-zinc-300 uppercase tracking-wider">SMC Analysis</p>

            <div>
              <label className="text-xs text-zinc-500 mb-2 block">HTF Bias</label>
              <div className="flex gap-2">
                {HTF_BIAS.map(b=>(
                  <button key={b} onClick={()=>f("htfBias",b)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      form.htfBias===b
                        ? b==="Bullish"?"bg-emerald-500/30 border border-emerald-500 text-emerald-400"
                        : b==="Bearish"?"bg-red-500/30 border border-red-500 text-red-400"
                        : "bg-zinc-700 border border-zinc-600 text-zinc-300"
                        : "bg-zinc-800 border border-zinc-700 text-zinc-500"
                    }`}>{b}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-500 mb-2 block">SMC Concept ที่ใช้</label>
              <div className="flex flex-wrap gap-2">
                {SMC_CONCEPTS.map(c=>{
                  const active = (form.smcConcept||[]).includes(c);
                  return (
                    <button key={c} onClick={()=>f("smcConcept", active?(form.smcConcept||[]).filter(x=>x!==c):[...(form.smcConcept||[]),c])}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                        active ? "bg-purple-500/30 border border-purple-500 text-purple-300" : "bg-zinc-800 border border-zinc-700 text-zinc-500 hover:border-zinc-500"
                      }`}>{c}</button>
                  );
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
              <label className="text-xs text-zinc-500 mb-1 block">Notes / บทเรียน</label>
              <textarea value={form.notes||""} onChange={e=>f("notes",e.target.value)}
                rows={3} placeholder="สิ่งที่เรียนรู้, ข้อผิดพลาด, จุดที่ดี..."
                className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"/>
            </div>
          </div>

          {/* Save button */}
          <button onClick={saveTrade}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-base rounded-xl transition-colors">
            {editId ? "✓ อัปเดต Trade" : "✓ บันทึก Trade"}
          </button>
        </div>
      )}
    </main>
  );
}
