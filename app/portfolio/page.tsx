"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type Position = {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  prevClose: number;
  targetAlloc: number; // % เป้าหมายที่ตั้งไว้
};

type TradeMode = "buy" | "sell";
type SortKey = "ticker" | "avgCost" | "value" | "pl" | "plPct" | "dailyPL" | "dailyPct" | "allocation" | "shares";
type SortDir = "asc" | "desc";
type PLMode = "total" | "daily"; // toggle กำไรรวม vs วันนี้

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INITIAL_PORTFOLIO: Position[] = [
  { ticker: "GOOGL", name: "อัลฟาเบท",              shares: 7.1646262,  avgCost: 240.83, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "AMZN",  name: "แอมะซอน",               shares: 10.5848651, avgCost: 222.19, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "ASML",  name: "อาเอสเอ็มแอล โฮลดิง",  shares: 1.120274,   avgCost: 750.37, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "MSFT",  name: "ไมโครซอฟท์",             shares: 4.5660891,  avgCost: 456.60, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "META",  name: "Meta",                   shares: 2.9587672,  avgCost: 627.48, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "NVDA",  name: "เอ็นวิเดีย",             shares: 7.9079846,  avgCost: 156.18, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "RBRK",  name: "Rubrik Inc",             shares: 22.4047329, avgCost: 62.39,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "ALAB",  name: "Astera Labs, Inc",       shares: 3.7271679,  avgCost: 133.28, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "NVO",   name: "โนโว นอร์ดิสค์",        shares: 34.6614128, avgCost: 48.19,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "NFLX",  name: "เน็ตฟลิกซ์",             shares: 17.7666769, avgCost: 101.18, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "AMD",   name: "เอเอ็มดี",               shares: 2.4819359,  avgCost: 199.32, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "SOFI",  name: "SoFi Technologies Inc",  shares: 63.2978785, avgCost: 19.84,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "PLTR",  name: "Palantir Technologies",  shares: 7.560984,   avgCost: 140.91, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "IONQ",  name: "IONQ Inc",               shares: 12.3795114, avgCost: 48.39,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "TSM",   name: "ทีเอสเอ็มซี",            shares: 1.3873869,  avgCost: 252.07, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "UBER",  name: "อูเบอร์",                shares: 8.1490212,  avgCost: 73.51,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "RKLB",  name: "Rocket Lab Corp",        shares: 5.4644484,  avgCost: 91.36,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "CRWD",  name: "คราวด์สไตรก์",           shares: 0.8078283,  avgCost: 371.37, currentPrice: 0, prevClose: 0, targetAlloc: 0 },
  { ticker: "TMDX",  name: "TransMedics Group Inc",  shares: 5.6205782,  avgCost: 98.46,  currentPrice: 0, prevClose: 0, targetAlloc: 0 },
];

const COLORS = [
  "#4f7df3","#69c36b","#f0aa4f","#d43d52","#9650e6",
  "#3b82f6","#5fc46b","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#10b981","#f97316","#ec4899","#14b8a6",
  "#a78bfa","#fb923c","#34d399","#f472b6","#60a5fa",
];

const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const pctFmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const [positions, setPositions]     = useState<Position[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("-");
  const autoRefreshed = useRef(false);

  // Cash
  const [cash, setCash] = useState<number>(0);
  const [showCashEdit, setShowCashEdit] = useState(false);
  const [cashInput, setCashInput] = useState("");



  // P/L column toggle
  const [plMode, setPlMode] = useState<PLMode>("total");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Modal
  const [modal, setModal]         = useState<{ type: "buy"|"sell"|"edit"; ticker: string }|null>(null);
  const [mode, setMode]           = useState<TradeMode>("buy");
  const [formTicker, setFormTicker]   = useState("");
  const [formShares, setFormShares]   = useState("");
  const [formPrice, setFormPrice]     = useState("");
  const [formName, setFormName]       = useState("");
  const [formAlloc, setFormAlloc]     = useState("");      // จำนวนหุ้นคำนวณจาก %
  const [formTarget, setFormTarget]   = useState("");      // % เป้าหมาย
  const [editingTicker, setEditingTicker] = useState<string|null>(null);
  const [formError, setFormError]     = useState("");

  // ── Load from Supabase ───────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load positions
      const { data: rows } = await supabase
        .from("portfolios")
        .select("*")
        .eq("user_id", user.id);

      if (rows && rows.length > 0) {
        setPositions(rows.map((r: any) => ({
          ticker: r.ticker, name: r.name || r.ticker,
          shares: Number(r.shares), avgCost: Number(r.avg_cost),
          currentPrice: Number(r.current_price)||0,
          prevClose: Number(r.prev_close)||0,
          targetAlloc: Number(r.target_alloc)||0,
        })));
      } else {
        // First time — load initial data and save to Supabase
        setPositions(INITIAL_PORTFOLIO);
        await savePositionsToSupabase(user.id, INITIAL_PORTFOLIO);
      }

      // Load cash
      const { data: settings } = await supabase
        .from("user_settings")
        .select("cash")
        .eq("user_id", user.id)
        .single();
      if (settings) setCash(Number(settings.cash)||0);
    };
    loadData();
  }, []);

  const savePositionsToSupabase = async (userId: string, pos: Position[]) => {
    // Upsert all positions
    const rows = pos.map(p => ({
      user_id: userId, ticker: p.ticker, name: p.name,
      shares: p.shares, avg_cost: p.avgCost,
      current_price: p.currentPrice, prev_close: p.prevClose,
      target_alloc: p.targetAlloc, updated_at: new Date().toISOString(),
    }));
    await supabase.from("portfolios").upsert(rows, { onConflict: "user_id,ticker" });
    // Also save to localStorage as backup
    localStorage.setItem("yok_portfolio_v4", JSON.stringify(pos));
  };

  const syncPositions = async (newPositions: Position[]) => {
    setPositions(newPositions);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await savePositionsToSupabase(user.id, newPositions);
    else localStorage.setItem("yok_portfolio_v4", JSON.stringify(newPositions));
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const getQuote = async (sym: string): Promise<{ c: number; pc: number }> => {
    const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!key) return { c: 0, pc: 0 };
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`);
      const d = await r.json();
      return { c: Number(d.c||0), pc: Number(d.pc||0) };
    } catch { return { c: 0, pc: 0 }; }
  };

  const refreshPrices = async () => {
    if (!positions.length) return;
    setIsRefreshing(true);
    const updated = await Promise.all(
      positions.map(async p => {
        const { c, pc } = await getQuote(p.ticker);
        return { ...p, currentPrice: c||p.currentPrice, prevClose: pc||p.prevClose };
      })
    );
    await syncPositions(updated);
    setLastUpdated(new Date().toLocaleTimeString("th-TH"));
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (positions.length > 0 && !autoRefreshed.current) {
      autoRefreshed.current = true;
      refreshPrices();
    }
  }, [positions.length]);

  // Auto-refresh ทุก 1 นาที (ปลอดภัยกับ Finnhub free tier)
  useEffect(() => {
    if (positions.length === 0) return;
    const id = setInterval(() => {
      refreshPrices();
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [positions.length]);



  const saveCash = async (val: number) => {
    setCash(val);
    localStorage.setItem("yok_cash_v1", String(val));
    setShowCashEdit(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_settings").upsert({
      user_id: user.id, cash: val, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalCost    = positions.reduce((s,p) => s + p.shares*p.avgCost, 0);
  const marketValue  = positions.reduce((s,p) => s + p.shares*(p.currentPrice||p.avgCost), 0);
  const totalPL      = marketValue - totalCost;
  const totalPLPct   = totalCost > 0 ? (totalPL/totalCost)*100 : 0;
  const totalDailyPL = positions.reduce((s,p) => {
    if (!p.prevClose||!p.currentPrice) return s;
    return s + p.shares*(p.currentPrice - p.prevClose);
  }, 0);
  const prevValue    = marketValue - totalDailyPL;
  const totalDailyPct = prevValue > 0 ? (totalDailyPL/prevValue)*100 : 0;
  const totalTargetAlloc = positions.reduce((s,p) => s + (p.targetAlloc||0), 0);
  const totalAssets   = marketValue + cash;
  const stockPct      = totalAssets > 0 ? (marketValue/totalAssets)*100 : 100;
  const cashPct       = totalAssets > 0 ? (cash/totalAssets)*100 : 0;

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a,b) => {
      const pa = a.currentPrice||a.avgCost, pb = b.currentPrice||b.avgCost;
      const va = a.shares*pa,  vb = b.shares*pb;
      const ca = a.shares*a.avgCost, cb = b.shares*b.avgCost;
      const plA = va-ca, plB = vb-cb;
      const plPctA = ca>0?(plA/ca)*100:0, plPctB = cb>0?(plB/cb)*100:0;
      const allocA = marketValue>0?(va/marketValue)*100:0;
      const allocB = marketValue>0?(vb/marketValue)*100:0;
      const dA = a.prevClose&&a.currentPrice ? a.shares*(a.currentPrice-a.prevClose) : 0;
      const dB = b.prevClose&&b.currentPrice ? b.shares*(b.currentPrice-b.prevClose) : 0;
      const dPctA = a.prevClose&&a.currentPrice ? ((a.currentPrice-a.prevClose)/a.prevClose)*100 : 0;
      const dPctB = b.prevClose&&b.currentPrice ? ((b.currentPrice-b.prevClose)/b.prevClose)*100 : 0;
      let cmp = 0;
      switch(sortKey){
        case "ticker":    cmp = a.ticker.localeCompare(b.ticker); break;
        case "avgCost":   cmp = a.avgCost-b.avgCost; break;
        case "value":     cmp = va-vb; break;
        case "pl":        cmp = plA-plB; break;
        case "plPct":     cmp = plPctA-plPctB; break;
        case "dailyPL":   cmp = dA-dB; break;
        case "dailyPct":  cmp = dPctA-dPctB; break;
        case "allocation":cmp = allocA-allocB; break;
        case "shares":    cmp = a.shares-b.shares; break;
      }
      return sortDir==="asc" ? cmp : -cmp;
    });
  }, [positions, sortKey, sortDir, marketValue]);

  // ── Donut ─────────────────────────────────────────────────────────────────────
  const donutSlices = useMemo(() => {
    if (marketValue<=0) return "#27272a 0% 100%";
    let start = 0;
    return sortedPositions.map((p,i) => {
      const val = p.shares*(p.currentPrice||p.avgCost);
      const pct = (val/marketValue)*100;
      const end = start+pct;
      const s = `${COLORS[i%COLORS.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end; return s;
    }).join(", ");
  }, [marketValue, sortedPositions]);

  // ── Modal helpers ──────────────────────────────────────────────────────────────
  const closeModal = () => {
    setModal(null); setEditingTicker(null);
    setFormTicker(""); setFormShares(""); setFormPrice(""); setFormName(""); setFormAlloc(""); setFormTarget(""); setFormError("");
  };
  const openBuy = (ticker: string) => {
    const p = positions.find(x=>x.ticker===ticker);
    setMode("buy"); setFormTicker(ticker); setFormShares(""); setFormPrice(p?String(p.currentPrice||p.avgCost):"");
    setFormName(p?.name||""); setFormAlloc(""); setFormTarget(""); setEditingTicker(null); setFormError("");
    setModal({ type:"buy", ticker });
  };
  const openSell = (ticker: string) => {
    const p = positions.find(x=>x.ticker===ticker);
    setMode("sell"); setFormTicker(ticker); setFormShares(""); setFormPrice(p?String(p.currentPrice||p.avgCost):"");
    setFormName(p?.name||""); setFormAlloc(""); setFormTarget(""); setEditingTicker(null); setFormError("");
    setModal({ type:"sell", ticker });
  };
  const openEdit = (ticker: string) => {
    const p = positions.find(x=>x.ticker===ticker);
    if (!p) return;
    setMode("buy"); setFormTicker(p.ticker); setFormShares(String(p.shares)); setFormPrice(String(p.avgCost));
    setFormName(p.name); setFormTarget(String(p.targetAlloc||""));
    const price = p.currentPrice||p.avgCost;
    setFormAlloc(marketValue>0 ? ((p.shares*price/marketValue)*100).toFixed(2) : "");
    setEditingTicker(ticker); setFormError("");
    setModal({ type:"edit", ticker });
  };

  const handleAllocChange = (val: string) => {
    setFormAlloc(val);
    const pct = parseFloat(val);
    const p = positions.find(x=>x.ticker===formTicker);
    const price = p?(p.currentPrice||p.avgCost):parseFloat(formPrice);
    if (!isNaN(pct)&&pct>0&&pct<=100&&price>0&&marketValue>0)
      setFormShares(((pct/100)*marketValue/price).toFixed(6));
  };
  const handleSharesChange = (val: string) => {
    setFormShares(val);
    const qty = parseFloat(val);
    const p = positions.find(x=>x.ticker===formTicker);
    const price = p?(p.currentPrice||p.avgCost):parseFloat(formPrice);
    if (!isNaN(qty)&&qty>0&&price>0&&marketValue>0)
      setFormAlloc((qty*price/marketValue*100).toFixed(2));
  };

  const saveTrade = () => {
    setFormError("");
    const sym = formTicker.toUpperCase().trim();
    const qty = parseFloat(formShares);
    const tradePrice = parseFloat(formPrice);
    const target = parseFloat(formTarget)||0;
    if (!sym) { setFormError("กรุณาใส่ Ticker"); return; }
    if (isNaN(qty)||qty<=0) { setFormError("จำนวนหุ้นต้องมากกว่า 0"); return; }
    if (isNaN(tradePrice)||tradePrice<=0) { setFormError("ราคาต้องมากกว่า 0"); return; }

    if (editingTicker) {
      syncPositions(positions.map(p =>
        p.ticker===editingTicker ? { ...p, ticker:sym, name:formName||p.name, shares:qty, avgCost:tradePrice, targetAlloc:target } : p
      ));
      closeModal(); return;
    }
    if (mode==="buy") {
      const ex = positions.find(p=>p.ticker===sym);
      if (!ex) {
        syncPositions([...positions, { ticker:sym, name:formName||sym, shares:qty, avgCost:tradePrice, currentPrice:tradePrice, prevClose:0, targetAlloc:target }]);
      } else {
        syncPositions(positions.map(p => {
          if (p.ticker!==sym) return p;
          const ns = p.shares+qty;
          return { ...p, shares:ns, avgCost:(p.shares*p.avgCost+qty*tradePrice)/ns };
        }));
      }
    }
    if (mode==="sell") {
      const ex = positions.find(p=>p.ticker===sym);
      if (!ex) { setFormError("ไม่พบหุ้นนี้"); return; }
      if (qty>ex.shares) { setFormError(`มีหุ้นแค่ ${ex.shares.toFixed(4)}`); return; }
      const rem = ex.shares-qty;
      if (rem<=0.00001) { syncPositions(positions.filter(p=>p.ticker!==sym)); return; }
      else syncPositions(positions.map(p=>p.ticker===sym?{...p,shares:rem}:p));
    }
    closeModal();
  };

  const deletePosition = async (ticker: string) => {
    if (!confirm(`ลบ ${ticker} ออกจากพอร์ต?`)) return;
    const newPositions = positions.filter(p => p.ticker !== ticker);
    setPositions(newPositions);
    localStorage.setItem("yok_portfolio_v4", JSON.stringify(newPositions));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("portfolios")
        .delete()
        .eq("user_id", user.id)
        .eq("ticker", ticker);
    }
  };

  // ── Sort header component ──────────────────────────────────────────────────────
  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-0.5 opacity-40 text-[10px]">
      {sortKey===k ? (sortDir==="asc"?"↑":"↓") : "↕"}
    </span>
  );
  const Th = ({ k, label, className="" }: { k:SortKey; label:string; className?:string }) => (
    <th className={`px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap ${className}`}
      onClick={()=>handleSort(k)}>
      {label}<SortIcon k={k}/>
    </th>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <style>{`
  @keyframes fadeInUp {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes countUp {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .fade-up   { animation: fadeInUp 0.45s ease both; }
  .fade-up-1 { animation: fadeInUp 0.45s 0.08s ease both; }
  .fade-up-2 { animation: fadeInUp 0.45s 0.16s ease both; }
  .fade-up-3 { animation: fadeInUp 0.45s 0.24s ease both; }
  .count-up  { animation: countUp 0.4s ease both; }
  .glow-card { transition: all 0.2s; }
  .glow-card:hover { box-shadow: 0 0 20px #ffffff08, 0 0 1px #ffffff18; transform: translateY(-1px); }
  .glow-green:hover { box-shadow: 0 0 20px #10b98122; }
  .glow-red:hover   { box-shadow: 0 0 20px #ef444422; }
  .ripple { position:relative; overflow:hidden; }
  .ripple:after { content:''; position:absolute; inset:0; background:radial-gradient(circle,#ffffff18 0%,transparent 70%); opacity:0; transition:opacity 0.25s; }
  .ripple:active:after { opacity:1; }
  .row-hover { transition: background 0.15s; }
  .row-hover:hover { background: rgba(255,255,255,0.03); }
`}</style>
<main className="min-h-screen bg-[#0d0d0f] text-white font-sans">

      {/* ── Top bar ── */}
      <div className="border-b border-zinc-800 px-3 py-2.5 flex items-center justify-between bg-[#0d0d0f]/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-zinc-500 hover:text-white text-xs transition-colors">← หน้าแรก</Link>
          <span className="text-zinc-700 hidden sm:block">|</span>
          <h1 className="text-xs font-bold tracking-tight hidden sm:block">TRUSH YOUR OWN · พอร์ต</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 hidden sm:block">อัปเดต: {lastUpdated}</span>
          <button onClick={refreshPrices} disabled={isRefreshing}
            className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
            <span className={isRefreshing?"animate-spin":""}>{isRefreshing?"⟳":"⟳"}</span>
            <span className="hidden sm:block">{isRefreshing?"กำลังโหลด...":"อัปเดตราคา"}</span>
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
            <span className="hidden sm:block">ออกจากระบบ</span>
            <span className="sm:hidden">ออก</span>
          </button>
        </div>
      </div>

      <div className="px-6 py-4 max-w-screen-2xl mx-auto space-y-4">

        {/* ── Stats + Donut row ── */}
        <div className="grid lg:grid-cols-[1fr_260px] gap-4">

          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up">
            {/* มูลค่าหุ้น */}
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-500 mb-1">มูลค่าหุ้น</p>
              <p className="text-lg font-bold text-white">{money(marketValue)}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{stockPct.toFixed(1)}% ของทั้งหมด</p>
            </div>

            {/* เงินสด — กดเพื่อแก้ไข */}
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-500 mb-1">เงินสด 💵</p>
              {showCashEdit ? (
                <div className="flex gap-1">
                  <input
                    type="number" step="100" autoFocus
                    value={cashInput}
                    onChange={e => setCashInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveCash(parseFloat(cashInput) || 0); }}
                    placeholder="0"
                    className="flex-1 min-w-0 bg-[#111113] border border-zinc-600 rounded px-2 py-1 text-xs outline-none focus:border-yellow-400 font-mono"
                  />
                  <button onClick={() => saveCash(parseFloat(cashInput) || 0)}
                    className="text-[10px] bg-yellow-400 text-black px-2 rounded font-black">✓</button>
                  <button onClick={() => setShowCashEdit(false)}
                    className="text-[10px] text-zinc-500 px-1">✕</button>
                </div>
              ) : (
                <button onClick={() => { setCashInput(String(cash)); setShowCashEdit(true); }}
                  className="text-left w-full group">
                  <p className="text-lg font-bold text-emerald-400 group-hover:text-emerald-300">{money(cash)}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{cashPct.toFixed(1)}% · กดแก้ไข</p>
                </button>
              )}
            </div>

            {/* กำไร/ขาดทุนรวม */}
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-500 mb-1">กำไร/ขาดทุนรวม</p>
              <p className={`text-lg font-bold ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(totalPL)}</p>
              <p className={`text-xs mt-0.5 opacity-80 ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pctFmt(totalPLPct)}</p>
            </div>

            {/* วันนี้ */}
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3">
              <p className="text-xs text-zinc-500 mb-1">วันนี้</p>
              <p className={`text-lg font-bold ${totalDailyPL >= 0 ? "text-sky-400" : "text-orange-400"}`}>
                {totalDailyPL >= 0 ? "+" : ""}{money(totalDailyPL)}
              </p>
              <p className={`text-xs mt-0.5 opacity-80 ${totalDailyPL >= 0 ? "text-sky-400" : "text-orange-400"}`}>{pctFmt(totalDailyPct)}</p>
            </div>
          </div>

          {/* Asset allocation bar — แสดงเมื่อมีเงินสด */}
          {cash > 0 && (
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">สินทรัพย์รวม {money(totalAssets)}</span>
                <div className="flex gap-3 text-xs">
                  <span className="text-blue-400">■ หุ้น {stockPct.toFixed(1)}%</span>
                  <span className="text-emerald-400">■ เงินสด {cashPct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden flex">
                <div className="h-full bg-blue-500 rounded-l-full transition-all" style={{ width: `${stockPct}%` }} />
                <div className="h-full bg-emerald-500 rounded-r-full transition-all" style={{ width: `${cashPct}%` }} />
              </div>
            </div>
          )}

                    {/* Donut (compact, right side) */}  {/* fade-up-1 */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
            <div className="relative w-24 h-24 flex-shrink-0">
              <div className="w-24 h-24 rounded-full"
                style={{ background: `conic-gradient(${donutSlices})` }} />
              <div className="absolute inset-2.5 bg-[#18181b] rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-zinc-400">{positions.length}x</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 overflow-hidden max-h-24">
              {sortedPositions.slice(0,10).map((p,i) => (
                <span key={p.ticker} className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COLORS[i%COLORS.length] }}/>
                  {p.ticker}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden fade-up-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#111113]">
                <tr>
                  <Th k="ticker"    label="หุ้น" />
                  <Th k="shares"    label="จำนวน" />
                  <Th k="avgCost"   label="ต้นทุนเฉลี่ย" />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">ราคา</th>
                  <Th k="value"     label="มูลค่า" />

                  {/* P/L column header — toggle total / daily */}
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setPlMode("total"); if(sortKey==="dailyPL"||sortKey==="dailyPct") { setSortKey("pl"); } }}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${plMode==="total" ? "bg-emerald-400/20 text-emerald-400" : "text-zinc-600 hover:text-zinc-400"}`}>
                        รวม
                      </button>
                      <span className="text-zinc-700 text-xs">|</span>
                      <button
                        onClick={() => { setPlMode("daily"); if(sortKey==="pl"||sortKey==="plPct") { setSortKey("dailyPL"); } }}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${plMode==="daily" ? "bg-sky-400/20 text-sky-400" : "text-zinc-600 hover:text-zinc-400"}`}>
                        วันนี้
                      </button>
                      {plMode==="total"
                        ? <SortIcon k="pl"/>
                        : <SortIcon k="dailyPL"/>}
                    </div>
                    {/* sub sort by % */}
                    <div className="flex items-center gap-1 mt-0.5">
                      {plMode==="total"
                        ? <button onClick={()=>handleSort("plPct")} className="text-[10px] text-zinc-600 hover:text-zinc-400">เรียงตาม %<SortIcon k="plPct"/></button>
                        : <button onClick={()=>handleSort("dailyPct")} className="text-[10px] text-zinc-600 hover:text-zinc-400">เรียงตาม %<SortIcon k="dailyPct"/></button>
                      }
                    </div>
                  </th>

                  {/* Allocation column */}
                  <Th k="allocation" label="สัดส่วน" />
                  <th className="px-3 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((p, idx) => {
                  const price    = p.currentPrice || p.avgCost;
                  const val      = p.shares * price;
                  const cost     = p.shares * p.avgCost;
                  const pl       = val - cost;
                  const plPct    = cost > 0 ? (pl/cost)*100 : 0;
                  const allocNow = marketValue > 0 ? (val/marketValue)*100 : 0;
                  const targetPct = p.targetAlloc || 0;
                  const dailyPL  = p.prevClose&&p.currentPrice ? p.shares*(p.currentPrice-p.prevClose) : null;
                  const dailyPct = p.prevClose&&p.currentPrice ? ((p.currentPrice-p.prevClose)/p.prevClose)*100 : null;
                  const isPos    = pl >= 0;
                  const isDailyPos = dailyPL !== null ? dailyPL >= 0 : null;
                  // Alloc diff: positive = ถือเกินเป้า, negative = ถือน้อยกว่าเป้า
                  const allocDiff = targetPct > 0 ? allocNow - targetPct : null;

                  return (
                    <tr key={p.ticker} className="row-hover border-t border-zinc-800 transition-colors">

                      {/* หุ้น */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[idx%COLORS.length] }}/>
                          <div>
                            <p className="font-bold text-sm">{p.ticker}</p>
                            <p className="text-xs text-zinc-500 truncate max-w-[100px]">{p.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* จำนวน */}
                      <td className="px-3 py-3 text-sm text-yellow-300 font-mono hidden md:table-cell">{p.shares.toFixed(4)}</td>

                      {/* ต้นทุนเฉลี่ย */}
                      <td className="px-3 py-3 text-sm font-medium hidden sm:table-cell">{money(p.avgCost)}</td>

                      {/* ราคาปัจจุบัน */}
                      <td className="px-3 py-3 text-sm text-zinc-300 hidden sm:table-cell">{money(price)}</td>

                      {/* มูลค่า */}
                      <td className="px-3 py-3 text-sm font-bold">{money(val)}</td>

                      {/* กำไร/ขาดทุน — toggle total / daily */}
                      <td className="px-3 py-3 min-w-[140px]">
                        {plMode === "total" ? (
                          <>
                            <p className={`text-sm font-bold count-up ${isPos?"text-emerald-400 glow-green":"text-red-400 glow-red"}`}>
                              {isPos?"+":""}{money(pl)}
                            </p>
                            <p className={`text-xs ${isPos?"text-emerald-400":"text-red-400"}`}>
                              {isPos?"▲":"▼"} {Math.abs(plPct).toFixed(2)}%
                            </p>
                          </>
                        ) : (
                          <>
                            {dailyPL !== null ? (
                              <>
                                <p className={`text-sm font-bold ${isDailyPos?"text-sky-400":"text-orange-400"}`}>
                                  {isDailyPos?"+":""}{money(dailyPL)}
                                </p>
                                <p className={`text-xs ${isDailyPos?"text-sky-400":"text-orange-400"}`}>
                                  {isDailyPos?"▲":"▼"} {Math.abs(dailyPct!).toFixed(2)}%
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-zinc-600">— ไม่มีข้อมูล</p>
                            )}
                          </>
                        )}
                      </td>

                      {/* สัดส่วน: เป้าหมาย vs ปัจจุบัน */}
                      <td className="px-3 py-3 min-w-[130px]">
                        {/* ปัจจุบัน */}
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-zinc-600">ปัจจุบัน</span>
                          <span className="text-xs font-bold text-zinc-300">{allocNow.toFixed(1)}%</span>
                        </div>
                        {/* bar ปัจจุบัน */}
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                          <div className="h-full rounded-full transition-all"
                            style={{ width:`${Math.min(allocNow,100)}%`, background: COLORS[idx%COLORS.length] }}/>
                        </div>
                        {/* เป้าหมาย */}
                        {targetPct > 0 ? (
                          <>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-zinc-600">เป้าหมาย</span>
                              <span className="text-[10px] font-bold text-purple-400">{targetPct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1">
                              <div className="h-full rounded-full bg-purple-500/50"
                                style={{ width:`${Math.min(targetPct,100)}%` }}/>
                            </div>
                            {/* diff badge */}
                            {allocDiff !== null && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                Math.abs(allocDiff) < 0.5 ? "bg-zinc-700 text-zinc-400" :
                                allocDiff > 0 ? "bg-orange-400/10 text-orange-400" : "bg-blue-400/10 text-blue-400"
                              }`}>
                                {allocDiff > 0 ? "▲ เกิน" : "▼ ขาด"} {Math.abs(allocDiff).toFixed(1)}%
                              </span>
                            )}
                          </>
                        ) : (
                          <p className="text-[10px] text-zinc-700">ยังไม่ตั้งเป้า</p>
                        )}
                      </td>

                      {/* จัดการ */}
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={()=>openBuy(p.ticker)}
                            className="ripple px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded font-medium transition-colors">ซื้อ</button>
                          <button onClick={()=>openSell(p.ticker)}
                            className="ripple px-2 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded font-medium transition-colors">ขาย</button>
                          <button onClick={()=>openEdit(p.ticker)}
                            className="ripple px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded font-medium transition-colors">แก้</button>
                          <button onClick={()=>deletePosition(p.ticker)}
                            className="px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded font-medium transition-colors">ลบ</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add new row */}
          <div className="border-t border-zinc-800 p-4">
            <button onClick={()=>{ setMode("buy"); setFormTicker(""); setFormShares(""); setFormPrice(""); setFormName(""); setFormAlloc(""); setFormTarget(""); setEditingTicker(null); setFormError(""); setModal({type:"buy",ticker:""}); }}
              className="w-full py-2.5 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 rounded-lg text-sm transition-colors">
              + เพิ่มหุ้นใหม่
            </button>
          </div>
        </div>

      </div>

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#18181b] border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editingTicker ? `แก้ไข ${editingTicker}` : mode==="buy" ? "ซื้อหุ้น" : "ขายหุ้น"}
              </h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white text-xl">✕</button>
            </div>

            {!editingTicker && (
              <div className="flex gap-2 mb-4">
                <button onClick={()=>setMode("buy")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode==="buy"?"bg-emerald-500 text-black":"bg-zinc-800 text-zinc-400"}`}>ซื้อ</button>
                <button onClick={()=>setMode("sell")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode==="sell"?"bg-blue-500 text-white":"bg-zinc-800 text-zinc-400"}`}>ขาย</button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Ticker</label>
                <input className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none uppercase"
                  placeholder="เช่น NVDA, GOOGL" value={formTicker}
                  readOnly={!!editingTicker||modal.ticker!==""}
                  onChange={e=>setFormTicker(e.target.value.toUpperCase())}/>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">ชื่อบริษัท</label>
                <input className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                  placeholder="เช่น เอ็นวิเดีย" value={formName} onChange={e=>setFormName(e.target.value)}/>
              </div>

              {/* สัดส่วนเป้าหมาย — ทุก mode */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">สัดส่วนเป้าหมาย (%)</label>
                <div className="flex gap-2 items-center">
                  <input className="flex-1 bg-[#111113] border border-zinc-700 focus:border-purple-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น 10 หรือ 20" type="number" step="0.1" min="0" max="100"
                    value={formTarget} onChange={e=>setFormTarget(e.target.value)}/>
                  <span className="text-zinc-400 font-bold">%</span>
                </div>
                {formTarget && !isNaN(parseFloat(formTarget)) && marketValue > 0 && (
                  <p className="text-xs text-purple-400 mt-1">
                    = {money((parseFloat(formTarget)/100)*marketValue)} จากพอร์ต {money(marketValue)}
                  </p>
                )}
              </div>

              {/* คำนวณจาก % alloc → shares (edit only) */}
              {editingTicker && (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">ปรับจำนวนหุ้นตาม % ปัจจุบัน (ไม่บังคับ)</label>
                  <div className="flex gap-2 items-center">
                    <input className="flex-1 bg-[#111113] border border-zinc-700 focus:border-sky-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                      placeholder="% ปัจจุบัน" type="number" step="0.01" min="0" max="100"
                      value={formAlloc} onChange={e=>handleAllocChange(e.target.value)}/>
                    <span className="text-zinc-400 font-bold">%</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">
                  {editingTicker ? "จำนวนหุ้น" : "จำนวนหุ้น"}
                </label>
                <input className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                  placeholder="เช่น 5.5" type="number" step="any"
                  value={formShares} onChange={e=>handleSharesChange(e.target.value)}/>
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">
                  {editingTicker ? "ราคาเฉลี่ย (Avg Cost)" : "ราคาที่ซื้อ/ขาย ($)"}
                </label>
                <input className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                  placeholder="เช่น 199.32" type="number" step="any"
                  value={formPrice} onChange={e=>setFormPrice(e.target.value)}/>
              </div>

              {formError && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>}

              <button onClick={saveTrade}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-colors mt-1 ${
                  editingTicker ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                  : mode==="buy" ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                  : "bg-blue-500 hover:bg-blue-400 text-white"
                }`}>
                {editingTicker ? "✓ บันทึกการแก้ไข" : mode==="buy" ? "✓ บันทึกการซื้อ" : "✓ บันทึกการขาย"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
