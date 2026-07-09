"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
export type Snapshot = {
  snapshot_date: string;
  market_value: number;
  total_pl: number;
  pl_pct: number;
};

type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "ALL";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "1M",  label: "1M",  days: 30   },
  { key: "3M",  label: "3M",  days: 90   },
  { key: "6M",  label: "6M",  days: 180  },
  { key: "YTD", label: "YTD", days: null }, // คำนวณพิเศษ
  { key: "1Y",  label: "1Y",  days: 365  },
  { key: "3Y",  label: "3Y",  days: 1095 },
  { key: "ALL", label: "All", days: null },
];

// ─── บันทึก snapshot ของวันนี้ (เรียกจาก Home) ────────────────────────────────
export async function saveTodaySnapshot(data: {
  marketValue: number; totalCost: number; cash: number;
  totalPL: number; plPct: number; count: number;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || data.marketValue <= 0) return;

    const today = new Date().toISOString().split("T")[0];
    await supabase.from("portfolio_snapshots").upsert({
      user_id: user.id,
      snapshot_date: today,
      market_value: data.marketValue,
      total_cost: data.totalCost,
      cash: data.cash,
      total_pl: data.totalPL,
      pl_pct: data.plPct,
      position_count: data.count,
    }, { onConflict: "user_id,snapshot_date" });
  } catch (e) {
    console.error("snapshot save error:", e);
  }
}

// ─── เส้น: ใช้ smoothing เบามาก เพื่อให้เห็นสวิงจริง ───────────────────────────
function polyline(pts: [number, number][], tension = 0.06): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  if (pts.length === 2) return `M ${pts[0][0]},${pts[0][1]} L ${pts[1][0]},${pts[1][1]}`;

  const d = [`M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) * tension;
    const c1y = p1[1] + (p2[1] - p0[1]) * tension;
    const c2x = p2[0] - (p3[0] - p1[0]) * tension;
    const c2y = p2[1] - (p3[1] - p1[1]) * tension;
    d.push(`C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
  }
  return d.join(" ");
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EquityCurve({ fallbackValue = 0 }: { fallbackValue?: number }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading]     = useState(true);
  const [range, setRange]         = useState<RangeKey>("1M");
  const [hover, setHover]         = useState<{ i: number; x: number; y: number } | null>(null);

  // โหลด snapshots
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) { setSnapshots([]); setLoading(false); } return; }
        const { data } = await supabase
          .from("portfolio_snapshots")
          .select("snapshot_date, market_value, total_pl, pl_pct")
          .eq("user_id", user.id)
          .order("snapshot_date", { ascending: true });
        if (!cancelled) setSnapshots(data || []);
      } catch {
        if (!cancelled) setSnapshots([]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // กรองตามช่วงเวลา
  const filtered = useMemo(() => {
    if (!snapshots.length) return [];
    const now = new Date();
    const cfg = RANGES.find(r => r.key === range)!;

    let cutoff: Date | null = null;
    if (cfg.key === "YTD") {
      cutoff = new Date(now.getFullYear(), 0, 1);
    } else if (cfg.days !== null) {
      cutoff = new Date(now.getTime() - cfg.days * 86400000);
    }
    if (!cutoff) return snapshots; // ALL

    const cutStr = cutoff.toISOString().split("T")[0];
    return snapshots.filter(s => s.snapshot_date >= cutStr);
  }, [snapshots, range]);

  // สถิติ
  const stats = useMemo(() => {
    if (filtered.length < 1) return null;
    const first = filtered[0].market_value;
    const last  = filtered[filtered.length - 1].market_value;
    const change = last - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    const values = filtered.map(s => s.market_value);
    return {
      first, last, change, changePct,
      high: Math.max(...values),
      low: Math.min(...values),
      days: filtered.length,
    };
  }, [filtered]);

  const W = 320, H = 90, PAD_Y = 6;

  // จุดบนกราฟ
  const points = useMemo((): [number, number][] => {
    if (filtered.length < 2) return [];
    const vals = filtered.map(s => s.market_value);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const range = mx - mn || 1;
    return filtered.map((s, i) => [
      (i / (filtered.length - 1)) * W,
      PAD_Y + (1 - (s.market_value - mn) / range) * (H - PAD_Y * 2),
    ]);
  }, [filtered]);

  const isPos = (stats?.change ?? 0) >= 0;
  const lineColor = isPos ? "#10b981" : "#ef4444";
  const line = polyline(points);
  const area = points.length ? `${line} L ${W},${H} L 0,${H} Z` : "";

  const fmt = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  };

  // ── Empty state: ยังเก็บข้อมูลไม่พอ ──
  if (!loading && filtered.length < 2) {
    return (
      <div className="mt-3">
        <div className="flex gap-1 mb-2 overflow-x-auto">
          {RANGES.map(r => (
            <button key={r.key} disabled
              className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--fill)] text-[var(--tx-6)] opacity-50">
              {r.label}
            </button>
          ))}
        </div>
        <div className="h-[90px] flex flex-col items-center justify-center gap-1 border border-dashed border-[var(--border-2)] rounded-lg">
          <p className="text-[11px] text-[var(--tx-4)] font-bold">📊 กำลังเก็บข้อมูล equity</p>
          <p className="text-[9px] text-[var(--tx-6)]">
            {snapshots.length === 0 ? "เริ่มบันทึกวันนี้" : `มีข้อมูล ${snapshots.length} วัน · ต้องการอย่างน้อย 2 วัน`}
          </p>
          {fallbackValue > 0 && (
            <p className="text-[10px] text-[var(--tx-5)] font-mono mt-0.5">ปัจจุบัน {fmt(fallbackValue)}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {/* ปุ่มช่วงเวลา */}
      <div className="flex gap-1 mb-2 overflow-x-auto scrollbar-none">
        {RANGES.map(r => {
          const active = range === r.key;
          // เช็คว่ามีข้อมูลพอสำหรับช่วงนี้ไหม
          return (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                active
                  ? "bg-[var(--tx)] text-[var(--bg)]"
                  : "bg-[var(--fill)] text-[var(--tx-4)] hover:text-[var(--tx-2)]"
              }`}>
              {r.label}
            </button>
          );
        })}
      </div>

      {/* สถิติช่วงนั้น */}
      {stats && (
        <div className="flex items-baseline gap-2 mb-1.5">
          <span className={`text-xs font-black ${isPos ? "text-emerald-400" : "text-red-400"}`}>
            {isPos ? "+" : ""}{fmt(stats.change)}
          </span>
          <span className={`text-[10px] font-bold ${isPos ? "text-emerald-400" : "text-red-400"}`}>
            ({isPos ? "+" : ""}{stats.changePct.toFixed(2)}%)
          </span>
          <span className="text-[9px] text-[var(--tx-6)] ml-auto">{stats.days} วัน</span>
        </div>
      )}

      {/* กราฟ */}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            if (!points.length) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round((x / W) * (points.length - 1));
            const clamped = Math.max(0, Math.min(points.length - 1, i));
            setHover({ i: clamped, x: points[clamped][0], y: points[clamped][1] });
          }}>
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.35"/>
              <stop offset="100%" stopColor={lineColor} stopOpacity="0"/>
            </linearGradient>
          </defs>

          {/* เส้นแนวนอนอ้างอิง */}
          <line x1="0" y1={H / 2} x2={W} y2={H / 2}
            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4"/>

          {/* พื้นที่ใต้กราฟ */}
          <path d={area} fill="url(#eqGrad)"/>

          {/* เส้น equity */}
          <path d={line} fill="none" stroke={lineColor} strokeWidth="1.6"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>

          {/* จุด hover */}
          {hover && points[hover.i] && (
            <>
              <line x1={hover.x} y1={0} x2={hover.x} y2={H}
                stroke={lineColor} strokeWidth="0.5" opacity="0.4" vectorEffect="non-scaling-stroke"/>
              <circle cx={hover.x} cy={hover.y} r="3" fill={lineColor}
                stroke="var(--bg)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover && filtered[hover.i] && (
          <div className="absolute pointer-events-none bg-[var(--surface)] border border-[var(--border-2)] rounded-lg px-2 py-1 shadow-xl"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: 0,
              transform: hover.x > W * 0.6 ? "translate(-105%, -4px)" : "translate(5%, -4px)",
            }}>
            <p className="text-[9px] text-[var(--tx-5)] whitespace-nowrap">
              {fmtDate(filtered[hover.i].snapshot_date)}
            </p>
            <p className="text-[11px] font-black text-[var(--tx)] whitespace-nowrap tabular-nums">
              {fmt(filtered[hover.i].market_value)}
            </p>
            <p className={`text-[9px] font-bold ${filtered[hover.i].total_pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {filtered[hover.i].total_pl >= 0 ? "+" : ""}{filtered[hover.i].pl_pct.toFixed(2)}%
            </p>
          </div>
        )}
      </div>

      {/* High / Low */}
      {stats && (
        <div className="flex justify-between mt-1 text-[9px] text-[var(--tx-6)] font-mono">
          <span>Low {fmt(stats.low)}</span>
          <span>High {fmt(stats.high)}</span>
        </div>
      )}
    </div>
  );
}
