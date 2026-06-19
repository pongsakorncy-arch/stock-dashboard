"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
    <div className="text-right">
      <p className="text-2xl font-mono font-bold tracking-widest">{time}</p>
      <p className="text-xs text-zinc-400 mt-0.5">{session}</p>
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

async function fetchNews(key: string): Promise<NewsItem[]> {
  const r = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`);
  const data = await r.json();
  const raw = (Array.isArray(data) ? data : []).slice(0, 8);
  return raw.map((n: any) => ({
    headline: n.headline,
    headlineTh: n.headline, // ภาษาอังกฤษก่อน
    source: n.source,
    time: new Date(n.datetime * 1000).toLocaleString("th-TH", {
      hour: "2-digit", minute: "2-digit", month: "short", day: "numeric",
    }),
    url: n.url,
  }));
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
    value: 0, pl: 0, plPct: 0, dailyPL: 0, dailyPct: 0, count: 0,
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

      setSnap({ value: marketValue, pl, plPct, dailyPL, dailyPct, count: positions.length });
    } catch {}
  }, []);
  return snap;
}

// ─── Demo data ────────────────────────────────────────────────────────────────
const DEMO_NEWS: NewsItem[] = [
  { headline: "Fed holds rates steady, signals 2 cuts in 2025", headlineTh: "เฟดคงอัตราดอกเบี้ย พร้อมส่งสัญญาณลดดอกเบี้ย 2 ครั้งในปี 2025", source: "Reuters", time: "2ชม.ที่แล้ว", url: "#" },
  { headline: "NVIDIA announces next-gen Blackwell Ultra chip", headlineTh: "NVIDIA เปิดตัวชิป Blackwell Ultra รุ่นใหม่ล่าสุด", source: "Bloomberg", time: "3ชม.ที่แล้ว", url: "#" },
  { headline: "Apple Vision Pro 2 launch reportedly pushed to 2026", headlineTh: "รายงานชี้ Apple Vision Pro 2 เลื่อนเปิดตัวไปปี 2026", source: "WSJ", time: "5ชม.ที่แล้ว", url: "#" },
  { headline: "Oil prices slip amid global demand concerns", headlineTh: "ราคาน้ำมันร่วงลงท่ามกลางความกังวลความต้องการพลังงานโลก", source: "FT", time: "6ชม.ที่แล้ว", url: "#" },
  { headline: "Strong jobs report keeps rate-cut hopes alive", headlineTh: "ตัวเลขการจ้างงานแข็งแกร่ง ยังมีความหวังเฟดลดดอกเบี้ย", source: "CNBC", time: "8ชม.ที่แล้ว", url: "#" },
  { headline: "Microsoft Azure revenue beats estimates by 3%", headlineTh: "รายได้ Azure ของ Microsoft เกินคาดการณ์ 3%", source: "Seeking Alpha", time: "9ชม.ที่แล้ว", url: "#" },
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
  const portfolio = usePortfolioSnapshot();

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
    <main className="min-h-screen bg-[#0a0a0c] text-white" style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

      {/* ── Header ── */}
      <header className="border-b border-zinc-800/60 px-6 py-3 flex items-center justify-between bg-[#0d0d0f]/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-black font-black text-xs">T</div>
          <div>
            <span className="font-bold text-sm tracking-tight">TRUSH YOUR OWN</span>
            <span className="ml-2 text-xs text-zinc-600">Dashboard</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <LiveClock />
          <button onClick={fetchAll} disabled={loading}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg font-medium transition-colors disabled:opacity-40">
            {loading ? "⟳ Loading..." : "⟳ Refresh"}
          </button>

        </div>
      </header>

      <div className="px-6 py-5 max-w-screen-2xl mx-auto space-y-4">

        {/* ── Quick Nav ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { href:"/portfolio", label:"พอร์ตโฟลิโอ", sub:"หุ้นของฉัน",   icon:"📊", grad:"from-yellow-400/20 to-yellow-400/5", border:"border-yellow-400/20 hover:border-yellow-400/50" },
            { href:"/chart",     label:"กราฟ",         sub:"TradingView",  icon:"📈", grad:"from-purple-400/20 to-purple-400/5", border:"border-purple-400/20 hover:border-purple-400/50" },
            { href:"/journal",   label:"Journal",       sub:"XAUUSD Trade", icon:"📓", grad:"from-sky-400/20 to-sky-400/5",     border:"border-sky-400/20 hover:border-sky-400/50" },
          ].map(l=>(
            <Link key={l.label} href={l.href}
              className={`relative flex items-center gap-3 bg-gradient-to-br ${l.grad} border ${l.border} rounded-2xl px-5 py-4 transition-all group overflow-hidden`}>
              <div className="absolute -right-2 -top-2 text-5xl opacity-10 group-hover:opacity-20 transition-opacity select-none">{l.icon}</div>
              <span className="text-3xl">{l.icon}</span>
              <div>
                <p className="font-black text-base text-white">{l.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{l.sub}</p>
              </div>
              <span className="ml-auto text-zinc-600 group-hover:text-zinc-300 transition-colors">→</span>
            </Link>
          ))}
        </div>

        {/* ── Portfolio + Indices compact ── */}
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">

          {/* Portfolio Card */}
          <div className="relative bg-[#111113] border border-zinc-800 rounded-2xl p-5 overflow-hidden">
            <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-10"
              style={{ background:"radial-gradient(circle,#f0aa4f,transparent)" }}/>
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">พอร์ตของฉัน</p>
            <p className="text-3xl font-black tracking-tight">${money(portfolio.value)}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="bg-[#0d0d0f] rounded-xl p-3">
                <p className="text-[10px] text-zinc-600 mb-0.5">กำไร/ขาดทุนรวม</p>
                <p className={`text-sm font-black ${portfolio.pl>=0?"text-emerald-400":"text-red-400"}`}>
                  {portfolio.pl>=0?"+":""}{money(portfolio.pl)}
                </p>
                <p className={`text-[10px] font-bold ${portfolio.pl>=0?"text-emerald-400":"text-red-400"}`}>
                  {portfolio.pl>=0?"▲":"▼"} {Math.abs(portfolio.plPct).toFixed(2)}%
                </p>
              </div>
              <div className="bg-[#0d0d0f] rounded-xl p-3">
                <p className="text-[10px] text-zinc-600 mb-0.5">วันนี้</p>
                <p className={`text-sm font-black ${portfolio.dailyPL>=0?"text-sky-400":"text-orange-400"}`}>
                  {portfolio.dailyPL>=0?"+":""}{money(portfolio.dailyPL)}
                </p>
                <p className={`text-[10px] font-bold ${portfolio.dailyPL>=0?"text-sky-400":"text-orange-400"}`}>
                  {portfolio.dailyPL>=0?"▲":"▼"} {Math.abs(portfolio.dailyPct).toFixed(2)}%
                </p>
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
                <div key={idx.symbol} className="bg-[#111113] border border-zinc-800 rounded-xl p-3 hover:border-zinc-600 transition-colors">
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

        {/* ── Row 3: News (TH) + Calendar + Sectors + Key Levels ── */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-5">

          {/* News ภาษาไทย */}
          <div className="bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">ข่าวตลาดวันนี้</p>
                <span className="text-[10px] bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full font-bold">ภาษาไทย</span>
              </div>
              <span className="text-xs text-zinc-600">{lastRefresh}</span>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {(news.length === 0 ? DEMO_NEWS : news).map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                  className="block px-5 py-3.5 hover:bg-zinc-800/30 transition-colors group">
                  {/* Thai headline prominent */}
                  <p className="text-sm text-zinc-100 font-medium leading-snug line-clamp-2 group-hover:text-white">
                    {n.headlineTh}
                  </p>
                  {/* English sub */}
                  <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">{n.headline}</p>
                  <p className="text-xs text-zinc-700 mt-1">{n.source} · {n.time}</p>
                </a>
              ))}
            </div>
          </div>

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
  );
}
