"use client";

import Link from "next/link";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type SymbolInfo = { ticker: string; name: string; exchange: string };
type SRData = { supports: number[]; resists: number[]; invest: number };

// ─── localStorage keys (จำค่าล่าสุด) ─────────────────────────────────────────
const LS_SYMBOL = "yok_chart_symbol";
const LS_EXCHANGE = "yok_chart_exchange";
const LS_INTERVAL = "yok_chart_interval";

// ─── Portfolio tickers ────────────────────────────────────────────────────────
function usePortfolioTickers(): SymbolInfo[] {
  const [tickers, setTickers] = useState<SymbolInfo[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yok_portfolio_v4");
      if (!saved) return;
      const positions = JSON.parse(saved);
      setTickers(
        positions.map((p: any) => ({
          ticker: p.ticker,
          name: p.name || p.ticker,
          exchange: "NASDAQ",
        })),
      );
    } catch {}
  }, []);
  return tickers;
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
const WATCHLIST: SymbolInfo[] = [
  { ticker: "XAUUSD", name: "Gold Spot", exchange: "FX_IDC" },
  { ticker: "NVDA", name: "NVIDIA", exchange: "NASDAQ" },
  { ticker: "AAPL", name: "Apple", exchange: "NASDAQ" },
  { ticker: "TSLA", name: "Tesla", exchange: "NASDAQ" },
  { ticker: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
  { ticker: "GOOGL", name: "Alphabet", exchange: "NASDAQ" },
  { ticker: "AMZN", name: "Amazon", exchange: "NASDAQ" },
  { ticker: "META", name: "Meta", exchange: "NASDAQ" },
  { ticker: "AMD", name: "AMD", exchange: "NASDAQ" },
  { ticker: "ALAB", name: "Astera Labs", exchange: "NASDAQ" },
  { ticker: "PLTR", name: "Palantir", exchange: "NYSE" },
  { ticker: "SPY", name: "S&P 500 ETF", exchange: "AMEX" },
  { ticker: "QQQ", name: "NASDAQ ETF", exchange: "NASDAQ" },
  { ticker: "GLD", name: "Gold ETF", exchange: "NYSEARCA" },
];

// ─── ราคาปัจจุบัน (Finnhub) ──────────────────────────────────────────────────
function useCurrentPrice(symbol: string, exchange: string) {
  const [price, setPrice] = useState<number | null>(null);
  const [manualPrice, setManualPrice] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // XAUUSD / forex → Finnhub free ไม่รองรับ ให้กรอกเอง
    if (exchange === "FX_IDC") {
      setPrice(null);
      return;
    }

    const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!key) {
      setPrice(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.c > 0) setPrice(Number(d.c));
        else if (!cancelled) setPrice(null);
      })
      .catch(() => {
        if (!cancelled) setPrice(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, exchange]);

  const effectivePrice = price ?? (parseFloat(manualPrice) || null);
  return {
    price: effectivePrice,
    autoPrice: price,
    manualPrice,
    setManualPrice,
    loading,
  };
}

// ─── TradingView Chart ────────────────────────────────────────────────────────
function TradingViewChart({
  symbol,
  exchange,
  interval,
  studies,
}: {
  symbol: string;
  exchange: string;
  interval: string;
  studies: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = `tv_${symbol}_${interval}`;
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = `<div id="${widgetId}" style="height:100%;width:100%;"></div>`;
    const tvExchange: Record<string, string> = {
      NASDAQ: "NASDAQ",
      NYSE: "NYSE",
      AMEX: "AMEX",
      NYSEARCA: "AMEX",
      FX_IDC: "FX_IDC",
    };
    const tvSym =
      exchange === "FX_IDC"
        ? `FX_IDC:${symbol}`
        : `${tvExchange[exchange] || "NASDAQ"}:${symbol}`;
    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSym,
      interval,
      timezone: "Asia/Bangkok",
      theme: "dark",
      style: "8",
      locale: "th_TH",
      toolbar_bg: "#0d0d0f",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      hide_side_toolbar: false,
      withdateranges: true,
      allow_symbol_change: false,
      container_id: widgetId,
      studies,
      overrides: {
        "mainSeriesProperties.candleStyle.upColor": "#10b981",
        "mainSeriesProperties.candleStyle.downColor": "#ef4444",
        "mainSeriesProperties.candleStyle.borderUpColor": "#10b981",
        "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
        "mainSeriesProperties.candleStyle.wickUpColor": "#10b981",
        "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
        "paneProperties.background": "#0d0d0f",
        "paneProperties.backgroundType": "solid",
        "scalesProperties.textColor": "#71717a",
        "scalesProperties.backgroundColor": "#0d0d0f",
        "paneProperties.vertGridProperties.color": "rgba(0,0,0,0)",
        "paneProperties.horzGridProperties.color": "rgba(0,0,0,0)",
      },
    });
    containerRef.current.querySelector(`#${widgetId}`)?.appendChild(script);
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, exchange, interval, studies.join(",")]);
  return <div ref={containerRef} className="w-full h-full" />;
}

// ─── Fibonacci Calculator ─────────────────────────────────────────────────────
const FIB_LEVELS = [
  { pct: 0, label: "0%", color: "#ef4444" },
  { pct: 0.236, label: "23.6%", color: "#f59e0b" },
  { pct: 0.382, label: "38.2%", color: "#10b981" },
  { pct: 0.5, label: "50%", color: "#3b82f6" },
  { pct: 0.618, label: "61.8%", color: "#a78bfa" },
  { pct: 0.786, label: "78.6%", color: "#f472b6" },
  { pct: 1, label: "100%", color: "#ef4444" },
];

function FibCalculator() {
  const [high, setHigh] = useState("");
  const [low, setLow] = useState("");
  const [dir, setDir] = useState<"down" | "up">("down");

  const h = parseFloat(high),
    l = parseFloat(low);
  const valid = !isNaN(h) && !isNaN(l) && h > l;
  const range = h - l;

  const levels = valid
    ? FIB_LEVELS.map((f) => ({
        ...f,
        price: dir === "down" ? h - f.pct * range : l + f.pct * range,
      }))
    : [];

  return (
    <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-xs font-bold text-white">📐 Fibonacci</p>
        <div className="flex gap-1">
          {(["down", "up"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDir(d)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                dir === d
                  ? "bg-yellow-400 text-black"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {d === "down" ? "↓ Bear" : "↑ Bull"}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">High</label>
            <input
              type="number"
              value={high}
              onChange={(e) => setHigh(e.target.value)}
              placeholder="4090.00"
              className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-emerald-400 text-emerald-400"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 mb-1 block">Low</label>
            <input
              type="number"
              value={low}
              onChange={(e) => setLow(e.target.value)}
              placeholder="4060.00"
              className="w-full bg-[#111113] border border-zinc-700 rounded-lg px-2 py-1.5 text-xs font-mono outline-none focus:border-red-400 text-red-400"
            />
          </div>
        </div>

        {valid ? (
          <div className="space-y-1 mt-1">
            {levels.map((lv) => (
              <div
                key={lv.label}
                className="flex items-center gap-2 px-2 py-1 rounded-lg bg-[#111113]"
              >
                <div
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: lv.color }}
                />
                <span className="text-[10px] font-mono text-zinc-400 w-10">
                  {lv.label}
                </span>
                <span
                  className="text-xs font-black font-mono ml-auto"
                  style={{ color: lv.color }}
                >
                  {lv.price.toFixed(3)}
                </span>
              </div>
            ))}
            <button
              onClick={() => {
                setHigh("");
                setLow("");
              }}
              className="w-full mt-1 py-1 text-[10px] text-zinc-600 hover:text-zinc-400"
            >
              ล้าง
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-zinc-600 text-center py-2">
            ใส่ High และ Low เพื่อคำนวณ
          </p>
        )}
      </div>
    </div>
  );
}

// ─── S/R Editor (แก้ไข + sync Supabase) ──────────────────────────────────────
function SREditor({
  symbol,
  currentPrice,
  manualPrice,
  setManualPrice,
  autoPrice,
}: {
  symbol: string;
  currentPrice: number | null;
  manualPrice: string;
  setManualPrice: (v: string) => void;
  autoPrice: number | null;
}) {
  const [supports, setSupports] = useState<number[]>([]);
  const [resists, setResists] = useState<number[]>([]);
  const [invest, setInvest] = useState(0);
  const [newSupport, setNewSupport] = useState("");
  const [newResist, setNewResist] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // โหลด S/R (Supabase → fallback localStorage)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("sr_levels")
            .select("*")
            .eq("user_id", user.id)
            .eq("ticker", symbol)
            .maybeSingle();
          if (!cancelled && data) {
            setSupports(data.supports || []);
            setResists(data.resists || []);
            setInvest(data.invest || 0);
            setLoading(false);
            return;
          }
        }
      } catch {}
      // fallback localStorage
      try {
        const raw = localStorage.getItem(`sr_${symbol}`);
        if (raw && !cancelled) {
          const d = JSON.parse(raw);
          setSupports((d.s || []).map(Number).filter((n: number) => n > 0));
          setResists((d.r || []).map(Number).filter((n: number) => n > 0));
          setInvest(parseFloat(d.invest) || 0);
        } else if (!cancelled) {
          setSupports([]);
          setResists([]);
          setInvest(0);
        }
      } catch {
        if (!cancelled) {
          setSupports([]);
          setResists([]);
          setInvest(0);
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // บันทึกลง Supabase + localStorage
  const saveSR = async (nextSupports: number[], nextResists: number[]) => {
    setSaving(true);
    setSaved(false);
    // localStorage เสมอ (offline fallback)
    try {
      localStorage.setItem(
        `sr_${symbol}`,
        JSON.stringify({
          s: nextSupports,
          r: nextResists,
          invest,
        }),
      );
    } catch {}
    // Supabase (sync ข้ามเครื่อง)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("sr_levels").upsert(
          {
            user_id: user.id,
            ticker: symbol,
            supports: nextSupports,
            resists: nextResists,
            invest,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,ticker" },
        );
      }
    } catch (e) {
      console.error("SR save error:", e);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const addSupport = () => {
    const v = parseFloat(newSupport);
    if (isNaN(v) || v <= 0) return;
    const next = [...supports, v].sort((a, b) => b - a);
    setSupports(next);
    setNewSupport("");
    saveSR(next, resists);
  };
  const addResist = () => {
    const v = parseFloat(newResist);
    if (isNaN(v) || v <= 0) return;
    const next = [...resists, v].sort((a, b) => b - a);
    setResists(next);
    setNewResist("");
    saveSR(supports, next);
  };
  const delSupport = (i: number) => {
    const next = supports.filter((_, j) => j !== i);
    setSupports(next);
    saveSR(next, resists);
  };
  const delResist = (i: number) => {
    const next = resists.filter((_, j) => j !== i);
    setResists(next);
    saveSR(supports, next);
  };

  // ระยะห่าง % จากราคาปัจจุบัน
  const distPct = (level: number) =>
    currentPrice ? ((level - currentPrice) / currentPrice) * 100 : null;

  const fmtDist = (level: number) => {
    const d = distPct(level);
    if (d === null) return "";
    const abs = Math.abs(d);
    const near = abs <= 1;
    return { text: `${d >= 0 ? "+" : ""}${d.toFixed(2)}%`, near };
  };

  const showManualInput = autoPrice === null;

  return (
    <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-xs font-bold text-white">🎯 S/R · {symbol}</p>
        <div className="flex items-center gap-1.5">
          {saving && <span className="text-[9px] text-zinc-500">saving…</span>}
          {saved && (
            <span className="text-[9px] text-emerald-400">✓ saved</span>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
              editMode
                ? "bg-yellow-400 text-black"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {editMode ? "✓ เสร็จ" : "✎ แก้ไข"}
          </button>
        </div>
      </div>

      {/* ราคาปัจจุบัน */}
      <div className="px-3 py-2 border-b border-zinc-800/60 bg-[#111113]">
        {showManualInput ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 flex-shrink-0">
              ราคาตอนนี้
            </span>
            <input
              type="number"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="กรอกราคา"
              className="flex-1 bg-[#0d0d0f] border border-zinc-700 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:border-yellow-400 text-yellow-400 text-right"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">ราคาตอนนี้</span>
            <span className="text-sm font-black font-mono text-yellow-400">
              {currentPrice ? currentPrice.toFixed(2) : "—"}
            </span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-1">
        {loading && (
          <p className="text-[10px] text-zinc-600 text-center py-2">โหลด…</p>
        )}

        {!loading && (
          <>
            {/* Resistance */}
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
              Resistance 🔴
            </p>
            {resists.length === 0 && (
              <p className="text-[10px] text-zinc-700 mb-1.5">ยังไม่มี</p>
            )}
            {resists.map((r, i) => {
              const d = fmtDist(r);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 bg-red-500/5 border border-red-500/20 rounded-lg"
                >
                  <div
                    className={`w-2 h-2 rounded-sm flex-shrink-0 ${typeof d === "object" && d.near ? "bg-red-400 animate-pulse" : "bg-red-400"}`}
                  />
                  <span className="text-[10px] text-zinc-500">R{i + 1}</span>
                  <span className="text-xs font-black font-mono text-red-400">
                    {r.toFixed(3)}
                  </span>
                  {typeof d === "object" && (
                    <span
                      className={`text-[9px] font-mono ml-auto ${d.near ? "text-yellow-400 font-bold" : "text-zinc-600"}`}
                    >
                      {d.text}
                      {d.near && " ⚠"}
                    </span>
                  )}
                  {editMode && (
                    <button
                      onClick={() => delResist(i)}
                      className="text-zinc-600 hover:text-red-400 text-xs ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {editMode && (
              <div className="flex gap-1.5 mt-1.5">
                <input
                  type="number"
                  value={newResist}
                  onChange={(e) => setNewResist(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addResist()}
                  placeholder="เพิ่ม R"
                  className="flex-1 bg-[#111113] border border-zinc-700 rounded-lg px-2 py-1 text-[11px] font-mono outline-none focus:border-red-400 text-red-400"
                />
                <button
                  onClick={addResist}
                  className="px-2.5 py-1 bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg text-[11px] font-bold"
                >
                  +
                </button>
              </div>
            )}

            {/* Support */}
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 mt-3">
              Support 🟢
            </p>
            {supports.length === 0 && (
              <p className="text-[10px] text-zinc-700 mb-1.5">ยังไม่มี</p>
            )}
            {supports.map((s, i) => {
              const d = fmtDist(s);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-lg"
                >
                  <div
                    className={`w-2 h-2 rounded-sm flex-shrink-0 ${typeof d === "object" && d.near ? "bg-emerald-400 animate-pulse" : "bg-emerald-400"}`}
                  />
                  <span className="text-[10px] text-zinc-500">S{i + 1}</span>
                  <span className="text-xs font-black font-mono text-emerald-400">
                    {s.toFixed(3)}
                  </span>
                  {typeof d === "object" && (
                    <span
                      className={`text-[9px] font-mono ml-auto ${d.near ? "text-yellow-400 font-bold" : "text-zinc-600"}`}
                    >
                      {d.text}
                      {d.near && " ⚠"}
                    </span>
                  )}
                  {editMode && (
                    <button
                      onClick={() => delSupport(i)}
                      className="text-zinc-600 hover:text-red-400 text-xs ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {editMode && (
              <div className="flex gap-1.5 mt-1.5">
                <input
                  type="number"
                  value={newSupport}
                  onChange={(e) => setNewSupport(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSupport()}
                  placeholder="เพิ่ม S"
                  className="flex-1 bg-[#111113] border border-zinc-700 rounded-lg px-2 py-1 text-[11px] font-mono outline-none focus:border-emerald-400 text-emerald-400"
                />
                <button
                  onClick={addSupport}
                  className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-lg text-[11px] font-bold"
                >
                  +
                </button>
              </div>
            )}

            {currentPrice && (supports.length > 0 || resists.length > 0) && (
              <p className="text-[9px] text-zinc-700 mt-2.5 leading-relaxed">
                ⚠ = ใกล้แนวนี้ภายใน 1% · ค่าที่บันทึกจะ sync ทุกเครื่องอัตโนมัติ
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { label: "1m", tv: "1" },
  { label: "5m", tv: "5" },
  { label: "15m", tv: "15" },
  { label: "1H", tv: "60" },
  { label: "4H", tv: "240" },
  { label: "1D", tv: "D" },
  { label: "1W", tv: "W" },
];

// ─── Main (inner) ─────────────────────────────────────────────────────────────
function ChartPageInner() {
  const searchParams = useSearchParams();
  const portfolioTickers = usePortfolioTickers();

  const [symbol, setSymbol] = useState("XAUUSD");
  const [exchange, setExchange] = useState("FX_IDC");
  const [interval, setInterval] = useState("60"); // ⭐ default H1
  const activeStudies = ["RSI@tv-basicstudies"];
  const [tab, setTab] = useState<"portfolio" | "watchlist">("watchlist");
  const [search, setSearch] = useState("");
  const [showSymbolSheet, setShowSymbolSheet] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { price, autoPrice, manualPrice, setManualPrice } = useCurrentPrice(
    symbol,
    exchange,
  );

  // ── Hydrate: URL param > localStorage > default ────────────────────────────
  useEffect(() => {
    const urlSymbol = searchParams.get("symbol");
    const urlExchange = searchParams.get("exchange");
    const urlInterval = searchParams.get("tf");

    if (urlSymbol) {
      // ⭐ Deep link จาก Portfolio
      setSymbol(urlSymbol.toUpperCase());
      setExchange(urlExchange || "NASDAQ");
      if (urlInterval) setInterval(urlInterval);
    } else {
      // ⭐ จำค่าล่าสุด
      try {
        const s = localStorage.getItem(LS_SYMBOL);
        const e = localStorage.getItem(LS_EXCHANGE);
        const i = localStorage.getItem(LS_INTERVAL);
        if (s) setSymbol(s);
        if (e) setExchange(e);
        if (i) setInterval(i);
      } catch {}
    }
    setHydrated(true);
  }, [searchParams]);

  // ── Save symbol/TF ล่าสุด ──────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_SYMBOL, symbol);
      localStorage.setItem(LS_EXCHANGE, exchange);
      localStorage.setItem(LS_INTERVAL, interval);
    } catch {}
  }, [symbol, exchange, interval, hydrated]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const selectSymbol = (s: SymbolInfo) => {
    setSymbol(s.ticker);
    setExchange(s.exchange);
    setShowSymbolSheet(false);
  };

  const displayList = tab === "portfolio" ? portfolioTickers : WATCHLIST;
  const filteredList = search
    ? displayList.filter(
        (s) =>
          s.ticker.includes(search.toUpperCase()) ||
          s.name.toLowerCase().includes(search.toLowerCase()),
      )
    : displayList;

  const tvUrl = `https://www.tradingview.com/chart/?symbol=${exchange === "FX_IDC" ? "FX_IDC:" : ""}${symbol}`;

  const sidePanel = (
    <>
      <FibCalculator />
      <SREditor
        symbol={symbol}
        currentPrice={price}
        manualPrice={manualPrice}
        setManualPrice={setManualPrice}
        autoPrice={autoPrice}
      />
    </>
  );

  // ── Mobile Layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <main
        className="h-screen bg-[#0d0d0f] text-white flex flex-col overflow-hidden select-none"
        style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}
      >
        <header className="flex-shrink-0 bg-[#0a0a0c] border-b border-zinc-800 px-3 py-2 flex items-center gap-2 z-20">
          <Link href="/" className="text-zinc-500 p-1">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <button
            onClick={() => setShowSymbolSheet(true)}
            className="flex items-center gap-1.5 bg-zinc-800/80 rounded-lg px-3 py-1.5 flex-1"
          >
            <span className="font-black text-sm text-yellow-400">{symbol}</span>
            {price && (
              <span className="text-[10px] font-mono text-zinc-400">
                {price.toFixed(2)}
              </span>
            )}
            <span className="text-zinc-600 text-xs ml-auto">▾</span>
          </button>
          <button
            onClick={() => setShowSidePanel(!showSidePanel)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              showSidePanel
                ? "bg-yellow-400/20 border-yellow-400/40 text-yellow-400"
                : "border-zinc-700 text-zinc-500"
            }`}
          >
            📐
          </button>
        </header>

        {showSidePanel && (
          <div className="flex-shrink-0 bg-[#0d0d0f] border-b border-zinc-800 p-3 space-y-3 max-h-80 overflow-y-auto">
            {sidePanel}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <TradingViewChart
            symbol={symbol}
            exchange={exchange}
            interval={interval}
            studies={activeStudies}
          />
        </div>

        <div className="flex-shrink-0 bg-[#0a0a0c] border-t border-zinc-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto z-10">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.tv}
              onClick={() => setInterval(tf.tv)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs font-black transition-colors ${
                interval === tf.tv
                  ? "bg-yellow-400 text-black"
                  : "bg-zinc-800/60 text-zinc-400"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {showSymbolSheet && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSymbolSheet(false)}
            />
            <div className="relative bg-[#111113] rounded-t-2xl border-t border-zinc-700 max-h-[75vh] flex flex-col">
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-zinc-600 rounded-full" />
              </div>
              <div className="px-4 pb-3 flex-shrink-0">
                <p className="text-sm font-bold mb-2">เลือกหุ้น / สินทรัพย์</p>
                <div className="flex gap-2 mb-2">
                  {(["watchlist", "portfolio"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tab === t
                          ? "bg-yellow-400 text-black"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {t === "portfolio" ? "พอร์ตของฉัน" : "Watchlist"}
                    </button>
                  ))}
                </div>
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400/50 placeholder-zinc-600"
                  placeholder="ค้นหา ticker..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="overflow-y-auto flex-1 pb-6">
                <div className="grid grid-cols-2 gap-2 px-4">
                  {filteredList.map((s) => {
                    const isActive = symbol === s.ticker;
                    return (
                      <button
                        key={s.ticker}
                        onClick={() => selectSymbol(s)}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                          isActive
                            ? "bg-yellow-400/10 border-yellow-400/40"
                            : "bg-zinc-900/60 border-zinc-800"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-black ${isActive ? "text-yellow-400" : "text-white"}`}
                          >
                            {s.ticker}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate">
                            {s.name}
                          </p>
                        </div>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ── Desktop Layout ─────────────────────────────────────────────────────────
  return (
    <main
      className="h-screen bg-[#0d0d0f] text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}
    >
      <header className="flex-shrink-0 border-b border-zinc-800 px-4 py-2.5 flex items-center gap-3 bg-[#0d0d0f]/95 backdrop-blur z-20">
        <Link
          href="/"
          className="text-zinc-500 hover:text-white text-sm transition-colors flex-shrink-0"
        >
          ← หน้าแรก
        </Link>
        <span className="text-zinc-700">|</span>
        <button
          onClick={() => setShowSymbolSheet(!showSymbolSheet)}
          className="flex items-center gap-1.5 hover:bg-zinc-800 rounded-lg px-2 py-1 transition-colors"
        >
          <span className="font-black text-lg tracking-tight text-yellow-400">
            {symbol}
          </span>
          {price && (
            <span className="text-xs font-mono text-zinc-400">
              {price.toFixed(2)}
            </span>
          )}
          <span className="text-zinc-600 text-xs">▾</span>
        </button>
        <span className="text-zinc-800">·</span>
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.tv}
              onClick={() => setInterval(tf.tv)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                interval === tf.tv
                  ? "bg-yellow-400 text-black"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-lg transition-colors border border-zinc-700"
          >
            🔗 TradingView ↗
          </a>
          <button
            onClick={() => setShowSidePanel(!showSidePanel)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              showSidePanel
                ? "bg-yellow-400/20 border-yellow-400/40 text-yellow-400"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            📐 Fib & S/R
          </button>
          <Link
            href="/portfolio"
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors"
          >
            พอร์ต →
          </Link>
        </div>
      </header>

      {showSymbolSheet && (
        <>
          <div className="absolute top-12 left-32 z-50 w-72 bg-[#111113] border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-zinc-800">
              <div className="flex gap-1.5 mb-2">
                {(["watchlist", "portfolio"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${
                      tab === t
                        ? "bg-yellow-400 text-black"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {t === "portfolio" ? "พอร์ต" : "Watchlist"}
                  </button>
                ))}
              </div>
              <input
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-yellow-400/50 placeholder-zinc-600"
                placeholder="ค้นหา ticker..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredList.map((s) => {
                const isActive = symbol === s.ticker;
                return (
                  <button
                    key={s.ticker}
                    onClick={() => {
                      selectSymbol(s);
                      setShowSymbolSheet(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 ${isActive ? "bg-yellow-400/10" : ""}`}
                  >
                    <div className="flex-1 text-left">
                      <p
                        className={`text-xs font-black ${isActive ? "text-yellow-400" : "text-white"}`}
                      >
                        {s.ticker}
                      </p>
                      <p className="text-[10px] text-zinc-500">{s.name}</p>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="p-2 border-t border-zinc-800">
              <button
                onClick={() => setShowSymbolSheet(false)}
                className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
              >
                ปิด
              </button>
            </div>
          </div>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowSymbolSheet(false)}
          />
        </>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <TradingViewChart
            symbol={symbol}
            exchange={exchange}
            interval={interval}
            studies={activeStudies}
          />
        </div>

        {showSidePanel && (
          <div className="w-64 flex-shrink-0 border-l border-zinc-800 bg-[#0d0d0f] overflow-y-auto p-3 space-y-3">
            {sidePanel}
          </div>
        )}
      </div>

      {portfolioTickers.length > 0 && (
        <div className="flex-shrink-0 border-t border-zinc-800 bg-[#0a0a0c] px-4 py-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] text-zinc-600 flex-shrink-0 uppercase tracking-wider">
            พอร์ต:
          </span>
          {portfolioTickers.slice(0, 15).map((s) => (
            <button
              key={s.ticker}
              onClick={() => {
                setSymbol(s.ticker);
                setExchange(s.exchange);
              }}
              className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                symbol === s.ticker
                  ? "bg-yellow-400 text-black"
                  : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              {s.ticker}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

// ─── Export (wrap Suspense เพราะใช้ useSearchParams) ──────────────────────────
export default function ChartPage() {
  return (
    <Suspense fallback={<main className="h-screen bg-[#0d0d0f]" />}>
      <ChartPageInner />
    </Suspense>
  );
}
