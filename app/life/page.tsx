"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type Asset = {
  id: string;
  label: string;
  icon: string;
  color: string;
  value: number;
  note?: string;
  sort_order: number;
};

type MonthLog = {
  month: string;
  income: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const USD_TO_THB = 33;

const DEFAULT_ASSETS: Omit<Asset, "sort_order">[] = [
  { id: "us_stocks", label: "หุ้น US",    icon: "🇺🇸", color: "#4f7df3", value: 27700 * USD_TO_THB, note: "Hold — ไม่เติมใหม่" },
  { id: "gold",      label: "ทองคำ",      icon: "🥇", color: "#f0aa4f", value: 70000 },
  { id: "bitcoin",   label: "Bitcoin",    icon: "₿",  color: "#f7931a", value: 76000 },
  { id: "th_stocks", label: "หุ้นไทย",   icon: "🇹🇭", color: "#10b981", value: 50000 },
  { id: "cash",      label: "เงินสำรอง", icon: "🏦", color: "#38bdf8", value: 0,     note: "6–12 เดือน (ไม่นับในพอร์ต)" },
];

const BUCKET_CONFIG = [
  { label: "ใช้ชีวิต", icon: "🛍️", color: "#f97316", pct: 25, note: "ค่าใช้จ่ายส่วนตัว" },
  { label: "ปลอดภัย", icon: "🛡️", color: "#38bdf8", pct: 25, note: "ทอง 60% + กองตลาดเงิน 40%" },
  { label: "เติบโต",  icon: "🚀", color: "#a78bfa", pct: 50, note: "หุ้นไทย + BTC + โอกาส" },
];

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtMonth(key: string) {
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

// ─── Donut ────────────────────────────────────────────────────────────────────
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

// ─── Asset Row ────────────────────────────────────────────────────────────────
function AssetRow({ asset, total, onEdit }: {
  asset: Asset;
  total: number;
  onEdit: (id: string, value: number) => void;
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
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold truncate">{asset.label}</p>
          {asset.note && <p className="text-[10px] text-[var(--tx-5)] truncate hidden sm:block">{asset.note}</p>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-[var(--fill)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: asset.color }} />
          </div>
          <span className="text-[10px] text-[var(--tx-4)] w-8 text-right">{pct.toFixed(1)}%</span>
        </div>
      </div>
      {editing ? (
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
          ฿{asset.value.toLocaleString("th-TH")}
          <span className="ml-1 text-[10px] opacity-0 group-hover:opacity-60 transition-opacity">✏️</span>
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LifePage() {
  const [assets, setAssets]   = useState<Asset[]>([]);
  const [logs, setLogs]       = useState<MonthLog[]>([]);
  const [income, setIncome]   = useState("");
  const [month, setMonth]     = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [userId, setUserId]   = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load from Supabase ──────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Load assets
      const { data: rows } = await supabase
        .from("life_assets")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (rows && rows.length > 0) {
        setAssets(rows.map((r: any) => ({
          id: r.id, label: r.label, icon: r.icon,
          color: r.color, value: Number(r.value),
          note: r.note, sort_order: r.sort_order,
        })));
      } else {
        // ครั้งแรก — seed default assets
        const defaults = DEFAULT_ASSETS.map((a, i) => ({ ...a, sort_order: i, user_id: user.id }));
        await supabase.from("life_assets").upsert(defaults);
        setAssets(DEFAULT_ASSETS.map((a, i) => ({ ...a, sort_order: i })));
      }

      // Load logs
      const { data: logRows } = await supabase
        .from("life_monthly_logs")
        .select("month, income")
        .eq("user_id", user.id)
        .order("month", { ascending: false })
        .limit(12);

      if (logRows) setLogs(logRows.map((r: any) => ({ month: r.month, income: Number(r.income) })));
      setLoading(false);
    };
    init();
  }, []);

  // ── Net Worth ───────────────────────────────────────────────────────────────
  const netWorth   = assets.filter(a => a.id !== "cash").reduce((s, a) => s + a.value, 0);
  const animatedNW = useCountUp(netWorth);
  const incomeNum  = parseFloat(income.replace(/,/g, "")) || 0;
  const savingsNum = incomeNum * 0.75;

  // ── Edit asset → debounce upsert ────────────────────────────────────────────
  const handleEdit = useCallback((id: string, value: number) => {
    setAssets(prev => {
      const next = prev.map(a => a.id === id ? { ...a, value } : a);

      // Debounce save 800ms
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

  // ── Save month log ───────────────────────────────────────────────────────────
  const handleSaveMonth = async () => {
    if (!incomeNum || !userId) return;
    setSaving(true);
    await supabase.from("life_monthly_logs").upsert({
      user_id: userId, month, income: incomeNum,
    });
    setLogs(prev => {
      const filtered = prev.filter(l => l.month !== month);
      return [{ month, income: incomeNum }, ...filtered].sort((a, b) => b.month.localeCompare(a.month));
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .fu  { animation: fadeInUp 0.4s ease both; }
        .fu1 { animation: fadeInUp 0.4s 0.07s ease both; }
        .fu2 { animation: fadeInUp 0.4s 0.14s ease both; }
        .fu3 { animation: fadeInUp 0.4s 0.21s ease both; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; display: inline-block; }
      `}</style>

      <main className="min-h-screen bg-[var(--bg)] text-[var(--tx)]"
        style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>

        {/* Header */}
        <header className="border-b border-[var(--border)] px-4 lg:px-6 py-3 flex items-center gap-3 bg-[var(--bg)]/90 backdrop-blur sticky top-0 z-30">
          <Link href="/"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--fill)] hover:bg-[var(--fill-strong)] text-sm transition-colors">
            ←
          </Link>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-black font-black text-xs flex-shrink-0">
            🌱
          </div>
          <div className="flex-1">
            <p className="font-black text-sm tracking-tight leading-none">Life Portfolio</p>
            <p className="text-[10px] text-[var(--tx-4)]">Net Worth รวม + Bucket รายเดือน</p>
          </div>
          {loading && <span className="spin text-[var(--tx-4)] text-base">⟳</span>}
        </header>

        {/* Loading skeleton */}
        {loading ? (
          <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto space-y-4">
            {[120, 280, 200].map((h, i) => (
              <div key={i} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] animate-pulse" style={{ height: h }} />
            ))}
          </div>
        ) : (
          <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto space-y-4">

            {/* ── NET WORTH CARD ── */}
            <div className="fu relative bg-gradient-to-br from-[#0d1117] to-[#0a0e14] border border-emerald-900/40 rounded-2xl p-5 lg:p-6 overflow-hidden"
              style={{ boxShadow: "0 0 48px #10b98112, 0 0 1px #10b98130" }}>
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle,#10b98118,transparent 70%)" }} />

              <p className="text-[10px] text-[var(--tx-4)] uppercase tracking-widest mb-1">NET WORTH รวม (ไม่รวมเงินสำรอง)</p>
              <p className="text-3xl lg:text-4xl font-black tabular-nums leading-none text-white">
                ฿{Math.round(animatedNW).toLocaleString("th-TH")}
              </p>
              <p className="text-xs text-emerald-400/60 mt-1">
                ≈ ${(animatedNW / USD_TO_THB).toLocaleString("en-US", { maximumFractionDigits: 0 })} USD · เรท {USD_TO_THB} ฿/$
              </p>

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
            </div>

            {/* ── ASSET LIST ── */}
            <div className="fu1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">มูลค่าสินทรัพย์</p>
                <p className="text-[10px] text-[var(--tx-5)]">แตะตัวเลขเพื่อแก้ไข · บันทึก Supabase อัตโนมัติ</p>
              </div>
              <div className="py-1">
                {assets.map(a => (
                  <AssetRow key={a.id} asset={a} total={netWorth} onEdit={handleEdit} />
                ))}
              </div>
              <div className="px-4 py-2 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--tx-5)]">☁️ ซิงก์ข้ามอุปกรณ์ผ่าน Supabase</p>
              </div>
            </div>

            {/* ── BUCKET PLANNER ── */}
            <div className="fu2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">Bucket Planner</p>
                <p className="text-[10px] text-[var(--tx-5)] mt-0.5">กรอกรายรับ → แบ่งให้อัตโนมัติ (เก็บ 75%)</p>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-[var(--tx-4)] mb-1">เดือน</p>
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                      className="w-full bg-[var(--fill)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--tx)] outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--tx-4)] mb-1">รายรับ (บาท)</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--tx-4)]">฿</span>
                      <input type="number" placeholder="150000" value={income}
                        onChange={e => setIncome(e.target.value)}
                        className="w-full pl-6 pr-3 py-1.5 bg-[var(--fill)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--tx)] outline-none focus:border-emerald-500" />
                    </div>
                  </div>
                </div>

                {incomeNum > 0 && (
                  <div className="flex items-center gap-3 py-2 px-3 rounded-xl border"
                    style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.2)" }}>
                    <span className="text-base">💰</span>
                    <p className="text-xs text-[var(--tx-4)] flex-1">เก็บ 75% จาก ฿{incomeNum.toLocaleString("th-TH")}</p>
                    <p className="text-sm font-black text-emerald-400 tabular-nums">฿{savingsNum.toLocaleString("th-TH")}</p>
                  </div>
                )}

                <div className="space-y-2">
                  {BUCKET_CONFIG.map((b, i) => {
                    const amt = savingsNum * (b.pct / 100);
                    return (
                      <div key={i} className="rounded-xl border border-[var(--border)] overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3" style={{ background: `${b.color}0d` }}>
                          <span className="text-lg flex-shrink-0">{b.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black">{b.label}</p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                                style={{ background: `${b.color}22`, color: b.color }}>
                                {b.pct}%
                              </span>
                            </div>
                            <p className="text-[10px] text-[var(--tx-5)] truncate">{b.note}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {incomeNum > 0 ? (
                              <p className="text-base font-black tabular-nums" style={{ color: b.color }}>
                                ฿{Math.round(amt).toLocaleString("th-TH")}
                              </p>
                            ) : (
                              <p className="text-xs text-[var(--tx-5)]">—</p>
                            )}
                          </div>
                        </div>
                        {incomeNum > 0 && (
                          <div className="h-1 bg-[var(--fill)]">
                            <div className="h-full transition-all duration-700"
                              style={{ width: `${b.pct}%`, background: b.color }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button onClick={handleSaveMonth} disabled={!incomeNum || saving}
                  className="w-full py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                  style={{
                    background: saved ? "rgba(16,185,129,0.12)" : "linear-gradient(135deg,#10b981,#059669)",
                    color: saved ? "#10b981" : "#fff",
                    border: saved ? "1px solid rgba(16,185,129,0.3)" : "none",
                  }}>
                  {saving ? <><span className="spin">⟳</span> กำลังบันทึก...</>
                   : saved ? `✓ บันทึก ${fmtMonth(month)} แล้ว`
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
                    const s75 = log.income * 0.75;
                    return (
                      <div key={log.month} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2.5">
                          <p className="text-sm font-bold">{fmtMonth(log.month)}</p>
                          <div className="text-right">
                            <p className="text-[10px] text-[var(--tx-5)]">รายรับ</p>
                            <p className="text-sm font-black tabular-nums">฿{log.income.toLocaleString("th-TH")}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {BUCKET_CONFIG.map((b, i) => (
                            <div key={i} className="rounded-lg py-2 px-2 text-center"
                              style={{ background: `${b.color}12` }}>
                              <p className="text-[10px] text-[var(--tx-4)]">{b.icon} {b.label}</p>
                              <p className="text-xs font-black tabular-nums mt-0.5" style={{ color: b.color }}>
                                ฿{Math.round(s75 * b.pct / 100).toLocaleString("th-TH")}
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

            <footer className="text-center text-xs text-[var(--tx-6)] pb-6">
              Life Portfolio · ☁️ Supabase · ไม่ใช่คำแนะนำการลงทุน
            </footer>
          </div>
        )}
      </main>
    </>
  );
}
