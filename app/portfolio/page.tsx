"use client";




// ─── Donut Chart Component ────────────────────────────────────────────────────
const DONUT_COLORS = [
  "#4f7df3","#69c36b","#f0aa4f","#d43d52","#9650e6",
  "#3b82f6","#5fc46b","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#10b981","#f97316","#ec4899","#14b8a6",
  "#a78bfa","#fb923c","#34d399","#f472b6","#60a5fa",
];

function DonutChart({
  positions, marketValue, hoveredIdx, setHoveredIdx, donutMounted, fmtMoney
}: {
  positions: {ticker:string;shares:number;currentPrice:number;avgCost:number}[];
  marketValue: number;
  hoveredIdx: number|null;
  setHoveredIdx: (v:number|null)=>void;
  donutMounted: boolean;
  fmtMoney: (v:number)=>string;
}) {
  const hovered = hoveredIdx !== null ? positions[hoveredIdx] : null;
  const hoveredVal = hovered ? hovered.shares*(hovered.currentPrice||hovered.avgCost) : 0;
  const hoveredPct = marketValue > 0 ? (hoveredVal/marketValue)*100 : 0;

  let start = 0;
  const slices = positions.map((p,i) => {
    const val = p.shares*(p.currentPrice||p.avgCost);
    const pct = marketValue > 0 ? (val/marketValue)*100 : 0;
    const end = start + pct;
    const color = DONUT_COLORS[i%DONUT_COLORS.length];
    const isHovered = hoveredIdx === i;
    const slice = { start, end, color, pct, isHovered };
    start = end;
    return slice;
  });

  const conicParts = slices.map(s => {
    const color = s.isHovered ? s.color : (hoveredIdx !== null ? s.color+"88" : s.color);
    return `${color} ${s.start.toFixed(2)}% ${s.end.toFixed(2)}%`;
  }).join(", ");

  return (
    <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 flex items-center gap-4 fade-up-1">
      <div className="relative flex-shrink-0 w-28 h-28">
        <div className="w-28 h-28 rounded-full transition-all duration-300"
          style={{
            background: `conic-gradient(${conicParts})`,
            transform: donutMounted ? "scale(1) rotate(-90deg)" : "scale(0.5) rotate(-90deg)",
            opacity: donutMounted ? 1 : 0,
            transition: "transform 0.8s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease",
          }}/>
        <div className="absolute inset-3 bg-[#18181b] rounded-full flex flex-col items-center justify-center transition-all duration-200">
          {hovered ? (
            <>
              <span className="text-[9px] font-black leading-none" style={{color: DONUT_COLORS[positions.indexOf(hovered)%DONUT_COLORS.length]}}>
                {hovered.ticker}
              </span>
              <span className="text-sm font-black text-white leading-none mt-0.5">{hoveredPct.toFixed(1)}%</span>
              <span className="text-[8px] text-zinc-500 leading-none mt-0.5">{fmtMoney(hoveredVal)}</span>
            </>
          ) : (
            <>
              <span className="text-[9px] text-zinc-500 leading-none">พอร์ต</span>
              <span className="text-xs font-black text-white leading-none mt-0.5">{positions.length} หุ้น</span>
              <span className="text-[8px] text-zinc-500 leading-none mt-0.5">{fmtMoney(marketValue)}</span>
            </>
          )}
        </div>
        {slices.map((s,i) => {
          const midAngle = ((s.start + s.end) / 2 / 100) * 360 - 90;
          const rad = midAngle * Math.PI / 180;
          const r = 44;
          const cx = 56 + r * Math.cos(rad);
          const cy = 56 + r * Math.sin(rad);
          return (
            <div key={i} className="absolute w-5 h-5 rounded-full cursor-pointer" style={{ left: cx-10, top: cy-10, zIndex: 10 }}
              onMouseEnter={()=>setHoveredIdx(i)} onMouseLeave={()=>setHoveredIdx(null)}/>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-28 overflow-hidden">
          {positions.slice(0,10).map((p,i) => {
            const val = p.shares*(p.currentPrice||p.avgCost);
            const pct = marketValue>0?(val/marketValue)*100:0;
            const isHov = hoveredIdx === i;
            return (
              <div key={p.ticker} className="flex items-center gap-1.5 cursor-pointer transition-opacity"
                style={{ opacity: hoveredIdx===null||isHov ? 1 : 0.4 }}
                onMouseEnter={()=>setHoveredIdx(i)} onMouseLeave={()=>setHoveredIdx(null)}>
                <span className="w-2 h-2 rounded-sm flex-shrink-0 transition-transform"
                  style={{ background: DONUT_COLORS[i%DONUT_COLORS.length], transform: isHov?"scale(1.4)":"scale(1)" }}/>
                <span className={`text-[10px] font-bold transition-colors ${isHov?"text-white":"text-zinc-400"}`}>{p.ticker}</span>
                <span className="text-[9px] text-zinc-600 ml-auto">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── DCA Calculator Component ─────────────────────────────────────────────────
function DCACalculator({
  p, dcaAmount, setDcaAmount, dcaPrice, setDcaPrice, dcaMode, setDcaMode, marketValue, fmtMoney
}: {
  p: { ticker:string; shares:number; avgCost:number; currentPrice:number };
  dcaAmount:string; setDcaAmount:(v:string)=>void;
  dcaPrice:string;  setDcaPrice:(v:string)=>void;
  dcaMode:"amount"|"shares"; setDcaMode:(v:"amount"|"shares")=>void;
  marketValue:number;
  fmtMoney:(v:number)=>string;
}) {
  const currentPrice = p.currentPrice || p.avgCost;
  const addAmt = parseFloat(dcaAmount) || 0;
  const buyPx  = parseFloat(dcaPrice)  || currentPrice;
  const addSh  = dcaMode === "amount" ? addAmt / buyPx : addAmt;
  const newSh  = p.shares + addSh;
  const newCost= newSh > 0 ? (p.shares*p.avgCost + (dcaMode==="amount"?addAmt:addSh*buyPx)) / newSh : 0;
  const newAlloc= marketValue>0 ? newSh*currentPrice/(marketValue+(dcaMode==="amount"?addAmt:addSh*buyPx))*100 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/40 rounded-xl p-3 text-xs">
        <p className="text-zinc-400 font-bold mb-2">{p.ticker} — ปัจจุบัน</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="text-zinc-600">ถือ</p><p className="font-bold">{p.shares.toFixed(4)}</p></div>
          <div><p className="text-zinc-600">Avg Cost</p><p className="font-bold text-yellow-400">${p.avgCost.toFixed(2)}</p></div>
          <div><p className="text-zinc-600">ราคาตอนนี้</p><p className="font-bold">${currentPrice.toFixed(2)}</p></div>
        </div>
      </div>

      <div className="flex gap-1 bg-zinc-800/50 p-1 rounded-lg">
        <button type="button" onClick={()=>setDcaMode("amount")}
          className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${dcaMode==="amount"?"bg-zinc-700 text-white":"text-zinc-500"}`}>
          ใส่เป็น $
        </button>
        <button type="button" onClick={()=>setDcaMode("shares")}
          className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-colors ${dcaMode==="shares"?"bg-zinc-700 text-white":"text-zinc-500"}`}>
          ใส่เป็นหุ้น
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">
            {dcaMode==="amount"?"เงินที่ซื้อเพิ่ม ($)":"จำนวนหุ้น"}
          </label>
          <input type="number" inputMode="decimal" step="any"
            value={dcaAmount} placeholder={dcaMode==="amount"?"100":"5"}
            onChange={e=>setDcaAmount(e.target.value)}
            className="w-full bg-[#111113] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none font-mono text-yellow-400 font-bold"/>
        </div>
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">ราคาที่ซื้อ ($)</label>
          <input type="number" inputMode="decimal" step="any"
            value={dcaPrice}
            onChange={e=>setDcaPrice(e.target.value)}
            className="w-full bg-[#111113] border border-zinc-700 focus:border-blue-400 rounded-lg px-3 py-2.5 text-sm outline-none font-mono"/>
        </div>
      </div>

      {addAmt > 0 ? (
        <div className="bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 border border-zinc-700/50 rounded-xl p-4 space-y-2.5">
          <p className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">ผลลัพธ์หลัง DCA</p>
          <div className="flex justify-between"><span className="text-xs text-zinc-500">ต้นทุนเฉลี่ยใหม่</span><span className="font-black text-base text-yellow-400">${newCost.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-xs text-zinc-500">จำนวนหุ้นทั้งหมด</span><span className="font-bold text-sm text-white">{newSh.toFixed(4)}</span></div>
          <div className="flex justify-between"><span className="text-xs text-zinc-500">ต้นทุนรวมใหม่</span><span className="font-bold text-sm text-zinc-300">${(newSh*newCost).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-xs text-zinc-500">สัดส่วนในพอร์ต</span><span className="font-bold text-sm text-purple-400">{newAlloc.toFixed(1)}%</span></div>
          <div className={`flex items-center gap-2 pt-2 border-t border-zinc-700/50 text-xs font-bold ${newCost<p.avgCost?"text-emerald-400":"text-red-400"}`}>
            <span>{newCost<p.avgCost?"▼ ต้นทุนลดลง":"▲ ต้นทุนเพิ่มขึ้น"}</span>
            <span>${Math.abs(newCost-p.avgCost).toFixed(2)} ({Math.abs((newCost-p.avgCost)/p.avgCost*100).toFixed(2)}%)</span>
          </div>
        </div>
      ) : (
        <p className="text-center text-zinc-600 text-xs py-2">ใส่จำนวนเงินหรือหุ้นที่จะซื้อเพิ่มครับ</p>
      )}
    </div>
  );
}

// ─── S/R Matrix Component ─────────────────────────────────────────────────────
function SRMatrix({ invest, srS, srR }: { invest: string; srS: string[]; srR: string[] }) {
  const inv = parseFloat(invest) || 0;
  const supports = srS.map(s => parseFloat(s) || 0).filter(s => s > 0);
  const resists  = srR.map(r => parseFloat(r) || 0).filter(r => r > 0);
  if (!supports.length || !resists.length || !inv) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="bg-[#111113]">
            <th className="px-2 py-2 text-yellow-400 font-black text-left">ซื้อ \ ขาย</th>
            {resists.map((r,i) => (
              <th key={i} className="px-2 py-2 text-center">
                <p className="text-red-400 font-black">R{i+1}</p>
                <p className="text-zinc-400">${r.toFixed(2)}</p>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {supports.map((s, si) => (
            <tr key={si} className="border-t border-zinc-800">
              <td className="px-2 py-2 bg-[#111113]">
                <p className="text-emerald-400 font-black">S{si+1}</p>
                <p className="text-zinc-400">${s.toFixed(2)}</p>
              </td>
              {resists.map((r, ri) => {
                const shares = inv / s;
                const pl  = (r - s) * shares;
                const pct = ((r - s) / s) * 100;
                const pos = pl >= 0;
                return (
                  <td key={ri} className={`px-2 py-2 text-center border-l border-zinc-800 ${pos ? "bg-emerald-400/5" : "bg-red-400/5"}`}>
                    <p className={`font-black ${pos ? "text-emerald-400" : "text-red-400"}`}>
                      {pos ? "+" : "-"}${Math.abs(pl).toFixed(0)}
                    </p>
                    <p className={pos ? "text-emerald-600" : "text-red-600"}>
                      ({pos ? "+" : ""}{pct.toFixed(1)}%)
                    </p>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import CurrencyToggle from "@/components/CurrencyToggle";
import { useCurrency } from "@/hooks/useCurrency";

// ─── Types ────────────────────────────────────────────────────────────────────
type Position = {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  prevClose: number;
  targetAlloc: number; // % เป้าหมายที่ตั้งไว้
  extPrice: number;   // pre/after market price
  extPct: number;     // pre/after % change
  extType: "pre"|"after"|"none";
};

type TradeMode = "buy" | "sell";
type SortKey = "ticker" | "avgCost" | "value" | "pl" | "plPct" | "dailyPL" | "dailyPct" | "allocation" | "shares";
type SortDir = "asc" | "desc";
type PLMode = "total" | "daily"; // toggle กำไรรวม vs วันนี้

// ─── Initial Data ─────────────────────────────────────────────────────────────
const INITIAL_PORTFOLIO: Position[] = [
  { ticker: "GOOGL", name: "อัลฟาเบท",              shares: 7.1646262,  avgCost: 240.83, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "AMZN",  name: "แอมะซอน",               shares: 10.5848651, avgCost: 222.19, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "ASML",  name: "อาเอสเอ็มแอล โฮลดิง",  shares: 1.120274,   avgCost: 750.37, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "MSFT",  name: "ไมโครซอฟท์",             shares: 4.5660891,  avgCost: 456.60, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "META",  name: "Meta",                   shares: 2.9587672,  avgCost: 627.48, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "NVDA",  name: "เอ็นวิเดีย",             shares: 7.9079846,  avgCost: 156.18, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "RBRK",  name: "Rubrik Inc",             shares: 22.4047329, avgCost: 62.39,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "ALAB",  name: "Astera Labs, Inc",       shares: 3.7271679,  avgCost: 133.28, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "NVO",   name: "โนโว นอร์ดิสค์",        shares: 34.6614128, avgCost: 48.19,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "NFLX",  name: "เน็ตฟลิกซ์",             shares: 17.7666769, avgCost: 101.18, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "AMD",   name: "เอเอ็มดี",               shares: 2.4819359,  avgCost: 199.32, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "SOFI",  name: "SoFi Technologies Inc",  shares: 63.2978785, avgCost: 19.84,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "PLTR",  name: "Palantir Technologies",  shares: 7.560984,   avgCost: 140.91, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "IONQ",  name: "IONQ Inc",               shares: 12.3795114, avgCost: 48.39,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "TSM",   name: "ทีเอสเอ็มซี",            shares: 1.3873869,  avgCost: 252.07, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "UBER",  name: "อูเบอร์",                shares: 8.1490212,  avgCost: 73.51,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "RKLB",  name: "Rocket Lab Corp",        shares: 5.4644484,  avgCost: 91.36,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "CRWD",  name: "คราวด์สไตรก์",           shares: 0.8078283,  avgCost: 371.37, currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
  { ticker: "TMDX",  name: "TransMedics Group Inc",  shares: 5.6205782,  avgCost: 98.46,  currentPrice: 0, prevClose: 0, targetAlloc: 0, extPrice: 0, extPct: 0, extType: "none" as const },
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



  const { currency, rate, lastUpdate: rateUpdate, toggleCurrency, format: fmtMoney } = useCurrency();

  // Toast
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"}|null>(null);
  const showToast = (msg: string, type: "success"|"error" = "success") => {
    setToast({msg,type});
    setTimeout(() => setToast(null), 2500);
  };

  // P/L column toggle
  const [plMode, setPlMode] = useState<PLMode>("total");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Modal
  const [modal, setModal]         = useState<{ type: "buy"|"sell"|"edit"; ticker: string }|null>(null);
  const [modalTab, setModalTab]     = useState<"trade"|"dca">("trade");

  // DCA Calculator states
  const [dcaAmount, setDcaAmount] = useState("");
  const [dcaPrice,  setDcaPrice]  = useState("");
  const [dcaMode,   setDcaMode]   = useState<"amount"|"shares">("amount");

  // S/R Matrix states
  const [srInvest, setSrInvest] = useState("");
  const [srS, setSrS] = useState(["","",""]);
  const [srR, setSrR] = useState(["","",""]);

  // Load SR data from localStorage when ticker changes
  useEffect(() => {
    if (!formTicker) return;
    try {
      const saved = localStorage.getItem(`sr_${formTicker}`);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.invest) setSrInvest(d.invest);
        if (d.s) setSrS(d.s);
        if (d.r) setSrR(d.r);
      } else {
        setSrInvest(""); setSrS(["","",""]); setSrR(["","",""]);
      }
    } catch {}
  }, [formTicker]);

  // Save SR to localStorage
  const saveSR = (invest: string, s: string[], r: string[]) => {
    if (!formTicker) return;
    localStorage.setItem(`sr_${formTicker}`, JSON.stringify({ invest, s, r }));
  };

  // Donut states
  const [hoveredIdx,   setHoveredIdx]   = useState<number|null>(null);
  const [donutMounted, setDonutMounted] = useState(false);
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
          extPrice: 0, extPct: 0, extType: "none" as const,
        })));
      } else {
        // New user — start with empty portfolio
        setPositions([]);
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

  // ── Market session ───────────────────────────────────────────────────────────────
  const getMarketSession = (): "pre"|"after"|"open"|"closed" => {
    const now = new Date();
    const etMin = now.getUTCHours()*60 + now.getUTCMinutes() - 240;
    const day = now.getUTCDay();
    if (day===0||day===6) return "closed";
    if (etMin>=240 && etMin<570)  return "pre";
    if (etMin>=570 && etMin<960)  return "open";
    if (etMin>=960 && etMin<1200) return "after";
    return "closed";
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const getQuote = async (sym: string): Promise<{ c: number; pc: number; o: number }> => {
    const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!key) return { c: 0, pc: 0, o: 0 };
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${key}`);
      const d = await r.json();
      return { c: Number(d.c||0), pc: Number(d.pc||0), o: Number(d.o||0) };
    } catch { return { c: 0, pc: 0, o: 0 }; }
  };

  const refreshPrices = async () => {
    if (!positions.length) return;
    setIsRefreshing(true);
    const updated = await Promise.all(
      positions.map(async p => {
        const { c, pc, o } = await getQuote(p.ticker);
        const sess = getMarketSession();
        const extPrice = (sess==="pre"||sess==="after") && o > 0 ? o : 0;
        const extPct   = extPrice > 0 && c > 0 ? ((extPrice-c)/c)*100 : 0;
        const extType  = sess==="pre"||sess==="after" ? sess : "none";
        return { ...p, currentPrice: c||p.currentPrice, prevClose: pc||p.prevClose, extPrice, extPct, extType };
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

  useEffect(() => { setTimeout(() => setDonutMounted(true), 100); }, []);

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
    setFormName(p?.name||""); setFormAlloc(""); setFormTarget(""); setEditingTicker(null); setFormError(""); setModalTab("trade");
    setDcaAmount(""); setDcaPrice(p ? String((p.currentPrice||p.avgCost).toFixed(2)) : "");
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
      closeModal(); showToast(`✓ แก้ไข ${sym} แล้ว`); return;
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
    closeModal(); showToast(`✓ บันทึก ${sym} แล้ว`);
  };

  const deletePosition = async (ticker: string) => {
    if (!confirm(`ลบ ${ticker} ออกจากพอร์ต?`)) return;
    const newPositions = positions.filter(p => p.ticker !== ticker);
    setPositions(newPositions);
    localStorage.setItem("yok_portfolio_v4", JSON.stringify(newPositions));
    const { data: { user } } = await supabase.auth.getUser();
    console.log("user:", user?.id);
    if (user) {
      const { error } = await supabase.from("portfolios")
        .delete()
        .eq("user_id", user.id)
        .eq("ticker", ticker);
      console.log("delete error:", error);
      if (!error) showToast(`✓ ลบ ${ticker} แล้ว`);
      else showToast("❌ ลบไม่สำเร็จ", "error");
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
    <>
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
          <Link href="/" className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs transition-colors font-medium">
            <span>←</span>
            <span>หน้าแรก</span>
          </Link>
          <span className="text-zinc-700 hidden sm:block">|</span>
          <h1 className="text-xs font-bold tracking-tight hidden sm:block">พอร์ตโฟลิโอ</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600 hidden sm:block">{lastUpdated}</span>
          <button onClick={refreshPrices} disabled={isRefreshing}
            className="h-8 px-3 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
            <span className={isRefreshing ? "animate-spin inline-block" : ""}>{isRefreshing ? "⟳" : "⟳"}</span>
            <span className="hidden sm:block">{isRefreshing ? "โหลด..." : "อัปเดต"}</span>
          </button>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors">
            ออก
          </button>
        </div>
      </div>

      <div className="px-6 py-4 max-w-screen-2xl mx-auto space-y-4">

        {/* ── Stats + Donut row ── */}
        <div className="grid lg:grid-cols-[1fr_260px] gap-4">

                    {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up">

            {/* มูลค่าหุ้น — Blue */}
            <div className="relative bg-gradient-to-br from-[#111827] to-[#0f172a] border border-blue-900/40 rounded-xl p-3 overflow-hidden hover-lift">
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:"radial-gradient(circle,#3b82f6,transparent)"}}/>
              <p className="text-[10px] text-blue-400/80 uppercase tracking-wider mb-1 font-bold">มูลค่าหุ้น</p>
              <p className="text-lg font-black text-white count-up">{fmtMoney(marketValue)}</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="flex-1 h-1 bg-blue-900/40 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-1000" style={{width:`${stockPct}%`}}/>
                </div>
                <span className="text-[10px] text-blue-400 font-bold">{stockPct.toFixed(0)}%</span>
              </div>
            </div>

            {/* เงินสด — Green */}
            <div className="relative bg-gradient-to-br from-[#052e16] to-[#0a1f0a] border border-emerald-900/40 rounded-xl p-3 overflow-hidden hover-lift">
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:"radial-gradient(circle,#10b981,transparent)"}}/>
              <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1 font-bold">เงินสด 💵</p>
              {showCashEdit ? (
                <div className="flex gap-1">
                  <input type="number" step="100" autoFocus value={cashInput}
                    onChange={e=>setCashInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")saveCash(parseFloat(cashInput)||0);}}
                    placeholder="0"
                    className="flex-1 min-w-0 bg-black/40 border border-emerald-700 rounded px-2 py-1 text-xs outline-none font-mono text-emerald-400"/>
                  <button onClick={()=>saveCash(parseFloat(cashInput)||0)}
                    className="text-[10px] bg-emerald-500 text-black px-2 rounded font-black">✓</button>
                  <button onClick={()=>setShowCashEdit(false)} className="text-[10px] text-zinc-500 px-1">✕</button>
                </div>
              ) : (
                <button onClick={()=>{setCashInput(String(cash));setShowCashEdit(true);}} className="text-left w-full group">
                  <p className="text-lg font-black text-emerald-400 group-hover:text-emerald-300 count-up">{fmtMoney(cash)}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="flex-1 h-1 bg-emerald-900/40 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-full transition-all duration-1000" style={{width:`${cashPct}%`}}/>
                    </div>
                    <span className="text-[10px] text-emerald-600 font-bold">{cashPct.toFixed(0)}%</span>
                  </div>
                </button>
              )}
            </div>

            {/* กำไร/ขาดทุน */}
            <div className={`relative bg-gradient-to-br border rounded-xl p-3 overflow-hidden hover-lift ${totalPL>=0?"from-[#052e16] to-[#0a1f0a] border-emerald-900/40":"from-[#2d0a0a] to-[#1a0505] border-red-900/40"}`}>
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:`radial-gradient(circle,${totalPL>=0?"#10b981":"#ef4444"},transparent)`}}/>
              <p className={`text-[10px] uppercase tracking-wider mb-1 font-bold ${totalPL>=0?"text-emerald-400/80":"text-red-400/80"}`}>กำไร/ขาดทุน</p>
              <p className={`text-lg font-black count-up-1 ${totalPL>=0?"text-emerald-400 glow-green":"text-red-400 glow-red"}`}>
                {totalPL>=0?"+":""}{fmtMoney(totalPL)}
              </p>
              <span className={`inline-flex items-center gap-0.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black ${totalPL>=0?"bg-emerald-400/10 text-emerald-400":"bg-red-400/10 text-red-400"}`}>
                {totalPL>=0?"▲":"▼"} {Math.abs(totalPLPct).toFixed(2)}%
              </span>
            </div>

            {/* วันนี้ */}
            <div className={`relative bg-gradient-to-br border rounded-xl p-3 overflow-hidden hover-lift ${totalDailyPL>=0?"from-[#0c1a2e] to-[#071220] border-sky-900/40":"from-[#2d1500] to-[#1a0d00] border-orange-900/40"}`}>
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:`radial-gradient(circle,${totalDailyPL>=0?"#38bdf8":"#f97316"},transparent)`}}/>
              <p className={`text-[10px] uppercase tracking-wider mb-1 font-bold ${totalDailyPL>=0?"text-sky-400/80":"text-orange-400/80"}`}>วันนี้</p>
              <p className={`text-lg font-black count-up-2 ${totalDailyPL>=0?"text-sky-400":"text-orange-400"}`}>
                {totalDailyPL>=0?"+":""}{fmtMoney(totalDailyPL)}
              </p>
              <span className={`inline-flex items-center gap-0.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-black ${totalDailyPL>=0?"bg-sky-400/10 text-sky-400":"bg-orange-400/10 text-orange-400"}`}>
                {totalDailyPL>=0?"▲":"▼"} {Math.abs(totalDailyPct).toFixed(2)}%
              </span>
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

                    {/* Donut — Interactive */}
          <DonutChart
            positions={sortedPositions}
            marketValue={marketValue}
            hoveredIdx={hoveredIdx}
            setHoveredIdx={setHoveredIdx}
            donutMounted={donutMounted}
            fmtMoney={fmtMoney}
          />
        </div>

        {/* ── Table ── */}
        <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden fade-up-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#111113]">
                <tr>
                  <Th k="ticker"    label="หุ้น" />
                  <Th k="shares"    label="จำนวน" className="hidden lg:table-cell" />
                  <Th k="avgCost"   label="ต้นทุน" className="hidden lg:table-cell" />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap hidden lg:table-cell">ราคา</th>
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
                  <Th k="allocation" label="สัดส่วน" className="hidden md:table-cell" />
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
                      <td className="px-3 py-3 text-sm text-yellow-300 font-mono hidden lg:table-cell">{p.shares.toFixed(4)}</td>

                      {/* ต้นทุนเฉลี่ย */}
                      <td className="px-3 py-3 text-sm font-medium hidden lg:table-cell">{money(p.avgCost)}</td>

                      {/* ราคาปัจจุบัน */}
                      <td className="px-3 py-3 text-sm text-zinc-300 hidden lg:table-cell">{money(price)}</td>

                      {/* มูลค่า */}
                      <td className="px-3 py-3 text-sm font-bold">{fmtMoney(val)}</td>

                      {/* กำไร/ขาดทุน — toggle total / daily */}
                      <td className="px-3 py-3 min-w-[140px]">
                        {plMode === "total" ? (
                          <>
                            <p className={`text-sm font-bold count-up ${isPos?"text-emerald-400 glow-green":"text-red-400 glow-red"}`}>
                              {isPos?"+":""}{fmtMoney(pl)}
                            </p>
                            <p className={`text-xs ${isPos?"text-emerald-400":"text-red-400"}`}>
                              {isPos?"▲":"▼"} {Math.abs(plPct).toFixed(2)}%
                            </p>
                            {p.extType!=="none" && p.extPrice>0 && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[9px] font-black px-1 py-0.5 rounded ${p.extType==="pre"?"bg-yellow-400/20 text-yellow-400":"bg-purple-400/20 text-purple-400"}`}>
                                  {p.extType==="pre"?"PRE":"AH"}
                                </span>
                                <span className={`text-[9px] font-bold ${p.extPct>=0?"text-emerald-400":"text-red-400"}`}>
                                  {p.extPct>=0?"+":""}{p.extPct.toFixed(2)}%
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {dailyPL !== null ? (
                              <>
                                <p className={`text-sm font-bold ${isDailyPos?"text-sky-400":"text-orange-400"}`}>
                                  {isDailyPos?"+":""}{fmtMoney(dailyPL)}
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
                      <td className="px-3 py-3 min-w-[130px] hidden md:table-cell">
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
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={()=>openBuy(p.ticker)}
                            className="ripple btn-press px-1.5 py-1 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded font-bold transition-colors">
                            <span className="hidden sm:inline">ซื้อ</span>
                            <span className="sm:hidden">+</span>
                          </button>
                          <button onClick={()=>openSell(p.ticker)}
                            className="ripple btn-press px-1.5 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded font-bold transition-colors">
                            <span className="hidden sm:inline">ขาย</span>
                            <span className="sm:hidden">-</span>
                          </button>
                          <button onClick={()=>openEdit(p.ticker)}
                            className="ripple btn-press px-1.5 py-1 text-xs bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 rounded font-bold transition-colors">
                            <span className="hidden sm:inline">แก้</span>
                            <span className="sm:hidden">✎</span>
                          </button>
                          <button onClick={()=>deletePosition(p.ticker)}
                            className="px-1.5 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded font-bold transition-colors">
                            <span className="hidden sm:inline">ลบ</span>
                            <span className="sm:hidden">✕</span>
                          </button>
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-[#18181b] border border-zinc-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">
                {editingTicker ? `แก้ไข ${editingTicker}` : mode==="buy" ? "ซื้อหุ้น" : "ขายหุ้น"}
              </h2>
              <button onClick={closeModal} className="text-zinc-500 hover:text-white text-xl">✕</button>
            </div>

            {!editingTicker && (
              <>
                {/* Main tabs: Trade / DCA / SR */}
                <div className="flex gap-1 mb-4 bg-zinc-800/50 p-1 rounded-xl">
                  <button type="button" onClick={()=>setModalTab("trade")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${modalTab==="trade"?"bg-zinc-700 text-white":"text-zinc-500"}`}>
                    💹 ซื้อ/ขาย
                  </button>
                  <button type="button" onClick={()=>setModalTab("dca")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${modalTab==="dca"?"bg-yellow-400/20 text-yellow-400":"text-zinc-500"}`}>
                    📊 DCA
                  </button>
                  <button type="button" onClick={()=>setModalTab("sr" as any)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${modalTab==="sr"?"bg-purple-400/20 text-purple-400":"text-zinc-500"}`}>
                    🎯 S/R
                  </button>
                </div>

                {/* Sub tabs for trade mode */}
                {modalTab === "trade" && (
                  <div className="flex gap-2 mb-4">
                    <button onClick={()=>setMode("buy")}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode==="buy"?"bg-emerald-500 text-black":"bg-zinc-800 text-zinc-400"}`}>ซื้อ</button>
                    <button onClick={()=>setMode("sell")}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode==="sell"?"bg-blue-500 text-white":"bg-zinc-800 text-zinc-400"}`}>ขาย</button>
                  </div>
                )}
              </>
            )}

            {/* DCA Calculator */}
            {modalTab === "dca" && (
              positions.find(x=>x.ticker===formTicker)
                ? <DCACalculator
                    p={positions.find(x=>x.ticker===formTicker)!}
                    dcaAmount={dcaAmount} setDcaAmount={setDcaAmount}
                    dcaPrice={dcaPrice}   setDcaPrice={setDcaPrice}
                    dcaMode={dcaMode}     setDcaMode={setDcaMode}
                    marketValue={marketValue}
                    fmtMoney={fmtMoney}
                  />
                : <p className="text-zinc-500 text-sm text-center py-4">เลือกหุ้นก่อนครับ</p>
            )}

            {/* S/R Matrix */}
            {(modalTab as any) === "sr" && (
              <div className="space-y-3">
                {/* Current position info — เหมือน DCA */}
                {positions.find(x=>x.ticker===formTicker) && (
                  <div className="bg-zinc-800/40 rounded-xl p-3 text-xs">
                    <p className="text-zinc-400 font-bold mb-2">{positions.find(x=>x.ticker===formTicker)!.ticker} — ปัจจุบัน</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-zinc-600">ถือ</p><p className="font-bold">{positions.find(x=>x.ticker===formTicker)!.shares.toFixed(4)}</p></div>
                      <div><p className="text-zinc-600">Avg Cost</p><p className="font-bold text-yellow-400">${positions.find(x=>x.ticker===formTicker)!.avgCost.toFixed(2)}</p></div>
                      <div><p className="text-zinc-600">ราคาตอนนี้</p><p className="font-bold">${(positions.find(x=>x.ticker===formTicker)!.currentPrice||positions.find(x=>x.ticker===formTicker)!.avgCost).toFixed(2)}</p></div>
                    </div>
                  </div>
                )}

                {/* Investment amount */}
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">💰 เงินลงทุน ($)</label>
                  <input type="number" inputMode="decimal" step="any"
                    value={srInvest} placeholder="1000"
                    onChange={e=>{ setSrInvest(e.target.value); saveSR(e.target.value, srS, srR); }}
                    className="w-full bg-[#111113] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none font-mono text-yellow-400 font-black"/>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Support levels — แค่ 3 */}
                  <div className="space-y-2">
                    <p className="text-xs font-black text-emerald-400">📗 แนวรับ (ซื้อ)</p>
                    {["S1","S2","S3"].map((label,i)=>(
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-emerald-400 w-5">{label}</span>
                        <input type="number" inputMode="decimal" step="any"
                          value={srS[i]} placeholder="ราคา"
                          onChange={e=>{const n=[...srS];n[i]=e.target.value;setSrS(n);saveSR(srInvest,n,srR);}}
                          className="flex-1 bg-[#111113] border border-emerald-900/50 focus:border-emerald-400 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"/>
                      </div>
                    ))}
                  </div>

                  {/* Resistance levels — แค่ 3 */}
                  <div className="space-y-2">
                    <p className="text-xs font-black text-red-400">📕 แนวต้าน (ขาย)</p>
                    {["R1","R2","R3"].map((label,i)=>(
                      <div key={label} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-red-400 w-5">{label}</span>
                        <input type="number" inputMode="decimal" step="any"
                          value={srR[i]} placeholder="ราคา"
                          onChange={e=>{const n=[...srR];n[i]=e.target.value;setSrR(n);saveSR(srInvest,srS,n);}}
                          className="flex-1 bg-[#111113] border border-red-900/50 focus:border-red-400 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Clear button */}
                {(srInvest||srS.some(s=>s)||srR.some(r=>r)) && (
                  <button type="button"
                    onClick={()=>{ setSrInvest(""); setSrS(["","",""]); setSrR(["","",""]); if(formTicker) localStorage.removeItem(`sr_${formTicker}`); }}
                    className="w-full py-1.5 text-xs text-zinc-600 hover:text-red-400 border border-zinc-800 hover:border-red-400/30 rounded-lg transition-colors">
                    🗑 ล้างข้อมูล S/R นี้
                  </button>
                )}

                {/* Matrix Table — ไม่ใช้ IIFE */}
                {srInvest && srS.some(s=>s) && srR.some(r=>r) ? (
                  <SRMatrix invest={srInvest} srS={srS} srR={srR} />
                ) : (
                  <p className="text-center text-zinc-600 text-xs py-2">ใส่เงินลงทุน + ราคา S/R แล้วตารางจะขึ้นอัตโนมัติครับ</p>
                )}
              </div>
            )}

            {/* Trade Form */}
            {(modalTab === "trade" || editingTicker) && (
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
            )}
          </div>
        </div>
      )}
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl ${
          toast.type==="success"
            ? "bg-emerald-500 text-black"
            : "bg-red-500 text-white"
        } ${toast ? "toast-in" : "toast-out"}`}>
          {toast.msg}
        </div>
      )}
    </main>
    </>
  );
}
