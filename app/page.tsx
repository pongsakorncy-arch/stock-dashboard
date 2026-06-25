"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import CurrencyToggle from "@/components/CurrencyToggle";
import { useCurrency } from "@/hooks/useCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────
type IndexData = {
  symbol: string;
  label: string;
  etf?: string;
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

// แปลงชุดจุดเป็นเส้นโค้งเนียน (Catmull-Rom → cubic bezier)
function smoothLine(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  if (pts.length === 2) return `M ${pts[0][0]},${pts[0][1]} L ${pts[1][0]},${pts[1][1]}`;
  const d = [`M ${pts[0][0]},${pts[0][1]}`];
  const t = 0.18; // ความเนียน
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d.push(`C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
  }
  return d.join(" ");
}

// Count-up animation hook (นับเลขวิ่ง)
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const start = fromRef.current;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(start + (target - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const n = clamp(data);
  const W = 80, H = 32;
  const pts: [number, number][] = n.map((v, i) => [(i / (n.length - 1)) * W, H - v * H]);
  const line = smoothLine(pts);
  const area = `${line} L ${W},${H} L 0,${H} Z`;
  const id = `g${color.replace("#", "")}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
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
      <div className="flex-1 h-2 bg-[var(--fill)] rounded-full overflow-hidden flex">
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
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    // เวลาเปิด-ปิดตลาดสหรัฐฯ (ใช้ EDT = UTC-4 แบบประมาณ)
    const OPEN = 9.5 * 3600, CLOSE = 16 * 3600; // วินาทีในวัน (ET)
    const fmt = (s: number) => {
      s = Math.max(0, Math.floor(s));
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    };
    const secsToNextOpen = (day: number, sod: number) => {
      if (day >= 1 && day <= 5 && sod < OPEN) return OPEN - sod;
      for (let i = 1; i <= 4; i++) {
        const nd = (day + i) % 7;
        if (nd >= 1 && nd <= 5) return (OPEN - sod) + i * 86400;
      }
      return (OPEN - sod) + 86400;
    };
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      // เวลา ET (เลื่อน UTC -4 ชม.)
      const et = new Date(now.getTime() - 4 * 3600 * 1000);
      const day = et.getUTCDay();
      const sod = et.getUTCHours() * 3600 + et.getUTCMinutes() * 60 + et.getUTCSeconds();
      const edtMin = sod / 60;
      const isOpen = day >= 1 && day <= 5 && sod >= OPEN && sod < CLOSE;
      if (day === 0 || day === 6) setSession("ตลาดปิด (Weekend)");
      else if (isOpen) setSession("🟢 ตลาด US เปิด");
      else if (edtMin >= 240 && edtMin < 570) setSession("🟡 Pre-Market");
      else if (edtMin >= 960 && edtMin < 1200) setSession("🟡 After-Hours");
      else setSession("🔴 ตลาด US ปิด");
      // นับถอยหลัง
      if (isOpen) setCountdown(`ปิดใน ${fmt(CLOSE - sod)}`);
      else setCountdown(`เปิดใน ${fmt(secsToNextOpen(day, sod))}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-center sm:text-right">
      <p className="text-lg sm:text-2xl font-mono font-bold tracking-widest leading-tight">{time}</p>
      <div className="flex items-center gap-1.5 justify-center sm:justify-end leading-tight">
        <span className="text-[10px] sm:text-xs text-[var(--tx-3)]">{session}</span>
        {countdown && (
          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-[var(--tx-4)] bg-[var(--fill)] px-1.5 py-0.5 rounded tabular-nums">
            {countdown}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchQuote(sym: string, key: string) {
  // Use crypto quote for BTC
  const endpoint = sym.includes(":")
    ? `https://finnhub.io/api/v1/crypto/candle?symbol=${sym}&resolution=D&from=${Math.floor(Date.now()/1000)-86400}&to=${Math.floor(Date.now()/1000)}&token=${key}`
    : `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`;
  try {
    const r = await fetch(endpoint);
    const d = await r.json();
    if (sym.includes(":")) {
      // crypto candle returns c[] array
      const closes = Array.isArray(d.c) ? d.c : [];
      const c = closes[closes.length-1] || 0;
      const pc = closes[closes.length-2] || c;
      return { c, d: c-pc, dp: pc>0?((c-pc)/pc)*100:0, pc, o: 0 };
    }
    return d;
  } catch { return { c:0, d:0, dp:0, pc:0, o:0 }; }
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
  // Use crypto endpoint for BTC
  const endpoint = sym.includes(":")
    ? `https://finnhub.io/api/v1/crypto/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${key}`
    : `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${key}`;
  try {
    const r = await fetch(endpoint);
    const d = await r.json();
    return Array.isArray(d.c) ? d.c.slice(-20) : [];
  } catch { return []; }
}

// หุ้นในพอร์ต
const PORTFOLIO_TICKERS = [
  "GOOGL","AMZN","ASML","MSFT","META","NVDA","RBRK",
  "ALAB","NVO","NFLX","AMD","SOFI","PLTR","IONQ",
  "TSM","UBER","RKLB","CRWD","TMDX"
];

// Sector ETFs (SPDR) สำหรับ Sector Performance
const SECTOR_ETFS: { name: string; sym: string }[] = [
  { name: "Technology", sym: "XLK" },
  { name: "Healthcare", sym: "XLV" },
  { name: "Financials", sym: "XLF" },
  { name: "Energy",     sym: "XLE" },
  { name: "Consumer",   sym: "XLY" },
];

async function fetchSectors(key: string): Promise<{ name: string; pct: number }[]> {
  if (!key) return [];
  const results = await Promise.allSettled(
    SECTOR_ETFS.map(async (s) => {
      const q = await fetchQuote(s.sym, key);
      return { name: s.name, pct: Number((q as any)?.dp ?? 0) };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{name:string;pct:number}> => r.status === "fulfilled")
    .map((r) => r.value);
}

// BTC จาก CoinGecko (ฟรี ไม่ต้องใช้ key, รองรับ CORS)
async function fetchBTC(): Promise<{ c:number; d:number; dp:number; pc:number; o:number }> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true");
    const d = await r.json();
    const c  = Number(d?.bitcoin?.usd ?? 0);
    const dp = Number(d?.bitcoin?.usd_24h_change ?? 0);
    const pc = dp !== -100 ? c / (1 + dp / 100) : c;
    return { c, d: c - pc, dp, pc, o: 0 };
  } catch { return { c:0, d:0, dp:0, pc:0, o:0 }; }
}

async function fetchFearGreed(): Promise<{value:number;label:string}> {
  try {
    // CNN Stock-Market Fear & Greed (ผ่าน API route ฝั่ง server)
    const r = await fetch("/api/fear-greed");
    const d = await r.json();
    const val = Number(d?.value ?? 50);
    const label = d?.label || "Neutral";
    return { value: isNaN(val) ? 50 : val, label };
  } catch { return { value: 50, label: "Neutral" }; }
}

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
// หมายเหตุ: Finnhub free ไม่มีค่า index จริง (เช่น S&P 6,000 จุด) จึงใช้ราคา ETF ที่ track ดัชนีนั้นแทน
// (% การเปลี่ยนแปลงตรงกับดัชนีจริง) — แสดง ticker ETF กำกับไว้ให้ตัวเลขไม่งง
const INDEX_CONFIG = [
  { symbol: "SPY",  etf: "SPY", label: "S&P 500", color: "#4f7df3" },
  { symbol: "QQQ",  etf: "QQQ", label: "NASDAQ",  color: "#a78bfa" },
  { symbol: "UUP",  etf: "UUP", label: "USD (DXY)", color: "#69c36b" },
  { symbol: "TLT",  etf: "TLT", label: "Bonds",   color: "#06b6d4" },
  { symbol: "GLD",  etf: "GLD", label: "GOLD",    color: "#f0aa4f" },
  { symbol: "BTC",  etf: "",    label: "BTC",     color: "#f7931a" },
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

// ─── Economic Calendar (recurring-schedule estimate) ───────────────────────────
// หมายเหตุ: คำนวณวันโดยประมาณจากรอบการประกาศจริงของสหรัฐฯ (อาจคลาดเคลื่อน ±1-2 วัน
// เพราะ BLS/Fed กำหนดวันเอง) — Jobless Claims/Jobs Report แม่นยำ, ตัวอื่นเป็นค่าประมาณ
type EconEvent = { date: Date; event: string; impact: "high"|"med"|"low" };

function getEconomicEvents(): EconEvent[] {
  const now = new Date();
  const events: EconEvent[] = [];

  // หา weekday ลำดับที่ n ของเดือน (weekday: 0=อา..6=ส, n เริ่มที่ 1)
  const nthWeekday = (y: number, m: number, weekday: number, n: number): Date | null => {
    const d = new Date(y, m, 1);
    let count = 0;
    while (d.getMonth() === m) {
      if (d.getDay() === weekday) { count++; if (count === n) return new Date(d); }
      d.setDate(d.getDate() + 1);
    }
    return null;
  };
  // หาวัน weekday ถัดไป (รวมวันนี้)
  const nextWeekday = (from: Date, weekday: number): Date => {
    const d = new Date(from);
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
    return d;
  };

  // เดือนนี้ + เดือนหน้า (กันช่วงรอยต่อสิ้นเดือน)
  for (let mOff = 0; mOff <= 1; mOff++) {
    const base = new Date(now.getFullYear(), now.getMonth() + mOff, 1);
    const y = base.getFullYear(), m = base.getMonth();

    const nfp = nthWeekday(y, m, 5, 1);              // ศุกร์แรก = Jobs Report
    if (nfp) events.push({ date: nfp, event: "Jobs Report (NFP)", impact: "high" });

    events.push({ date: new Date(y, m, 12), event: "CPI (US)",   impact: "high" });
    events.push({ date: new Date(y, m, 12), event: "Core CPI",   impact: "high" });
    events.push({ date: new Date(y, m, 13), event: "PPI",        impact: "med"  });
    events.push({ date: new Date(y, m, 15), event: "Retail Sales", impact: "high" });

    const cs = nthWeekday(y, m, 5, 2);               // ศุกร์ที่ 2 = Consumer Sentiment
    if (cs) events.push({ date: cs, event: "Consumer Sentiment", impact: "low" });
  }

  // Jobless Claims = ทุกพฤหัส (4 สัปดาห์ข้างหน้า)
  const thu = nextWeekday(now, 4);
  for (let i = 0; i < 4; i++) {
    events.push({ date: new Date(thu), event: "Jobless Claims", impact: "med" });
    thu.setDate(thu.getDate() + 7);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return events
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);
}

function fmtEventDate(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff < 7) return ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."][d.getDay()];
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Home() {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [movers, setMovers] = useState<{ gainers: Mover[]; losers: Mover[] }>({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState("-");
  const [moversTab, setMoversTab] = useState<"gainers" | "losers">("gainers");
  const [fearGreedData, setFearGreedData] = useState<{value:number;label:string}>({value:50,label:"Neutral"});
  const [sectorData, setSectorData] = useState<{name:string;pct:number}[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const portfolio = usePortfolioSnapshot();
  const animatedValue = useCountUp(portfolio.value);
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

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      setAiAnalysis(data.text || "ไม่สามารถวิเคราะห์ได้ในขณะนี้");
    } catch {
      setAiAnalysis("ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้");
    }
    setAiLoading(false);
  };

  const fetchAll = async (silent = false) => {
    if (!silent) setLoading(true);
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? "";

    if (!apiKey) {
      // Demo mode
      const sess = getMarketSession();
      setIndices(INDEX_CONFIG.map((cfg, i) => {
        const price = [5240.5, 18320.1, 183.2, 28.4, 91.3, 18.2][i];
        const extP  = price * (1 + [0.0031, -0.0018, 0.0055, 0.0008, -0.0012, 0.014][i]);
        const extCh = extP - price;
        return {
          symbol: cfg.symbol, label: cfg.label, etf: cfg.etf, color: cfg.color,
          value: price, change: [12.3,-45.2,1.1,-0.2,-0.8,0.5][i],
          changePct: [0.24,-0.25,0.61,-0.71,-0.87,2.83][i], prevClose: 0,
          sparkline: Array.from({length:20},(_,j)=>100+Math.sin(j*0.4+i)*5+Math.random()*2),
          extPrice: extP, extChange: extCh, extPct: (extCh/price)*100,
          extType: (sess==="open"||sess==="closed" ? "none" : sess) as "pre"|"after"|"none",
        };
      }));
      setNews(DEMO_NEWS);
      setMovers({ gainers: DEMO_GAINERS, losers: DEMO_LOSERS });
      fetchFearGreed().then(setFearGreedData);
      setLastRefresh(new Date().toLocaleTimeString("th-TH"));
      setLoading(false);
      return;
    }

    try {
      const [indexResults, newsData, moversData, fgData, sectorResults] = await Promise.all([
        Promise.all(INDEX_CONFIG.map(async (cfg) => {
          const isBTC = cfg.symbol === "BTC";
          const q = isBTC ? await fetchBTC() : await fetchQuote(cfg.symbol, apiKey);
          const sess = getMarketSession();
          const extP  = isBTC ? 0 : Number(q.o || 0);
          const price = Number(q.c || 0);
          const pc    = Number(q.pc || 0);
          const extCh = extP > 0 ? extP - price : 0;
          // Generate sparkline from price change (simulated 20 points)
          const change = Number(q.dp || 0);
          const sparkline = Array.from({length:20},(_,i) => {
            const progress = i / 19;
            return pc * (1 + (change/100) * progress * (0.5 + Math.sin(i*0.8)*0.5));
          });
          return {
            symbol: cfg.symbol, label: cfg.label, etf: cfg.etf, color: cfg.color,
            value: price, change: Number(q.d || 0), changePct: Number(q.dp || 0),
            prevClose: pc,
            sparkline,
            extPrice: extP, extChange: extCh,
            extPct: price > 0 && extP > 0 ? (extCh/price)*100 : 0,
            extType: (isBTC || sess==="open" || sess==="closed" ? "none" : sess) as "pre"|"after"|"none",
          };
        })),
        fetchNews(apiKey),
        fetchTopMovers(apiKey),
        fetchFearGreed(),
        fetchSectors(apiKey),
      ]);
      setIndices(indexResults);
      setNews(newsData);
      setMovers(moversData);
      setFearGreedData(fgData);
      if (sectorResults.length) setSectorData(sectorResults);
    } catch (e) {
      console.error(e);
    }
    setLastRefresh(new Date().toLocaleTimeString("th-TH"));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(() => fetchAll(true), 60000);
    return () => clearInterval(id);
  }, []);

  const fearGreed = fearGreedData.value;
  const fearLabel = fearGreedData.label;
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
  .quick-card { transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s ease, border-color .3s ease; }
  .quick-card:hover { transform: translateY(-3px); box-shadow: 0 16px 32px -16px var(--qc, #ffffff55); }
  .quick-card:active { transform: translateY(-1px) scale(.98); }
  .ripple { position:relative; overflow:hidden; }
  .ripple:after { content:''; position:absolute; inset:0; background:radial-gradient(circle,#ffffff22 0%,transparent 70%); opacity:0; transition:opacity 0.3s; }
  .ripple:active:after { opacity:1; }
`}</style>
<main className="min-h-screen bg-[var(--bg)] text-[var(--tx)]" style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

      {/* ── Header ── */}
      <header className="border-b border-[var(--border)] px-3 py-2 flex items-center justify-between bg-[var(--bg)]/90 backdrop-blur sticky top-0 z-30">
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
            className="w-8 h-8 flex items-center justify-center bg-[var(--fill)] hover:bg-[var(--fill-strong)] rounded-lg text-sm transition-colors disabled:opacity-40"
            title="Refresh">
            <span className={loading ? "animate-spin inline-block" : ""}>{loading ? "⟳" : "⟳"}</span>
          </button>
          <CurrencyToggle currency={currency} rate={rate} lastUpdate={rateUpdate} onToggle={toggleCurrency} />
          <ThemeToggle />
        </div>
      </header>

      <div className="px-6 py-5 max-w-screen-2xl mx-auto space-y-4">

        {/* ── Quick Nav ── */}
        <div className="grid grid-cols-3 gap-2.5 fade-up">
          {[
            { href:"/portfolio", label:"พอร์ต",  sub:"หุ้นของฉัน",  icon:"📊", accent:"#f59e0b" },
            { href:"/chart",     label:"กราฟ",   sub:"TradingView", icon:"📈", accent:"#a78bfa" },
            { href:"/journal",   label:"Journal", sub:"XAUUSD",      icon:"📓", accent:"#38bdf8" },
          ].map(l=>(
            <Link key={l.label} href={l.href}
              className="quick-card group relative flex flex-col items-center justify-center rounded-2xl p-3.5 min-h-[104px] overflow-hidden border transition-all"
              style={{
                ["--qc" as any]: `${l.accent}66`,
                borderColor: `${l.accent}33`,
                background: `linear-gradient(160deg, ${l.accent}22, ${l.accent}0a 45%, transparent)`,
              }}>
              {/* corner glow */}
              <div className="absolute -right-6 -top-6 w-20 h-20 rounded-full blur-2xl opacity-40 group-hover:opacity-75 transition-opacity duration-300 pointer-events-none"
                style={{ background: l.accent }}/>
              {/* big faint icon */}
              <div className="absolute -right-1 -bottom-2 text-4xl opacity-[0.08] group-hover:opacity-[0.14] transition-opacity duration-300 select-none -rotate-12 pointer-events-none">{l.icon}</div>
              {/* icon chip */}
              <div className="relative mb-2 w-11 h-11 rounded-xl flex items-center justify-center text-xl transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-0.5"
                style={{ background: `${l.accent}26`, boxShadow: `inset 0 0 0 1px ${l.accent}44` }}>
                {l.icon}
              </div>
              <p className="font-black text-xs text-[var(--tx)] text-center leading-tight relative">{l.label}</p>
              <p className="text-[10px] text-[var(--tx-4)] mt-0.5 text-center relative">{l.sub}</p>
              {/* arrow hint */}
              <span className="absolute top-2.5 right-3 text-xs font-black opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                style={{ color: l.accent }}>→</span>
            </Link>
          ))}
        </div>

        {/* ── Portfolio + Indices compact ── */}
        <div className="grid lg:grid-cols-[320px_1fr] gap-4">

          {/* Portfolio Card — Hero */}
          <div className="relative bg-gradient-to-br from-[#141416] to-[#0d0d0f] border border-[var(--border-2)] rounded-2xl p-5 overflow-hidden text-[#fff]"
            style={{ boxShadow: portfolio.pl>=0 ? "0 0 40px #10b98118, 0 0 80px #10b98108" : "0 0 40px #ef444418, 0 0 80px #ef444408" }}>

            {/* Background glow orb */}
            <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: portfolio.pl>=0 ? "radial-gradient(circle,#10b98122,transparent 70%)" : "radial-gradient(circle,#ef444422,transparent 70%)" }}/>
            <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle,#f0aa4f18,transparent 70%)" }}/>

            {/* Badge row */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] text-[var(--tx-4)] uppercase tracking-widest">พอร์ตของฉัน</span>
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
            <p className="text-3xl font-black tracking-tight leading-none tabular-nums">
              {fmtMoney(animatedValue)}
            </p>

            {/* Progress ring + Daily bar */}
            <div className="flex items-center gap-3 mt-3 mb-3">
              {/* Progress arc — % กำไรเทียบเป้า 30% */}
              <div className="relative flex-shrink-0">
                <svg width="52" height="52" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="4"/>
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
                  {/* Simulated equity curve from pl% (เส้นโค้งเนียน) */}
                  {(() => {
                    const raw = [0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,portfolio.plPct];
                    const pts: [number, number][] = raw.map((v,i,a)=>[
                      (i/(a.length-1))*120,
                      32 - Math.max(0, Math.min(v/Math.max(portfolio.plPct,1)*28, 28))
                    ]);
                    const line = smoothLine(pts);
                    return (
                      <>
                        <path d={`${line} L 120,32 L 0,32 Z`} fill="url(#sparkGrad)"/>
                        <path d={line} fill="none" stroke={portfolio.pl>=0?"#10b981":"#ef4444"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
                      </>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Daily bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-[var(--tx-5)] mb-1">
                <span>วันนี้</span>
                <span className={portfolio.dailyPL>=0?"text-sky-400":"text-orange-400"}>
                  {portfolio.dailyPL>=0?"+":""}{portfolio.dailyPct.toFixed(2)}%
                </span>
              </div>
              <div className="h-1 bg-[var(--fill)] rounded-full overflow-hidden">
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
              <div className="bg-black/20 rounded-xl p-3 border border-[var(--border)]">
                <p className="text-[10px] text-[var(--tx-4)] mb-0.5">กำไร/ขาดทุนรวม</p>
                <p className={`text-sm font-black ${portfolio.pl>=0?"text-emerald-400":"text-red-400"}`}>
                  {portfolio.pl>=0?"+":""}{fmtMoney(portfolio.pl)}
                </p>
              </div>
              <div className="bg-black/20 rounded-xl p-3 border border-[var(--border)]">
                <p className="text-[10px] text-[var(--tx-4)] mb-0.5">วันนี้</p>
                <p className={`text-sm font-black ${portfolio.dailyPL>=0?"text-sky-400":"text-orange-400"}`}>
                  {portfolio.dailyPL>=0?"+":""}{fmtMoney(portfolio.dailyPL)}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-[var(--tx-6)] mt-2">{portfolio.count} หลักทรัพย์ · {lastRefresh}</p>
          </div>

          {/* Indices compact 6 chips */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 content-start">
            {(loading ? Array(6).fill(null) : indices).map((idx,i)=>{
              if(!idx) return <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 animate-pulse h-20"/>;
              const pos=idx.changePct>=0;
              return (
                <div key={idx.symbol} className="glow-card relative overflow-hidden bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--border-2)] transition-all cursor-default">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] text-[var(--tx-4)] uppercase tracking-wider truncate">{idx.label}</p>
                    {idx.etf && <span className="text-[8px] font-bold text-[var(--tx-5)] bg-[var(--fill)] px-1 py-0.5 rounded flex-shrink-0">{idx.etf}</span>}
                  </div>
                  <p className="text-xs font-mono font-black mt-0.5 tabular-nums">{money(idx.value)}</p>
                  <p className={`text-[10px] font-bold mt-0.5 ${pos?"text-emerald-400":"text-red-400"}`}>
                    {pos?"▲":"▼"} {Math.abs(idx.changePct).toFixed(2)}%
                  </p>
                  {/* Mini sparkline */}
                  {idx.sparkline.length > 1 && (
                    <div className="mt-1.5">
                      <Sparkline data={idx.sparkline} color={pos?idx.color:"#ef4444"}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Row 2: Sentiment + Top Movers ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Fear & Greed */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
            <p className="text-[10px] text-[var(--tx-4)] uppercase tracking-wider mb-2">Fear & Greed Index</p>
            <div className="flex items-center justify-center mb-2">
              <svg viewBox="0 0 100 60" className="w-20 sm:w-28">
                <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="var(--border)" strokeWidth="8" strokeLinecap="round"/>
                <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke={fearColor}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${fearGreed * 1.257} 200`} opacity="0.9"/>
                <line x1="50" y1="55"
                  x2={50 + 28 * Math.cos(((fearGreed / 100) * 180 - 180) * (Math.PI / 180))}
                  y2={55 + 28 * Math.sin(((fearGreed / 100) * 180 - 180) * (Math.PI / 180))}
                  stroke="var(--tx)" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="50" cy="55" r="3" fill="var(--tx)"/>
              </svg>
            </div>
            <p className="text-xl font-black text-center" style={{ color: fearColor }}>{fearGreed}</p>
            <p className="text-[10px] text-center mt-0.5 font-medium" style={{ color: fearColor }}>{fearLabel}</p>
          </div>

          {/* Market Breadth */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
            <p className="text-[10px] text-[var(--tx-4)] uppercase tracking-wider mb-2">Market Breadth</p>
            <BreadthBar up={312} down={188} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="bg-emerald-400/10 rounded-lg py-2">
                <p className="text-emerald-400 font-black text-lg">312</p>
                <p className="text-[var(--tx-4)] text-xs">ขึ้น</p>
              </div>
              <div className="bg-red-400/10 rounded-lg py-1.5">
                <p className="text-red-400 font-black text-base">188</p>
                <p className="text-[var(--tx-4)] text-xs">ลง</p>
              </div>
            </div>
          </div>

          {/* TOP GAINERS / LOSERS */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden col-span-2">
            {/* Tab bar */}
            <div className="flex border-b border-[var(--border)]">
              <button
                onClick={() => setMoversTab("gainers")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  moversTab === "gainers"
                    ? "text-emerald-400 border-b-2 border-emerald-400 bg-emerald-400/5"
                    : "text-[var(--tx-4)] hover:text-[var(--tx-2)]"
                }`}>
                🚀 Top 5 Gainers
              </button>
              <button
                onClick={() => setMoversTab("losers")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
                  moversTab === "losers"
                    ? "text-red-400 border-b-2 border-red-400 bg-red-400/5"
                    : "text-[var(--tx-4)] hover:text-[var(--tx-2)]"
                }`}>
                📉 Top 5 Losers
              </button>
            </div>
            <p className="text-[10px] text-[var(--tx-5)] px-4 pt-2">S&P 500 + NASDAQ · วันนี้</p>
            <div className="divide-y divide-[var(--border)]">
              {(loading ? Array(5).fill(null) : displayMovers).map((m, i) => {
                if (!m) return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
                    <div className="w-5 h-3 bg-[var(--fill)] rounded" />
                    <div className="w-12 h-3 bg-[var(--fill)] rounded" />
                    <div className="flex-1 h-3 bg-[var(--fill)] rounded" />
                    <div className="w-14 h-3 bg-[var(--fill)] rounded" />
                  </div>
                );
                const pos = m.changePct >= 0;
                return (
                  <div key={m.symbol} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors">
                    <span className="text-xs text-[var(--tx-5)] w-4 font-mono">{i + 1}</span>
                    <span className="font-black text-sm w-14">{m.symbol}</span>
                    <span className="text-xs text-[var(--tx-3)] flex-1 font-mono">${money(m.price)}</span>
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
          <div className="bg-[var(--surface)] border border-purple-900/40 rounded-xl overflow-hidden">
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
                  <p className={`text-sm text-[var(--tx-2)] leading-relaxed whitespace-pre-line ${!aiExpanded ? "line-clamp-3" : ""}`}>
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
                <p className="text-xs text-[var(--tx-5)] py-1">กด "✨ วิเคราะห์" เพื่อให้ AI ดูพอร์ตและแนะนำครับ</p>
              )}
            </div>
          </div>

          {/* News ภาษาไทย */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold">ข่าวหุ้นในพอร์ต</p>
                <span className="text-[10px] bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">Portfolio News</span>
              </div>
              <span className="text-xs text-[var(--tx-5)]">{lastRefresh}</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {(news.length === 0 ? DEMO_NEWS : news).slice(0, 4).map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                  className="block px-5 py-3.5 hover:bg-[var(--hover)] transition-colors group">
                  <div className="flex items-center gap-2 mb-1">
                    {n.ticker && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--fill-strong)] text-[var(--tx-2)] flex-shrink-0">
                        {n.ticker}
                      </span>
                    )}
                    <p className="text-xs text-[var(--tx-4)] truncate">{n.source} · {n.time}</p>
                  </div>
                  <p className="text-sm text-[var(--tx)] font-medium leading-snug line-clamp-2 group-hover:text-[var(--tx)]">
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
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <p className="text-xs text-[var(--tx-4)] uppercase tracking-wider mb-3">Sector Performance</p>
              <div className="space-y-1.5">
                {(sectorData.length ? sectorData : [
                  { name: "Technology", pct: 0 },
                  { name: "Healthcare", pct: 0 },
                  { name: "Financials", pct: 0 },
                  { name: "Energy",     pct: 0 },
                  { name: "Consumer",   pct: 0 },
                ]).map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <p className="text-xs text-[var(--tx-3)] w-20 truncate">{s.name}</p>
                    <div className="flex-1 h-4 bg-[var(--fill)] rounded overflow-hidden">
                      <div className="h-full rounded flex items-center justify-end pr-1"
                        style={{
                          width: `${Math.min(Math.abs(s.pct) * 40 + 20, 100)}%`,
                          background: s.pct >= 0 ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
                        }}>
                        <span className="text-[10px] font-bold text-[var(--tx)]">{s.pct > 0 ? "+" : ""}{s.pct.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Economic Calendar */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)]">
                <p className="text-xs font-bold text-[var(--tx-2)]">📅 Economic Calendar</p>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {getEconomicEvents().map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-xs text-[var(--tx-5)] w-14">{fmtEventDate(e.date)}</span>
                    <span className="text-xs text-[var(--tx-2)] flex-1">{e.event}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      e.impact === "high" ? "bg-red-400" : e.impact === "med" ? "bg-yellow-400" : "bg-zinc-600"
                    }`} />
                  </div>
                ))}
              </div>
            </div>


          </div>
        </div>

        <footer className="text-center text-xs text-[var(--tx-6)] pb-4">
          TRUSH YOUR OWN · ข้อมูลจาก Finnhub · ไม่ใช่คำแนะนำการลงทุน
        </footer>
      </div>
    </main>
    </>
  );
}
