"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCurrency } from "@/hooks/useCurrency";
import CurrencyToggle from "@/components/CurrencyToggle";
import ThemeToggle from "@/components/ThemeToggle";

// ─── Types ────────────────────────────────────────────────────────────────────
type Asset = {
  id: string;
  label: string;
  icon: string;
  color: string;
  value: number;      // เก็บเป็น THB เสมอ
  valueUSD?: number;  // มีเฉพาะ us_stocks
  note?: string;
  sort_order: number;
  autoSync?: boolean;
};

type MonthLog = {
  month: string;
  income: number;
};

type NetWorthSnap = {
  month: string;
  total: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────
// Bucket type
type Bucket = { id: string; label: string; icon: string; color: string; pct: number; note: string };

const DEFAULT_BUCKETS: Bucket[] = [
  { id: "spend",  label: "ใช้จ่าย",    icon: "🛍️", color: "#f97316", pct: 25,    note: "ค่าใช้จ่ายประจำวัน" },
  { id: "safe",   label: "ปลอดภัย",   icon: "🛡️", color: "#38bdf8", pct: 18.75, note: "ทอง 60% + กองตลาดเงิน 40%" },
  { id: "grow",   label: "เติบโต",    icon: "🚀", color: "#a78bfa", pct: 37.5,  note: "หุ้นไทย + BTC + โอกาส" },
  { id: "buffer", label: "สำรองเพิ่ม", icon: "🏦", color: "#10b981", pct: 18.75, note: "เพิ่มเงินสำรอง / Buffer" },
];

const LS_BUCKETS = "yok_life_buckets_v1";
function loadBuckets(): Bucket[] {
  try { const r = localStorage.getItem(LS_BUCKETS); return r ? JSON.parse(r) : DEFAULT_BUCKETS; }
  catch { return DEFAULT_BUCKETS; }
}
function saveBuckets(b: Bucket[]) {
  try { localStorage.setItem(LS_BUCKETS, JSON.stringify(b)); } catch {}
}

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

const DEFAULT_ASSETS = (rate: number): Omit<Asset, "sort_order">[] => {
  const r = rate || 33;
  return [
    { id: "us_stocks", label: "หุ้น US",    icon: "🇺🇸", color: "#4f7df3", value: 0,     note: "ซิงก์จากพอร์ต", autoSync: true },
    { id: "gold",      label: "ทองคำ",      icon: "🥇", color: "#f0aa4f", value: 70000 },
    { id: "bitcoin",   label: "Bitcoin",    icon: "₿",  color: "#f7931a", value: 76000 },
    { id: "th_stocks", label: "หุ้นไทย",   icon: "🇹🇭", color: "#10b981", value: 50000 },
    { id: "cash",      label: "เงินสำรอง", icon: "🏦", color: "#38bdf8", value: 0,     note: "6–12 เดือน (ไม่นับในพอร์ต)" },
  ];
};

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonth(key: string) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return `${MONTHS_TH[parseInt(m) - 1]} ${parseInt(y)}`;
}

// ─── Count-up ─────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const s = from.current, t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      setVal(s + (target - s) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) return (
    <div className="w-28 h-28 rounded-full bg-[var(--fill)] flex items-center justify-center text-xs text-[var(--tx-4)]">
      ยังไม่มีข้อมูล
    </div>
  );
  const R = 44, C = 56, stroke = 16, circ = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg width={112} height={112} viewBox="0 0 112 112">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const dash = (seg.value / total) * circ;
        const el = (
          <circle key={i} cx={C} cy={C} r={R} fill="none"
            stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-off + circ * 0.25}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        );
        off += dash;
        return el;
      })}
    </svg>
  );
}

// ─── Sparkline Net Worth ───────────────────────────────────────────────────────
function NWSparkline({ snaps }: { snaps: NetWorthSnap[] }) {
  if (snaps.length < 2) return null;
  const vals = snaps.map(s => s.total);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const W = 280, H = 56;
  const pts: [number,number][] = vals.map((v, i) => [
    (i / (vals.length - 1)) * W,
    H - ((mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (H - 8) + 4),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${W},${H} L 0,${H} Z`;
  const growing = vals[vals.length - 1] >= vals[0];
  const col = growing ? "#10b981" : "#ef4444";
  return (
    <div className="mt-4">
      <p className="text-[10px] text-[var(--tx-5)] mb-1.5 uppercase tracking-wider">Net Worth ย้อนหลัง</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
        <defs>
          <linearGradient id="nwgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.25" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#nwgrad)" />
        <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={col} opacity="0.8">
            <title>{fmtMonth(snaps[i].month)}: ฿{snaps[i].total.toLocaleString("th-TH")}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-[var(--tx-5)] mt-0.5">
        <span>{fmtMonth(snaps[0].month)}</span>
        <span>{fmtMonth(snaps[snaps.length - 1].month)}</span>
      </div>
    </div>
  );
}

// ─── Asset Row ────────────────────────────────────────────────────────────────
function AssetRow({ asset, total, onEdit, fmtVal }: {
  asset: Asset;
  total: number;
  onEdit: (id: string, value: number) => void;
  fmtVal: (thb: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const pct = total > 0 ? (asset.value / total) * 100 : 0;

  const commit = () => {
    const v = parseFloat(draft.replace(/,/g, ""));
    if (!isNaN(v) && v >= 0) onEdit(asset.id, v);
    setEditing(false);
  };

  useEffect(() => {
    if (editing) { setDraft(String(asset.value)); ref.current?.focus(); }
  }, [editing, asset.value]);

  return (
    <div className="group flex items-center gap-3 py-2.5 px-4 rounded-xl hover:bg-[var(--hover)] transition-colors">
      <span className="text-xl w-7 text-center flex-shrink-0">{asset.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold truncate">{asset.label}</p>
          {asset.autoSync && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-500/15 text-blue-400 flex-shrink-0">
              ⚡ Auto
            </span>
          )}
          {asset.note && !asset.autoSync && (
            <p className="text-[10px] text-[var(--tx-5)] truncate hidden sm:block">{asset.note}</p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-[var(--fill)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: asset.color }} />
          </div>
          <span className="text-[10px] text-[var(--tx-4)] w-8 text-right">{pct.toFixed(1)}%</span>
        </div>
      </div>

      {asset.autoSync ? (
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-black tabular-nums text-[var(--tx)]">{fmtVal(asset.value)}</p>
          {asset.valueUSD && (
            <p className="text-[10px] text-[var(--tx-5)]">${asset.valueUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
          )}
        </div>
      ) : editing ? (
        <div className="flex items-center gap-1">
          <input ref={ref} type="number" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="w-28 text-right text-sm font-mono bg-[var(--fill)] border border-[var(--border-2)] rounded-lg px-2 py-1 text-[var(--tx)] outline-none focus:border-emerald-500"
          />
          <span className="text-[10px] text-[var(--tx-5)]">฿</span>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="text-right text-sm font-mono font-black hover:text-emerald-400 transition-colors tabular-nums flex-shrink-0">
          {fmtVal(asset.value)}
          <span className="ml-1 text-[10px] opacity-0 group-hover:opacity-50 transition-opacity">✏️</span>
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LifePage() {
  const [assets, setAssets]     = useState<Asset[]>([]);
  const [logs, setLogs]         = useState<MonthLog[]>([]);
  const [nwSnaps, setNwSnaps]   = useState<NetWorthSnap[]>([]);
  const [income, setIncome]     = useState("");
  const [month, setMonth]       = useState(getCurrentMonth());
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [userId, setUserId]     = useState<string | null>(null);
  const [buckets, setBuckets]   = useState<Bucket[]>(DEFAULT_BUCKETS);
  const [editBuckets, setEditBuckets] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { currency, rate, lastUpdate: rateUpdate, toggleCurrency, format: fmtCurrency } = useCurrency();

  // format THB value → current currency display
  const fmtVal = useCallback((thb: number) => {
    if (currency === "THB") return "฿" + Math.round(thb).toLocaleString("th-TH");
    const usd = rate > 0 ? thb / rate : thb / 33;
    return "$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [currency, rate]);

  // ── ดึงมูลค่าพอร์ต US จาก Supabase ─────────────────────────────────────────
  const syncUSPortfolio = useCallback(async (uid: string, currentRate: number) => {
    setSyncing(true);
    try {
      const { data: mainGroup } = await supabase
        .from("portfolio_groups")
        .select("id")
        .eq("user_id", uid)
        .eq("is_default", true)
        .maybeSingle();

      if (!mainGroup?.id) { setSyncing(false); return; }

      const { data: rows } = await supabase
        .from("portfolios")
        .select("shares, avg_cost, current_price")
        .eq("user_id", uid)
        .eq("portfolio_id", mainGroup.id);

      if (!rows || rows.length === 0) { setSyncing(false); return; }

      const marketValueUSD = rows.reduce((sum: number, p: any) => {
        const price = Number(p.current_price) || Number(p.avg_cost) || 0;
        return sum + (Number(p.shares) || 0) * price;
      }, 0);

      const r = currentRate > 0 ? currentRate : 33;
      const marketValueTHB = Math.round(marketValueUSD * r);

      // upsert ลง life_assets
      await supabase.from("life_assets").upsert({
        id: "us_stocks", user_id: uid, label: "หุ้น US",
        icon: "🇺🇸", color: "#4f7df3",
        value: marketValueTHB, note: "ซิงก์จากพอร์ต",
        sort_order: 0,
      });

      setAssets(prev => prev.map(a =>
        a.id === "us_stocks"
          ? { ...a, value: marketValueTHB, valueUSD: marketValueUSD }
          : a
      ));
    } catch (e) {
      console.error("syncUSPortfolio error:", e);
    }
    setSyncing(false);
  }, []);

  // ── Load all data ────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Assets
      const { data: rows } = await supabase
        .from("life_assets")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      let loadedAssets: Asset[];
      if (rows && rows.length > 0) {
        loadedAssets = rows.map((r: any) => ({
          id: r.id, label: r.label, icon: r.icon, color: r.color,
          value: Number(r.value), note: r.note,
          sort_order: r.sort_order,
          autoSync: r.id === "us_stocks",
        }));
        setAssets(loadedAssets);
      } else {
        const defaults = DEFAULT_ASSETS(33).map((a, i) => ({ ...a, sort_order: i }));
        await supabase.from("life_assets").upsert(
          defaults.map(a => ({ ...a, user_id: user.id }))
        );
        loadedAssets = defaults;
        setAssets(defaults);
      }

      // Month logs
      const { data: logRows } = await supabase
        .from("life_monthly_logs")
        .select("month, income")
        .eq("user_id", user.id)
        .order("month", { ascending: true })
        .limit(12);

      const logsData: MonthLog[] = (logRows || []).map((r: any) => ({
        month: r.month, income: Number(r.income),
      }));
      setLogs([...logsData].reverse());

      // Net Worth snapshots จาก logs
      const netWorthFromLoad = loadedAssets
        .filter(a => a.id !== "cash")
        .reduce((s, a) => s + a.value, 0);

      const snaps: NetWorthSnap[] = logsData.map(l => ({
        month: l.month,
        total: netWorthFromLoad,
      }));
      setNwSnaps(snaps);

      setBuckets(loadBuckets());
      setLoading(false);

      // Auto-sync US portfolio หลัง load เสร็จ
      const r = rate > 0 ? rate : 33;
      syncUSPortfolio(user.id, r);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Net Worth ────────────────────────────────────────────────────────────────
  const netWorth   = assets.filter(a => a.id !== "cash").reduce((s, a) => s + a.value, 0);
  const animatedNW = useCountUp(netWorth);
  const incomeNum  = parseFloat(income.replace(/,/g, "")) || 0;
  const totalPct   = buckets.reduce((s, b) => s + b.pct, 0);
  const pctOk      = Math.abs(totalPct - 100) < 0.1;

  const handleBucketPct = (id: string, val: number) => {
    setBuckets(prev => {
      const next = prev.map(b => b.id === id ? { ...b, pct: val } : b);
      saveBuckets(next);
      return next;
    });
  };

  // ── Edit asset ───────────────────────────────────────────────────────────────
  const handleEdit = useCallback((id: string, value: number) => {
    setAssets(prev => {
      const next = prev.map(a => a.id === id ? { ...a, value } : a);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!userId) return;
        const target = next.find(a => a.id === id);
        if (!target) return;
        await supabase.from("life_assets").upsert({
          id, user_id: userId, label: target.label, icon: target.icon,
          color: target.color, value, note: target.note ?? null,
          sort_order: target.sort_order,
        });
      }, 800);
      return next;
    });
  }, [userId]);

  // ── Save month ───────────────────────────────────────────────────────────────
  const handleSaveMonth = async () => {
    if (!incomeNum || !userId) return;
    setSaving(true);
    await supabase.from("life_monthly_logs").upsert({
      user_id: userId, month, income: incomeNum,
    });
    const newLog = { month, income: incomeNum };
    setLogs(prev => {
      const filtered = prev.filter(l => l.month !== month);
      return [newLog, ...filtered].sort((a, b) => b.month.localeCompare(a.month));
    });
    // อัปเดต NW snapshot
    setNwSnaps(prev => {
      const filtered = prev.filter(s => s.month !== month);
      return [...filtered, { month, total: netWorth }].sort((a, b) => a.month.localeCompare(b.month));
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .fu  { animation: fadeInUp 0.4s ease both; }
        .fu1 { animation: fadeInUp 0.4s 0.07s ease both; }
        .fu2 { animation: fadeInUp 0.4s 0.14s ease both; }
        .fu3 { animation: fadeInUp 0.4s 0.21s ease both; }
        .fu4 { animation: fadeInUp 0.4s 0.28s ease both; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .spin { animation: spin 0.8s linear infinite; display:inline-block; }
      `}</style>

      <main className="min-h-screen bg-[var(--bg)] text-[var(--tx)]"
        style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

        {/* ── Header เหมือนหน้าหลัก ── */}
        <header className="border-b border-[var(--border)] px-3 lg:px-6 py-2 lg:py-3 flex items-center justify-between bg-[var(--bg)]/90 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/"
              className="w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center rounded-lg bg-[var(--fill)] hover:bg-[var(--fill-strong)] text-sm transition-colors">
              ←
            </Link>
            <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-black font-black text-xs flex-shrink-0">
              🌱
            </div>
            <span className="font-bold text-sm lg:text-base tracking-tight hidden sm:block">LIFE PORTFOLIO</span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Sync button */}
            <button
              onClick={() => userId && syncUSPortfolio(userId, rate)}
              disabled={syncing}
              title="Sync พอร์ต US"
              className="w-8 h-8 flex items-center justify-center bg-[var(--fill)] hover:bg-[var(--fill-strong)] rounded-lg text-sm transition-colors disabled:opacity-40">
              <span className={syncing ? "spin" : ""}>⟳</span>
            </button>
            <CurrencyToggle currency={currency} rate={rate} lastUpdate={rateUpdate} onToggle={toggleCurrency} />
            <ThemeToggle />
          </div>
        </header>

        {/* Loading */}
        {loading ? (
          <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto space-y-4">
            {[140, 300, 220].map((h, i) => (
              <div key={i} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] animate-pulse" style={{ height: h }} />
            ))}
          </div>
        ) : (
          <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto space-y-4 pb-20">

            {/* ── NET WORTH CARD ── */}
            <div className="fu relative bg-gradient-to-br from-[#0d1117] to-[#0a0e14] border border-emerald-900/40 rounded-2xl p-5 lg:p-6 overflow-hidden"
              style={{ boxShadow: "0 0 48px #10b98112, 0 0 1px #10b98130" }}>
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle,#10b98118,transparent 70%)" }} />

              <p className="text-[10px] text-[var(--tx-4)] uppercase tracking-widest mb-1">NET WORTH รวม (ไม่รวมเงินสำรอง)</p>

              {/* มูลค่าหลัก — แสดงตามสกุลเงินที่เลือก */}
              <p className="text-3xl lg:text-4xl font-black tabular-nums leading-none text-white">
                {fmtVal(Math.round(animatedNW))}
              </p>
              <p className="text-xs text-emerald-400/60 mt-1">
                {currency === "THB"
                  ? `≈ $${(animatedNW / (rate || 33)).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD`
                  : `≈ ฿${Math.round(animatedNW).toLocaleString("th-TH")}`
                }
                {rate > 0 && ` · เรท ${rate} ฿/$`}
              </p>

              {/* Donut + legend */}
              <div className="mt-5 flex gap-5 items-center">
                <div className="flex-shrink-0">
                  <DonutChart segments={assets.filter(a => a.id !== "cash").map(a => ({ value: a.value, color: a.color }))} />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {assets.filter(a => a.id !== "cash").map(a => (
                    <div key={a.id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
                      <span className="text-xs text-[var(--tx-3)] flex-1 truncate">{a.label}</span>
                      <span className="text-xs font-bold tabular-nums text-[var(--tx-2)] flex-shrink-0">
                        {netWorth > 0 ? ((a.value / netWorth) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Net Worth Sparkline */}
              {nwSnaps.length >= 2 && <NWSparkline snaps={nwSnaps} />}
            </div>

            {/* ── ASSET LIST ── */}
            <div className="fu1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">มูลค่าสินทรัพย์</p>
                <p className="text-[10px] text-[var(--tx-5)]">แตะตัวเลขเพื่อแก้ไข</p>
              </div>
              <div className="py-1">
                {assets.map(a => (
                  <AssetRow key={a.id} asset={a} total={netWorth} onEdit={handleEdit} fmtVal={fmtVal} />
                ))}
              </div>
              <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-2">
                <span className="text-[10px] text-[var(--tx-5)]">☁️ ซิงก์ผ่าน Supabase</span>
                {syncing && <span className="text-[10px] text-blue-400 spin">⟳</span>}
                {syncing && <span className="text-[10px] text-blue-400">กำลังอัปเดตพอร์ต US...</span>}
              </div>
            </div>

            {/* ── BUCKET PLANNER ── */}
            <div className="fu2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">Bucket Planner</p>
                  <p className="text-[10px] text-[var(--tx-5)] mt-0.5">กรอกรายรับจริง → ระบบแบ่งตาม % ที่ตั้งไว้</p>
                </div>
                <button onClick={() => setEditBuckets(e => !e)}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-colors"
                  style={{
                    background: editBuckets ? "rgba(167,139,250,0.15)" : "var(--fill)",
                    color: editBuckets ? "#a78bfa" : "var(--tx-4)",
                  }}>
                  {editBuckets ? "✓ เสร็จแล้ว" : "⚙️ ปรับ %"}
                </button>
              </div>

              <div className="p-4 space-y-3">

                {/* ── เดือน + รายรับ ── */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-[var(--tx-4)] mb-1">เดือน</p>
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                      className="w-full bg-[var(--fill)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--tx)] outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--tx-4)] mb-1">รายรับจริง (บาท)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--tx-4)]">฿</span>
                      <input type="number" placeholder="200000" value={income}
                        onChange={e => setIncome(e.target.value)}
                        className="w-full pl-6 pr-3 py-1.5 bg-[var(--fill)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--tx)] outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                </div>

                {/* ── % ไม่ครบ 100 เตือน ── */}
                {editBuckets && !pctOk && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30">
                    <span>⚠️</span>
                    <p className="text-xs text-red-400">รวมทุก Bucket = <strong>{totalPct.toFixed(2)}%</strong> ต้องให้ครบ 100% ก่อนบันทึกครับ</p>
                  </div>
                )}

                {/* ── Bucket rows ── */}
                <div className="space-y-2">
                  {buckets.map((b) => {
                    const amt = incomeNum * (b.pct / 100);
                    return (
                      <div key={b.id} className="rounded-xl border border-[var(--border)] overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3" style={{ background: `${b.color}0d` }}>
                          <span className="text-lg flex-shrink-0">{b.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-black">{b.label}</p>
                              {editBuckets ? (
                                /* slider + input % */
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <input
                                    type="range" min={0} max={100} step={0.25}
                                    value={b.pct}
                                    onChange={e => handleBucketPct(b.id, parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
                                    style={{ accentColor: b.color }}
                                  />
                                  <input
                                    type="number" min={0} max={100} step={0.25}
                                    value={b.pct}
                                    onChange={e => handleBucketPct(b.id, parseFloat(e.target.value) || 0)}
                                    className="w-14 text-center text-xs font-black bg-[var(--fill)] border border-[var(--border-2)] rounded-lg px-1 py-0.5 outline-none"
                                    style={{ color: b.color }}
                                  />
                                  <span className="text-xs font-bold flex-shrink-0" style={{ color: b.color }}>%</span>
                                </div>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                                  style={{ background: `${b.color}22`, color: b.color }}>
                                  {b.pct}%
                                </span>
                              )}
                            </div>
                            {!editBuckets && <p className="text-[10px] text-[var(--tx-5)] truncate mt-0.5">{b.note}</p>}
                          </div>
                          {!editBuckets && (
                            <div className="text-right flex-shrink-0">
                              {incomeNum > 0 ? (
                                <p className="text-base font-black tabular-nums" style={{ color: b.color }}>
                                  ฿{Math.round(amt).toLocaleString("th-TH")}
                                </p>
                              ) : (
                                <p className="text-xs text-[var(--tx-5)]">—</p>
                              )}
                            </div>
                          )}
                        </div>
                        {!editBuckets && incomeNum > 0 && (
                          <div className="h-1 bg-[var(--fill)]">
                            <div className="h-full transition-all duration-700"
                              style={{ width: `${b.pct}%`, background: b.color }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── Total bar ── */}
                {editBuckets && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[var(--tx-4)]">รวมทั้งหมด</span>
                      <span className={pctOk ? "text-emerald-400 font-black" : "text-red-400 font-black"}>
                        {totalPct.toFixed(2)}% {pctOk ? "✓" : `(ขาด ${(100 - totalPct).toFixed(2)}%)`}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--fill)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(totalPct, 100)}%`,
                          background: pctOk
                            ? "linear-gradient(90deg,#10b981,#059669)"
                            : "linear-gradient(90deg,#f97316,#ef4444)",
                        }} />
                    </div>
                    <button
                      onClick={() => { setBuckets(DEFAULT_BUCKETS); saveBuckets(DEFAULT_BUCKETS); }}
                      className="mt-2 text-[10px] text-[var(--tx-5)] hover:text-[var(--tx-3)] transition-colors">
                      ↺ รีเซ็ตกลับค่าเริ่มต้น
                    </button>
                  </div>
                )}

                {/* ── Summary เมื่อกรอกรายรับ ── */}
                {incomeNum > 0 && !editBuckets && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-xl px-3 py-2.5 border border-[var(--border)] bg-[var(--fill)]">
                      <p className="text-[10px] text-[var(--tx-5)]">รายรับทั้งหมด</p>
                      <p className="text-sm font-black tabular-nums">฿{incomeNum.toLocaleString("th-TH")}</p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 border border-emerald-500/25"
                      style={{ background: "rgba(16,185,129,0.06)" }}>
                      <p className="text-[10px] text-[var(--tx-5)]">เก็บรวม ({buckets.filter(b => b.id !== "spend").reduce((s,b) => s+b.pct, 0).toFixed(2)}%)</p>
                      <p className="text-sm font-black tabular-nums text-emerald-400">
                        ฿{Math.round(incomeNum * buckets.filter(b => b.id !== "spend").reduce((s,b) => s+b.pct, 0) / 100).toLocaleString("th-TH")}
                      </p>
                    </div>
                  </div>
                )}

                <button onClick={handleSaveMonth} disabled={!incomeNum || saving || !pctOk}
                  className="w-full py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                  style={{
                    background: saved ? "rgba(16,185,129,0.12)" : "linear-gradient(135deg,#10b981,#059669)",
                    color: saved ? "#10b981" : "#fff",
                    border: saved ? "1px solid rgba(16,185,129,0.3)" : "none",
                  }}>
                  {saving ? <><span className="spin">⟳</span> กำลังบันทึก...</>
                    : saved  ? `✓ บันทึก ${fmtMonth(month)} แล้ว`
                    : !pctOk ? "⚠️ % ยังไม่ครบ 100"
                    : `☁️ บันทึก ${fmtMonth(month)}`}
                </button>
              </div>
            </div>

            {/* ── HISTORY ── */}
            {logs.length > 0 && (
              <div className="fu3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">ประวัติรายเดือน</p>
                  <p className="text-[10px] text-[var(--tx-5)]">{logs.length} เดือน</p>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {logs.map(log => {
                    return (
                      <div key={log.month} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2.5">
                          <p className="text-sm font-bold">{fmtMonth(log.month)}</p>
                          <div className="text-right">
                            <p className="text-[10px] text-[var(--tx-5)]">รายรับ</p>
                            <p className="text-sm font-black tabular-nums">฿{log.income.toLocaleString("th-TH")}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          {buckets.map((b) => (
                            <div key={b.id} className="rounded-lg py-2 px-2 text-center"
                              style={{ background: `${b.color}12` }}>
                              <p className="text-[10px] text-[var(--tx-4)]">{b.icon} {b.label}</p>
                              <p className="text-xs font-black tabular-nums mt-0.5" style={{ color: b.color }}>
                                ฿{Math.round(log.income * b.pct / 100).toLocaleString("th-TH")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <footer className="text-center text-xs text-[var(--tx-6)] pb-2">
              Life Portfolio · ☁️ Supabase · ไม่ใช่คำแนะนำการลงทุน
            </footer>
          </div>
        )}

        {/* ── Bottom Nav (mobile) ── */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[var(--bg)]/95 backdrop-blur border-t border-[var(--border)] z-30 lg:hidden">
          <div className="flex justify-around items-center py-2 px-2">
            {[
              { href: "/",          icon: "🏠", label: "หน้าหลัก" },
              { href: "/portfolio", icon: "📊", label: "พอร์ต" },
              { href: "/chart",     icon: "📈", label: "กราฟ" },
              { href: "/journal",   icon: "📓", label: "Journal" },
              { href: "/life",      icon: "🌱", label: "ชีวิต",  active: true },
            ].map(n => (
              <Link key={n.href} href={n.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors ${
                  n.active
                    ? "text-emerald-400 bg-emerald-400/10"
                    : "text-[var(--tx-4)] hover:text-[var(--tx-2)]"
                }`}>
                <span className="text-lg">{n.icon}</span>
                <span className="text-[9px] font-bold">{n.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </>
  );
}
