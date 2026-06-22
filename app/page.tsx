"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import CurrencyToggle from "@/components/CurrencyToggle";
import { useCurrency } from "@/hooks/useCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────
type IndexData = {
  symbol: string;
  label: string;
  value: number;
  change: number;
  changePct: number;
  prevClose: number;
  sparkline: number[];
  color: string;
  extPrice: number;   // pre/after market price
  extChange: number;
  extPct: number;
  extType: "pre" | "after" | "none";
};

type NewsItem = {
  headline: string;
  headlineTh: string;
  source: string;
  time: string;
  url: string;
  ticker?: string;
};

type Mover = {
  symbol: string;
  changePct: number;
  change: number;
  price: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const money = (v: number, d = 2) =>
  v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const clamp = (arr: number[]) => {
  const mn = Math.min(...arr), mx = Math.max(...arr);
  return arr.map(v => (mx === mn ? 0.5 : (v - mn) / (mx - mn)));
};

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const n = clamp(data);
  const W = 80, H = 32;
  const pts = n.map((v, i) => `${(i / (n.length - 1)) * W},${H - v * H}`).join(" ");
  const fill = n.map((v, i) => `${(i / (n.length - 1)) * W},${H - v * H}`).join(" ");
  const id = `g${color.replace("#", "")}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${fill} ${W},${H}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Breadth Bar ─────────────────────────────────────────────────────────────
function BreadthBar({ up, down }: { up: number; down: number }) {
  const total = up + down;
  const upPct = total > 0 ? (up / total) * 100 : 50;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-emerald-400 w-8 text-right font-bold">{up}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${upPct}%` }} />
        <div className="h-full bg-red-500 transition-all" style={{ width: `${100 - upPct}%` }} />
      </div>
      <span className="text-red-400 w-8 font-bold">{down}</span>
    </div>
  );
}

// ─── Live Clock ──────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState("");
  const [session, setSession] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      const edtMin = now.getUTCHours() * 60 + now.getUTCMinutes() - 240;
      const day = now.getUTCDay();
      if (day === 0 || day === 6) { setSession("ตลาดปิด (Weekend)"); return; }
      if (edtMin >= 570 && edtMin < 960) setSession("🟢 ตลาด US เปิด");
      else if (edtMin >= 540 && edtMin < 570) setSession("🟡 Pre-Market");
      else if (edtMin >= 960 && edtMin < 1080) setSession("🟡 After-Hours");
      else setSession("🔴 ตลาด US ปิด");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-center sm:text-right">
      <p className="text-lg sm:text-2xl font-mono font-bold tracking-widest leading-tight">{time}</p>
      <p className="text-[10px] sm:text-xs text-zinc-400">{session}</p>
    </div>
  );
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchQuote(sym: string, key: string) {
  const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`);
  return r.json();
}

// Determine session: pre-market (<9:30 ET) or after-hours (>16:00 ET)
function getMarketSession(): "pre" | "after" | "open" | "closed" {
  const now = new Date();
  const etMin = now.getUTCHours() * 60 + now.getUTCMinutes() - 240; // EDT offset
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return "closed";
  if (etMin >= 240 && etMin < 570) return "pre";    // 04:00–09:30
  if (etMin >= 570 && etMin < 960) return "open";   // 09:30–16:00
  if (etMin >= 960 && etMin < 1200) return "after"; // 16:00–20:00
  return "closed";
}

async function fetchCandles(sym: string, key: string): Promise<number[]> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * 30;
  const r = await fetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${key}`
  );
  const d = await r.json();
  return Array.isArray(d.c) ? d.c.slice(-20) : [];
}

// หุ้นในพอร์ต
const PORTFOLIO_TICKERS = [
  "GOOGL","AMZN","ASML","MSFT","META","NVDA","RBRK",
  "ALAB","NVO","NFLX","AMD","SOFI","PLTR","IONQ",
  "TSM","UBER","RKLB","CRWD","TMDX"
];

async function fetchNews(key: string): Promise<NewsItem[]> {
  if (!key) return [];
  
  const now = Math.floor(Date.now() / 1000);
  const from = now - 86400 * 3; // ย้อนหลัง 3 วัน
  
  // สุ่มหยิบ 5 หุ้นมาดึงข่าว (ไม่เกิน rate limit)
  const picks = [...PORTFOLIO_TICKERS].sort(() => Math.random() - 0.5).slice(0, 5);
  
  const results = await Promise.allSettled(
    picks.map(sym =>
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${new Date(from*1000).toISOString().split('T')[0]}&to=${new Date(now*1000).toISOString().split('T')[0]}&token=${key}`)
        .then(r => r.json())
        .then((data: any[]) => (Array.isArray(data) ? data : []).slice(0, 2).map((n: any) => ({
          headline: n.headline,
          headlineTh: n.headline,
          source: n.source || sym,
          time: new Date(n.datetime * 1000).toLocaleString("th-TH", {
            hour: "2-digit", minute: "2-digit", month: "short", day: "numeric",
          }),
          url: n.url,
          ticker: sym,
        })))
    )
  );
  
  const all: NewsItem[] = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled")
    .flatMap(r => r.value)
    .filter(n => n.headline && n.headline.length > 10)
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
    
  return all;
}

// Top movers: fetch quotes for S&P500 + NASDAQ big caps in batches
// We use Finnhub's market movers endpoint (free: /stock/market-status, gainers/losers via quote batches)
// Finnhub free has: /stock/symbol for exchange listings → then batch quotes
// Simpler approach: use a curated watchlist of ~50 major tickers
const WATCHLIST = [
  "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","LLY","JPM",
  "V","UNH","XOM","MA","JNJ","PG","HD","MRK","ABBV","COST",
  "ORCL","BAC","KO","AMD","PEP","ADBE","CSCO","ACN","TMO","WMT",
  "MCD","ABT","CRM","NKE","NEE","QCOM","LIN","DHR","AMGN","PM",
  "RTX","HON","TXN","INTU","LOW","SPGI","GS","MS","BLK","AMAT",
];

async function fetchTopMovers(key: string): Promise<{ gainers: Mover[]; losers: Mover[] }> {
  // Fetch in smaller batches to avoid rate limit
  const batch = WATCHLIST.slice(0, 20); // free tier ~30 req/s
  const quotes = await Promise.allSettled(
    batch.map(async (sym) => {
      const q = await fetchQuote(sym, key);
      return { symbol: sym, price: Number(q.c || 0), change: Number(q.d || 0), changePct: Number(q.dp || 0) };
    })
  );
  const valid = quotes
    .filter((r): r is PromiseFulfilledResult<Mover> => r.status === "fulfilled" && r.value.price > 0)
    .map(r => r.value)
    .sort((a, b) => b.changePct - a.changePct);

  return {
    gainers: valid.slice(0, 5),
    losers: valid.slice(-5).reverse(),
  };
}

// ─── Index config ─────────────────────────────────────────────────────────────
const INDEX_CONFIG = [
  { symbol: "SPY", label: "S&P 500", color: "#4f7df3" },
  { symbol: "QQQ", label: "NASDAQ",  color: "#a78bfa" },
  { symbol: "GLD", label: "GOLD",    color: "#f0aa4f" },
  { symbol: "UUP", label: "DXY",     color: "#69c36b" },
  { symbol: "TLT", label: "Bonds",   color: "#06b6d4" },
  { symbol: "VIX", label: "VIX",     color: "#f43f5e" },
] as const;

// ─── Portfolio snapshot ───────────────────────────────────────────────────────
function usePortfolioSnapshot() {
  const [snap, setSnap] = useState({
    value: 0, pl: 0, plPct: 0, dailyPL: 0, dailyPct: 0, count: 0, extPL: 0, extPct: 0, extType: "none",
  });
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yok_portfolio_v4");
      if (!saved) return;
      const positions = JSON.parse(saved);
      const marketValue = positions.reduce(
        (s: number, p: any) => s + p.shares * (p.currentPrice || p.avgCost), 0
      );
      const totalCost = positions.reduce(
        (s: number, p: any) => s + p.shares * p.avgCost, 0
      );
      const pl = marketValue - totalCost;
      const plPct = totalCost > 0 ? (pl / totalCost) * 100 : 0;

      // Daily P/L: sum of shares × (currentPrice - prevClose)
      const dailyPL = positions.reduce((s: number, p: any) => {
        if (!p.prevClose || !p.currentPrice) return s;
        return s + p.shares * (p.currentPrice - p.prevClose);
      }, 0);
      const prevValue = marketValue - dailyPL;
      const dailyPct = prevValue > 0 ? (dailyPL / prevValue) * 100 : 0;

      // Pre/After market P/L
      const extPL = positions.reduce((s: number, p: any) => {
        if (!p.extPrice || !p.currentPrice || p.extType === "none") return s;
        return s + p.shares * (p.extPrice - p.currentPrice);
      }, 0);
      const extPct = marketValue > 0 ? (extPL / marketValue) * 100 : 0;
      const extType = positions.find((p: any) => p.extType !== "none")?.extType || "none";

      setSnap({ value: marketValue, pl, plPct, dailyPL, dailyPct, count: positions.length, extPL, extPct, extType });
    } catch {}
  }, []);
  return snap;
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_NEWS: NewsItem[] = [
  { headline: "NVIDIA's Blackwell Ultra demand surges ahead of Q3 earnings", headlineTh: "", source: "Bloomberg", time: "1ชม.ที่แล้ว", url: "#", ticker: "NVDA" },
  { headline: "Alphabet beats estimates, Google Cloud grows 28% YoY", headlineTh: "", source: "Reuters", time: "2ชม.ที่แล้ว", url: "#", ticker: "GOOGL" },
  { headline: "Amazon Web Services expands AI infrastructure investment", headlineTh: "", source: "WSJ", time: "3ชม.ที่แล้ว", url: "#", ticker: "AMZN" },
  { headline: "AMD launches next-gen MI400 AI accelerator chips", headlineTh: "", source: "The Verge", time: "4ชม.ที่แล้ว", url: "#", ticker: "AMD" },
  { headline: "Meta AI assistant reaches 1 billion users milestone", headlineTh: "", source: "CNBC", time: "5ชม.ที่แล้ว", url: "#", ticker: "META" },
  { headline: "ASML reports record EUV machine orders from TSMC", headlineTh: "", source: "FT", time: "6ชม.ที่แล้ว", url: "#", ticker: "ASML" },
  { headline: "Palantir wins new US defense AI contract worth $400M", headlineTh: "", source: "Defense News", time: "7ชม.ที่แล้ว", url: "#", ticker: "PLTR" },
  { headline: "CrowdStrike expands cybersecurity platform with AI features", headlineTh: "", source: "TechCrunch", time: "8ชม.ที่แล้ว", url: "#", ticker: "CRWD" },
];

const DEMO_GAINERS: Mover[] = [
  { symbol: "NVDA", changePct: 4.21, change: 8.82, price: 218.93 },
  { symbol: "AMD",  changePct: 3.57, change: 18.36, price: 531.18 },
  { symbol: "ALAB", changePct: 9.96, change: 37.22, price: 410.69 },
  { symbol: "TSM",  changePct: 6.43, change: 27.78, price: 460.76 },
  { symbol: "AVGO", changePct: 2.88, change: 5.31, price: 189.62 },
];
const DEMO_LOSERS: Mover[] = [
  { symbol: "TMDX", changePct: -20.74, change: -20.38, price: 78.08 },
  { symbol: "NFLX", changePct: -23.83, change: -24.13, price: 77.05 },
  { symbol: "NVO",  changePct: -10.82, change: -5.21, price: 42.98 },
  { symbol: "META", changePct: -8.10,  change: -50.48, price: 574.01 },
  { symbol: "SOFI", changePct: -10.51, change: -2.09, price: 17.75 },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [movers, setMovers] = useState<{ gainers: Mover[]; losers: Mover[] }>({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState("-");
  const [moversTab, setMoversTab] = useState<"gainers" | "losers">("gainers");
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const portfolio = usePortfolioSnapshot();
  const { currency, rate, lastUpdate: rateUpdate, toggleCurrency, format: fmtMoney } = useCurrency();

  const fetchAI = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const snap = portfolio;
      const prompt = `คุณเป็น AI วิเคราะห์การลงทุน วิเคราะห์พอร์ตหุ้นนี้เป็นภาษาไทยสั้นๆ กระชับ ไม่เกิน 5 บรรทัด:
- มูลค่าพอร์ต: $${snap.value.toFixed(2)}
- กำไร/ขาดทุนรวม: $${snap.pl.toFixed(2)} (${snap.plPct.toFixed(2)}%)
- กำไรวันนี้: $${snap.dailyPL.toFixed(2)} (${snap.dailyPct.toFixed(2)}%)
- จำนวนหุ้น: ${snap.count} ตัว
หุ้นในพอร์ต: GOOGL, AMZN, ASML, MSFT, META, NVDA, RBRK, ALAB, NVO, NFLX, AMD, SOFI, PLTR, IONQ, TSM, UBER, RKLB, CRWD, TMDX
วิเคราะห์สั้นๆ ว่าพอร์ตเป็นอย่างไร มีจุดแข็งอะไร ควรระวังอะไร`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text || "ไม่สามารถวิเคราะห์ได้ในขณะนี้";
      setAiAnalysis(text);
    } catch {
      setAiAnalysis("ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้");
    }
    setAiLoading(false);
  };

  const fetchAll = async () => {
    setLoading(true);
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? "";

    if (!apiKey) {
      // Demo mode
      const sess = getMarketSession();
      setIndices(INDEX_CONFIG.map((cfg, i) => {
        const price = [5240.5, 18320.1, 183.2, 28.4, 91.3, 18.2][i];
        const extP  = price * (1 + [0.0031, -0.0018, 0.0055, 0.0008, -0.0012, 0.014][i]);
        const extCh = extP - price;
        return {
          symbol: cfg.symbol, label: cfg.label, color: cfg.color,
          value: price, change: [12.3,-45.2,1.1,-0.2,-0.8,0.5][i],
          changePct: [0.24,-0.25,0.61,-0.71,-0.87,2.83][i], prevClose: 0,
          sparkline: Array.from({length:20},(_,j)=>100+Math.sin(j*0.4+i)*5+Math.random()*2),
          extPrice: extP, extChange: extCh, extPct: (extCh/price)*100,
          extType: (sess==="open"||sess==="closed" ? "none" : sess) as "pre"|"after"|"none",
        };
      }));
      setNews(DEMO_NEWS);
      setMovers({ gainers: DEMO_GAINERS, losers: DEMO_LOSERS });
      setLastRefresh(new Date().toLocaleTimeString("th-TH"));
      setLoading(false);
      return;
    }

    try {
      const [indexResults, newsData, moversData] = await Promise.all([
        Promise.all(INDEX_CONFIG.map(async (cfg) => {
          const [q, candles] = await Promise.all([fetchQuote(cfg.symbol, apiKey), fetchCandles(cfg.symbol, apiKey)]);
          const sess = getMarketSession();
          // Finnhub quote: `o` = extended hours open price when available
          const extP  = Number(q.o || 0);  // best approximation available in free tier
          const price = Number(q.c || 0);
          const extCh = extP > 0 ? extP - price : 0;
          return {
            symbol: cfg.symbol, label: cfg.label, color: cfg.color,
            value: price, change: Number(q.d || 0), changePct: Number(q.dp || 0),
            prevClose: Number(q.pc || 0),
            sparkline: candles.length ? candles : [0],
            extPrice: extP, extChange: extCh,
            extPct: price > 0 && extP > 0 ? (extCh/price)*100 : 0,
            extType: (sess==="open"||sess==="closed" ? "none" : sess) as "pre"|"after"|"none",
          };
        })),
        fetchNews(apiKey),
        fetchTopMovers(apiKey),
      ]);
      setIndices(indexResults);
      setNews(newsData);
      setMovers(moversData);
    } catch (e) {
      console.error(e);
    }
    setLastRefresh(new Date().toLocaleTimeString("th-TH"));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const fearGreed = 62;
  const fearLabel = fearGreed > 75 ? "Extreme Greed" : fearGreed > 55 ? "Greed" : fearGreed > 45 ? "Neutral" : fearGreed > 25 ? "Fear" : "Extreme Fear";
  const fearColor = fearGreed > 75 ? "#10b981" : fearGreed > 55 ? "#69c36b" : fearGreed > 45 ? "#f59e0b" : fearGreed > 25 ? "#f97316" : "#ef4444";

  const displayMovers = moversTab === "gainers" ? movers.gainers : movers.losers;

  return (
    <>
    <style>{`
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes countUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes glowGreen {
    0%,100% { box-shadow: 0 0 0px #10b98100; }
    50%      { box-shadow: 0 0 18px #10b98144; }
  }
  @keyframes glowRed {
    0%,100% { box-shadow: 0 0 0px #ef444400; }
    50%      { box-shadow: 0 0 18px #ef444444; }
  }
  @keyframes pulse-green {
    0%,100% { opacity:1; }
    50%      { opacity:0.6; }
  }
  .fade-up { animation: fadeInUp 0.5s ease both; }
  .fade-up-1 { animation: fadeInUp 0.5s 0.05s ease both; }
  .fade-up-2 { animation: fadeInUp 0.5s 0.10s ease both; }
  .fade-up-3 { animation: fadeInUp 0.5s 0.15s ease both; }
  .fade-up-4 { animation: fadeInUp 0.5s 0.20s ease both; }
  .fade-up-5 { animation: fadeInUp 0.5s 0.25s ease both; }
  .glow-card:hover { box-shadow: 0 0 24px #ffffff0a, 0 0 1px #ffffff22; transform: translateY(-1px); transition: all 0.2s; }
  .ripple { position:relative; overflow:hidden; }
  .ripple:after { content:''; position:absolute; inset:0; background:radial-gradient(circle,#ffffff22 0%,transparent 70%); opacity:0; transition:opacity 0.3s; }
  .ripple:active:after { opacity:1; }
`}</style>
<main className="min-h-screen bg-[#0a0a0c] text-white" style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

      {/* ── Header ── */}
      <header className="border-b border-zinc-800/60 px-3 py-2 flex items-center justify-between bg-[#0d0d0f]/90 backdrop-blur sticky top-0 z-30">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-black font-black text-xs flex-shrink-0">T</div>
          <span className="font-bold text-sm tracking-tight hidden sm:block">TRUSH YOUR OWN</span>
        </div>

        {/* Clock — center on mobile */}
        <div className="flex-1 flex justify-center sm:justify-end sm:mr-4">
          <LiveClock />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={fetchAll} disabled={loading}
            className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors disabled:opacity-40"
            title="Refresh">
            <span className={loading ? "animate-spin inline-block" : ""}>{loading ? "⟳" : "⟳"}</span>
          </button>
          <CurrencyToggle currency={currency} rate={rate} lastUpdate={rateUpdate} onToggle={toggleCurrency} />
          <ThemeSwitcher />
        </div>
      </header>

      <div className="px-6 py-5 max-w-screen-2xl mx-auto space-y-4">

        {/* ── Quick Nav ── */}
        <div className="grid grid-cols-3 gap-2 fade-up">
          {[
            { href:"/portfolio", label:"พอร์ต", sub:"หุ้นของฉัน",   icon:"📊", grad:"from-yellow-400/20 to-yellow-400/5", border:"border-yellow-400/20 hover:border-yellow-400/50" },
            { href:"/chart",     label:"กราฟ",  sub:"TradingView",  icon:"📈", grad:"from-purple-400/20 to-purple-400/5", border:"border-purple-400/20 hover:border-purple-400/50" },
            { href:"/journal",   label:"Journal",sub:"XAUUSD",      icon:"📓", grad:"from-sky-400/20 to-sky-400/5",     border:"border-sky-400/20 hover:border-sky-400/50" },
          ].map(l=>(
            <Link key={l.label} href={l.href}
              className={`ripple glow-card relative flex flex-col items-center justify-center bg-gradient-to-br ${l.grad} border ${l.border} rounded-2xl p-3 transition-all group overflow-hidden min-h-[80px]`}>
              <div className="absolute -right-2 -top-2 text-5xl opacity-10 group-hover:opacity-20 transition-opacity select-none">{l.icon}</div>
              <span className="text-2xl mb-1">{l.icon}</span>
              <p className="font-black text-xs text-white text-center leading-tight">{l.label}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 text-center">{l.sub}</p>
            </Link>
          ))}
        </div>

        {/* ── Portfolio + Indices compact ── */}
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">

          {/* Portfolio Card — Hero */}
          <div className="relative bg-gradient-to-br from-[#141416] to-[#0d0d0f] border border-zinc-700/50 rounded-2xl p-5 overflow-hidden"
            style={{ boxShadow: portfolio.pl>=0 ? "0 0 40px #10b98118, 0 0 80px #10b98108" : "0 0 40px #ef444418, 0 0 80px #ef444408" }}>

            {/* Background glow orb */}
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: portfolio.pl>=0 ? "radial-gradient(circle,#10b98122,transparent 70%)" : "radial-gradient(circle,#ef444422,transparent 70%)" }}/>
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,#f0aa4f18,transparent 70%)" }}/>

            {/* Badge row */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">พอร์ตของฉัน</span>
              <div className="flex gap-1.5 ml-auto">
                {portfolio.plPct >= 20 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/30">
                    🏆 +20%
                  </span>
                )}
                {portfolio.dailyPL >= 0 && portfolio.dailyPct >= 2 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-400 border border-emerald-400/30">
                    🔥 Best Day
                  </span>
                )}
                {portfolio.pl > 0 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-400 border border-sky-400/30">
                    📈 ATH
                  </span>
                )}
              </div>
            </div>

            {/* Main value */}
            <p className="text-3xl font-black tracking-tight leading-none">
              {fmtMoney(portfolio.value)}
            </p>

            {/* Progress ring + Daily bar */}
            <div className="flex items-center gap-3 mt-3 mb-3">
              {/* Progress arc — % กำไรเทียบเป้า 30% */}
              <div className="relative flex-shrink-0">
                <svg width="52" height="52" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="22" fill="none" stroke="#27272a" strokeWidth="4"/>
                  <circle cx="26" cy="26" r="22" fill="none"
                    stroke={portfolio.pl>=0?"#10b981":"#ef4444"}
                    strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${Math.min(portfolio.plPct/30*138, 138)} 138`}
                    strokeDashoffset="34.5"
                    style={{ transition: "stroke-dasharray 1s ease" }}/>
                  <text x="26" y="30" textAnchor="middle" fontSize="9" fontWeight="bold"
                    fill={portfolio.pl>=0?"#10b981":"#ef4444"}>
                    {Math.abs(portfolio.plPct).toFixed(0)}%
                  </text>
                </svg>
              </div>

              {/* Mini sparkline */}
              <div className="flex-1">
                <svg viewBox="0 0 120 32" className="w-full h-8" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={portfolio.pl>=0?"#10b981":"#ef4444"} stopOpacity="0.4"/>
                      <stop offset="100%" stopColor={portfolio.pl>=0?"#10b981":"#ef4444"} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  {/* Simulated equity curve from pl% */}
                  {(() => {
                    const pts = [0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,portfolio.plPct].map((v,i,a) =>
                      `${(i/(a.length-1))*120},${32-Math.max(0,Math.min(v/Math.max(portfolio.plPct,1)*28,28))}`
                    );
                    const fill = `0,32 ${pts.join(" ")} 120,32`;
                    const color = portfolio.pl>=0?"#10b981":"#ef4444";
                    return <>
                      <polygon points={fill} fill="url(#sparkGrad)"/>
                      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
                    </>;
                  })()}
                </svg>
              </div>
            </div>

            {/* Daily bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
                <span>วันนี้</span>
                <span className={portfolio.dailyPL>=0?"text-sky-400":"text-orange-400"}>
                  {portfolio.dailyPL>=0?"+":""}{portfolio.dailyPct.toFixed(2)}%
                </span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min(Math.abs(portfolio.dailyPct)*10, 100)}%`,
                    background: portfolio.dailyPL>=0
                      ? "linear-gradient(90deg,#38bdf8,#10b981)"
                      : "linear-gradient(90deg,#f97316,#ef4444)"
                  }}/>
              </div>
            </div>

            {/* P/L stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/20 rounded-xl p-3 border border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 mb-0.5">กำไร/ขาดทุนรวม</p>
                <p className={`text-sm font-black ${portfolio.pl>=0?"text-emerald-400":"text-red-400"}`}>
                  {portfolio.pl>=0?"+":""}{fmtMoney(portfolio.pl)}
                </p>
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-zinc-800/50">
                <p className="text-[10px] text-zinc-500 mb-0.5">วันนี้</p>
                <p className={`text-sm font-black ${portfolio.dailyPL>=0?"text-sky-400":"text-orange-400"}`}>
                  {portfolio.dailyPL>=0?"+":""}{fmtMoney(portfolio.dailyPL)}
                </p>
                {portfolio.extType!=="none" && portfolio.extPL!==0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${portfolio.extType==="pre"?"bg-yellow-400/20 text-yellow-400":"bg-purple-400/20 text-purple-400"}`}>
                      {portfolio.extType==="pre"?"PRE":"AH"}
                    </span>
                    <span className={`text-[9px] font-bold ${portfolio.extPL>=0?"text-emerald-400":"text-red-400"}`}>
                      {portfolio.extPL>=0?"+":""}{fmtMoney(portfolio.extPL)} ({portfolio.extPct>=0?"+":""}{portfolio.extPct.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[10px] text-zinc-700 mt-2">{portfolio.count} หลักทรัพย์ · {lastRefresh}</p>
          </div>

          {/* Indices compact 6 chips */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 content-start">
            {(loading ? Array(6).fill(null) : indices).map((idx,i)=>{
              if(!idx) return <div key={i} className="bg-[#111113] border border-zinc-800 rounded-xl p-3 animate-pulse h-20"/>;
              const pos=idx.changePct>=0;
              const extPos=idx.extPct>=0;
              const hasExt=idx.extType!=="none"&&idx.extPrice>0;
              return (
                <div key={idx.symbol} className="glow-card bg-[#111113] border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition-all cursor-default">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{idx.label}</p>
                  <p className="text-xs font-mono font-black mt-0.5">{money(idx.value)}</p>
                  <p className={`text-[10px] font-bold mt-0.5 ${pos?"text-emerald-400":"text-red-400"}`}>
                    {pos?"▲":"▼"} {Math.abs(idx.changePct).toFixed(2)}%
                  </p>
                  {hasExt && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[9px] font-black px-1 rounded ${idx.extType==="pre"?"bg-yellow-400/20 text-yellow-400":"bg-purple-400/20 text-purple-400"}`}>
                        {idx.extType==="pre"?"PRE":"AH"}
                      </span>
                      <span className={`text-[9px] font-bold ${extPos?"text-emerald-400":"text-red-400"}`}>
                        {extPos?"+":""}{idx.extPct.toFixed(2)}%
                      </span>
                    </div>
                  )}
                  <div className="mt-1.5 h-0.5 rounded-full" style={{background:idx.color,opacity:0.4}}/>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Row 2: Sentiment + Top Movers ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Fear & Greed */}
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Fear & Greed Index</p>
            <div className="flex items-center justify-center mb-2">
              <svg viewBox="0 0 100 60" className="w-28">
                <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="#27272a" strokeWidth="8" strokeLinecap="round"/>
                <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={fearColor}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${fearGreed * 1.257} 200`} opacity="0.9"/>
                {(() => {
                  const ang = ((fearGreed / 100) * 180 - 180) * (Math.PI / 180);
                  return <line x1="50" y1="55" x2={50 + 28 * Math.cos(ang)} y2={55 + 28 * Math.sin(ang)} stroke="white" strokeWidth="1.5" strokeLinecap="round"/>;
                })()}
                <circle cx="50" cy="55" r="3" fill="white"/>
              </svg>
            </div>
            <p className="text-2xl font-black text-center" style={{ color: fearColor }}>{fearGreed}</p>
            <p className="text-xs text-center mt-1 font-medium" style={{ color: fearColor }}>{fearLabel}</p>
          </div>

          {/* Market Breadth */}
          <div className="bg-[#111113] border border-zinc-800 rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Market Breadth (S&P 500)</p>
            <BreadthBar up={312} down={188} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="bg-emerald-400/10 rounded-lg py-2">
                <p className="text-emerald-400 font-black text-lg">312</p>
                <p className="text-zinc-500 text-xs">ขึ้น</p>
              </div>
              <div className="bg-red-400/10 rounded-lg py-2">
                <p className="text-red-400 font-black text-lg">188</p>
                <p className="text-zinc-500 text-xs">ลง</p>
              </div>
            </div>
          </div>

          {/* TOP GAINERS / LOSERS */}
          <div className="bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden col-span-2">
            {/* Tab bar */}
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => setMoversTab("gainers")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  moversTab === "gainers"
                    ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}>
                🚀 Top 5 Gainers
              </button>
              <button
                onClick={() => setMoversTab("losers")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  moversTab === "losers"
                    ? "text-red-400 border-b-2 border-red-400 bg-red-400/5"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}>
                📉 Top 5 Losers
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 px-4 pt-2">S&P 500 + NASDAQ · วันนี้</p>
            <div className="divide-y divide-zinc-800/60">
              {(loading ? Array(5).fill(null) : displayMovers).map((m, i) => {
                if (!m) return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                    <div className="w-5 h-3 bg-zinc-800 rounded" />
                    <div className="w-12 h-3 bg-zinc-800 rounded" />
                    <div className="flex-1 h-3 bg-zinc-800 rounded" />
                    <div className="w-14 h-3 bg-zinc-800 rounded" />
                  </div>
                );
                const pos = m.changePct >= 0;
                return (
                  <div key={m.symbol} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/30 transition-colors">
                    <span className="text-xs text-zinc-600 w-4 font-mono">{i + 1}</span>
                    <span className="font-black text-sm w-14">{m.symbol}</span>
                    <span className="text-xs text-zinc-400 flex-1 font-mono">${money(m.price)}</span>
                    <span className={`text-xs font-bold w-16 text-right ${pos ? "text-emerald-400" : "text-red-400"}`}>
                      {pos ? "+" : ""}{money(m.change)}
                    </span>
                    <span className={`text-xs font-black px-2 py-0.5 rounded w-18 text-center ${
                      pos ? "bg-emerald-400/10 text-emerald-400" : "bg-red-400/10 text-red-400"
                    }`}>
                      {pos ? "▲" : "▼"}{Math.abs(m.changePct).toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Row 3: AI + News + Calendar ── */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-5">

          <div className="flex flex-col gap-4">
          {/* AI Analysis Box */}
          <div className="bg-gradient-to-br from-[#0f0f1a] to-[#0a0a0c] border border-purple-900/40 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-purple-900/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <p className="text-sm font-bold text-purple-300">AI วิเคราะห์พอร์ต</p>
                <span className="text-[10px] bg-purple-400/10 text-purple-400 px-2 py-0.5 rounded-full font-bold">Claude AI</span>
              </div>
              <button onClick={fetchAI} disabled={aiLoading}
                className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
                {aiLoading ? <><span className="animate-spin">⟳</span> กำลังวิเคราะห์...</> : "✨ วิเคราะห์"}
              </button>
            </div>
            <div className="px-4 py-3">
              {aiAnalysis ? (
                <>
                  <p className={`text-sm text-zinc-300 leading-relaxed whitespace-pre-line ${!aiExpanded ? "line-clamp-3" : ""}`}>
                    {aiAnalysis}
                  </p>
                  {aiAnalysis.length > 150 && (
                    <button onClick={()=>setAiExpanded(!aiExpanded)}
                      className="text-xs text-purple-400 hover:text-purple-300 mt-1.5 transition-colors">
                      {aiExpanded ? "ย่อลง ▲" : "ดูเพิ่มเติม ▼"}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-zinc-600 py-1">กด "✨ วิเคราะห์" เพื่อให้ AI ดูพอร์ตและแนะนำครับ</p>
              )}
            </div>
          </div>

          {/* News ภาษาไทย */}
          <div className="bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">ข่าวหุ้นในพอร์ต</p>
                <span className="text-[10px] bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">Portfolio News</span>
              </div>
              <span className="text-xs text-zinc-600">{lastRefresh}</span>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {(news.length === 0 ? DEMO_NEWS : news).slice(0, 4).map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                  className="block px-5 py-3.5 hover:bg-zinc-800/30 transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    {n.ticker && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 flex-shrink-0">
                        {n.ticker}
                      </span>
                    )}
                    <p className="text-xs text-zinc-500 truncate">{n.source} · {n.time}</p>
                  </div>
                  <p className="text-sm text-zinc-100 font-medium leading-snug line-clamp-2 group-hover:text-white">
                    {n.headline}
                  </p>
                </a>
              ))}
            </div>
          </div>
          </div>{/* end left col */}

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Sector Performance */}
            <div className="bg-[#111113] border border-zinc-800 rounded-xl p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Sector Performance</p>
              <div className="space-y-1.5">
                {[
                  { name: "Technology", pct: 1.42 },
                  { name: "Healthcare", pct: 0.38 },
                  { name: "Financials", pct: -0.21 },
                  { name: "Energy",     pct: -1.05 },
                  { name: "Consumer",   pct: 0.71 },
                ].map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <p className="text-xs text-zinc-400 w-20 truncate">{s.name}</p>
                    <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full rounded flex items-center justify-end pr-1"
                        style={{
                          width: `${Math.min(Math.abs(s.pct) * 40 + 20, 100)}%`,
                          background: s.pct >= 0 ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
                        }}>
                        <span className="text-[10px] font-bold text-white">{s.pct > 0 ? "+" : ""}{s.pct}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Economic Calendar */}
            <div className="bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800">
                <p className="text-xs font-bold text-zinc-300">📅 Economic Calendar</p>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {[
                  { date: "พรุ่งนี้", event: "CPI (US)",          impact: "high" },
                  { date: "พรุ่งนี้", event: "Core CPI",          impact: "high" },
                  { date: "พฤ.",      event: "PPI",                impact: "med"  },
                  { date: "พฤ.",      event: "Jobless Claims",     impact: "med"  },
                  { date: "ศ.",       event: "Retail Sales",       impact: "high" },
                  { date: "ศ.",       event: "Consumer Sentiment", impact: "low"  },
                ].map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-xs text-zinc-600 w-12">{e.date}</span>
                    <span className="text-xs text-zinc-300 flex-1">{e.event}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      e.impact === "high" ? "bg-red-400" : e.impact === "med" ? "bg-yellow-400" : "bg-zinc-600"
                    }`} />
                  </div>
                ))}
              </div>
            </div>


          </div>
        </div>

        <footer className="text-center text-xs text-zinc-700 pb-4">
          TRUSH YOUR OWN · ข้อมูลจาก Finnhub · ไม่ใช่คำแนะนำการลงทุน
        </footer>
      </div>
    </main>
    </>
  );
}
