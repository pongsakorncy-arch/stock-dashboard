"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Timeframe = "1m" | "5" | "15" | "60" | "D" | "W";
type SymbolInfo = { ticker: string; name: string; exchange: string };

// ─── Portfolio tickers from localStorage ─────────────────────────────────────
function usePortfolioTickers(): SymbolInfo[] {
  const [tickers, setTickers] = useState<SymbolInfo[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("yok_portfolio_v4");
      if (!saved) return;
      const positions = JSON.parse(saved);
      setTickers(positions.map((p: any) => ({
        ticker: p.ticker,
        name: p.name || p.ticker,
        exchange: "NASDAQ",
      })));
    } catch {}
  }, []);
  return tickers;
}

// ─── Predefined watchlist ─────────────────────────────────────────────────────
const WATCHLIST: SymbolInfo[] = [
  { ticker: "NVDA",  name: "NVIDIA",        exchange: "NASDAQ" },
  { ticker: "AAPL",  name: "Apple",         exchange: "NASDAQ" },
  { ticker: "TSLA",  name: "Tesla",         exchange: "NASDAQ" },
  { ticker: "MSFT",  name: "Microsoft",     exchange: "NASDAQ" },
  { ticker: "GOOGL", name: "Alphabet",      exchange: "NASDAQ" },
  { ticker: "AMZN",  name: "Amazon",        exchange: "NASDAQ" },
  { ticker: "META",  name: "Meta",          exchange: "NASDAQ" },
  { ticker: "AMD",   name: "AMD",           exchange: "NASDAQ" },
  { ticker: "ALAB",  name: "Astera Labs",   exchange: "NASDAQ" },
  { ticker: "PLTR",  name: "Palantir",      exchange: "NYSE"   },
  { ticker: "SPY",   name: "S&P 500 ETF",   exchange: "AMEX"   },
  { ticker: "QQQ",   name: "NASDAQ ETF",    exchange: "NASDAQ" },
  { ticker: "GLD",   name: "Gold ETF",      exchange: "NYSEARCA"},
  { ticker: "XAUUSD",name: "Gold Spot",     exchange: "FX_IDC" },
];

// ─── TradingView Widget ───────────────────────────────────────────────────────
function TradingViewChart({
  symbol,
  exchange,
  interval,
  studies,
  theme = "dark",
}: {
  symbol: string;
  exchange: string;
  interval: string;
  studies: string[];
  theme?: "dark" | "light";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef    = useRef<HTMLScriptElement | null>(null);
  const widgetId     = `tv_${symbol}_${Date.now()}`;

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous
    containerRef.current.innerHTML = `<div id="${widgetId}" style="height:100%;width:100%;"></div>`;

    // Map exchange for TradingView symbol format
    const tvExchange: Record<string, string> = {
      NASDAQ: "NASDAQ", NYSE: "NYSE", AMEX: "AMEX",
      NYSEARCA: "AMEX", FX_IDC: "FX_IDC",
    };
    const tvSym = exchange === "FX_IDC"
      ? `FX_IDC:${symbol}`
      : `${tvExchange[exchange] || "NASDAQ"}:${symbol}`;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSym,
      interval,
      timezone: "Asia/Bangkok",
      theme,
      style: "1",           // 1 = candlestick
      locale: "th_TH",
      toolbar_bg: "#0d0d0f",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      container_id: widgetId,
      studies,
      overrides: {
        "mainSeriesProperties.candleStyle.upColor":         "#10b981",
        "mainSeriesProperties.candleStyle.downColor":       "#ef4444",
        "mainSeriesProperties.candleStyle.borderUpColor":   "#10b981",
        "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
        "mainSeriesProperties.candleStyle.wickUpColor":     "#10b981",
        "mainSeriesProperties.candleStyle.wickDownColor":   "#ef4444",
        "paneProperties.background":                        "#0d0d0f",
        "paneProperties.backgroundType":                    "solid",
        "scalesProperties.textColor":                       "#71717a",
        "scalesProperties.backgroundColor":                 "#0d0d0f",
      },
    });

    containerRef.current.querySelector(`#${widgetId}`)?.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, exchange, interval, studies.join(",")]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ─── Quick stats bar (static label + color) ───────────────────────────────────
const TIMEFRAMES: { label: string; value: Timeframe; tv: string }[] = [
  { label: "1m",  value: "1m", tv: "1"  },
  { label: "5m",  value: "5",  tv: "5"  },
  { label: "15m", value: "15", tv: "15" },
  { label: "1H",  value: "60", tv: "60" },
  { label: "1D",  value: "D",  tv: "D"  },
  { label: "1W",  value: "W",  tv: "W"  },
];

const INDICATORS = [
  { label: "EMA 20",       value: "MAExp@tv-basicstudies" },
  { label: "EMA 50",       value: "MAExp@tv-basicstudies" },
  { label: "Bollinger",    value: "BB@tv-basicstudies"    },
  { label: "RSI",          value: "RSI@tv-basicstudies"   },
  { label: "MACD",         value: "MACD@tv-basicstudies"  },
  { label: "Volume",       value: "Volume@tv-basicstudies"},
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChartPage() {
  const portfolioTickers = usePortfolioTickers();

  const [symbol,    setSymbol]    = useState("NVDA");
  const [exchange,  setExchange]  = useState("NASDAQ");
  const [interval,  setInterval]  = useState("D");
  const [search,    setSearch]    = useState("");
  const [activeStudies, setActiveStudies] = useState<string[]>([
    "RSI@tv-basicstudies",
    "Volume@tv-basicstudies",
  ]);
  const [tab, setTab] = useState<"portfolio"|"watchlist">("portfolio");
  const [compareMode, setCompareMode] = useState(false);
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);

  const toggleStudy = (val: string) => {
    setActiveStudies(prev =>
      prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]
    );
  };

  const selectSymbol = (s: SymbolInfo) => {
    if (compareMode) {
      setCompareSymbols(prev =>
        prev.includes(s.ticker)
          ? prev.filter(x => x !== s.ticker)
          : prev.length < 3 ? [...prev, s.ticker] : prev
      );
    } else {
      setSymbol(s.ticker);
      setExchange(s.exchange);
    }
  };

  const displayList = tab === "portfolio" ? portfolioTickers : WATCHLIST;
  const filteredList = search
    ? displayList.filter(s =>
        s.ticker.includes(search.toUpperCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
      )
    : displayList;

  // Active timeframe obj
  const activeTF = TIMEFRAMES.find(t => t.tv === interval) ?? TIMEFRAMES[4];

  return (
    <main className="h-screen bg-[#0d0d0f] text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

      {/* ── Top bar ── */}
      <header className="flex-shrink-0 border-b border-zinc-800 px-4 py-2.5 flex items-center gap-3 bg-[#0d0d0f]/95 backdrop-blur z-20">
        <Link href="/" className="text-zinc-500 hover:text-white text-sm transition-colors flex-shrink-0">← หน้าแรก</Link>
        <span className="text-zinc-700">|</span>

        {/* Symbol display */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-black text-lg tracking-tight">{symbol}</span>
          <span className="text-xs text-zinc-500">{exchange}</span>
        </div>

        <span className="text-zinc-800">·</span>

        {/* Timeframe pills */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(tf => (
            <button key={tf.tv} onClick={() => setInterval(tf.tv)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                interval === tf.tv
                  ? "bg-yellow-400 text-black"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}>
              {tf.label}
            </button>
          ))}
        </div>

        <span className="text-zinc-800 ml-1">·</span>

        {/* Indicator toggles */}
        <div className="flex items-center gap-1 flex-wrap">
          {INDICATORS.map(ind => (
            <button key={ind.label} onClick={() => toggleStudy(ind.value)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                activeStudies.includes(ind.value)
                  ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                  : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600"
              }`}>
              {ind.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {/* Compare toggle */}
          <button onClick={() => { setCompareMode(!compareMode); setCompareSymbols([]); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
              compareMode
                ? "bg-sky-400/20 border-sky-400/40 text-sky-400"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}>
            {compareMode ? `เปรียบ ${compareSymbols.length}/3` : "เปรียบเทียบ"}
          </button>

          <Link href="/portfolio"
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors">
            พอร์ต →
          </Link>
        </div>
      </header>

      {/* ── Body: sidebar + chart ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-52 flex-shrink-0 border-r border-zinc-800 flex flex-col bg-[#0a0a0c] overflow-hidden">

          {/* Tab: พอร์ต / Watchlist */}
          <div className="flex border-b border-zinc-800 flex-shrink-0">
            <button onClick={() => setTab("portfolio")}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${
                tab === "portfolio" ? "text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              พอร์ตของฉัน
            </button>
            <button onClick={() => setTab("watchlist")}
              className={`flex-1 py-2 text-xs font-bold transition-colors ${
                tab === "watchlist" ? "text-yellow-400 border-b-2 border-yellow-400 bg-yellow-400/5" : "text-zinc-500 hover:text-zinc-300"
              }`}>
              Watchlist
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-zinc-800/60 flex-shrink-0">
            <input
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-yellow-400/50 placeholder-zinc-600"
              placeholder="ค้นหา ticker..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Symbol list */}
          <div className="flex-1 overflow-y-auto">
            {filteredList.length === 0 && (
              <p className="text-xs text-zinc-600 px-4 py-6 text-center">
                {tab === "portfolio" ? "ยังไม่มีข้อมูลพอร์ต\nกด อัปเดตราคา ในหน้าพอร์ตก่อน" : "ไม่พบ"}
              </p>
            )}
            {filteredList.map(s => {
              const isActive  = !compareMode && symbol === s.ticker;
              const isCompare = compareMode && compareSymbols.includes(s.ticker);
              return (
                <button key={s.ticker} onClick={() => selectSymbol(s)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/50 border-b border-zinc-800/30 ${
                    isActive ? "bg-yellow-400/10 border-l-2 border-l-yellow-400" :
                    isCompare ? "bg-sky-400/10 border-l-2 border-l-sky-400" : ""
                  }`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black ${isActive ? "text-yellow-400" : isCompare ? "text-sky-400" : "text-white"}`}>
                      {s.ticker}
                    </p>
                    <p className="text-[10px] text-zinc-600 truncate">{s.name}</p>
                  </div>
                  {isActive  && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0"/>}
                  {isCompare && <span className="text-[10px] text-sky-400 font-bold">{compareSymbols.indexOf(s.ticker)+1}</span>}
                </button>
              );
            })}
          </div>

          {/* Compare mode hint */}
          {compareMode && compareSymbols.length > 0 && (
            <div className="border-t border-zinc-800 p-3 flex-shrink-0">
              <p className="text-[10px] text-zinc-500 mb-2">เปรียบเทียบกับ:</p>
              <div className="flex flex-wrap gap-1">
                {compareSymbols.map(sym => (
                  <span key={sym}
                    className="text-[10px] bg-sky-400/20 text-sky-400 px-2 py-0.5 rounded font-bold cursor-pointer hover:bg-red-400/20 hover:text-red-400"
                    onClick={() => setCompareSymbols(prev => prev.filter(x => x !== sym))}>
                    {sym} ✕
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Chart area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Chart */}
          <div className="flex-1 overflow-hidden">
            {compareMode && compareSymbols.length > 0 ? (
              /* Compare: grid layout */
              <div className={`h-full grid gap-0.5 bg-zinc-900 ${compareSymbols.length === 1 ? "grid-cols-2" : compareSymbols.length === 2 ? "grid-cols-2" : "grid-cols-2 grid-rows-2"}`}>
                {/* Main symbol */}
                <div className={`bg-[#0d0d0f] overflow-hidden relative ${compareSymbols.length === 3 ? "col-span-1 row-span-2" : ""}`}>
                  <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur rounded px-2 py-0.5">
                    <span className="text-xs font-black text-yellow-400">{symbol}</span>
                  </div>
                  <TradingViewChart symbol={symbol} exchange={exchange} interval={interval} studies={activeStudies}/>
                </div>
                {/* Compare symbols */}
                {compareSymbols.map((sym, i) => {
                  const info = [...portfolioTickers, ...WATCHLIST].find(x => x.ticker === sym);
                  return (
                    <div key={sym} className="bg-[#0d0d0f] overflow-hidden relative">
                      <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur rounded px-2 py-0.5">
                        <span className="text-xs font-black text-sky-400">{sym}</span>
                      </div>
                      <TradingViewChart
                        symbol={sym}
                        exchange={info?.exchange || "NASDAQ"}
                        interval={interval}
                        studies={activeStudies}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single chart */
              <TradingViewChart symbol={symbol} exchange={exchange} interval={interval} studies={activeStudies}/>
            )}
          </div>

          {/* ── Bottom bar: quick switch portfolio ── */}
          {!compareMode && portfolioTickers.length > 0 && (
            <div className="flex-shrink-0 border-t border-zinc-800 bg-[#0a0a0c] px-4 py-2 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] text-zinc-600 flex-shrink-0 uppercase tracking-wider">พอร์ต:</span>
              {portfolioTickers.slice(0, 15).map(s => (
                <button key={s.ticker} onClick={() => { setSymbol(s.ticker); setExchange(s.exchange); }}
                  className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                    symbol === s.ticker
                      ? "bg-yellow-400 text-black"
                      : "bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                  }`}>
                  {s.ticker}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
