"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SymbolInfo = { ticker: string; name: string; exchange: string };

// ─── Portfolio tickers ────────────────────────────────────────────────────────
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

// ─── Watchlist ────────────────────────────────────────────────────────────────
const WATCHLIST: SymbolInfo[] = [
  { ticker: "XAUUSD", name: "Gold Spot",   exchange: "FX_IDC"   },
  { ticker: "NVDA",   name: "NVIDIA",      exchange: "NASDAQ"   },
  { ticker: "AAPL",   name: "Apple",       exchange: "NASDAQ"   },
  { ticker: "TSLA",   name: "Tesla",       exchange: "NASDAQ"   },
  { ticker: "MSFT",   name: "Microsoft",   exchange: "NASDAQ"   },
  { ticker: "GOOGL",  name: "Alphabet",    exchange: "NASDAQ"   },
  { ticker: "AMZN",   name: "Amazon",      exchange: "NASDAQ"   },
  { ticker: "META",   name: "Meta",        exchange: "NASDAQ"   },
  { ticker: "AMD",    name: "AMD",         exchange: "NASDAQ"   },
  { ticker: "ALAB",   name: "Astera Labs", exchange: "NASDAQ"   },
  { ticker: "PLTR",   name: "Palantir",    exchange: "NYSE"     },
  { ticker: "SPY",    name: "S&P 500 ETF", exchange: "AMEX"     },
  { ticker: "QQQ",    name: "NASDAQ ETF",  exchange: "NASDAQ"   },
  { ticker: "GLD",    name: "Gold ETF",    exchange: "NYSEARCA" },
];

// ─── TradingView Chart ────────────────────────────────────────────────────────
function TradingViewChart({
  symbol, exchange, interval, studies,
}: {
  symbol: string; exchange: string; interval: string; studies: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = `tv_${symbol}_${interval}`;

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = `<div id="${widgetId}" style="height:100%;width:100%;"></div>`;

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
      theme: "dark",
      style: "1",
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
    return () => { if (containerRef.current) containerRef.current.innerHTML = ""; };
  }, [symbol, exchange, interval, studies.join(",")]);

  return <div ref={containerRef} className="w-full h-full" />;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  { label: "1m",  tv: "1"  },
  { label: "5m",  tv: "5"  },
  { label: "15m", tv: "15" },
  { label: "1H",  tv: "60" },
  { label: "4H",  tv: "240"},
  { label: "1D",  tv: "D"  },
  { label: "1W",  tv: "W"  },
];

const INDICATORS = [
  { label: "EMA20",  value: "MAExp@tv-basicstudies" },
  { label: "BB",     value: "BB@tv-basicstudies"    },
  { label: "RSI",    value: "RSI@tv-basicstudies"   },
  { label: "MACD",   value: "MACD@tv-basicstudies"  },
  { label: "Vol",    value: "Volume@tv-basicstudies" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChartPage() {
  const portfolioTickers = usePortfolioTickers();

  const [symbol,       setSymbol]       = useState("XAUUSD");
  const [exchange,     setExchange]     = useState("FX_IDC");
  const [interval,     setInterval]     = useState("5");
  const [activeStudies, setActiveStudies] = useState<string[]>(["RSI@tv-basicstudies","Volume@tv-basicstudies"]);
  const [tab,          setTab]          = useState<"portfolio"|"watchlist">("watchlist");
  const [search,       setSearch]       = useState("");

  // Mobile states
  const [showSymbolSheet, setShowSymbolSheet] = useState(false);
  const [showIndicators,  setShowIndicators]  = useState(false);
  const [isMobile,        setIsMobile]        = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const toggleStudy = (val: string) =>
    setActiveStudies(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);

  const selectSymbol = (s: SymbolInfo) => {
    setSymbol(s.ticker);
    setExchange(s.exchange);
    setShowSymbolSheet(false);
  };

  const displayList = tab === "portfolio" ? portfolioTickers : WATCHLIST;
  const filteredList = search
    ? displayList.filter(s =>
        s.ticker.includes(search.toUpperCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase()))
    : displayList;

  // ── Mobile Layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <main className="h-screen bg-[#0d0d0f] text-white flex flex-col overflow-hidden select-none"
        style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

        {/* Mobile Top Bar */}
        <header className="flex-shrink-0 bg-[#0a0a0c] border-b border-zinc-800 px-3 py-2 flex items-center gap-2 z-20">
          <Link href="/" className="text-zinc-500 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </Link>

          {/* Symbol button */}
          <button onClick={() => setShowSymbolSheet(true)}
            className="flex items-center gap-1.5 bg-zinc-800/80 rounded-lg px-3 py-1.5 flex-1">
            <span className="font-black text-sm text-yellow-400">{symbol}</span>
            <span className="text-zinc-600 text-xs">▾</span>
          </button>

          {/* Indicators toggle */}
          <button onClick={() => setShowIndicators(!showIndicators)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              showIndicators
                ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                : "border-zinc-700 text-zinc-500"
            }`}>
            Ind {activeStudies.length > 0 ? `(${activeStudies.length})` : ""}
          </button>

          <Link href="/portfolio"
            className="px-3 py-1.5 bg-yellow-400 text-black text-xs font-black rounded-lg flex-shrink-0">
            พอร์ต
          </Link>
        </header>

        {/* Indicators dropdown (mobile) */}
        {showIndicators && (
          <div className="flex-shrink-0 bg-[#111113] border-b border-zinc-800 px-3 py-2 flex gap-2 overflow-x-auto">
            {INDICATORS.map(ind => (
              <button key={ind.label} onClick={() => toggleStudy(ind.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  activeStudies.includes(ind.value)
                    ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                    : "border-zinc-700 text-zinc-500"
                }`}>
                {ind.label}
              </button>
            ))}
          </div>
        )}

        {/* Chart — takes all remaining space */}
        <div className="flex-1 overflow-hidden">
          <TradingViewChart symbol={symbol} exchange={exchange} interval={interval} studies={activeStudies}/>
        </div>

        {/* Timeframe bar — fixed bottom above nav */}
        <div className="flex-shrink-0 bg-[#0a0a0c] border-t border-zinc-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto z-10">
          {TIMEFRAMES.map(tf => (
            <button key={tf.tv} onClick={() => setInterval(tf.tv)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs font-black transition-colors ${
                interval === tf.tv
                  ? "bg-yellow-400 text-black"
                  : "bg-zinc-800/60 text-zinc-400"
              }`}>
              {tf.label}
            </button>
          ))}
        </div>

        {/* Symbol bottom sheet */}
        {showSymbolSheet && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSymbolSheet(false)}/>

            {/* Sheet */}
            <div className="relative bg-[#111113] rounded-t-2xl border-t border-zinc-700 max-h-[75vh] flex flex-col">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-zinc-600 rounded-full"/>
              </div>

              {/* Header */}
              <div className="px-4 pb-3 flex-shrink-0">
                <p className="text-sm font-bold mb-2">เลือกหุ้น / สินทรัพย์</p>
                {/* Tab */}
                <div className="flex gap-2 mb-2">
                  {(["watchlist","portfolio"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        tab === t ? "bg-yellow-400 text-black" : "bg-zinc-800 text-zinc-400"
                      }`}>
                      {t === "portfolio" ? "พอร์ตของฉัน" : "Watchlist"}
                    </button>
                  ))}
                </div>
                {/* Search */}
                <input
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400/50 placeholder-zinc-600"
                  placeholder="ค้นหา ticker..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {/* List */}
              <div className="overflow-y-auto flex-1 pb-6">
                {filteredList.length === 0 && (
                  <p className="text-sm text-zinc-600 text-center py-8">
                    {tab === "portfolio" ? "ยังไม่มีข้อมูลพอร์ต" : "ไม่พบ"}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 px-4">
                  {filteredList.map(s => {
                    const isActive = symbol === s.ticker;
                    return (
                      <button key={s.ticker} onClick={() => selectSymbol(s)}
                        className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                          isActive
                            ? "bg-yellow-400/10 border-yellow-400/40"
                            : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-600"
                        }`}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-black ${isActive ? "text-yellow-400" : "text-white"}`}>
                            {s.ticker}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate">{s.name}</p>
                        </div>
                        {isActive && <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0"/>}
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
    <main className="h-screen bg-[#0d0d0f] text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

      {/* Desktop Header */}
      <header className="flex-shrink-0 border-b border-zinc-800 px-4 py-2.5 flex items-center gap-3 bg-[#0d0d0f]/95 backdrop-blur z-20">
        <Link href="/" className="text-zinc-500 hover:text-white text-sm transition-colors flex-shrink-0">← หน้าแรก</Link>
        <span className="text-zinc-700">|</span>

        <button onClick={() => setShowSymbolSheet(!showSymbolSheet)}
          className="flex items-center gap-1.5 hover:bg-zinc-800 rounded-lg px-2 py-1 transition-colors">
          <span className="font-black text-lg tracking-tight text-yellow-400">{symbol}</span>
          <span className="text-zinc-600 text-xs">▾</span>
        </button>

        <span className="text-zinc-800">·</span>

        {/* Timeframes */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(tf => (
            <button key={tf.tv} onClick={() => setInterval(tf.tv)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                interval === tf.tv ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}>
              {tf.label}
            </button>
          ))}
        </div>

        <span className="text-zinc-800">·</span>

        {/* Indicators */}
        <div className="flex items-center gap-1">
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
          <Link href="/portfolio"
            className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors">
            พอร์ต →
          </Link>
        </div>
      </header>

      {/* Desktop symbol dropdown */}
      {showSymbolSheet && (
        <div className="absolute top-12 left-32 z-50 w-72 bg-[#111113] border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-3 border-b border-zinc-800">
            <div className="flex gap-1.5 mb-2">
              {(["watchlist","portfolio"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-1 rounded-lg text-xs font-bold transition-colors ${
                    tab === t ? "bg-yellow-400 text-black" : "bg-zinc-800 text-zinc-400"
                  }`}>
                  {t === "portfolio" ? "พอร์ต" : "Watchlist"}
                </button>
              ))}
            </div>
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-yellow-400/50 placeholder-zinc-600"
              placeholder="ค้นหา ticker..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredList.map(s => {
              const isActive = symbol === s.ticker;
              return (
                <button key={s.ticker} onClick={() => { selectSymbol(s); setShowSymbolSheet(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800/50 transition-colors border-b border-zinc-800/30 ${
                    isActive ? "bg-yellow-400/10" : ""
                  }`}>
                  <div className="flex-1 text-left">
                    <p className={`text-xs font-black ${isActive ? "text-yellow-400" : "text-white"}`}>{s.ticker}</p>
                    <p className="text-[10px] text-zinc-500">{s.name}</p>
                  </div>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"/>}
                </button>
              );
            })}
          </div>
          <div className="p-2 border-t border-zinc-800">
            <button onClick={() => setShowSymbolSheet(false)}
              className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300">ปิด</button>
          </div>
        </div>
      )}

      {/* Backdrop for desktop dropdown */}
      {showSymbolSheet && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSymbolSheet(false)}/>
      )}

      {/* Chart full area */}
      <div className="flex-1 overflow-hidden">
        <TradingViewChart symbol={symbol} exchange={exchange} interval={interval} studies={activeStudies}/>
      </div>

      {/* Bottom ticker strip */}
      {portfolioTickers.length > 0 && (
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
    </main>
  );
}
