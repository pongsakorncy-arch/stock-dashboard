"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import CurrencyToggle from "@/components/CurrencyToggle";
import { useCurrency } from "@/hooks/useCurrency";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  "#4f7df3","#69c36b","#f0aa4f","#d43d52","#9650e6",
  "#3b82f6","#5fc46b","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#10b981","#f97316","#ec4899","#14b8a6",
  "#a78bfa","#fb923c","#34d399","#f472b6","#60a5fa",
];

function money(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function pct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }

// ─── Types ────────────────────────────────────────────────────────────────────
type Position = {
  ticker: string; name: string; shares: number;
  avgCost: number; currentPrice: number; prevClose: number;
  targetAlloc: number; extPrice: number; extPct: number; extType: "pre"|"after"|"none";
};
type SortKey = "ticker"|"avgCost"|"value"|"pl"|"plPct"|"dailyPL"|"dailyPct"|"allocation"|"shares";
type SortDir = "asc"|"desc";
type PLMode = "total"|"daily";
type AccountType = "cent"|"standard";

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INITIAL: Position[] = [
  { ticker:"GOOGL", name:"อัลฟาเบท",      shares:7.1646262,  avgCost:240.83, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"AMZN",  name:"แอมะซอน",       shares:10.5848651, avgCost:222.19, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"ASML",  name:"อาเอสเอ็มแอล",  shares:1.120274,   avgCost:750.37, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"MSFT",  name:"ไมโครซอฟท์",    shares:4.5660891,  avgCost:456.60, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"META",  name:"Meta",           shares:2.9587672,  avgCost:627.48, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"NVDA",  name:"เอ็นวิเดีย",    shares:7.9079846,  avgCost:156.18, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"RBRK",  name:"Rubrik Inc",     shares:22.4047329, avgCost:62.39,  currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"ALAB",  name:"Astera Labs",    shares:3.7271679,  avgCost:133.28, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"NVO",   name:"โนโว นอร์ดิสค์",shares:34.6614128, avgCost:48.19,  currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"NFLX",  name:"เน็ตฟลิกซ์",    shares:17.7666769, avgCost:101.18, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"AMD",   name:"เอเอ็มดี",       shares:2.4819359,  avgCost:199.32, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"SOFI",  name:"SoFi Technologies",shares:63.2978785,avgCost:19.84, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"PLTR",  name:"Palantir",       shares:7.560984,   avgCost:140.91, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"IONQ",  name:"IONQ Inc",       shares:12.3795114, avgCost:48.39,  currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"TSM",   name:"ทีเอสเอ็มซี",   shares:1.3873869,  avgCost:252.07, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"UBER",  name:"อูเบอร์",        shares:8.1490212,  avgCost:73.51,  currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"RKLB",  name:"Rocket Lab",     shares:5.4644484,  avgCost:91.36,  currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"CRWD",  name:"คราวด์สไตรก์",  shares:0.8078283,  avgCost:371.37, currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
  { ticker:"TMDX",  name:"TransMedics",    shares:5.6205782,  avgCost:98.46,  currentPrice:0, prevClose:0, targetAlloc:0, extPrice:0, extPct:0, extType:"none" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PortfolioClient() {
  const [positions, setPositions]       = useState<Position[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated]   = useState("-");
  const autoRefreshed                   = useRef(false);
  const [cash, setCash]                 = useState(0);
  const [showCashEdit, setShowCashEdit] = useState(false);
  const [cashInput, setCashInput]       = useState("");
  const [plMode, setPlMode]             = useState<PLMode>("total");
  const [sortKey, setSortKey]           = useState<SortKey>("value");
  const [sortDir, setSortDir]           = useState<SortDir>("desc");
  const [modal, setModal]               = useState<{type:"buy"|"sell"|"edit";ticker:string}|null>(null);
  const [modalTab, setModalTab]         = useState<"trade"|"dca"|"sr"|"history">("trade");
  const [mode, setMode]                 = useState<"buy"|"sell">("buy");
  const [formTicker, setFormTicker]     = useState("");
  const [formShares, setFormShares]     = useState("");
  const [formPrice, setFormPrice]       = useState("");
  const [formName, setFormName]         = useState("");
  const [formTarget, setFormTarget]     = useState("");
  const [formAlloc, setFormAlloc]       = useState("");
  const [editingTicker, setEditingTicker] = useState<string|null>(null);
  const [formError, setFormError]       = useState("");
  const [toast, setToast]               = useState<{msg:string;type:"success"|"error"}|null>(null);
  const [dcaAmount, setDcaAmount]       = useState("");
  const [dcaPrice, setDcaPrice]         = useState("");
  const [dcaMode, setDcaMode]           = useState<"amount"|"shares">("amount");
  const [srInvest, setSrInvest]         = useState("");
  const [srS, setSrS]                   = useState(["","",""]);
  const [srR, setSrR]                   = useState(["","",""]);
  const [hoveredIdx, setHoveredIdx]     = useState<number|null>(null);
  const [isTrading, setIsTrading]       = useState(false);
  const tradeTimeoutRef                 = useRef<NodeJS.Timeout|null>(null);

  const { currency, rate, lastUpdate: rateUpdate, toggleCurrency, format: fmtMoney } = useCurrency();

  const showToast = (msg: string, type: "success"|"error" = "success") => {
    setToast({msg,type});
    setTimeout(() => setToast(null), 2500);
  };

  // ── Load from Supabase ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("portfolios").select("*").eq("user_id", user.id);
      if (data && data.length > 0) {
        setPositions(data.map((r: any) => ({
          ticker: r.ticker, name: r.name || r.ticker,
          shares: Number(r.shares), avgCost: Number(r.avg_cost),
          currentPrice: Number(r.current_price)||0, prevClose: Number(r.prev_close)||0,
          targetAlloc: Number(r.target_alloc)||0,
          extPrice: 0, extPct: 0, extType: "none" as const,
        })));
      } else {
        setPositions([]);
      }
      const { data: s } = await supabase.from("user_settings").select("cash").eq("user_id", user.id).single();
      if (s) setCash(Number(s.cash)||0);
      // Load trade history
      const { data: trades } = await supabase.from("portfolio_trades").select("*").eq("user_id", user.id).order("created_at", {ascending: false});
      if (trades) setTradeHistory(trades);
    };
    load();
  }, []);

  const saveToSupabase = async (userId: string, pos: Position[]) => {
    const rows = pos.map(p => ({
      user_id: userId, ticker: p.ticker, name: p.name,
      shares: p.shares, avg_cost: p.avgCost,
      current_price: p.currentPrice, prev_close: p.prevClose,
      target_alloc: p.targetAlloc, updated_at: new Date().toISOString(),
    }));
    await supabase.from("portfolios").upsert(rows, { onConflict: "user_id,ticker" });
    localStorage.setItem("yok_portfolio_v4", JSON.stringify(pos));
  };

  const recordTrade = async (ticker: string, type: "buy"|"sell", shares: number, price: number, costBefore: number, costAfter: number, pl: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("portfolio_trades").insert({
      user_id: user.id, ticker, type, shares, price,
      amount: shares * price,
      avg_cost_before: costBefore,
      avg_cost_after: costAfter,
      pl,
      created_at: new Date().toISOString(),
    });
  };

const syncPositions = async (newPos: Position[]) => {
    console.log("syncPositions called, positions:", newPos.length);
    setPositions(newPos);
    const { data: { user } } = await supabase.auth.getUser();
    console.log("user:", user?.id);
    if (user) {
      const result = await saveToSupabase(user.id, newPos);
      console.log("saveToSupabase done");
    }
  };

  // ── Market session ────────────────────────────────────────────────────────────
  function getSession(): "pre"|"after"|"open"|"closed" {
    const now = new Date();
    const etMin = now.getUTCHours()*60 + now.getUTCMinutes() - 240;
    const day = now.getUTCDay();
    if (day===0||day===6) return "closed";
    if (etMin>=240&&etMin<570) return "pre";
    if (etMin>=570&&etMin<960) return "open";
    if (etMin>=960&&etMin<1200) return "after";
    return "closed";
  }

  // ── Fetch prices ──────────────────────────────────────────────────────────────
  async function getQuote(sym: string) {
    const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!key) return { c:0, pc:0, o:0 };
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`);
      const d = await r.json();
      return { c: Number(d.c||0), pc: Number(d.pc||0), o: Number(d.o||0) };
    } catch { return { c:0, pc:0, o:0 }; }
  }

  const refreshPrices = async () => {
    if (!positions.length) return;
    setIsRefreshing(true);
    const sess = getSession();
    const updated = await Promise.all(positions.map(async p => {
      const { c, pc, o } = await getQuote(p.ticker);
      const extPrice = (sess==="pre"||sess==="after") && o > 0 ? o : 0;
      const extPct   = extPrice>0&&c>0 ? ((extPrice-c)/c)*100 : 0;
      const extType: "pre"|"after"|"none" = sess==="pre"||sess==="after" ? sess : "none";
      return { ...p, currentPrice: c||p.currentPrice, prevClose: pc||p.prevClose, extPrice, extPct, extType };
    }));
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

  useEffect(() => {
    if (!positions.length || isTrading) return;
    const id = setInterval(refreshPrices, 60000);
    return () => clearInterval(id);
  }, [positions.length, isTrading]);

  const saveCash = async (val: number) => {
    setCash(val); setShowCashEdit(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_settings").upsert({ user_id: user.id, cash: val, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  };

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalCost    = positions.reduce((s,p) => s + p.shares*p.avgCost, 0);
  const marketValue  = positions.reduce((s,p) => s + p.shares*(p.currentPrice||p.avgCost), 0);
  const totalPL      = marketValue - totalCost;
  const totalPLPct   = totalCost > 0 ? (totalPL/totalCost)*100 : 0;
  const totalDailyPL = positions.reduce((s,p) => p.prevClose&&p.currentPrice ? s+p.shares*(p.currentPrice-p.prevClose) : s, 0);
  const prevValue    = marketValue - totalDailyPL;
  const totalDailyPct = prevValue > 0 ? (totalDailyPL/prevValue)*100 : 0;
  const totalAssets  = marketValue + cash;
  const stockPct     = totalAssets > 0 ? (marketValue/totalAssets)*100 : 100;
  const cashPct      = totalAssets > 0 ? (cash/totalAssets)*100 : 0;

  // ── Sort ──────────────────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...positions].sort((a,b) => {
    const pa = a.currentPrice||a.avgCost, pb = b.currentPrice||b.avgCost;
    const va = a.shares*pa, vb = b.shares*pb;
    const ca = a.shares*a.avgCost, cb = b.shares*b.avgCost;
    const plA = va-ca, plB = vb-cb;
    const pctA = ca>0?(plA/ca)*100:0, pctB = cb>0?(plB/cb)*100:0;
    const allocA = marketValue>0?(va/marketValue)*100:0, allocB = marketValue>0?(vb/marketValue)*100:0;
    const dA = a.prevClose&&a.currentPrice ? a.shares*(a.currentPrice-a.prevClose) : 0;
    const dB = b.prevClose&&b.currentPrice ? b.shares*(b.currentPrice-b.prevClose) : 0;
    const dpA = a.prevClose&&a.currentPrice ? ((a.currentPrice-a.prevClose)/a.prevClose)*100 : 0;
    const dpB = b.prevClose&&b.currentPrice ? ((b.currentPrice-b.prevClose)/b.prevClose)*100 : 0;
    let cmp = 0;
    if (sortKey==="ticker")    cmp = a.ticker.localeCompare(b.ticker);
    else if (sortKey==="avgCost") cmp = a.avgCost-b.avgCost;
    else if (sortKey==="value")   cmp = va-vb;
    else if (sortKey==="pl")      cmp = plA-plB;
    else if (sortKey==="plPct")   cmp = pctA-pctB;
    else if (sortKey==="dailyPL") cmp = dA-dB;
    else if (sortKey==="dailyPct")cmp = dpA-dpB;
    else if (sortKey==="allocation") cmp = allocA-allocB;
    else if (sortKey==="shares")  cmp = a.shares-b.shares;
    return sortDir==="asc" ? cmp : -cmp;
  });

  // ── Donut ─────────────────────────────────────────────────────────────────────
  const donutGradient = marketValue <= 0 ? "#27272a 0% 100%" : (() => {
    let s = 0;
    return sorted.map((p,i) => {
      const v = p.shares*(p.currentPrice||p.avgCost);
      const pv = marketValue > 0 ? (v/marketValue)*100 : 0;
      const e = s + pv;
      const str = `${COLORS[i%COLORS.length]} ${s.toFixed(2)}% ${e.toFixed(2)}%`;
      s = e;
      return str;
    }).join(", ");
  })();

  // ── Modal helpers ──────────────────────────────────────────────────────────────
  function closeModal() {
    setModal(null); setEditingTicker(null);
    setFormTicker(""); setFormShares(""); setFormPrice("");
    setFormName(""); setFormAlloc(""); setFormTarget(""); setFormError("");
  }
  function openBuy(ticker: string) {
    const p = positions.find(x=>x.ticker===ticker);
    setMode("buy"); setFormTicker(ticker); setFormShares(""); setFormPrice(p?String(p.currentPrice||p.avgCost):"");
    setFormName(p?.name||""); setFormAlloc(""); setFormTarget(""); setEditingTicker(null); setFormError(""); setModalTab("trade");
    setDcaAmount(""); setDcaPrice(p?String((p.currentPrice||p.avgCost).toFixed(2)):"");
    loadSR(ticker);
    setModal({type:"buy",ticker});
  }
  function openSell(ticker: string) {
    const p = positions.find(x=>x.ticker===ticker);
    setMode("sell"); setFormTicker(ticker); setFormShares(""); setFormPrice(p?String(p.currentPrice||p.avgCost):"");
    setFormName(p?.name||""); setFormAlloc(""); setFormTarget(""); setEditingTicker(null); setFormError(""); setModalTab("trade");
    setModal({type:"sell",ticker});
  }
  function openEdit(ticker: string) {
    const p = positions.find(x=>x.ticker===ticker);
    if (!p) return;
    setFormTicker(p.ticker); setFormShares(String(p.shares)); setFormPrice(String(p.avgCost));
    setFormName(p.name); setFormTarget(String(p.targetAlloc||""));
    const pr = p.currentPrice||p.avgCost;
    setFormAlloc(marketValue>0?((p.shares*pr/marketValue)*100).toFixed(2):"");
    setEditingTicker(ticker); setFormError(""); setModalTab("trade");
    setModal({type:"edit",ticker});
  }

  function loadSR(ticker: string) {
    try {
      const d = JSON.parse(localStorage.getItem(`sr_${ticker}`) || "{}");
      setSrInvest(d.invest||""); setSrS(d.s||["","",""]); setSrR(d.r||["","",""]);
    } catch { setSrInvest(""); setSrS(["","",""]); setSrR(["","",""]); }
  }
  function saveSR(invest: string, s: string[], r: string[]) {
    if (formTicker) localStorage.setItem(`sr_${formTicker}`, JSON.stringify({invest,s,r}));
  }

  async function deletePosition(ticker: string) {
    if (!confirm(`ลบ ${ticker} ออกจากพอร์ต?`)) return;
    const newPos = positions.filter(p => p.ticker !== ticker);
    setPositions(newPos);
    localStorage.setItem("yok_portfolio_v4", JSON.stringify(newPos));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase.from("portfolios").delete().eq("user_id", user.id).eq("ticker", ticker);
      console.log("delete error:", error);
      if (!error) showToast(`✓ ลบ ${ticker} แล้ว`);
      else showToast("❌ ลบไม่สำเร็จ", "error");
    }
  }

  function saveTrade() {
    setFormError("");
    const sym = formTicker.toUpperCase().trim();
    const qty = parseFloat(formShares);
    const tradePrice = parseFloat(formPrice);
    console.log("saveTrade called:", {sym, qty, tradePrice, mode, editingTicker});
    const target = parseFloat(formTarget)||0;
    if (!sym) { setFormError("กรุณาใส่ Ticker"); return; }
    if (isNaN(qty)||qty<=0) { setFormError("จำนวนหุ้นต้องมากกว่า 0"); return; }
    if (isNaN(tradePrice)||tradePrice<=0) { setFormError("ราคาต้องมากกว่า 0"); return; }

    if (editingTicker) {
      syncPositions(positions.map(p =>
        p.ticker===editingTicker ? {...p, ticker:sym, name:formName||p.name, shares:qty, avgCost:tradePrice, targetAlloc:target} : p
      ));
      showToast(`✓ แก้ไข ${sym} แล้ว`);
      closeModal(); return;
    }
    if (mode==="buy") {
      const ex = positions.find(p=>p.ticker===sym);
      if (!ex) {
        syncPositions([...positions, {ticker:sym,name:formName||sym,shares:qty,avgCost:tradePrice,currentPrice:tradePrice,prevClose:0,targetAlloc:target,extPrice:0,extPct:0,extType:"none"}]);
        recordTrade(sym, "buy", qty, tradePrice, 0, tradePrice, 0);
      } else {
        const oldAvg = ex.avgCost;
        const ns = ex.shares+qty;
        const newAvg = (ex.shares*oldAvg+qty*tradePrice)/ns;
        syncPositions(positions.map(p => {
          if (p.ticker!==sym) return p;
          return {...p, shares:ns, avgCost:newAvg};
        }));
        recordTrade(sym, "buy", qty, tradePrice, oldAvg, newAvg, 0);
      }
    }
    if (mode==="sell") {
      const ex = positions.find(p=>p.ticker===sym);
      if (!ex) { setFormError("ไม่พบหุ้นนี้"); return; }
      if (qty>ex.shares) { setFormError(`มีหุ้นแค่ ${ex.shares.toFixed(4)}`); return; }
      const pl = (tradePrice - ex.avgCost) * qty;
      if (ex.shares-qty <= 0.00001) {
        syncPositions(positions.filter(p=>p.ticker!==sym));
        recordTrade(sym, "sell", qty, tradePrice, ex.avgCost, ex.avgCost, pl);
      } else {
        syncPositions(positions.map(p=>p.ticker===sym?{...p,shares:p.shares-qty}:p));
        recordTrade(sym, "sell", qty, tradePrice, ex.avgCost, ex.avgCost, pl);
      }
    }
    showToast(`✓ บันทึก ${sym} แล้ว`);
    closeModal();
    // Prevent auto-refresh for 3 seconds after trade
    setIsTrading(true);
    if (tradeTimeoutRef.current) clearTimeout(tradeTimeoutRef.current);
    tradeTimeoutRef.current = setTimeout(() => setIsTrading(false), 3000);
  }

  function SortIcon({ k }: { k: SortKey }) {
    return <span className="ml-0.5 opacity-40 text-[10px]">{sortKey===k?(sortDir==="asc"?"↑":"↓"):"↕"}</span>;
  }
  function Th({ k, label, className="" }: { k:SortKey; label:string; className?:string }) {
    return (
      <th className={`px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap ${className}`}
        onClick={()=>handleSort(k)}>
        {label}<SortIcon k={k}/>
      </th>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
    <style>{`
      .fade-up { animation: fadeInUp 0.45s ease both; }
      .fade-up-1 { animation: fadeInUp 0.45s 0.08s ease both; }
      .fade-up-2 { animation: fadeInUp 0.45s 0.16s ease both; }
      .glow-card { transition: all 0.2s; }
      .glow-card:hover { box-shadow: 0 0 20px #ffffff08, 0 0 1px #ffffff18; transform: translateY(-1px); }
      .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
      .ripple { position:relative; overflow:hidden; }
      .ripple::after { content:""; position:absolute; inset:0; background:radial-gradient(circle,rgba(255,255,255,0.15) 0%,transparent 70%); opacity:0; transition:opacity 0.25s; }
      .ripple:active::after { opacity:1; }
      .row-hover { transition: background 0.15s; }
      .row-hover:hover { background: rgba(255,255,255,0.03); }
      .count-up { animation: countUp 0.6s cubic-bezier(0.22,1,0.36,1) both; }
      .count-up-1 { animation: countUp 0.6s 0.1s cubic-bezier(0.22,1,0.36,1) both; }
      .count-up-2 { animation: countUp 0.6s 0.2s cubic-bezier(0.22,1,0.36,1) both; }
      .glow-green { animation: glowG 2s ease-in-out infinite; }
      .glow-red { animation: glowR 2s ease-in-out infinite; }
      .shimmer { background: linear-gradient(90deg,#1f1f23 25%,#2a2a30 50%,#1f1f23 75%); background-size:400px 100%; animation: shimmer 1.4s infinite linear; }
      .toast-in { animation: toastIn 0.3s cubic-bezier(0.22,1,0.36,1) both; }
      @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes countUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes glowG { 0%,100%{text-shadow:0 0 0 #10b981} 50%{text-shadow:0 0 12px #10b98188} }
      @keyframes glowR { 0%,100%{text-shadow:0 0 0 #ef4444} 50%{text-shadow:0 0 12px #ef444488} }
      @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
      @keyframes toastIn { from{opacity:0;transform:translateY(20px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
    `}</style>
    <main className="min-h-screen bg-[#0d0d0f] text-white font-sans">

      {/* ── Header ── */}
      <div className="border-b border-zinc-800 px-3 py-2.5 flex items-center justify-between bg-[#0d0d0f]/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-zinc-500 hover:text-white text-xs transition-colors">← หน้าแรก</Link>
          <span className="text-zinc-700 hidden sm:block">|</span>
          <h1 className="text-xs font-bold tracking-tight hidden sm:block">TRUSH YOUR OWN · พอร์ต</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 hidden sm:block">อัปเดต: {lastUpdated}</span>
          <CurrencyToggle currency={currency} rate={rate} lastUpdate={rateUpdate} onToggle={toggleCurrency}/>
          <button onClick={refreshPrices} disabled={isRefreshing}
            className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
            <span className={isRefreshing?"animate-spin":""}>{isRefreshing?"⟳":"⟳"}</span>
            <span className="hidden sm:block">{isRefreshing?"กำลังโหลด...":"อัปเดตราคา"}</span>
          </button>
          <button onClick={async()=>{await supabase.auth.signOut();window.location.href="/login";}}
            className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
            <span className="hidden sm:block">ออกจากระบบ</span>
            <span className="sm:hidden">ออก</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-4 max-w-screen-2xl mx-auto space-y-4">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up">
          {/* มูลค่าหุ้น */}
          <div className="relative bg-gradient-to-br from-[#111827] to-[#0f172a] border border-blue-900/40 rounded-xl p-3 overflow-hidden hover-lift">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:"radial-gradient(circle,#3b82f6,transparent)"}}/>
            <p className="text-[10px] text-blue-400/80 uppercase tracking-wider mb-1 font-bold">มูลค่าหุ้น</p>
            <p className="text-lg font-black text-white count-up">{fmtMoney(marketValue)}</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex-1 h-1 bg-blue-900/40 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full" style={{width:`${stockPct}%`}}/>
              </div>
              <span className="text-[10px] text-blue-400 font-bold">{stockPct.toFixed(0)}%</span>
            </div>
          </div>
          {/* เงินสด */}
          <div className="relative bg-gradient-to-br from-[#052e16] to-[#0a1f0a] border border-emerald-900/40 rounded-xl p-3 overflow-hidden hover-lift">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:"radial-gradient(circle,#10b981,transparent)"}}/>
            <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1 font-bold">เงินสด 💵</p>
            {showCashEdit ? (
              <div className="flex gap-1">
                <input type="number" step="100" autoFocus value={cashInput}
                  onChange={e=>setCashInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")saveCash(parseFloat(cashInput)||0);}}
                  className="flex-1 min-w-0 bg-black/40 border border-emerald-700 rounded px-2 py-1 text-xs outline-none font-mono text-emerald-400"/>
                <button onClick={()=>saveCash(parseFloat(cashInput)||0)} className="text-[10px] bg-emerald-500 text-black px-2 rounded font-black">✓</button>
                <button onClick={()=>setShowCashEdit(false)} className="text-[10px] text-zinc-500 px-1">✕</button>
              </div>
            ) : (
              <button onClick={()=>{setCashInput(String(cash));setShowCashEdit(true);}} className="text-left w-full group">
                <p className="text-lg font-black text-emerald-400 group-hover:text-emerald-300 count-up">{fmtMoney(cash)}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="flex-1 h-1 bg-emerald-900/40 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full" style={{width:`${cashPct}%`}}/>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold">{cashPct.toFixed(0)}%</span>
                </div>
              </button>
            )}
          </div>
          {/* กำไร */}
          <div className={`relative bg-gradient-to-br border rounded-xl p-3 overflow-hidden hover-lift ${totalPL>=0?"from-[#052e16] to-[#0a1f0a] border-emerald-900/40":"from-[#2d0a0a] to-[#1a0505] border-red-900/40"}`}>
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:`radial-gradient(circle,${totalPL>=0?"#10b981":"#ef4444"},transparent)`}}/>
            <p className={`text-[10px] uppercase tracking-wider mb-1 font-bold ${totalPL>=0?"text-emerald-400/80":"text-red-400/80"}`}>กำไร/ขาดทุน</p>
            <p className={`text-lg font-black count-up-1 ${totalPL>=0?"text-emerald-400 glow-green":"text-red-400 glow-red"}`}>{totalPL>=0?"+":""}{fmtMoney(totalPL)}</p>
            <span className={`inline-flex items-center gap-0.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black ${totalPL>=0?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>
              {totalPL>=0?"▲":"▼"} {Math.abs(totalPLPct).toFixed(2)}%
            </span>
          </div>
          {/* วันนี้ */}
          <div className={`relative bg-gradient-to-br border rounded-xl p-3 overflow-hidden hover-lift ${totalDailyPL>=0?"from-[#0c1a2e] to-[#071220] border-sky-900/40":"from-[#2d1500] to-[#1a0d00] border-orange-900/40"}`}>
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:`radial-gradient(circle,${totalDailyPL>=0?"#38bdf8":"#f97316"},transparent)`}}/>
            <p className={`text-[10px] uppercase tracking-wider mb-1 font-bold ${totalDailyPL>=0?"text-sky-400/80":"text-orange-400/80"}`}>วันนี้</p>
            <p className={`text-lg font-black count-up-2 ${totalDailyPL>=0?"text-sky-400":"text-orange-400"}`}>{totalDailyPL>=0?"+":""}{fmtMoney(totalDailyPL)}</p>
            <span className={`inline-flex items-center gap-0.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black ${totalDailyPL>=0?"bg-sky-400/10 text-sky-400":"bg-orange-400/10 text-orange-400"}`}>
              {totalDailyPL>=0?"▲":"▼"} {Math.abs(totalDailyPct).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* ── Donut ── */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 flex items-center gap-4 fade-up-1">
          {/* Donut circle */}
          <div className="relative flex-shrink-0 w-28 h-28">
            <div className="w-28 h-28 rounded-full transition-all duration-300"
              style={{background:`conic-gradient(${donutGradient})`, transform:"rotate(-90deg)"}}/>
            {/* Inner circle */}
            <div className="absolute inset-3 bg-[#18181b] rounded-full flex flex-col items-center justify-center">
              {hoveredIdx!==null && sorted[hoveredIdx] ? (
                <>
                  <span className="text-[9px] font-black leading-none" style={{color:COLORS[hoveredIdx%COLORS.length]}}>
                    {sorted[hoveredIdx].ticker}
                  </span>
                  <span className="text-sm font-black text-white leading-none mt-0.5">
                    {marketValue>0?((sorted[hoveredIdx].shares*(sorted[hoveredIdx].currentPrice||sorted[hoveredIdx].avgCost)/marketValue)*100).toFixed(1):0}%
                  </span>
                  <span className="text-[8px] text-zinc-500 leading-none mt-0.5">
                    {fmtMoney(sorted[hoveredIdx].shares*(sorted[hoveredIdx].currentPrice||sorted[hoveredIdx].avgCost))}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[9px] text-zinc-500 leading-none">พอร์ต</span>
                  <span className="text-xs font-black text-white leading-none mt-0.5">{positions.length} หุ้น</span>
                  <span className="text-[8px] text-zinc-500 leading-none mt-0.5">{fmtMoney(marketValue)}</span>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 overflow-hidden">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-28 overflow-hidden">
              {sorted.slice(0,10).map((p,i) => {
                const v = p.shares*(p.currentPrice||p.avgCost);
                const pv = marketValue>0?(v/marketValue)*100:0;
                const isHov = hoveredIdx===i;
                return (
                  <div key={p.ticker}
                    className="flex items-center gap-1.5 cursor-pointer transition-opacity"
                    style={{opacity:hoveredIdx===null||isHov?1:0.4}}
                    onMouseEnter={()=>setHoveredIdx(i)} onMouseLeave={()=>setHoveredIdx(null)}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0 transition-transform"
                      style={{background:COLORS[i%COLORS.length],transform:isHov?"scale(1.4)":"scale(1)"}}/>
                    <span className={`text-[10px] font-bold transition-colors ${isHov?"text-white":"text-zinc-400"}`}>{p.ticker}</span>
                    <span className="text-[9px] text-zinc-600 ml-auto">{pv.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden fade-up-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#111113]">
                <tr>
                  <Th k="ticker" label="หุ้น"/>
                  <Th k="shares" label="จำนวน" className="hidden lg:table-cell"/>
                  <Th k="avgCost" label="ต้นทุน" className="hidden lg:table-cell"/>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider hidden lg:table-cell">ราคา</th>
                  <Th k="value" label="มูลค่า"/>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={()=>{setPlMode("total");if(sortKey==="dailyPL"||sortKey==="dailyPct")setSortKey("pl");}}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${plMode==="total"?"bg-emerald-400/20 text-emerald-400":"text-zinc-600 hover:text-zinc-400"}`}>รวม</button>
                      <span className="text-zinc-700 text-xs">|</span>
                      <button onClick={()=>{setPlMode("daily");if(sortKey==="pl"||sortKey==="plPct")setSortKey("dailyPL");}}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${plMode==="daily"?"bg-sky-400/20 text-sky-400":"text-zinc-600 hover:text-zinc-400"}`}>วันนี้</button>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {plMode==="total"
                        ? <button onClick={()=>handleSort("plPct")} className="text-[10px] text-zinc-600 hover:text-zinc-400">% <SortIcon k="plPct"/></button>
                        : <button onClick={()=>handleSort("dailyPct")} className="text-[10px] text-zinc-600 hover:text-zinc-400">% <SortIcon k="dailyPct"/></button>
                      }
                    </div>
                  </th>
                  <Th k="allocation" label="สัดส่วน" className="hidden md:table-cell"/>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-zinc-400 uppercase">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, idx) => {
                  const price = p.currentPrice || p.avgCost;
                  const val   = p.shares * price;
                  const cost  = p.shares * p.avgCost;
                  const pl    = val - cost;
                  const plPct = cost > 0 ? (pl/cost)*100 : 0;
                  const allocNow = marketValue > 0 ? (val/marketValue)*100 : 0;
                  const targetPct = p.targetAlloc || 0;
                  const dailyPL  = p.prevClose&&p.currentPrice ? p.shares*(p.currentPrice-p.prevClose) : null;
                  const dailyPct = p.prevClose&&p.currentPrice ? ((p.currentPrice-p.prevClose)/p.prevClose)*100 : null;
                  const isPos    = pl >= 0;
                  const isDailyPos = dailyPL !== null ? dailyPL >= 0 : null;
                  const allocDiff = targetPct > 0 ? allocNow - targetPct : null;
                  return (
                    <tr key={p.ticker} className="row-hover border-t border-zinc-800">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:COLORS[idx%COLORS.length]}}/>
                          <div>
                            <p className="font-bold text-sm">{p.ticker}</p>
                            <p className="text-xs text-zinc-500 truncate max-w-[100px]">{p.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-yellow-300 font-mono hidden lg:table-cell">{p.shares.toFixed(4)}</td>
                      <td className="px-3 py-3 text-sm hidden lg:table-cell">{fmtMoney(p.avgCost)}</td>
                      <td className="px-3 py-3 text-sm text-zinc-300 hidden lg:table-cell">{fmtMoney(price)}</td>
                      <td className="px-3 py-3 text-sm font-bold">{fmtMoney(val)}</td>
                      <td className="px-3 py-3 min-w-[130px]">
                        {plMode==="total" ? (
                          <>
                            <p className={`text-sm font-bold ${isPos?"text-emerald-400 glow-green":"text-red-400 glow-red"}`}>{isPos?"+":""}{fmtMoney(pl)}</p>
                            <p className={`text-xs ${isPos?"text-emerald-400":"text-red-400"}`}>{isPos?"▲":"▼"} {Math.abs(plPct).toFixed(2)}%</p>
                            {p.extType!=="none"&&p.extPrice>0&&(
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[9px] font-black px-1 py-0.5 rounded ${p.extType==="pre"?"bg-yellow-400/20 text-yellow-400":"bg-purple-400/20 text-purple-400"}`}>{p.extType==="pre"?"PRE":"AH"}</span>
                                <span className={`text-[9px] font-bold ${p.extPct>=0?"text-emerald-400":"text-red-400"}`}>{p.extPct>=0?"+":""}{p.extPct.toFixed(2)}%</span>
                              </div>
                            )}
                          </>
                        ) : (
                          dailyPL!==null ? (
                            <>
                              <p className={`text-sm font-bold ${isDailyPos?"text-sky-400":"text-orange-400"}`}>{isDailyPos?"+":""}{fmtMoney(dailyPL)}</p>
                              <p className={`text-xs ${isDailyPos?"text-sky-400":"text-orange-400"}`}>{isDailyPos?"▲":"▼"} {Math.abs(dailyPct!).toFixed(2)}%</p>
                            </>
                          ) : <p className="text-xs text-zinc-600">— ไม่มีข้อมูล</p>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-[120px] hidden md:table-cell">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-zinc-600">ปัจจุบัน</span>
                          <span className="text-xs font-bold text-zinc-300">{allocNow.toFixed(1)}%</span>
                        </div>
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                          <div className="h-full rounded-full" style={{width:`${Math.min(allocNow,100)}%`,background:COLORS[idx%COLORS.length]}}/>
                        </div>
                        {targetPct>0 ? (
                          <>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-zinc-600">เป้าหมาย</span>
                              <span className="text-[10px] font-bold text-purple-400">{targetPct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1">
                              <div className="h-full bg-purple-500/50 rounded-full" style={{width:`${Math.min(targetPct,100)}%`}}/>
                            </div>
                            {allocDiff!==null&&(
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${Math.abs(allocDiff)<0.5?"bg-zinc-700 text-zinc-400":allocDiff>0?"bg-orange-400/10 text-orange-400":"bg-blue-400/10 text-blue-400"}`}>
                                {allocDiff>0?"▲ เกิน":"▼ ขาด"} {Math.abs(allocDiff).toFixed(1)}%
                              </span>
                            )}
                          </>
                        ) : <p className="text-[10px] text-zinc-700">ยังไม่ตั้งเป้า</p>}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={()=>openBuy(p.ticker)} className="ripple px-1.5 py-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded font-bold">
                            <span className="hidden sm:inline">ซื้อ</span><span className="sm:hidden">+</span>
                          </button>
                          <button onClick={()=>openSell(p.ticker)} className="ripple px-1.5 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded font-bold">
                            <span className="hidden sm:inline">ขาย</span><span className="sm:hidden">-</span>
                          </button>
                          <button onClick={()=>openEdit(p.ticker)} className="ripple px-1.5 py-1 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded font-bold">
                            <span className="hidden sm:inline">แก้</span><span className="sm:hidden">✎</span>
                          </button>
                          <button onClick={()=>deletePosition(p.ticker)} className="px-1.5 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded font-bold">
                            <span className="hidden sm:inline">ลบ</span><span className="sm:hidden">✕</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-zinc-800 p-4">
            <button onClick={()=>{setMode("buy");setFormTicker("");setFormShares("");setFormPrice("");setFormName("");setFormAlloc("");setFormTarget("");setEditingTicker(null);setFormError("");setModalTab("trade");setModal({type:"buy",ticker:""}); }}
              className="w-full py-2.5 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 rounded-lg text-sm">
              + เพิ่มหุ้นใหม่
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
          <div className="bg-[#18181b] border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingTicker?`แก้ไข ${editingTicker}`:mode==="buy"?"ซื้อหุ้น":"ขายหุ้น"}</h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white text-xl">✕</button>
            </div>

            {!editingTicker && (
              <>
                <div className="flex gap-1 mb-4 bg-zinc-800/50 p-1 rounded-xl">
                  <button type="button" onClick={()=>setModalTab("trade")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${modalTab==="trade"?"bg-zinc-700 text-white":"text-zinc-500"}`}>💹 ซื้อ/ขาย</button>
                  <button type="button" onClick={()=>setModalTab("dca")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${modalTab==="dca"?"bg-yellow-400/20 text-yellow-400":"text-zinc-500"}`}>📊 DCA</button>
                  <button type="button" onClick={()=>setModalTab("sr")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${modalTab==="sr"?"bg-purple-400/20 text-purple-400":"text-zinc-500"}`}>🎯 S/R</button>
                </div>
                {modalTab==="trade" && (
                  <div className="flex gap-2 mb-4">
                    <button type="button" onClick={()=>setMode("buy")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${mode==="buy"?"bg-emerald-500 text-black":"bg-zinc-800 text-zinc-400"}`}>ซื้อ</button>
                    <button type="button" onClick={()=>setMode("sell")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${mode==="sell"?"bg-blue-500 text-white":"bg-zinc-800 text-zinc-400"}`}>ขาย</button>
                  </div>
                )}
              </>
            )}

            {/* DCA Tab */}
            {modalTab==="dca" && !editingTicker && (()=>{
              const p = positions.find(x=>x.ticker===formTicker);
              if (!p) return <p className="text-zinc-500 text-sm text-center py-4">เลือกหุ้นก่อนครับ</p>;
              const cp = p.currentPrice||p.avgCost;
              const addAmt = parseFloat(dcaAmount)||0;
              const buyPx  = parseFloat(dcaPrice)||cp;
              const addSh  = dcaMode==="amount"?addAmt/buyPx:addAmt;
              const newSh  = p.shares+addSh;
              const newCost= newSh>0?(p.shares*p.avgCost+(dcaMode==="amount"?addAmt:addSh*buyPx))/newSh:0;
              const newAlloc= marketValue>0?newSh*cp/(marketValue+(dcaMode==="amount"?addAmt:addSh*buyPx))*100:0;
              return (
                <div className="space-y-4">
                  <div className="bg-zinc-800/40 rounded-xl p-3 text-xs">
                    <p className="text-zinc-400 font-bold mb-2">{p.ticker} — ปัจจุบัน</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-zinc-600">ถือ</p><p className="font-bold">{p.shares.toFixed(4)}</p></div>
                      <div><p className="text-zinc-600">Avg Cost</p><p className="font-bold text-yellow-400">${p.avgCost.toFixed(2)}</p></div>
                      <div><p className="text-zinc-600">ราคาตอนนี้</p><p className="font-bold">${cp.toFixed(2)}</p></div>
                    </div>
                  </div>
                  <div className="flex gap-1 bg-zinc-800/50 p-1 rounded-lg">
                    <button type="button" onClick={()=>setDcaMode("amount")} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${dcaMode==="amount"?"bg-zinc-700 text-white":"text-zinc-500"}`}>ใส่เป็น $</button>
                    <button type="button" onClick={()=>setDcaMode("shares")} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${dcaMode==="shares"?"bg-zinc-700 text-white":"text-zinc-500"}`}>ใส่เป็นหุ้น</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">{dcaMode==="amount"?"เงินที่ซื้อเพิ่ม ($)":"จำนวนหุ้น"}</label>
                      <input type="number" inputMode="decimal" step="any" value={dcaAmount} placeholder={dcaMode==="amount"?"100":"5"}
                        onChange={e=>setDcaAmount(e.target.value)}
                        className="w-full bg-[#111113] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none font-mono text-yellow-400 font-bold"/>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400 mb-1 block">ราคาที่ซื้อ ($)</label>
                      <input type="number" inputMode="decimal" step="any" value={dcaPrice}
                        onChange={e=>setDcaPrice(e.target.value)}
                        className="w-full bg-[#111113] border border-zinc-700 focus:border-blue-400 rounded-lg px-3 py-2.5 text-sm outline-none font-mono"/>
                    </div>
                  </div>
                  {addAmt>0 ? (
                    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4 space-y-2.5">
                      <p className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">ผลลัพธ์หลัง DCA</p>
                      <div className="flex justify-between"><span className="text-xs text-zinc-500">ต้นทุนเฉลี่ยใหม่</span><span className="font-black text-base text-yellow-400">${newCost.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-zinc-500">จำนวนหุ้นทั้งหมด</span><span className="font-bold text-sm">{newSh.toFixed(4)}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-zinc-500">ต้นทุนรวมใหม่</span><span className="font-bold text-sm text-zinc-300">${(newSh*newCost).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-zinc-500">สัดส่วนในพอร์ต</span><span className="font-bold text-sm text-purple-400">{newAlloc.toFixed(1)}%</span></div>
                      <div className={`flex items-center gap-2 pt-2 border-t border-zinc-700/50 text-xs font-bold ${newCost<p.avgCost?"text-emerald-400":"text-red-400"}`}>
                        <span>{newCost<p.avgCost?"▼ ต้นทุนลดลง":"▲ ต้นทุนเพิ่มขึ้น"}</span>
                        <span>${Math.abs(newCost-p.avgCost).toFixed(2)} ({Math.abs((newCost-p.avgCost)/p.avgCost*100).toFixed(2)}%)</span>
                      </div>
                    </div>
                  ) : <p className="text-center text-zinc-600 text-xs py-2">ใส่จำนวนเงินหรือหุ้นที่จะซื้อเพิ่มครับ</p>}
                </div>
              );
            })()}

            {/* SR Tab */}
            {modalTab==="sr" && !editingTicker && (()=>{
              const p = positions.find(x=>x.ticker===formTicker);
              const cp = p ? (p.currentPrice||p.avgCost) : 0;
              const inv = parseFloat(srInvest)||0;
              const supports = srS.map(s=>parseFloat(s)||0).filter(s=>s>0);
              const resists  = srR.map(r=>parseFloat(r)||0).filter(r=>r>0);
              return (
                <div className="space-y-3">
                  {p && (
                    <div className="bg-zinc-800/40 rounded-xl p-3 text-xs">
                      <p className="text-zinc-400 font-bold mb-2">{p.ticker} — ปัจจุบัน</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-zinc-600">ถือ</p><p className="font-bold">{p.shares.toFixed(4)}</p></div>
                        <div><p className="text-zinc-600">Avg Cost</p><p className="font-bold text-yellow-400">${p.avgCost.toFixed(2)}</p></div>
                        <div><p className="text-zinc-600">ราคาตอนนี้</p><p className="font-bold">${cp.toFixed(2)}</p></div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">💰 เงินลงทุน ($)</label>
                    <input type="number" inputMode="decimal" step="any" value={srInvest} placeholder="1000"
                      onChange={e=>{setSrInvest(e.target.value);saveSR(e.target.value,srS,srR);}}
                      className="w-full bg-[#111113] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none font-mono text-yellow-400 font-black"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-black text-emerald-400">📗 แนวรับ (ซื้อ)</p>
                      {["S1","S2","S3"].map((label,i)=>(
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black text-emerald-400 w-5">{label}</span>
                          <input type="number" inputMode="decimal" step="any" value={srS[i]} placeholder="ราคา"
                            onChange={e=>{const n=[...srS];n[i]=e.target.value;setSrS(n);saveSR(srInvest,n,srR);}}
                            className="flex-1 bg-[#111113] border border-emerald-900/50 focus:border-emerald-400 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"/>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-black text-red-400">📕 แนวต้าน (ขาย)</p>
                      {["R1","R2","R3"].map((label,i)=>(
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black text-red-400 w-5">{label}</span>
                          <input type="number" inputMode="decimal" step="any" value={srR[i]} placeholder="ราคา"
                            onChange={e=>{const n=[...srR];n[i]=e.target.value;setSrR(n);saveSR(srInvest,srS,n);}}
                            className="flex-1 bg-[#111113] border border-red-900/50 focus:border-red-400 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"/>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(srInvest||srS.some(s=>s)||srR.some(r=>r)) && (
                    <button type="button" onClick={()=>{setSrInvest("");setSrS(["","",""]);setSrR(["","",""]);if(formTicker)localStorage.removeItem(`sr_${formTicker}`);}}
                      className="w-full py-1.5 text-xs text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-400/30 rounded-lg">
                      🗑 ล้างข้อมูล S/R
                    </button>
                  )}
                  {inv>0&&supports.length>0&&resists.length>0&&(
                    <div className="overflow-x-auto rounded-xl border border-zinc-800">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-[#111113]">
                            <th className="px-2 py-2 text-yellow-400 font-black text-left">ซื้อ\ขาย</th>
                            {resists.map((r,i)=>(
                              <th key={i} className="px-2 py-2 text-center">
                                <p className="text-red-400 font-black">R{i+1}</p>
                                <p className="text-zinc-400">${r.toFixed(2)}</p>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {supports.map((s,si)=>(
                            <tr key={si} className="border-t border-zinc-800">
                              <td className="px-2 py-2 bg-[#111113]">
                                <p className="text-emerald-400 font-black">S{si+1}</p>
                                <p className="text-zinc-400">${s.toFixed(2)}</p>
                              </td>
                              {resists.map((r,ri)=>{
                                const sh = inv/s;
                                const pl = (r-s)*sh;
                                const pv = ((r-s)/s)*100;
                                const pos = pl>=0;
                                return (
                                  <td key={ri} className={`px-2 py-2 text-center border-l border-zinc-800 ${pos?"bg-emerald-400/5":"bg-red-400/5"}`}>
                                    <p className={`font-black ${pos?"text-emerald-400":"text-red-400"}`}>{pos?"+":"-"}${Math.abs(pl).toFixed(0)}</p>
                                    <p className={pos?"text-emerald-600":"text-red-600"}>({pos?"+":""}{pv.toFixed(1)}%)</p>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Trade Form */}
            {(modalTab==="trade"||editingTicker) && (
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
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">สัดส่วนเป้าหมาย (%)</label>
                  <input className="w-full bg-[#111113] border border-zinc-700 focus:border-purple-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น 10" type="number" step="0.1" value={formTarget} onChange={e=>setFormTarget(e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">จำนวนหุ้น</label>
                  <input className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น 5.5" type="number" step="any" value={formShares} onChange={e=>setFormShares(e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">{editingTicker?"ราคาเฉลี่ย (Avg Cost)":"ราคาที่ซื้อ/ขาย ($)"}</label>
                  <input className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น 199.32" type="number" step="any" value={formPrice} onChange={e=>setFormPrice(e.target.value)}/>
                </div>
                {formError && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>}
                <button onClick={saveTrade}
                  className={`w-full py-3 rounded-xl font-bold text-sm mt-1 ${editingTicker?"bg-yellow-400 hover:bg-yellow-300 text-black":mode==="buy"?"bg-emerald-500 hover:bg-emerald-400 text-black":"bg-blue-500 hover:bg-blue-400 text-white"}`}>
                  {editingTicker?"✓ บันทึกการแก้ไข":mode==="buy"?"✓ บันทึกการซื้อ":"✓ บันทึกการขาย"}
                </button>
              </div>
            )}

            {/* History Tab */}
            {modalTab==="history" && !editingTicker && (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400 mb-2">ประวัติการซื้อขาย {formTicker || "ทั้งหมด"}</p>
                {tradeHistory.length === 0 ? (
                  <p className="text-center text-zinc-600 text-sm py-4">ยังไม่มีประวัติการซื้อขาย</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tradeHistory.filter(t => !formTicker || t.ticker === formTicker).map((trade, idx) => {
                      const date = new Date(trade.created_at);
                      const isPos = trade.type === "buy" || trade.pl > 0;
                      return (
                        <div key={idx} className="bg-zinc-800/50 rounded-lg p-2.5 text-xs border border-zinc-700/50">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`font-bold ${trade.type==="buy"?"text-emerald-400":"text-blue-400"}`}>
                              {trade.type==="buy"?"🟢 ซื้อ":"🔵 ขาย"} {trade.ticker}
                            </span>
                            <span className="text-zinc-500">{date.toLocaleDateString("th-TH")} {date.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-zinc-400 mb-1">
                            <div><span className="text-zinc-600">จำนวน:</span> {trade.shares.toFixed(4)}</div>
                            <div><span className="text-zinc-600">ราคา:</span> ${trade.price.toFixed(2)}</div>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>เงิน: ${trade.amount.toFixed(2)}</span>
                            {trade.type==="sell" && trade.pl !== null && (
                              <span className={`font-bold ${trade.pl>0?"text-emerald-400":"text-red-400"}`}>
                                {trade.pl>0?"+":""}{fmtMoney(trade.pl)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}


        {/* ── Trade History ── */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden fade-up">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-white">📜 ประวัติการซื้อขาย</h2>
          </div>
          {tradeHistory.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-zinc-600 text-sm">ยังไม่มีประวัติการซื้อขาย</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#111113]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">วันที่</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">หุ้น</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">ประเภท</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">จำนวน</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">ราคา</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">เงินทั้งหมด</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase">Avg Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400 uppercase">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeHistory.slice(0, 50).map((trade, idx) => {
                    const date = new Date(trade.created_at);
                    const isPos = trade.pl > 0;
                    return (
                      <tr key={idx} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                        <td className="px-4 py-2.5 text-xs text-zinc-500">{date.toLocaleDateString("th-TH")} {date.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</td>
                        <td className="px-4 py-2.5 font-bold text-white">{trade.ticker}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${trade.type==="buy"?"bg-emerald-400/20 text-emerald-400":"bg-blue-400/20 text-blue-400"}`}>
                            {trade.type==="buy"?"ซื้อ":"ขาย"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-mono text-yellow-300">{trade.shares.toFixed(4)}</td>
                        <td className="px-4 py-2.5 text-sm">${trade.price.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm">${trade.amount.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm text-zinc-400">${trade.avg_cost_before ? trade.avg_cost_before.toFixed(2) : "-"}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-bold">
                          {trade.type==="sell" && trade.pl !== null ? (
                            <span className={isPos?"text-emerald-400":"text-red-400"}>
                              {isPos?"+":""}{fmtMoney(trade.pl)}
                            </span>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl toast-in ${toast.type==="success"?"bg-emerald-500 text-black":"bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}
    </main>
    </>
  );
}
