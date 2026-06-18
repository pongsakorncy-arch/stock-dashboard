"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Position = {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  prevClose: number; // for daily P/L
};

type TradeMode = "buy" | "sell";
type SortKey = "ticker" | "avgCost" | "value" | "pl" | "plPct" | "dailyPL" | "allocation" | "shares";
type SortDir = "asc" | "desc";

const INITIAL_PORTFOLIO: Position[] = [
  { ticker: "GOOGL", name: "อัลฟาเบท",           shares: 7.1646262,  avgCost: 240.83, currentPrice: 0, prevClose: 0 },
  { ticker: "AMZN",  name: "แอมะซอน",             shares: 10.5848651, avgCost: 222.19, currentPrice: 0, prevClose: 0 },
  { ticker: "ASML",  name: "อาเอสเอ็มแอล โฮลดิง", shares: 1.120274,   avgCost: 750.37, currentPrice: 0, prevClose: 0 },
  { ticker: "MSFT",  name: "ไมโครซอฟท์",           shares: 4.5660891,  avgCost: 456.60, currentPrice: 0, prevClose: 0 },
  { ticker: "META",  name: "Meta",                 shares: 2.9587672,  avgCost: 627.48, currentPrice: 0, prevClose: 0 },
  { ticker: "NVDA",  name: "เอ็นวิเดีย",           shares: 7.9079846,  avgCost: 156.18, currentPrice: 0, prevClose: 0 },
  { ticker: "RBRK",  name: "Rubrik Inc",           shares: 22.4047329, avgCost: 62.39,  currentPrice: 0, prevClose: 0 },
  { ticker: "ALAB",  name: "Astera Labs, Inc",     shares: 3.7271679,  avgCost: 133.28, currentPrice: 0, prevClose: 0 },
  { ticker: "NVO",   name: "โนโว นอร์ดิสค์",      shares: 34.6614128, avgCost: 48.19,  currentPrice: 0, prevClose: 0 },
  { ticker: "NFLX",  name: "เน็ตฟลิกซ์",           shares: 17.7666769, avgCost: 101.18, currentPrice: 0, prevClose: 0 },
  { ticker: "AMD",   name: "เอเอ็มดี",             shares: 2.4819359,  avgCost: 199.32, currentPrice: 0, prevClose: 0 },
  { ticker: "SOFI",  name: "SoFi Technologies Inc", shares: 63.2978785, avgCost: 19.84,  currentPrice: 0, prevClose: 0 },
  { ticker: "PLTR",  name: "Palantir Technologies Inc", shares: 7.560984, avgCost: 140.91, currentPrice: 0, prevClose: 0 },
  { ticker: "IONQ",  name: "IONQ Inc",             shares: 12.3795114, avgCost: 48.39,  currentPrice: 0, prevClose: 0 },
  { ticker: "TSM",   name: "ทีเอสเอ็มซี",          shares: 1.3873869,  avgCost: 252.07, currentPrice: 0, prevClose: 0 },
  { ticker: "UBER",  name: "อูเบอร์",              shares: 8.1490212,  avgCost: 73.51,  currentPrice: 0, prevClose: 0 },
  { ticker: "RKLB",  name: "Rocket Lab Corp",      shares: 5.4644484,  avgCost: 91.36,  currentPrice: 0, prevClose: 0 },
  { ticker: "CRWD",  name: "คราวด์สไตรก์",         shares: 0.8078283,  avgCost: 371.37, currentPrice: 0, prevClose: 0 },
  { ticker: "TMDX",  name: "TransMedics Group Inc", shares: 5.6205782,  avgCost: 98.46,  currentPrice: 0, prevClose: 0 },
];

const COLORS = [
  "#4f7df3","#69c36b","#f0aa4f","#d43d52","#9650e6",
  "#3b82f6","#5fc46b","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#10b981","#f97316","#ec4899","#14b8a6",
  "#a78bfa","#fb923c","#34d399","#f472b6","#60a5fa",
];

const money = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const fmt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("-");
  const autoRefreshed = useRef(false);

  // Trade form state
  const [mode, setMode] = useState<TradeMode>("buy");
  const [formTicker, setFormTicker] = useState("");
  const [formShares, setFormShares] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formName, setFormName] = useState("");
  const [formAlloc, setFormAlloc] = useState(""); // % allocation input
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [modal, setModal] = useState<{ type: "buy" | "sell" | "edit"; ticker: string } | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("yok_portfolio_v3");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPositions(parsed.map((p: any) => ({ prevClose: 0, ...p })));
      } catch {
        setPositions(INITIAL_PORTFOLIO);
      }
    } else {
      setPositions(INITIAL_PORTFOLIO);
    }
  }, []);

  useEffect(() => {
    if (positions.length > 0)
      localStorage.setItem("yok_portfolio_v3", JSON.stringify(positions));
  }, [positions]);

  // Fetch quote — returns { c: current, pc: prevClose }
  const getQuote = async (symbol: string): Promise<{ c: number; pc: number }> => {
    const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!apiKey) return { c: 0, pc: 0 };
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      const data = await res.json();
      return { c: Number(data.c || 0), pc: Number(data.pc || 0) };
    } catch {
      return { c: 0, pc: 0 };
    }
  };

  const refreshPrices = async () => {
    if (positions.length === 0) return;
    setIsRefreshing(true);
    const updated = await Promise.all(
      positions.map(async (p) => {
        const { c, pc } = await getQuote(p.ticker);
        return {
          ...p,
          currentPrice: c || p.currentPrice,
          prevClose: pc || p.prevClose,
        };
      })
    );
    setPositions(updated);
    setLastUpdated(new Date().toLocaleTimeString("th-TH"));
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (positions.length > 0 && !autoRefreshed.current) {
      autoRefreshed.current = true;
      refreshPrices();
    }
  }, [positions.length]);

  // Portfolio stats
  const totalCost    = positions.reduce((s, p) => s + p.shares * p.avgCost, 0);
  const marketValue  = positions.reduce((s, p) => s + p.shares * (p.currentPrice || p.avgCost), 0);
  const totalPL      = marketValue - totalCost;
  const totalPLPct   = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const totalDailyPL = positions.reduce((s, p) => {
    if (!p.prevClose || !p.currentPrice) return s;
    return s + p.shares * (p.currentPrice - p.prevClose);
  }, 0);
  const totalDailyPct = marketValue > 0 ? (totalDailyPL / (marketValue - totalDailyPL)) * 100 : 0;

  // Sort
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const priceA = a.currentPrice || a.avgCost;
      const priceB = b.currentPrice || b.avgCost;
      const valA = a.shares * priceA, valB = b.shares * priceB;
      const costA = a.shares * a.avgCost, costB = b.shares * b.avgCost;
      const plA = valA - costA, plB = valB - costB;
      const plPctA = costA > 0 ? (plA / costA) * 100 : 0;
      const plPctB = costB > 0 ? (plB / costB) * 100 : 0;
      const allocA = marketValue > 0 ? (valA / marketValue) * 100 : 0;
      const allocB = marketValue > 0 ? (valB / marketValue) * 100 : 0;
      const dailyA = a.prevClose && a.currentPrice ? a.shares * (a.currentPrice - a.prevClose) : 0;
      const dailyB = b.prevClose && b.currentPrice ? b.shares * (b.currentPrice - b.prevClose) : 0;

      let cmp = 0;
      switch (sortKey) {
        case "ticker":    cmp = a.ticker.localeCompare(b.ticker); break;
        case "avgCost":   cmp = a.avgCost - b.avgCost; break;
        case "value":     cmp = valA - valB; break;
        case "pl":        cmp = plA - plB; break;
        case "plPct":     cmp = plPctA - plPctB; break;
        case "dailyPL":   cmp = dailyA - dailyB; break;
        case "allocation":cmp = allocA - allocB; break;
        case "shares":    cmp = a.shares - b.shares; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [positions, sortKey, sortDir, marketValue]);

  // Donut
  const donutSlices = useMemo(() => {
    if (marketValue <= 0) return "#27272a 0% 100%";
    let start = 0;
    return sortedPositions.map((p, i) => {
      const val = p.shares * (p.currentPrice || p.avgCost);
      const pctVal = (val / marketValue) * 100;
      const end = start + pctVal;
      const slice = `${COLORS[i % COLORS.length]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
      start = end;
      return slice;
    }).join(", ");
  }, [marketValue, sortedPositions]);

  // Modal openers
  const openBuy = (ticker: string) => {
    const p = positions.find(x => x.ticker === ticker);
    setMode("buy"); setFormTicker(ticker);
    setFormShares(""); setFormPrice(p ? String(p.currentPrice || p.avgCost) : "");
    setFormName(p?.name || ""); setFormAlloc(""); setEditingTicker(null); setFormError("");
    setModal({ type: "buy", ticker });
  };
  const openSell = (ticker: string) => {
    const p = positions.find(x => x.ticker === ticker);
    setMode("sell"); setFormTicker(ticker);
    setFormShares(""); setFormPrice(p ? String(p.currentPrice || p.avgCost) : "");
    setFormName(p?.name || ""); setFormAlloc(""); setEditingTicker(null); setFormError("");
    setModal({ type: "sell", ticker });
  };
  const openEdit = (ticker: string) => {
    const p = positions.find(x => x.ticker === ticker);
    if (!p) return;
    const price = p.currentPrice || p.avgCost;
    const allocPct = marketValue > 0 ? ((p.shares * price) / marketValue) * 100 : 0;
    setMode("buy"); setFormTicker(p.ticker); setFormShares(String(p.shares));
    setFormPrice(String(p.avgCost)); setFormName(p.name);
    setFormAlloc(allocPct.toFixed(2)); setEditingTicker(ticker); setFormError("");
    setModal({ type: "edit", ticker });
  };
  const closeModal = () => {
    setModal(null); setEditingTicker(null);
    setFormTicker(""); setFormShares(""); setFormPrice(""); setFormName(""); setFormAlloc(""); setFormError("");
  };

  // When allocation % changes → auto-calc shares
  const handleAllocChange = (val: string) => {
    setFormAlloc(val);
    const allocPct = parseFloat(val);
    const p = positions.find(x => x.ticker === formTicker);
    const price = p ? (p.currentPrice || p.avgCost) : parseFloat(formPrice);
    if (!isNaN(allocPct) && allocPct > 0 && allocPct <= 100 && price > 0 && marketValue > 0) {
      const targetValue = (allocPct / 100) * marketValue;
      const calcShares = targetValue / price;
      setFormShares(calcShares.toFixed(6));
    }
  };

  // When shares changes → update alloc display
  const handleSharesChange = (val: string) => {
    setFormShares(val);
    const qty = parseFloat(val);
    const p = positions.find(x => x.ticker === formTicker);
    const price = p ? (p.currentPrice || p.avgCost) : parseFloat(formPrice);
    if (!isNaN(qty) && qty > 0 && price > 0 && marketValue > 0) {
      const allocPct = (qty * price / marketValue) * 100;
      setFormAlloc(allocPct.toFixed(2));
    }
  };

  const saveTrade = () => {
    setFormError("");
    const sym = formTicker.toUpperCase().trim();
    const qty = parseFloat(formShares);
    const tradePrice = parseFloat(formPrice);

    if (!sym) { setFormError("กรุณาใส่ Ticker"); return; }
    if (isNaN(qty) || qty <= 0) { setFormError("จำนวนหุ้นต้องมากกว่า 0"); return; }
    if (isNaN(tradePrice) || tradePrice <= 0) { setFormError("ราคาต้องมากกว่า 0"); return; }

    if (editingTicker) {
      setPositions(prev => prev.map(p =>
        p.ticker === editingTicker
          ? { ...p, ticker: sym, name: formName || p.name, shares: qty, avgCost: tradePrice }
          : p
      ));
      closeModal(); return;
    }

    if (mode === "buy") {
      const existing = positions.find(p => p.ticker === sym);
      if (!existing) {
        setPositions(prev => [...prev, {
          ticker: sym, name: formName || sym,
          shares: qty, avgCost: tradePrice,
          currentPrice: tradePrice, prevClose: 0,
        }]);
      } else {
        setPositions(prev => prev.map(p => {
          if (p.ticker !== sym) return p;
          const newShares = p.shares + qty;
          const newAvg = (p.shares * p.avgCost + qty * tradePrice) / newShares;
          return { ...p, shares: newShares, avgCost: newAvg };
        }));
      }
    }

    if (mode === "sell") {
      const existing = positions.find(p => p.ticker === sym);
      if (!existing) { setFormError("ไม่พบหุ้นนี้ในพอร์ต"); return; }
      if (qty > existing.shares) { setFormError(`มีหุ้นแค่ ${existing.shares.toFixed(4)} หุ้น`); return; }
      const remaining = existing.shares - qty;
      if (remaining <= 0.00001) {
        setPositions(prev => prev.filter(p => p.ticker !== sym));
      } else {
        setPositions(prev => prev.map(p =>
          p.ticker === sym ? { ...p, shares: remaining } : p
        ));
      }
    }
    closeModal();
  };

  const deletePosition = (ticker: string) => {
    if (confirm(`ลบ ${ticker} ออกจากพอร์ต?`))
      setPositions(prev => prev.filter(p => p.ticker !== ticker));
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-0.5 opacity-40 text-[10px]">
      {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </span>
  );

  const Th = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th
      className={`px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap ${className}`}
      onClick={() => handleSort(k)}
    >
      {label}<SortIcon k={k} />
    </th>
  );

  return (
    <main className="min-h-screen bg-[#0d0d0f] text-white font-sans">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">TRUSH YOUR OWN</h1>
          <p className="text-xs text-zinc-500 mt-0.5">v2.1 · พอร์ตหุ้นอเมริกา</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">อัปเดต: {lastUpdated}</span>
          <button
            onClick={refreshPrices}
            disabled={isRefreshing}
            className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
          >
            {isRefreshing ? "⟳ กำลังโหลด..." : "⟳ อัปเดตราคา"}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 max-w-screen-2xl mx-auto">
        {/* Stats — 5 cards now including daily */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {[
            { label: "มูลค่าพอร์ต",    value: money(marketValue),  color: "text-white" },
            { label: "ต้นทุนรวม",       value: money(totalCost),    color: "text-zinc-300" },
            { label: "กำไร/ขาดทุนรวม",  value: money(totalPL),      color: totalPL >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "ผลตอบแทนรวม",    value: fmt(totalPLPct),     color: totalPLPct >= 0 ? "text-emerald-400" : "text-red-400" },
            {
              label: "วันนี้",
              value: `${totalDailyPL >= 0 ? "+" : ""}${money(totalDailyPL)}`,
              sub: fmt(totalDailyPct),
              color: totalDailyPL >= 0 ? "text-emerald-400" : "text-red-400",
            },
          ].map((s) => (
            <div key={s.label} className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              {s.sub && <p className={`text-xs mt-0.5 ${s.color}`}>{s.sub}</p>}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Table */}
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#111113]">
                  <tr>
                    <Th k="ticker"     label="หุ้น" />
                    <Th k="shares"     label="จำนวน" />
                    <Th k="avgCost"    label="ต้นทุนเฉลี่ย" />
                    <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                      ราคาปัจจุบัน
                    </th>
                    <Th k="value"      label="มูลค่า" />
                    <Th k="pl"         label="กำไร/ขาดทุน" />
                    <Th k="allocation" label="สัดส่วน" />
                    <th className="px-3 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      จัดการ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((p, idx) => {
                    const price   = p.currentPrice || p.avgCost;
                    const val     = p.shares * price;
                    const cost    = p.shares * p.avgCost;
                    const pl      = val - cost;
                    const plPct   = cost > 0 ? (pl / cost) * 100 : 0;
                    const alloc   = marketValue > 0 ? (val / marketValue) * 100 : 0;
                    const dailyPL = p.prevClose && p.currentPrice
                      ? p.shares * (p.currentPrice - p.prevClose) : null;
                    const dailyPct = p.prevClose && p.currentPrice
                      ? ((p.currentPrice - p.prevClose) / p.prevClose) * 100 : null;
                    const isPos      = pl >= 0;
                    const isDailyPos = dailyPL !== null ? dailyPL >= 0 : null;

                    return (
                      <tr key={p.ticker} className="border-t border-zinc-800 hover:bg-[#1f1f23] transition-colors">
                        {/* หุ้น */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: COLORS[idx % COLORS.length] }} />
                            <div>
                              <p className="font-bold text-sm">{p.ticker}</p>
                              <p className="text-xs text-zinc-500 truncate max-w-[110px]">{p.name}</p>
                            </div>
                          </div>
                        </td>

                        {/* จำนวน */}
                        <td className="px-3 py-3 text-sm text-yellow-300">{p.shares.toFixed(4)}</td>

                        {/* ต้นทุนเฉลี่ย */}
                        <td className="px-3 py-3 text-sm font-medium">{money(p.avgCost)}</td>

                        {/* ราคาปัจจุบัน */}
                        <td className="px-3 py-3 text-sm text-zinc-300">{money(price)}</td>

                        {/* มูลค่า */}
                        <td className="px-3 py-3 text-sm font-bold">{money(val)}</td>

                        {/* กำไร/ขาดทุน — 2 บรรทัด: ทั้งหมด + วันนี้ */}
                        <td className="px-3 py-3">
                          {/* บรรทัดบน: กำไรรวม */}
                          <p className={`text-sm font-bold ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                            {isPos ? "+" : ""}{money(pl)}
                          </p>
                          <p className={`text-xs ${isPos ? "text-emerald-400" : "text-red-400"}`}>
                            {isPos ? "▲" : "▼"} {Math.abs(plPct).toFixed(2)}%
                          </p>
                          {/* บรรทัดล่าง: วันนี้ */}
                          {dailyPL !== null ? (
                            <p className={`text-xs mt-1 ${isDailyPos ? "text-sky-400" : "text-orange-400"}`}>
                              วันนี้ {isDailyPos ? "+" : ""}{money(dailyPL)}{" "}
                              <span className="opacity-75">({isDailyPos ? "+" : ""}{dailyPct!.toFixed(2)}%)</span>
                            </p>
                          ) : (
                            <p className="text-xs mt-1 text-zinc-600">วันนี้ —</p>
                          )}
                        </td>

                        {/* สัดส่วน */}
                        <td className="px-3 py-3">
                          <div className="min-w-[72px]">
                            <p className="text-xs text-zinc-400 mb-1">{alloc.toFixed(1)}%</p>
                            <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${Math.min(alloc, 100)}%`, background: COLORS[idx % COLORS.length] }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* จัดการ */}
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openBuy(p.ticker)}
                              className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded font-medium transition-colors">
                              ซื้อ
                            </button>
                            <button onClick={() => openSell(p.ticker)}
                              className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded font-medium transition-colors">
                              ขาย
                            </button>
                            <button onClick={() => openEdit(p.ticker)}
                              className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded font-medium transition-colors">
                              แก้
                            </button>
                            <button onClick={() => deletePosition(p.ticker)}
                              className="px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded font-medium transition-colors">
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add new */}
            <div className="border-t border-zinc-800 p-4">
              <button
                onClick={() => {
                  setMode("buy"); setFormTicker(""); setFormShares("");
                  setFormPrice(""); setFormName(""); setFormAlloc("");
                  setEditingTicker(null); setFormError("");
                  setModal({ type: "buy", ticker: "" });
                }}
                className="w-full py-2.5 border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-zinc-300 rounded-lg text-sm transition-colors"
              >
                + เพิ่มหุ้นใหม่
              </button>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-4">
            {/* Donut */}
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-5">
              <div className="relative w-52 h-52 mx-auto mb-4">
                <div className="w-52 h-52 rounded-full"
                  style={{ background: `conic-gradient(${donutSlices})` }} />
                <div className="absolute inset-7 bg-[#18181b] rounded-full flex flex-col items-center justify-center text-center px-2">
                  <p className="text-xs text-zinc-500">รวม</p>
                  <p className="text-base font-bold leading-tight">{money(marketValue)}</p>
                  <p className={`text-sm font-bold ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalPL >= 0 ? "+" : ""}{money(totalPL)}
                  </p>
                  <p className={`text-xs ${totalPLPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmt(totalPLPct)}
                  </p>
                  {totalDailyPL !== 0 && (
                    <p className={`text-xs mt-1 ${totalDailyPL >= 0 ? "text-sky-400" : "text-orange-400"}`}>
                      วันนี้ {totalDailyPL >= 0 ? "+" : ""}{money(totalDailyPL)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {sortedPositions.slice(0, 12).map((p, i) => (
                  <span key={p.ticker} className="flex items-center gap-1 bg-[#111113] rounded px-2 py-1 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {p.ticker}
                  </span>
                ))}
              </div>
            </div>

            {/* Top Performers */}
            <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Top Performers</p>
              {[...positions]
                .map(p => {
                  const price = p.currentPrice || p.avgCost;
                  const val = p.shares * price;
                  const cost = p.shares * p.avgCost;
                  const plPct = cost > 0 ? ((val - cost) / cost) * 100 : 0;
                  return { ...p, plPct };
                })
                .sort((a, b) => b.plPct - a.plPct)
                .slice(0, 5)
                .map(p => (
                  <div key={p.ticker} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                    <span className="text-sm font-medium">{p.ticker}</span>
                    <span className={`text-sm font-bold ${p.plPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(p.plPct)}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#18181b] border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editingTicker ? `แก้ไข ${editingTicker}` : mode === "buy" ? "ซื้อหุ้น" : "ขายหุ้น"}
              </h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white text-xl">✕</button>
            </div>

            {!editingTicker && (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setMode("buy")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === "buy" ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>
                  ซื้อ
                </button>
                <button onClick={() => setMode("sell")}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === "sell" ? "bg-blue-500 text-white" : "bg-zinc-800 text-zinc-400"}`}>
                  ขาย
                </button>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Ticker</label>
                <input
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors uppercase"
                  placeholder="เช่น NVDA, GOOGL"
                  value={formTicker}
                  readOnly={!!editingTicker || modal.ticker !== ""}
                  onChange={(e) => setFormTicker(e.target.value.toUpperCase())}
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">ชื่อบริษัท (ไม่บังคับ)</label>
                <input
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  placeholder="เช่น เอ็นวิเดีย"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* สัดส่วน (edit mode only) */}
              {editingTicker && (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">
                    สัดส่วนเป้าหมาย (%) — ระบบจะคำนวณจำนวนหุ้นให้อัตโนมัติ
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      className="flex-1 bg-[#111113] border border-zinc-700 focus:border-purple-400 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                      placeholder="เช่น 10.5"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="100"
                      value={formAlloc}
                      onChange={(e) => handleAllocChange(e.target.value)}
                    />
                    <span className="text-zinc-400 text-sm font-bold">%</span>
                  </div>
                  {formAlloc && !isNaN(parseFloat(formAlloc)) && (
                    <p className="text-xs text-purple-400 mt-1">
                      = {money((parseFloat(formAlloc) / 100) * marketValue)} จากพอร์ต {money(marketValue)}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">
                  {editingTicker ? "จำนวนหุ้น (คำนวณจาก % หรือกรอกเอง)" : "จำนวนหุ้น"}
                </label>
                <input
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  placeholder="เช่น 5.5"
                  type="number"
                  step="any"
                  value={formShares}
                  onChange={(e) => handleSharesChange(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">
                  {editingTicker ? "ราคาเฉลี่ย (Avg Cost)" : "ราคาที่ซื้อ/ขาย ($)"}
                </label>
                <input
                  className="w-full bg-[#111113] border border-zinc-700 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  placeholder="เช่น 199.32"
                  type="number"
                  step="any"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value)}
                />
              </div>

              {formError && (
                <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>
              )}

              <button
                onClick={saveTrade}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-colors mt-1 ${
                  editingTicker
                    ? "bg-yellow-400 hover:bg-yellow-300 text-black"
                    : mode === "buy"
                    ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                    : "bg-blue-500 hover:bg-blue-400 text-white"
                }`}
              >
                {editingTicker ? "✓ บันทึกการแก้ไข" : mode === "buy" ? "✓ บันทึกการซื้อ" : "✓ บันทึกการขาย"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
