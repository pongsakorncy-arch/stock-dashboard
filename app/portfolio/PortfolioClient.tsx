"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import CurrencyToggle from "@/components/CurrencyToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useCurrency } from "@/hooks/useCurrency";

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = [
  "#4f7df3","#69c36b","#f0aa4f","#d43d52","#9650e6",
  "#3b82f6","#5fc46b","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#10b981","#f97316","#ec4899","#14b8a6",
  "#a78bfa","#fb923c","#34d399","#f472b6","#60a5fa",
];

const GROUP_ICONS = ["💼","📊","⚖️","🚀","💎","🎯","🏦","📈","🌱","🔥","💰","🧭"];

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

// ⭐ พอร์ต (portfolio group) — ชื่อ/ไอคอนตั้งเองได้ทั้งหมด
type PortfolioGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  sort_order: number;
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PortfolioClient() {
  const [positions, setPositions]       = useState<Position[]>([]);
  const positionsRef                    = useRef<Position[]>([]);
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
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory]   = useState(false);
  const [isTrading, setIsTrading]       = useState(false);
  const tradeTimeoutRef                 = useRef<NodeJS.Timeout|null>(null);
  // ป้องกัน refresh ราคาที่เริ่มก่อนการแก้ไข/ลบ เขียนข้อมูลเก่ากลับเข้า Supabase
  const positionsMutationRef             = useRef(0);

  // ── NEW: Alerts & Rebalance ────────────────────────────────────────────────
  const [showAlerts, setShowAlerts]           = useState(false);
  const [showRebalance, setShowRebalance]     = useState(false);
  const [rebalanceInvest, setRebalanceInvest] = useState("");
  const alertFiredRef                          = useRef<Set<string>>(new Set());
  const [notifPermission, setNotifPermission] = useState<"default"|"denied"|"granted">("default");

  // ── Telegram Alerts ────────────────────────────────────────────────────────
  const [showTgAlerts,   setShowTgAlerts]   = useState(false);
  const [tgAlerts,       setTgAlerts]       = useState<any[]>([]);
  const [tgLoading,      setTgLoading]      = useState(false);
  const [tgForm,         setTgForm]         = useState({ ticker: "", price: "", condition: "above" as "above"|"below", label: "" });

  // ── ⭐ Multi-Portfolio (Groups) ─────────────────────────────────────────────
  const [groups, setGroups]               = useState<PortfolioGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>("");
  const [groupsLoaded, setGroupsLoaded]   = useState(false);
  const [showGroupModal, setShowGroupModal] = useState<{mode:"create"|"rename";id?:string}|null>(null);
  const [groupNameInput, setGroupNameInput] = useState("");
  const [groupIconInput, setGroupIconInput] = useState("💼");
  const [showGroupMenu, setShowGroupMenu]   = useState<string|null>(null);

  const activeGroup = groups.find(g => g.id === activeGroupId) || null;

  const fetchTgAlerts = async () => {
    setTgLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/alerts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setTgAlerts(data);
    } catch { /* ignore */ }
    setTgLoading(false);
  };

  const addTgAlert = async () => {
    if (!tgForm.ticker || !tgForm.price) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast("กรุณา Login ก่อน", "error"); return; }
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(tgForm),
      });
      if (res.ok) {
        setTgForm({ ticker: "", price: "", condition: "above", label: "" });
        fetchTgAlerts();
        showToast("✅ ตั้ง Alert แล้ว — Telegram จะแจ้งเตือนเมื่อราคาถึง");
      }
    } catch { showToast("เพิ่ม Alert ไม่ได้", "error"); }
  };

  const deleteTgAlert = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/alerts?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setTgAlerts(prev => prev.filter(a => a.id !== id));
      showToast("ลบ Alert แล้ว");
    } catch { showToast("ลบไม่ได้", "error"); }
  };

  useEffect(() => { if (showTgAlerts) fetchTgAlerts(); }, [showTgAlerts]);

  const { currency, rate, lastUpdate: rateUpdate, toggleCurrency, format: fmtMoney } = useCurrency();

  // Keep positionsRef in sync with the latest positions (prevents stale closure in interval/refresh)
  useEffect(() => { positionsRef.current = positions; }, [positions]);

  const showToast = (msg: string, type: "success"|"error" = "success") => {
    setToast({msg,type});
    setTimeout(() => setToast(null), 2500);
  };

  // ── NEW: Sync notification permission on mount ────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission as "default"|"denied"|"granted");
    }
  }, []);

  const requestNotification = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm as "default"|"denied"|"granted");
  };

  // ── ⭐ Load Portfolio Groups (ทำก่อนโหลดหุ้น) ──────────────────────────────
  useEffect(() => {
    const loadGroups = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setGroupsLoaded(true); return; }

      let { data } = await supabase.from("portfolio_groups").select("*")
        .eq("user_id", user.id).order("sort_order", { ascending: true });

      // user ใหม่ที่ยังไม่มีพอร์ตเลย → สร้าง "พอร์ตหลัก" ให้อัตโนมัติ
      if (!data || data.length === 0) {
        const { data: created } = await supabase.from("portfolio_groups").insert({
          user_id: user.id, name: "พอร์ตหลัก", icon: "💼", is_default: true, sort_order: 0,
        }).select().single();
        data = created ? [created] : [];
      }

      setGroups(data || []);

      const saved = typeof window !== "undefined" ? localStorage.getItem("yok_active_portfolio_id") : null;
      const validSaved = data?.find(g => g.id === saved);
      const initial = validSaved ? saved! : (data?.find(g => g.is_default)?.id || data?.[0]?.id || "");
      setActiveGroupId(initial);
      setGroupsLoaded(true);
    };
    loadGroups();
  }, []);

  // จำพอร์ตที่เลือกล่าสุดไว้
  useEffect(() => {
    if (activeGroupId) localStorage.setItem("yok_active_portfolio_id", activeGroupId);
  }, [activeGroupId]);

  // ปิดเมนู ⋯ เมื่อคลิกที่อื่น
  useEffect(() => {
    if (!showGroupMenu) return;
    const close = () => setShowGroupMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [showGroupMenu]);

  // ── ⭐ Group CRUD ───────────────────────────────────────────────────────────
  const createGroup = async () => {
    const name = groupNameInput.trim();
    if (!name) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from("portfolio_groups").insert({
      user_id: user.id, name, icon: groupIconInput, is_default: false, sort_order: groups.length,
    }).select().single();
    if (data) {
      setGroups(prev => [...prev, data]);
      setActiveGroupId(data.id);
      showToast(`✓ สร้างพอร์ต "${data.name}" แล้ว`);
    } else {
      showToast("สร้างพอร์ตไม่สำเร็จ", "error");
    }
    setShowGroupModal(null); setGroupNameInput(""); setGroupIconInput("💼");
  };

  const renameGroup = async (id: string) => {
    const name = groupNameInput.trim();
    if (!name) return;
    await supabase.from("portfolio_groups").update({ name, icon: groupIconInput }).eq("id", id);
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name, icon: groupIconInput } : g));
    showToast("✓ แก้ไขพอร์ตแล้ว");
    setShowGroupModal(null); setGroupNameInput(""); setGroupIconInput("💼");
  };

  const deleteGroup = async (id: string) => {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    if (g.is_default) { showToast("ลบพอร์ตหลักไม่ได้", "error"); return; }
    if (groups.length <= 1) { showToast("ต้องมีอย่างน้อย 1 พอร์ต", "error"); return; }
    if (!confirm(`ลบพอร์ต "${g.name}" ทั้งหมด? หุ้น เงินสด และประวัติในพอร์ตนี้จะหายถาวร`)) return;

    await supabase.from("portfolio_groups").delete().eq("id", id); // FK cascade ลบ positions/settings/trades ให้อัตโนมัติ
    const next = groups.filter(x => x.id !== id);
    setGroups(next);
    if (activeGroupId === id) {
      const def = next.find(x => x.is_default) || next[0];
      setActiveGroupId(def.id);
    }
    try { localStorage.removeItem(`yok_portfolio_v4__${id}`); } catch {}
    showToast(`✓ ลบพอร์ต "${g.name}" แล้ว`);
  };

  // ── ⭐ Load positions/cash/history — scoped ตามพอร์ตที่เลือกอยู่ ────────────
  useEffect(() => {
    if (!groupsLoaded || !activeGroupId) return;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from("portfolios").select("*")
        .eq("user_id", user.id).eq("portfolio_id", activeGroupId);
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

      const { data: s } = await supabase.from("user_settings").select("cash")
        .eq("user_id", user.id).eq("portfolio_id", activeGroupId).maybeSingle();
      setCash(s ? Number(s.cash) || 0 : 0);

      const { data: trades } = await supabase.from("portfolio_trades").select("*")
        .eq("user_id", user.id).eq("portfolio_id", activeGroupId).order("created_at", { ascending: false });
      setTradeHistory(trades || []);

      // อนุญาตให้ auto-refresh ราคาทำงานใหม่สำหรับพอร์ตที่เพิ่งสลับมา
      autoRefreshed.current = false;
    };
    load();
  }, [activeGroupId, groupsLoaded]);

  const saveToSupabase = async (userId: string, pos: Position[]) => {
    if (!activeGroupId) return;
    const rows = pos.map(p => ({
      user_id: userId, portfolio_id: activeGroupId, ticker: p.ticker, name: p.name,
      shares: p.shares, avg_cost: p.avgCost,
      current_price: p.currentPrice, prev_close: p.prevClose,
      target_alloc: p.targetAlloc, updated_at: new Date().toISOString(),
    }));
    await supabase.from("portfolios").upsert(rows, { onConflict: "user_id,portfolio_id,ticker" });
    try {
      localStorage.setItem(`yok_portfolio_v4__${activeGroupId}`, JSON.stringify(pos));
      // mirror พอร์ตที่กำลังดูอยู่ไว้ให้หน้า Dashboard/Chart อ่านได้ (ใช้ชั่วคราวจนกว่าจะทำตัวเลือกพอร์ตที่หน้านั้นด้วย)
      localStorage.setItem("yok_portfolio_v4", JSON.stringify(pos));
    } catch {}
  };

  const recordTrade = async (ticker: string, type: "buy"|"sell", shares: number, price: number, costBefore: number, costAfter: number, pl: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !activeGroupId) return;
    await supabase.from("portfolio_trades").insert({
      user_id: user.id, portfolio_id: activeGroupId, ticker, type, shares, price,
      amount: shares * price,
      avg_cost_before: costBefore,
      avg_cost_after: costAfter,
      pl,
      created_at: new Date().toISOString(),
    });
  };

  const syncPositions = async (newPos: Position[]) => {
    setPositions(newPos);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await saveToSupabase(user.id, newPos);
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

  // ── refreshPrices + S/R Alert check ─────────────────────────────────
  const refreshPrices = async () => {
    const refreshVersion = positionsMutationRef.current;
    const refreshGroupId = activeGroupId;
    const cur = positionsRef.current;
    if (!cur.length) return;
    setIsRefreshing(true);
    const sess = getSession();
    const updated = await Promise.all(cur.map(async p => {
      const { c, pc, o } = await getQuote(p.ticker);
      const extPrice = (sess==="pre"||sess==="after") && o > 0 ? o : 0;
      const extPct   = extPrice>0&&c>0 ? ((extPrice-c)/c)*100 : 0;
      const extType: "pre"|"after"|"none" = sess==="pre"||sess==="after" ? sess : "none";
      return { ...p, currentPrice: c||p.currentPrice, prevClose: pc||p.prevClose, extPrice, extPct, extType, targetAlloc: p.targetAlloc };
    }));
    // ถ้าระหว่างโหลดราคามีการซื้อ/ขาย/แก้ไข/ลบ หรือสลับพอร์ตแล้ว
    // ห้ามนำ snapshot เก่ากลับมาเขียนทับข้อมูลล่าสุด
    if (
      refreshVersion !== positionsMutationRef.current ||
      refreshGroupId !== activeGroupId
    ) {
      setIsRefreshing(false);
      return;
    }

    await syncPositions(updated);

    // ── Check S/R Alerts ────────────────────────────────────────────────
    const ALERT_PCT = 1.0;
    for (const pos of updated) {
      if (!pos.currentPrice) continue;
      try {
        const srRaw = localStorage.getItem(`sr_${pos.ticker}`);
        if (!srRaw) continue;
        const srData = JSON.parse(srRaw);
        const supports: number[] = (srData.s || []).map(Number).filter((n: number) => n > 0);
        const resists:  number[] = (srData.r || []).map(Number).filter((n: number) => n > 0);
        const levels = [
          ...supports.map((lv, i) => ({ lv, type: "S" as const, n: i + 1 })),
          ...resists.map((lv, i)  => ({ lv, type: "R" as const, n: i + 1 })),
        ];
        for (const { lv, type, n } of levels) {
          const dist = Math.abs((pos.currentPrice - lv) / lv) * 100;
          const key  = `${pos.ticker}_${type}${n}_${lv}`;
          if (dist <= ALERT_PCT && !alertFiredRef.current.has(key)) {
            alertFiredRef.current.add(key);
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(
                `🎯 ${pos.ticker} ใกล้แนว${type === "S" ? "รับ" : "ต้าน"} ${type}${n}`,
                {
                  body: `ราคา $${pos.currentPrice.toFixed(2)} ห่าง $${lv.toFixed(2)} แค่ ${dist.toFixed(2)}%`,
                  icon: "/icon.svg",
                }
              );
            }
          }
        }
      } catch { /* ignore */ }
    }
    // ─────────────────────────────────────────────────────────────────────────

    setLastUpdated(new Date().toLocaleTimeString("th-TH"));
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (positions.length > 0 && !autoRefreshed.current) {
      autoRefreshed.current = true;
      refreshPrices();
    }
  }, [positions.length, activeGroupId]);

  useEffect(() => {
    if (!positions.length || isTrading) return;
    const id = setInterval(refreshPrices, 60000);
    return () => clearInterval(id);
  }, [positions.length, isTrading]);

  const saveCash = async (val: number) => {
    setCash(val); setShowCashEdit(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !activeGroupId) return;
    await supabase.from("user_settings").upsert({
      user_id: user.id, portfolio_id: activeGroupId, cash: val, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,portfolio_id" });
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

  // S/R ยังคง global ตาม ticker (ไม่ผูกกับพอร์ต เพราะแนวรับ/ต้านเป็นของราคาหุ้นตัวนั้น ไม่ใช่ของพอร์ต)
  async function loadSR(ticker: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("sr_levels")
          .select("*")
          .eq("user_id", user.id)
          .eq("ticker", ticker)
          .single();
        if (data) {
          setSrInvest(String(data.invest || ""));
          setSrS((data.supports || []).map(String).concat(["","",""]).slice(0,3));
          setSrR((data.resists  || []).map(String).concat(["","",""]).slice(0,3));
          return;
        }
      }
      const d = JSON.parse(localStorage.getItem(`sr_${ticker}`) || "{}");
      setSrInvest(d.invest||""); setSrS(d.s||["","",""]); setSrR(d.r||["","",""]);
    } catch {
      setSrInvest(""); setSrS(["","",""]); setSrR(["","",""]);
    }
  }

  async function saveSR(invest: string, s: string[], r: string[]) {
    if (!formTicker) return;
    localStorage.setItem(`sr_${formTicker}`, JSON.stringify({invest,s,r}));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const supports = s.map(v => parseFloat(v)).filter(v => v > 0);
      const resists  = r.map(v => parseFloat(v)).filter(v => v > 0);
      await supabase.from("sr_levels").upsert({
        user_id: user.id,
        ticker: formTicker,
        invest: parseFloat(invest) || 0,
        supports,
        resists,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,ticker" });
    } catch (e) {
      console.error("saveSR error", e);
    }
  }

  async function deletePosition(ticker: string) {
    if (!confirm(`ลบ ${ticker} ออกจากพอร์ต?`)) return;

    const groupId = activeGroupId;
    if (!groupId) {
      showToast("ไม่พบพอร์ตที่กำลังใช้งาน", "error");
      return;
    }

    // invalidate refresh ราคาทุกตัวที่กำลังทำงานด้วย snapshot เก่า
    positionsMutationRef.current += 1;

    const beforeDelete = positionsRef.current;
    const newPos = beforeDelete.filter(p => p.ticker !== ticker);

    // อัปเดตทั้ง state และ ref ทันที เพื่อไม่ให้ interval รอบใหม่เห็นหุ้นตัวเก่า
    positionsRef.current = newPos;
    setPositions(newPos);

    try {
      localStorage.setItem(`yok_portfolio_v4__${groupId}`, JSON.stringify(newPos));
      localStorage.setItem("yok_portfolio_v4", JSON.stringify(newPos));
    } catch {}

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      positionsRef.current = beforeDelete;
      setPositions(beforeDelete);
      showToast("กรุณา Login ใหม่", "error");
      return;
    }

    const { error } = await supabase.from("portfolios").delete()
      .eq("user_id", user.id)
      .eq("portfolio_id", groupId)
      .eq("ticker", ticker);

    if (error) {
      // rollback หน้าจอเมื่อฐานข้อมูลลบไม่สำเร็จ
      positionsRef.current = beforeDelete;
      setPositions(beforeDelete);
      try {
        localStorage.setItem(`yok_portfolio_v4__${groupId}`, JSON.stringify(beforeDelete));
        localStorage.setItem("yok_portfolio_v4", JSON.stringify(beforeDelete));
      } catch {}
      console.error("deletePosition error", error);
      showToast(`❌ ลบ ${ticker} ไม่สำเร็จ: ${error.message}`, "error");
      return;
    }

    showToast(`✓ ลบ ${ticker} แล้ว`);
  }

  function saveTrade() {
    setFormError("");
    const sym = formTicker.toUpperCase().trim();
    const qty = parseFloat(formShares);
    const tradePrice = parseFloat(formPrice);
    const target = parseFloat(formTarget)||0;
    const cur = positionsRef.current;
    if (!sym) { setFormError("กรุณาใส่ Ticker"); return; }
    if (isNaN(qty)||qty<=0) { setFormError("จำนวนหุ้นต้องมากกว่า 0"); return; }
    if (isNaN(tradePrice)||tradePrice<=0) { setFormError("ราคาต้องมากกว่า 0"); return; }

    // ── Lock target allocation: รวมทุกหุ้นในพอร์ตนี้ต้องไม่เกิน 100% ──
    const selfKey = editingTicker || sym;
    const othersTarget = cur.reduce((s,p) => p.ticker===selfKey ? s : s + (p.targetAlloc||0), 0);
    if (othersTarget + target > 100.01) {
      const remain = Math.max(0, 100 - othersTarget);
      setFormError(`สัดส่วนเป้าหมายรวมเกิน 100% — หุ้นอื่นในพอร์ตนี้ใช้ไปแล้ว ${othersTarget.toFixed(1)}% เหลือตั้งได้สูงสุด ${remain.toFixed(1)}%`);
      return;
    }

    // ยกเลิกผล refresh ราคาที่เริ่มจากข้อมูลก่อนการทำรายการนี้
    positionsMutationRef.current += 1;

    if (editingTicker) {
      syncPositions(cur.map(p =>
        p.ticker===editingTicker ? {...p, ticker:sym, name:formName||p.name, shares:qty, avgCost:tradePrice, targetAlloc:target} : p
      ));
      showToast(`✓ แก้ไข ${sym} แล้ว`);
      closeModal(); return;
    }
    if (mode==="buy") {
      const ex = cur.find(p=>p.ticker===sym);
      if (!ex) {
        syncPositions([...cur, {ticker:sym,name:formName||sym,shares:qty,avgCost:tradePrice,currentPrice:tradePrice,prevClose:0,targetAlloc:target,extPrice:0,extPct:0,extType:"none"}]);
        recordTrade(sym, "buy", qty, tradePrice, 0, tradePrice, 0);
      } else {
        const oldAvg = ex.avgCost;
        const ns = ex.shares+qty;
        const newAvg = (ex.shares*oldAvg+qty*tradePrice)/ns;
        syncPositions(cur.map(p => {
          if (p.ticker!==sym) return p;
          return {...p, shares:ns, avgCost:newAvg, targetAlloc:target};
        }));
        recordTrade(sym, "buy", qty, tradePrice, oldAvg, newAvg, 0);
      }
    }
    if (mode==="sell") {
      const ex = cur.find(p=>p.ticker===sym);
      if (!ex) { setFormError("ไม่พบหุ้นนี้"); return; }
      if (qty>ex.shares) { setFormError(`มีหุ้นแค่ ${ex.shares.toFixed(4)}`); return; }
      const pl = (tradePrice - ex.avgCost) * qty;
      if (ex.shares-qty <= 0.00001) {
        syncPositions(cur.filter(p=>p.ticker!==sym));
        recordTrade(sym, "sell", qty, tradePrice, ex.avgCost, ex.avgCost, pl);
      } else {
        syncPositions(cur.map(p=>p.ticker===sym?{...p,shares:p.shares-qty,targetAlloc:target}:p));
        recordTrade(sym, "sell", qty, tradePrice, ex.avgCost, ex.avgCost, pl);
      }
    }
    showToast(`✓ บันทึก ${sym} แล้ว`);
    closeModal();
    setIsTrading(true);
    if (tradeTimeoutRef.current) clearTimeout(tradeTimeoutRef.current);
    tradeTimeoutRef.current = setTimeout(() => setIsTrading(false), 3000);
  }

  function SortIcon({ k }: { k: SortKey }) {
    return <span className="ml-0.5 opacity-40 text-[10px]">{sortKey===k?(sortDir==="asc"?"↑":"↓"):"↕"}</span>;
  }
  function Th({ k, label, className="" }: { k:SortKey; label:string; className?:string }) {
    return (
      <th className={`px-3 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase tracking-wider cursor-pointer select-none hover:text-[var(--tx)] transition-colors whitespace-nowrap ${className}`}
        onClick={()=>handleSort(k)}>
        {label}<SortIcon k={k}/>
      </th>
    );
  }

  // ── Get all S/R data for Alerts section ──────────────────────────────────
  function getAllSRData() {
    if (typeof window === "undefined") return [];
    type SRRow = {
      ticker: string; currentPrice: number; level: number;
      type: "S"|"R"; n: number; dist: number; crossed: boolean;
    };
    const results: SRRow[] = [];
    positions.forEach(pos => {
      if (!pos.currentPrice) return;
      try {
        const srRaw = localStorage.getItem(`sr_${pos.ticker}`);
        if (!srRaw) return;
        const srData = JSON.parse(srRaw);
        const supports: number[] = (srData.s || []).map(Number).filter((v: number) => v > 0);
        const resists:  number[] = (srData.r || []).map(Number).filter((v: number) => v > 0);
        supports.forEach((lv, i) => {
          const dist = ((pos.currentPrice - lv) / lv) * 100;
          results.push({ ticker: pos.ticker, currentPrice: pos.currentPrice, level: lv, type: "S", n: i+1, dist, crossed: pos.currentPrice < lv });
        });
        resists.forEach((lv, i) => {
          const dist = ((pos.currentPrice - lv) / lv) * 100;
          results.push({ ticker: pos.ticker, currentPrice: pos.currentPrice, level: lv, type: "R", n: i+1, dist, crossed: pos.currentPrice > lv });
        });
      } catch { /* ignore */ }
    });
    return results.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
  }

  // ── Calculate Rebalance ──────────────────────────────────────────────────────
  function calcRebalance() {
    const addInvest = parseFloat(rebalanceInvest) || 0;
    const newTotal  = marketValue + addInvest;
    if (newTotal <= 0) return [];
    return positions
      .filter(p => p.targetAlloc > 0 && p.currentPrice > 0)
      .map(p => {
        const curValue   = p.shares * p.currentPrice;
        const tgtValue   = (p.targetAlloc / 100) * newTotal;
        const diffValue  = tgtValue - curValue;
        const diffShares = p.currentPrice > 0 ? diffValue / p.currentPrice : 0;
        const allocNow   = marketValue > 0 ? (curValue / marketValue) * 100 : 0;
        return {
          ticker: p.ticker, name: p.name, price: p.currentPrice,
          targetPct: p.targetAlloc, allocNow, diffValue, diffShares,
          action: (diffValue >= 0 ? "buy" : "sell") as "buy"|"sell",
        };
      })
      .sort((a, b) => Math.abs(b.diffValue) - Math.abs(a.diffValue));
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
      .pulse-alert { animation: pulseAlert 1.5s ease-in-out infinite; }
      .scrollbar-none::-webkit-scrollbar { display: none; }
      .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
      @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes countUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      @keyframes glowG { 0%,100%{text-shadow:0 0 0 #10b981} 50%{text-shadow:0 0 12px #10b98188} }
      @keyframes glowR { 0%,100%{text-shadow:0 0 0 #ef4444} 50%{text-shadow:0 0 12px #ef444488} }
      @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
      @keyframes toastIn { from{opacity:0;transform:translateY(20px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes pulseAlert { 0%,100%{opacity:1} 50%{opacity:0.5} }
    `}</style>
    <main className="min-h-screen bg-[var(--bg)] text-[var(--tx)] font-sans">

      {/* ── Header ── */}
      <div className="border-b border-[var(--border)] px-3 py-2.5 flex items-center justify-between bg-[var(--bg)]/90 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-[var(--tx-4)] hover:text-[var(--tx)] text-xs transition-colors">← หน้าแรก</Link>
          <span className="text-[var(--tx-6)] hidden sm:block">|</span>
          <h1 className="text-xs font-bold tracking-tight hidden sm:block">TRUSH YOUR OWN · พอร์ต</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--tx-5)] hidden sm:block">อัปเดต: {lastUpdated}</span>
          <ThemeToggle/>
          <CurrencyToggle currency={currency} rate={rate} lastUpdate={rateUpdate} onToggle={toggleCurrency}/>
          <button onClick={refreshPrices} disabled={isRefreshing}
            className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-black text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
            <span className={isRefreshing?"animate-spin":""}>⟳</span>
            <span className="hidden sm:block">{isRefreshing?"กำลังโหลด...":"อัปเดตราคา"}</span>
          </button>
          <button onClick={async()=>{await supabase.auth.signOut();window.location.href="/login";}}
            className="px-2.5 py-2 bg-[var(--fill)] hover:bg-[var(--fill-strong)] text-[var(--tx-3)] text-xs rounded-lg transition-colors">
            <span className="hidden sm:block">ออกจากระบบ</span>
            <span className="sm:hidden">ออก</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-4 max-w-screen-2xl mx-auto space-y-4">

        {/* ── ⭐ Portfolio Switcher ── */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none fade-up pb-1">
          {groups.map(g => {
            const active = g.id === activeGroupId;
            return (
              <div key={g.id} className="relative flex-shrink-0">
                <button
                  onClick={() => setActiveGroupId(g.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                    active
                      ? "bg-yellow-400 text-black border-yellow-400"
                      : "bg-[var(--surface)] text-[var(--tx-3)] border-[var(--border)] hover:border-[var(--border-2)]"
                  }`}>
                  <span>{g.icon}</span>
                  <span>{g.name}</span>
                </button>
                {active && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowGroupMenu(showGroupMenu===g.id ? null : g.id); }}
                    className="absolute -right-1.5 -top-1.5 w-4 h-4 bg-[var(--surface)] border border-[var(--border-2)] rounded-full text-[9px] flex items-center justify-center text-[var(--tx-4)] hover:text-[var(--tx-2)]">
                    ⋯
                  </button>
                )}
                {showGroupMenu === g.id && (
                  <div onClick={e=>e.stopPropagation()}
                    className="absolute top-full mt-1 left-0 z-20 bg-[var(--surface)] border border-[var(--border-2)] rounded-lg shadow-xl overflow-hidden min-w-[110px]">
                    <button onClick={()=>{ setGroupNameInput(g.name); setGroupIconInput(g.icon); setShowGroupModal({mode:"rename", id:g.id}); setShowGroupMenu(null); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--hover)] whitespace-nowrap">✎ แก้ไขชื่อ</button>
                    {!g.is_default && (
                      <button onClick={()=>{ deleteGroup(g.id); setShowGroupMenu(null); }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 whitespace-nowrap">🗑 ลบพอร์ต</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button onClick={() => { setGroupNameInput(""); setGroupIconInput("💼"); setShowGroupModal({mode:"create"}); }}
            className="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border border-dashed border-[var(--border-2)] text-[var(--tx-4)] hover:text-[var(--tx-2)] hover:border-zinc-500 transition-colors">
            + พอร์ตใหม่
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 fade-up">
          {/* มูลค่าหุ้น */}
          <div className="relative bg-gradient-to-br from-[#111827] to-[#0f172a] border border-blue-900/40 rounded-xl p-3 overflow-hidden hover-lift">
            <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20" style={{background:"radial-gradient(circle,#3b82f6,transparent)"}}/>
            <p className="text-[10px] text-blue-400/80 uppercase tracking-wider mb-1 font-bold">มูลค่าหุ้น</p>
            <p className="text-lg font-black text-[#fff] count-up">{fmtMoney(marketValue)}</p>
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
                <button onClick={()=>setShowCashEdit(false)} className="text-[10px] text-[var(--tx-4)] px-1">✕</button>
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
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4 fade-up-1">
          <div className="relative flex-shrink-0 w-28 h-28">
            <div className="w-28 h-28 rounded-full transition-all duration-300"
              style={{background:`conic-gradient(${donutGradient})`, transform:"rotate(-90deg)"}}/>
            <div className="absolute inset-3 bg-[var(--surface)] rounded-full flex flex-col items-center justify-center">
              {hoveredIdx!==null && sorted[hoveredIdx] ? (
                <>
                  <span className="text-[9px] font-black leading-none" style={{color:COLORS[hoveredIdx%COLORS.length]}}>
                    {sorted[hoveredIdx].ticker}
                  </span>
                  <span className="text-sm font-black text-[var(--tx)] leading-none mt-0.5">
                    {marketValue>0?((sorted[hoveredIdx].shares*(sorted[hoveredIdx].currentPrice||sorted[hoveredIdx].avgCost)/marketValue)*100).toFixed(1):0}%
                  </span>
                  <span className="text-[8px] text-[var(--tx-4)] leading-none mt-0.5">
                    {fmtMoney(sorted[hoveredIdx].shares*(sorted[hoveredIdx].currentPrice||sorted[hoveredIdx].avgCost))}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[9px] text-[var(--tx-4)] leading-none">{activeGroup?.icon || "💼"} {activeGroup?.name || "พอร์ต"}</span>
                  <span className="text-xs font-black text-[var(--tx)] leading-none mt-0.5">{positions.length} หุ้น</span>
                  <span className="text-[8px] text-[var(--tx-4)] leading-none mt-0.5">{fmtMoney(marketValue)}</span>
                </>
              )}
            </div>
          </div>

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
                    <span className={`text-[10px] font-bold transition-colors ${isHov?"text-[var(--tx)]":"text-[var(--tx-3)]"}`}>{p.ticker}</span>
                    <span className="text-[9px] text-[var(--tx-5)] ml-auto">{pv.toFixed(1)}%</span>
                  </div>
                );
              })}
              {!sorted.length && (
                <p className="text-[11px] text-[var(--tx-5)] col-span-2">ยังไม่มีหุ้นในพอร์ตนี้</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden fade-up-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--surface-2)]">
                <tr>
                  <Th k="ticker" label="หุ้น"/>
                  <Th k="shares" label="จำนวน" className="hidden lg:table-cell"/>
                  <Th k="avgCost" label="ต้นทุน" className="hidden lg:table-cell"/>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase tracking-wider hidden lg:table-cell">ราคา</th>
                  <Th k="value" label="มูลค่า"/>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button onClick={()=>{setPlMode("total");if(sortKey==="dailyPL"||sortKey==="dailyPct")setSortKey("pl");}}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${plMode==="total"?"bg-emerald-400/20 text-emerald-400":"text-[var(--tx-5)] hover:text-[var(--tx-3)]"}`}>รวม</button>
                      <span className="text-[var(--tx-6)] text-xs">|</span>
                      <button onClick={()=>{setPlMode("daily");if(sortKey==="pl"||sortKey==="plPct")setSortKey("dailyPL");}}
                        className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${plMode==="daily"?"bg-sky-400/20 text-sky-400":"text-[var(--tx-5)] hover:text-[var(--tx-3)]"}`}>วันนี้</button>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {plMode==="total"
                        ? <button onClick={()=>handleSort("plPct")} className="text-[10px] text-[var(--tx-5)] hover:text-[var(--tx-3)]">% <SortIcon k="plPct"/></button>
                        : <button onClick={()=>handleSort("dailyPct")} className="text-[10px] text-[var(--tx-5)] hover:text-[var(--tx-3)]">% <SortIcon k="dailyPct"/></button>
                      }
                    </div>
                  </th>
                  <Th k="allocation" label="สัดส่วน" className="hidden md:table-cell"/>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-[var(--tx-3)] uppercase">จัดการ</th>
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
                    <tr key={p.ticker} className="row-hover border-t border-[var(--border)]">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:COLORS[idx%COLORS.length]}}/>
                          <div>
                            <p className="font-bold text-sm">{p.ticker}</p>
                            <p className="text-xs text-[var(--tx-4)] truncate max-w-[100px]">{p.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-yellow-300 font-mono hidden lg:table-cell">{p.shares.toFixed(4)}</td>
                      <td className="px-3 py-3 text-sm hidden lg:table-cell">{fmtMoney(p.avgCost)}</td>
                      <td className="px-3 py-3 text-sm text-[var(--tx-2)] hidden lg:table-cell">{fmtMoney(price)}</td>
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
                          ) : <p className="text-xs text-[var(--tx-5)]">— ไม่มีข้อมูล</p>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-[140px] hidden md:table-cell">
                        {targetPct>0 ? (
                          <div className="space-y-0.5">
                            <div className="h-3 bg-[var(--fill)] rounded-md overflow-hidden flex relative border border-[var(--border-2)]">
                              <div className="h-full rounded-md z-10" style={{width:`${Math.min((allocNow/targetPct)*100,100)}%`,background:allocNow<targetPct?COLORS[idx%COLORS.length]:"#f97316",opacity:0.85}}/>
                              {allocNow<targetPct && <div className="h-full" style={{width:`${Math.max(0,100-((allocNow/targetPct)*100))}%`,background:"#10b98111"}}/>}
                            </div>
                            <div className="flex items-center justify-between text-[8px]">
                              <span className="text-[var(--tx-3)]">{allocNow.toFixed(1)}% / {targetPct.toFixed(1)}%</span>
                              <span className={`font-bold ${allocDiff!==null&&allocDiff>0?"text-orange-400":"text-emerald-400"}`}>
                                {allocDiff!==null&&allocDiff>0?"+":""}{allocDiff!==null?allocDiff.toFixed(1):0}% = {allocDiff!==null?fmtMoney(Math.abs(marketValue*(allocDiff/100))):""}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[8px] text-[var(--tx-5)]">ยังไม่ตั้งเป้า</div>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/chart?symbol=${p.ticker}&exchange=NASDAQ&tf=60`}
                            className="ripple px-1.5 py-1 text-xs bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded font-bold"
                            title="ดูกราฟ">
                            📈
                          </Link>
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
          <div className="border-t border-[var(--border)] p-4">
            <button onClick={()=>{setMode("buy");setFormTicker("");setFormShares("");setFormPrice("");setFormName("");setFormAlloc("");setFormTarget("");setEditingTicker(null);setFormError("");setModalTab("trade");setModal({type:"buy",ticker:""}); }}
              className="w-full py-2.5 border border-dashed border-[var(--border-2)] hover:border-zinc-500 text-[var(--tx-4)] hover:text-[var(--tx-2)] rounded-lg text-sm">
              + เพิ่มหุ้นใหม่ (ในพอร์ต {activeGroup?.name || "-"})
            </button>
          </div>
        </div>
      </div>

      {/* ── Trade Modal ── */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
          <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editingTicker?`แก้ไข ${editingTicker}`:mode==="buy"?"ซื้อหุ้น":"ขายหุ้น"}</h2>
              <button onClick={closeModal} className="text-[var(--tx-4)] hover:text-[var(--tx)] text-xl">✕</button>
            </div>

            {!editingTicker && (
              <>
                <div className="flex gap-1 mb-4 bg-[var(--fill)] p-1 rounded-xl">
                  <button type="button" onClick={()=>setModalTab("trade")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${modalTab==="trade"?"bg-[var(--fill-strong)] text-[var(--tx)]":"text-[var(--tx-4)]"}`}>💹 ซื้อ/ขาย</button>
                  <button type="button" onClick={()=>setModalTab("dca")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${modalTab==="dca"?"bg-yellow-400/20 text-yellow-400":"text-[var(--tx-4)]"}`}>📊 DCA</button>
                  <button type="button" onClick={()=>setModalTab("sr")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${modalTab==="sr"?"bg-purple-400/20 text-purple-400":"text-[var(--tx-4)]"}`}>🎯 S/R</button>
                </div>
                {modalTab==="trade" && (
                  <div className="flex gap-2 mb-4">
                    <button type="button" onClick={()=>setMode("buy")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${mode==="buy"?"bg-emerald-500 text-black":"bg-[var(--fill)] text-[var(--tx-3)]"}`}>ซื้อ</button>
                    <button type="button" onClick={()=>setMode("sell")} className={`flex-1 py-2 rounded-lg text-sm font-bold ${mode==="sell"?"bg-blue-500 text-[var(--tx)]":"bg-[var(--fill)] text-[var(--tx-3)]"}`}>ขาย</button>
                  </div>
                )}
              </>
            )}

            {/* DCA Tab */}
            {modalTab==="dca" && !editingTicker && (()=>{
              const p = positions.find(x=>x.ticker===formTicker);
              if (!p) return <p className="text-[var(--tx-4)] text-sm text-center py-4">เลือกหุ้นก่อนครับ</p>;
              const cp = p.currentPrice||p.avgCost;
              const addAmt = parseFloat(dcaAmount)||0;
              const buyPx  = parseFloat(dcaPrice)||cp;
              const addSh  = dcaMode==="amount"?addAmt/buyPx:addAmt;
              const newSh  = p.shares+addSh;
              const newCost= newSh>0?(p.shares*p.avgCost+(dcaMode==="amount"?addAmt:addSh*buyPx))/newSh:0;
              const newAlloc= marketValue>0?newSh*cp/(marketValue+(dcaMode==="amount"?addAmt:addSh*buyPx))*100:0;
              return (
                <div className="space-y-4">
                  <div className="bg-[var(--fill)] rounded-xl p-3 text-xs">
                    <p className="text-[var(--tx-3)] font-bold mb-2">{p.ticker} — ปัจจุบัน</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[var(--tx-5)]">ถือ</p><p className="font-bold">{p.shares.toFixed(4)}</p></div>
                      <div><p className="text-[var(--tx-5)]">Avg Cost</p><p className="font-bold text-yellow-400">${p.avgCost.toFixed(2)}</p></div>
                      <div><p className="text-[var(--tx-5)]">ราคาตอนนี้</p><p className="font-bold">${cp.toFixed(2)}</p></div>
                    </div>
                  </div>
                  <div className="flex gap-1 bg-[var(--fill)] p-1 rounded-lg">
                    <button type="button" onClick={()=>setDcaMode("amount")} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${dcaMode==="amount"?"bg-[var(--fill-strong)] text-[var(--tx)]":"text-[var(--tx-4)]"}`}>ใส่เป็น $</button>
                    <button type="button" onClick={()=>setDcaMode("shares")} className={`flex-1 py-1.5 rounded-md text-xs font-bold ${dcaMode==="shares"?"bg-[var(--fill-strong)] text-[var(--tx)]":"text-[var(--tx-4)]"}`}>ใส่เป็นหุ้น</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--tx-3)] mb-1 block">{dcaMode==="amount"?"เงินที่ซื้อเพิ่ม ($)":"จำนวนหุ้น"}</label>
                      <input type="number" inputMode="decimal" step="any" value={dcaAmount} placeholder={dcaMode==="amount"?"100":"5"}
                        onChange={e=>setDcaAmount(e.target.value)}
                        className="w-full bg-[var(--surface-2)] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none font-mono text-yellow-400 font-bold"/>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--tx-3)] mb-1 block">ราคาที่ซื้อ ($)</label>
                      <input type="number" inputMode="decimal" step="any" value={dcaPrice}
                        onChange={e=>setDcaPrice(e.target.value)}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] focus:border-blue-400 rounded-lg px-3 py-2.5 text-sm outline-none font-mono"/>
                    </div>
                  </div>
                  {addAmt>0 ? (
                    <div className="bg-[var(--fill)] border border-[var(--border-2)] rounded-xl p-4 space-y-2.5">
                      <p className="text-xs font-black text-[var(--tx-3)] uppercase tracking-wider mb-3">ผลลัพธ์หลัง DCA</p>
                      <div className="flex justify-between"><span className="text-xs text-[var(--tx-4)]">ต้นทุนเฉลี่ยใหม่</span><span className="font-black text-base text-yellow-400">${newCost.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-[var(--tx-4)]">จำนวนหุ้นทั้งหมด</span><span className="font-bold text-sm">{newSh.toFixed(4)}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-[var(--tx-4)]">ต้นทุนรวมใหม่</span><span className="font-bold text-sm text-[var(--tx-2)]">${(newSh*newCost).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-xs text-[var(--tx-4)]">สัดส่วนในพอร์ต</span><span className="font-bold text-sm text-purple-400">{newAlloc.toFixed(1)}%</span></div>
                      <div className={`flex items-center gap-2 pt-2 border-t border-[var(--border-2)] text-xs font-bold ${newCost<p.avgCost?"text-emerald-400":"text-red-400"}`}>
                        <span>{newCost<p.avgCost?"▼ ต้นทุนลดลง":"▲ ต้นทุนเพิ่มขึ้น"}</span>
                        <span>${Math.abs(newCost-p.avgCost).toFixed(2)} ({Math.abs((newCost-p.avgCost)/p.avgCost*100).toFixed(2)}%)</span>
                      </div>
                    </div>
                  ) : <p className="text-center text-[var(--tx-5)] text-xs py-2">ใส่จำนวนเงินหรือหุ้นที่จะซื้อเพิ่มครับ</p>}
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
                    <div className="bg-[var(--fill)] rounded-xl p-3 text-xs">
                      <p className="text-[var(--tx-3)] font-bold mb-2">{p.ticker} — ปัจจุบัน</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-[var(--tx-5)]">ถือ</p><p className="font-bold">{p.shares.toFixed(4)}</p></div>
                        <div><p className="text-[var(--tx-5)]">Avg Cost</p><p className="font-bold text-yellow-400">${p.avgCost.toFixed(2)}</p></div>
                        <div><p className="text-[var(--tx-5)]">ราคาตอนนี้</p><p className="font-bold">${cp.toFixed(2)}</p></div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-[var(--tx-3)] mb-1 block">💰 เงินลงทุน ($)</label>
                    <input type="number" inputMode="decimal" step="any" value={srInvest} placeholder="1000"
                      onChange={e=>{setSrInvest(e.target.value);saveSR(e.target.value,srS,srR);}}
                      className="w-full bg-[var(--surface-2)] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none font-mono text-yellow-400 font-black"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-black text-emerald-400">📗 แนวรับ (ซื้อ)</p>
                      {["S1","S2","S3"].map((label,i)=>(
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black text-emerald-400 w-5">{label}</span>
                          <input type="number" inputMode="decimal" step="any" value={srS[i]} placeholder="ราคา"
                            onChange={e=>{const n=[...srS];n[i]=e.target.value;setSrS(n);saveSR(srInvest,n,srR);}}
                            className="flex-1 bg-[var(--surface-2)] border border-emerald-900/50 focus:border-emerald-400 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"/>
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
                            className="flex-1 bg-[var(--surface-2)] border border-red-900/50 focus:border-red-400 rounded-lg px-2 py-1.5 text-xs outline-none font-mono"/>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(srInvest||srS.some(s=>s)||srR.some(r=>r)) && (
                    <button type="button" onClick={async ()=>{
                      setSrInvest(""); setSrS(["","",""]); setSrR(["","",""]);
                      if (formTicker) {
                        localStorage.removeItem(`sr_${formTicker}`);
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) await supabase.from("sr_levels").delete().eq("user_id", user.id).eq("ticker", formTicker);
                      }
                    }}
                      className="w-full py-1.5 text-xs text-[var(--tx-5)] hover:text-red-400 border border-[var(--border)] hover:border-red-400/30 rounded-lg">
                      🗑 ล้างข้อมูล S/R
                    </button>
                  )}
                  {inv>0&&supports.length>0&&resists.length>0&&(
                    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="bg-[var(--surface-2)]">
                            <th className="px-2 py-2 text-yellow-400 font-black text-left">ซื้อ\ขาย</th>
                            {resists.map((r,i)=>(
                              <th key={i} className="px-2 py-2 text-center">
                                <p className="text-red-400 font-black">R{i+1}</p>
                                <p className="text-[var(--tx-3)]">${r.toFixed(2)}</p>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {supports.map((s,si)=>(
                            <tr key={si} className="border-t border-[var(--border)]">
                              <td className="px-2 py-2 bg-[var(--surface-2)]">
                                <p className="text-emerald-400 font-black">S{si+1}</p>
                                <p className="text-[var(--tx-3)]">${s.toFixed(2)}</p>
                              </td>
                              {resists.map((r,ri)=>{
                                const sh = inv/s;
                                const plCalc = (r-s)*sh;
                                const pv = ((r-s)/s)*100;
                                const posCalc = plCalc>=0;
                                return (
                                  <td key={ri} className={`px-2 py-2 text-center border-l border-[var(--border)] ${posCalc?"bg-emerald-400/5":"bg-red-400/5"}`}>
                                    <p className={`font-black ${posCalc?"text-emerald-400":"text-red-400"}`}>{posCalc?"+":"-"}${Math.abs(plCalc).toFixed(0)}</p>
                                    <p className={posCalc?"text-emerald-600":"text-red-600"}>({posCalc?"+":""}{pv.toFixed(1)}%)</p>
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
                  <label className="text-xs text-[var(--tx-3)] mb-1 block">Ticker</label>
                  <input className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none uppercase"
                    placeholder="เช่น NVDA, GOOGL" value={formTicker}
                    readOnly={!!editingTicker||modal.ticker!==""}
                    onChange={e=>setFormTicker(e.target.value.toUpperCase())}/>
                </div>
                <div>
                  <label className="text-xs text-[var(--tx-3)] mb-1 block">ชื่อบริษัท</label>
                  <input className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น เอ็นวิเดีย" value={formName} onChange={e=>setFormName(e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs text-[var(--tx-3)] mb-1 block">สัดส่วนเป้าหมายในพอร์ตนี้ (%)</label>
                  {(() => {
                    const selfKey = editingTicker || formTicker.toUpperCase().trim();
                    const othersTarget = positions.reduce((s,p) => p.ticker===selfKey ? s : s + (p.targetAlloc||0), 0);
                    const remain = Math.max(0, 100 - othersTarget);
                    const curVal = parseFloat(formTarget) || 0;
                    const willTotal = othersTarget + curVal;
                    const over = willTotal > 100.01;
                    return (
                      <>
                        <input
                          className={`w-full bg-[var(--surface-2)] border rounded-lg px-3 py-2.5 text-sm outline-none ${over?"border-red-500 focus:border-red-400":"border-[var(--border-2)] focus:border-purple-400"}`}
                          placeholder={`สูงสุด ${remain.toFixed(1)}%`} type="number" step="0.1" min="0" max={remain}
                          value={formTarget}
                          onChange={e=>{
                            const v = e.target.value;
                            const n = parseFloat(v);
                            if (v==="" || isNaN(n)) { setFormTarget(v); return; }
                            if (n > remain) setFormTarget(remain.toFixed(1));
                            else setFormTarget(v);
                          }}/>
                        <div className="flex items-center justify-between mt-1 text-[10px]">
                          <span className="text-[var(--tx-4)]">หุ้นอื่นในพอร์ตนี้ใช้ไป {othersTarget.toFixed(1)}% · เหลือ <span className="text-purple-400 font-bold">{remain.toFixed(1)}%</span></span>
                          <span className={`font-bold ${over?"text-red-400":willTotal>=99.5&&willTotal<=100.5?"text-emerald-400":"text-[var(--tx-4)]"}`}>
                            {over ? "⚠️ เกิน 100%" : `รวม ${willTotal.toFixed(1)}%`}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 bg-[var(--fill)] rounded-full overflow-hidden flex">
                          <div className="h-full bg-zinc-600" style={{width:`${Math.min(othersTarget,100)}%`}}/>
                          <div className={`h-full ${over?"bg-red-500":"bg-purple-400"}`} style={{width:`${Math.min(curVal,Math.max(0,100-othersTarget))}%`}}/>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-xs text-[var(--tx-3)] mb-1 block">จำนวนหุ้น</label>
                  <input className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น 5.5" type="number" step="any" value={formShares} onChange={e=>setFormShares(e.target.value)}/>
                </div>
                <div>
                  <label className="text-xs text-[var(--tx-3)] mb-1 block">{editingTicker?"ราคาเฉลี่ย (Avg Cost)":"ราคาที่ซื้อ/ขาย ($)"}</label>
                  <input className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"
                    placeholder="เช่น 199.32" type="number" step="any" value={formPrice} onChange={e=>setFormPrice(e.target.value)}/>
                </div>
                {formError && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{formError}</p>}
                <button onClick={saveTrade}
                  className={`w-full py-3 rounded-xl font-bold text-sm mt-1 ${editingTicker?"bg-yellow-400 hover:bg-yellow-300 text-black":mode==="buy"?"bg-emerald-500 hover:bg-emerald-400 text-black":"bg-blue-500 hover:bg-blue-400 text-[var(--tx)]"}`}>
                  {editingTicker?"✓ บันทึกการแก้ไข":mode==="buy"?"✓ บันทึกการซื้อ":"✓ บันทึกการขาย"}
                </button>
              </div>
            )}

            {/* History Tab */}
            {modalTab==="history" && !editingTicker && (
              <div className="space-y-3">
                <p className="text-xs text-[var(--tx-3)] mb-2">ประวัติการซื้อขาย {formTicker || "ทั้งหมด"}</p>
                {tradeHistory.length === 0 ? (
                  <p className="text-center text-[var(--tx-5)] text-sm py-4">ยังไม่มีประวัติการซื้อขาย</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tradeHistory.filter(t => !formTicker || t.ticker === formTicker).map((trade, idx) => {
                      const date = new Date(trade.created_at);
                      return (
                        <div key={idx} className="bg-[var(--fill)] rounded-lg p-2.5 text-xs border border-[var(--border-2)]">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`font-bold ${trade.type==="buy"?"text-emerald-400":"text-blue-400"}`}>
                              {trade.type==="buy"?"🟢 ซื้อ":"🔵 ขาย"} {trade.ticker}
                            </span>
                            <span className="text-[var(--tx-4)]">{date.toLocaleDateString("th-TH")} {date.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[var(--tx-3)] mb-1">
                            <div><span className="text-[var(--tx-5)]">จำนวน:</span> {trade.shares.toFixed(4)}</div>
                            <div><span className="text-[var(--tx-5)]">ราคา:</span> ${trade.price.toFixed(2)}</div>
                          </div>
                          <div className="flex justify-between text-[var(--tx-3)]">
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

      {/* ── ⭐ Portfolio Group Modal (สร้าง/แก้ไข) ── */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={e=>{if(e.target===e.currentTarget) setShowGroupModal(null);}}>
          <div className="bg-[var(--surface)] border border-[var(--border-2)] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e=>e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{showGroupModal.mode==="create" ? "สร้างพอร์ตใหม่" : "แก้ไขพอร์ต"}</h2>
            <div className="mb-3">
              <label className="text-xs text-[var(--tx-3)] mb-1 block">ไอคอน</label>
              <div className="flex gap-2 flex-wrap">
                {GROUP_ICONS.map(ic => (
                  <button key={ic} onClick={()=>setGroupIconInput(ic)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg border transition-colors ${groupIconInput===ic?"bg-yellow-400/20 border-yellow-400":"border-[var(--border-2)] hover:border-zinc-500"}`}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-[var(--tx-3)] mb-1 block">ชื่อพอร์ต</label>
              <input autoFocus value={groupNameInput} onChange={e=>setGroupNameInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") (showGroupModal.mode==="create" ? createGroup() : renameGroup(showGroupModal.id!)); }}
                placeholder="พิมพ์ชื่อพอร์ตของพี่เอง"
                className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] focus:border-yellow-400 rounded-lg px-3 py-2.5 text-sm outline-none"/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setShowGroupModal(null)} className="flex-1 py-2.5 bg-[var(--fill)] text-[var(--tx-3)] rounded-xl text-sm font-bold">ยกเลิก</button>
              <button onClick={()=> showGroupModal.mode==="create" ? createGroup() : renameGroup(showGroupModal.id!)}
                disabled={!groupNameInput.trim()}
                className="flex-1 py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black rounded-xl text-sm font-bold">
                {showGroupModal.mode==="create" ? "✓ สร้าง" : "✓ บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trade History ── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden fade-up mt-4 mx-4">
        <button onClick={() => setShowHistory(!showHistory)} className="w-full p-4 border-b border-[var(--border)] hover:bg-[var(--hover)] transition-colors flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx)]">📜 ประวัติการซื้อขาย · {activeGroup?.name || "-"} ({tradeHistory.length})</h2>
          <span className={`text-xs transition-transform ${showHistory?"rotate-180":""}`}>▼</span>
        </button>
        {showHistory && (
          tradeHistory.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-[var(--tx-5)] text-sm">ยังไม่มีประวัติการซื้อขาย</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">วันที่</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">หุ้น</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">ประเภท</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">จำนวน</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">ราคา</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">เงินทั้งหมด</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">Avg Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">P/L</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.slice(0, 50).map((trade, idx) => {
                  const date = new Date(trade.created_at);
                  const isPos = trade.pl > 0;
                  return (
                    <tr key={idx} className="border-t border-[var(--border)] hover:bg-[var(--hover)]">
                      <td className="px-4 py-2.5 text-xs text-[var(--tx-4)]">{date.toLocaleDateString("th-TH")} {date.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}</td>
                      <td className="px-4 py-2.5 font-bold text-[var(--tx)]">{trade.ticker}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${trade.type==="buy"?"bg-emerald-400/20 text-emerald-400":"bg-blue-400/20 text-blue-400"}`}>
                          {trade.type==="buy"?"ซื้อ":"ขาย"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-mono text-yellow-300">{trade.shares.toFixed(4)}</td>
                      <td className="px-4 py-2.5 text-sm">${trade.price.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm">${trade.amount.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-[var(--tx-3)]">${trade.avg_cost_before ? trade.avg_cost_before.toFixed(2) : "-"}</td>
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
          )
        )}
      </div>

      {/* ── Price Alerts (S/R) ───────────────────────────────────────────────── */}
      {(() => {
        const allSR = showAlerts ? getAllSRData() : [];
        const closeSRCount = (() => {
          if (typeof window === "undefined") return 0;
          let count = 0;
          positions.forEach(pos => {
            if (!pos.currentPrice) return;
            try {
              const srRaw = localStorage.getItem(`sr_${pos.ticker}`);
              if (!srRaw) return;
              const srData = JSON.parse(srRaw);
              const all: number[] = [
                ...(srData.s || []).map(Number).filter((v: number) => v > 0),
                ...(srData.r || []).map(Number).filter((v: number) => v > 0),
              ];
              all.forEach(lv => {
                if (Math.abs((pos.currentPrice - lv) / lv) * 100 <= 2) count++;
              });
            } catch { /* ignore */ }
          });
          return count;
        })();

        return (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden fade-up mt-4 mx-4">
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className="w-full p-4 hover:bg-[var(--hover)] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--tx)]">🔔 Price Alerts — แนวรับ/ต้าน</h2>
                {closeSRCount > 0 && (
                  <span className="pulse-alert bg-orange-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
                    {closeSRCount} ใกล้!
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifPermission === "granted" ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"/>แจ้งเตือนเปิด
                  </span>
                ) : notifPermission === "denied" ? (
                  <span className="text-[10px] text-red-400">🔕 ปิดอยู่</span>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); requestNotification(); }}
                    className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/30 transition-colors"
                  >
                    เปิดรับแจ้งเตือน 🔔
                  </button>
                )}
                <span className={`text-xs transition-transform duration-200 ${showAlerts ? "rotate-180" : ""}`}>▼</span>
              </div>
            </button>

            {showAlerts && (
              <div className="border-t border-[var(--border)]">
                {allSR.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-2xl">🎯</p>
                    <p className="text-[var(--tx-3)] text-sm font-bold">ยังไม่มี S/R levels ที่ตั้งไว้</p>
                    <p className="text-[var(--tx-5)] text-xs">ตั้งได้ที่ปุ่ม "ซื้อ" แล้วเลือกแท็บ 🎯 S/R</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[var(--surface-2)]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">หุ้น</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">Level</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">ราคา Level</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">ราคาตอนนี้</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">ห่าง%</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase hidden sm:table-cell">ทิศทาง</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--tx-3)] uppercase">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allSR.map((row, idx) => {
                          const absDist = Math.abs(row.dist);
                          const isHit   = absDist <= 0.5;
                          const isClose = absDist <= 2;
                          const isNear  = absDist <= 4;
                          const rowBg   = isHit ? "bg-red-400/5" : isClose ? "bg-orange-400/5" : "";
                          const statusLabel = isHit ? "🎯 แตะแล้ว!" : isClose ? "🔥 ใกล้มาก" : isNear ? "⚠️ ใกล้" : "⚪ ปกติ";
                          const statusColor = isHit
                            ? "bg-red-400/20 text-red-400"
                            : isClose
                            ? "bg-orange-400/20 text-orange-400"
                            : isNear
                            ? "bg-yellow-400/20 text-yellow-400"
                            : "bg-[var(--fill)] text-[var(--tx-4)]";
                          let dirText = "";
                          if (row.type === "S") {
                            dirText = row.crossed ? "⚠️ ทะลุแนวรับลงมา" : "✅ ราคาเหนือแนวรับ";
                          } else {
                            dirText = row.crossed ? "🚀 ทะลุแนวต้านขึ้นไป" : "⏳ ราคาใต้แนวต้าน";
                          }
                          return (
                            <tr key={idx} className={`border-t border-[var(--border)] row-hover ${rowBg}`}>
                              <td className="px-4 py-3">
                                <span className="font-black text-[var(--tx)]">{row.ticker}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-black px-2 py-1 rounded ${row.type === "S" ? "bg-emerald-400/20 text-emerald-400" : "bg-red-400/20 text-red-400"}`}>
                                  {row.type}{row.n}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-[var(--tx)]">
                                ${row.level.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-[var(--tx-2)]">
                                ${row.currentPrice.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`font-black text-sm ${isHit ? "text-red-400 pulse-alert" : isClose ? "text-orange-400" : isNear ? "text-yellow-400" : "text-[var(--tx-3)]"}`}>
                                  {absDist.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-4 py-3 hidden sm:table-cell">
                                <span className="text-[11px] text-[var(--tx-4)]">{dirText}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${statusColor}`}>
                                  {statusLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between">
                      <p className="text-[10px] text-[var(--tx-5)]">{allSR.length} levels · แจ้งเตือนเมื่อราคาห่างจาก level ≤ 1% (ทุก 60 วินาที)</p>
                      {notifPermission !== "granted" && (
                        <button
                          onClick={requestNotification}
                          className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                        >
                          เปิด Browser Notification
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Telegram Price Alerts ──────────────────────────────────────────────── */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden fade-up mt-4 mx-4">
        <button onClick={()=>setShowTgAlerts(!showTgAlerts)}
          className="w-full p-4 hover:bg-[var(--hover)] transition-colors flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--tx)]">📱 Telegram Alerts</h2>
            {tgAlerts.filter(a=>!a.triggered).length > 0 && (
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                {tgAlerts.filter(a=>!a.triggered).length} active
              </span>
            )}
          </div>
          <span className={`text-xs transition-transform duration-200 ${showTgAlerts?"rotate-180":""}`}>▼</span>
        </button>

        {showTgAlerts && (
          <div className="border-t border-[var(--border)] p-4 space-y-4">
            <div className="bg-[var(--surface-2)] rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-[var(--tx-3)] uppercase tracking-wider">+ ตั้ง Alert ใหม่</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--tx-5)] mb-1 block">Ticker</label>
                  <input value={tgForm.ticker} onChange={e=>setTgForm(p=>({...p,ticker:e.target.value.toUpperCase()}))}
                    placeholder="AAPL" list="ticker-list"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-yellow-400 text-[var(--tx)] uppercase"/>
                  <datalist id="ticker-list">
                    {positions.map(p=><option key={p.ticker} value={p.ticker}/>)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--tx-5)] mb-1 block">ราคาเป้าหมาย ($)</label>
                  <input type="number" step="0.01" value={tgForm.price} onChange={e=>setTgForm(p=>({...p,price:e.target.value}))}
                    placeholder="150.00"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs font-mono outline-none focus:border-yellow-400 text-[var(--tx)]"/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--tx-5)] mb-1 block">เงื่อนไข</label>
                  <select value={tgForm.condition} onChange={e=>setTgForm(p=>({...p,condition:e.target.value as any}))}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs outline-none focus:border-yellow-400 text-[var(--tx)]">
                    <option value="above">📈 ขึ้นถึง (above)</option>
                    <option value="below">📉 ลงถึง (below)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-[var(--tx-5)] mb-1 block">Label (ไม่บังคับ)</label>
                  <input value={tgForm.label} onChange={e=>setTgForm(p=>({...p,label:e.target.value}))}
                    placeholder="แนวต้าน / TP1"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs outline-none focus:border-yellow-400 text-[var(--tx)]"/>
                </div>
              </div>
              <button onClick={addTgAlert} disabled={!tgForm.ticker || !tgForm.price}
                className="w-full py-2.5 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black text-xs font-black rounded-lg transition-colors">
                🔔 ตั้ง Alert → Telegram
              </button>
            </div>

            {tgLoading ? (
              <p className="text-center text-xs text-[var(--tx-5)] py-4">กำลังโหลด...</p>
            ) : tgAlerts.length === 0 ? (
              <p className="text-center text-xs text-[var(--tx-5)] py-4">ยังไม่มี Alert — ตั้งด้านบนได้เลย 🔔</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-[var(--tx-5)] uppercase tracking-wider font-bold">Alerts ที่ตั้งไว้</p>
                {tgAlerts.map(a=>(
                  <div key={a.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs ${a.triggered?"border-[var(--border)] bg-[var(--surface-2)] opacity-50":"border-[var(--border)] bg-[var(--surface)]"}`}>
                    <span className="text-base">{a.condition==="above"?"📈":"📉"}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-black text-[var(--tx)]">{a.ticker}</span>
                      {a.label && <span className="text-[var(--tx-4)] ml-1">· {a.label}</span>}
                      <div className="text-[var(--tx-4)] font-mono mt-0.5">
                        {a.condition==="above"?"ขึ้นถึง":"ลงถึง"} <b className="text-[var(--tx)]">${Number(a.price).toFixed(2)}</b>
                      </div>
                    </div>
                    {a.triggered ? (
                      <span className="text-[10px] text-emerald-400 font-bold">✓ Sent</span>
                    ) : (
                      <span className="text-[10px] text-yellow-400 font-bold animate-pulse">● Active</span>
                    )}
                    <button onClick={()=>deleteTgAlert(a.id)}
                      className="text-[10px] text-red-400 hover:text-red-300 font-bold ml-1">✕</button>
                  </div>
                ))}
                <p className="text-[10px] text-[var(--tx-5)] pt-1">⏱ เช็คราคาทุก 1 นาที · ส่งข้อความ Telegram เมื่อถึงเป้า</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Rebalance Calculator ──────────────────────────────────────────────── */}
      {(() => {
        const rebalData  = showRebalance ? calcRebalance() : [];
        const totalBuy   = rebalData.filter(r => r.action === "buy").reduce((s, r) => s + r.diffValue, 0);
        const totalSell  = rebalData.filter(r => r.action === "sell").reduce((s, r) => s + Math.abs(r.diffValue), 0);
        const sumTargets = positions.reduce((s, p) => s + (p.targetAlloc || 0), 0);
        const hasTargets = positions.some(p => p.targetAlloc > 0);

        return (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden fade-up mt-4 mx-4 mb-4">
            <button
              onClick={() => setShowRebalance(!showRebalance)}
              className="w-full p-4 hover:bg-[var(--hover)] transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[var(--tx)]">⚖️ Rebalance Calculator</h2>
                {hasTargets && (
                  <span className="text-[10px] text-[var(--tx-4)]">
                    {positions.filter(p => p.targetAlloc > 0).length} หุ้นมีเป้า · รวม {sumTargets.toFixed(1)}%
                  </span>
                )}
              </div>
              <span className={`text-xs transition-transform duration-200 ${showRebalance ? "rotate-180" : ""}`}>▼</span>
            </button>

            {showRebalance && (
              <div className="border-t border-[var(--border)] p-4 space-y-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div>
                    <label className="text-[10px] text-[var(--tx-4)] uppercase tracking-wider mb-1 block font-bold">
                      💰 เงินเพิ่มเข้าพอร์ต ($) — ใส่ 0 = rebalance ไม่เพิ่มเงิน
                    </label>
                    <input
                      type="number" step="100" value={rebalanceInvest} placeholder="0"
                      onChange={e => setRebalanceInvest(e.target.value)}
                      className="w-full sm:w-44 bg-[var(--surface-2)] border border-yellow-400/40 focus:border-yellow-400 rounded-lg px-3 py-2 text-sm outline-none font-mono text-yellow-400 font-bold"
                    />
                  </div>
                  {sumTargets > 0 && Math.abs(sumTargets - 100) > 0.5 && (
                    <div className="text-xs text-orange-400 bg-orange-400/10 border border-orange-400/20 px-3 py-2 rounded-lg">
                      ⚠️ เป้าหมายรวม <span className="font-black">{sumTargets.toFixed(1)}%</span>
                      {sumTargets < 100 ? ` (ขาด ${(100-sumTargets).toFixed(1)}%)` : ` (เกิน ${(sumTargets-100).toFixed(1)}%)`}
                    </div>
                  )}
                </div>

                {!hasTargets ? (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-2xl">⚖️</p>
                    <p className="text-[var(--tx-3)] text-sm font-bold">ยังไม่มีหุ้นที่ตั้งสัดส่วนเป้าหมาย</p>
                    <p className="text-[var(--tx-5)] text-xs">ตั้งได้ที่ปุ่ม "แก้" หรือ "ซื้อ" แล้วกรอก "สัดส่วนเป้าหมาย (%)"</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-emerald-400 font-black uppercase mb-1">ซื้อเพิ่ม</p>
                        <p className="text-base font-black text-emerald-400">{fmtMoney(totalBuy)}</p>
                        <p className="text-[10px] text-emerald-600 mt-0.5">
                          {rebalData.filter(r => r.action === "buy").length} หุ้น
                        </p>
                      </div>
                      <div className="bg-blue-400/10 border border-blue-400/20 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-blue-400 font-black uppercase mb-1">ขายออก</p>
                        <p className="text-base font-black text-blue-400">{fmtMoney(totalSell)}</p>
                        <p className="text-[10px] text-blue-600 mt-0.5">
                          {rebalData.filter(r => r.action === "sell").length} หุ้น
                        </p>
                      </div>
                      <div className="bg-[var(--fill)] border border-[var(--border-2)] rounded-xl p-3 text-center">
                        <p className="text-[10px] text-[var(--tx-3)] font-black uppercase mb-1">สุทธิ</p>
                        <p className={`text-base font-black ${totalBuy - totalSell >= 0 ? "text-yellow-400" : "text-purple-400"}`}>
                          {fmtMoney(Math.abs(totalBuy - totalSell))}
                        </p>
                        <p className="text-[10px] text-[var(--tx-5)] mt-0.5">
                          {totalBuy - totalSell >= 0 ? "ต้องใช้เงินเพิ่ม" : "ได้เงินคืน"}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                      <table className="w-full text-sm">
                        <thead className="bg-[var(--surface-2)]">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-semibold text-[var(--tx-3)] uppercase">หุ้น</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase hidden sm:table-cell">ราคา</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">เป้า%</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">ตอนนี้%</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">ต่าง</th>
                            <th className="px-3 py-3 text-center text-xs font-semibold text-[var(--tx-3)] uppercase">Action</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">หุ้น</th>
                            <th className="px-3 py-3 text-right text-xs font-semibold text-[var(--tx-3)] uppercase">มูลค่า</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rebalData.map((r) => {
                            const isBuy = r.action === "buy";
                            const diffPct = r.targetPct - r.allocNow;
                            return (
                              <tr key={r.ticker} className="border-t border-[var(--border)] row-hover">
                                <td className="px-3 py-3">
                                  <p className="font-black text-[var(--tx)]">{r.ticker}</p>
                                  <p className="text-[10px] text-[var(--tx-4)] truncate max-w-[80px]">{r.name}</p>
                                </td>
                                <td className="px-3 py-3 text-right font-mono text-[var(--tx-3)] text-xs hidden sm:table-cell">
                                  ${r.price.toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className="text-purple-400 font-bold">{r.targetPct.toFixed(1)}%</span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className="text-[var(--tx-2)]">{r.allocNow.toFixed(1)}%</span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className={`font-black text-sm ${isBuy ? "text-emerald-400" : "text-blue-400"}`}>
                                    {isBuy ? "+" : ""}{diffPct.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className={`text-xs font-black px-2 py-1 rounded whitespace-nowrap ${isBuy ? "bg-emerald-400/20 text-emerald-400" : "bg-blue-400/20 text-blue-400"}`}>
                                    {isBuy ? "↑ ซื้อ" : "↓ ขาย"}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-right font-mono">
                                  <span className={`font-bold ${isBuy ? "text-emerald-400" : "text-blue-400"}`}>
                                    {isBuy ? "+" : ""}{r.diffShares.toFixed(4)}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <span className={`font-bold ${isBuy ? "text-emerald-400" : "text-blue-400"}`}>
                                    {isBuy ? "+" : "-"}{fmtMoney(Math.abs(r.diffValue))}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-[var(--tx-5)] text-center">
                      คำนวณจาก targetAlloc% × มูลค่าพอร์ตใหม่ (${(marketValue + (parseFloat(rebalanceInvest)||0)).toFixed(0)}) · ราคาจาก Finnhub ล่าสุด
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl text-sm font-bold shadow-2xl toast-in ${toast.type==="success"?"bg-emerald-500 text-black":"bg-red-500 text-[var(--tx)]"}`}>
          {toast.msg}
        </div>
      )}
    </main>
    </>
  );
}
