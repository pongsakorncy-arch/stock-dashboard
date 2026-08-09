"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCurrency } from "@/hooks/useCurrency";
import CurrencyToggle from "@/components/CurrencyToggle";
import ThemeToggle from "@/components/ThemeToggle";

// ─── Types ────────────────────────────────────────────────────────────────────
type Asset = {
  id: string; label: string; icon: string; color: string;
  value: number; valueUSD?: number; note?: string;
  sort_order: number; autoSync?: boolean;
};
type MonthLog  = { month: string; income: number };
type NWSnap    = { month: string; total: number };
type SubItem   = { id: string; label: string; icon: string; pct: number; note: string };
type Bucket    = { id: string; label: string; icon: string; color: string; pct: number; note: string; subs: SubItem[] };

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_BUCKETS: Bucket[] = [
  {
    id: "spend", label: "ใช้จ่าย", icon: "🛍️", color: "#f97316", pct: 25,
    note: "ค่าใช้จ่ายประจำวัน",
    subs: [],
  },
  {
    id: "safe", label: "ปลอดภัย", icon: "🛡️", color: "#38bdf8", pct: 18.75,
    note: "ทอง + กองตลาดเงิน",
    subs: [
      { id: "gold",  label: "ทองคำ",        icon: "🥇", pct: 60, note: "MTS Gold / ทองฟิสิคัล" },
      { id: "mmf",   label: "กองตลาดเงิน",  icon: "🏦", pct: 40, note: "KPLUS / SCB / กองเงิน" },
    ],
  },
  {
    id: "grow", label: "เติบโต", icon: "🚀", color: "#a78bfa", pct: 37.5,
    note: "หุ้นไทย + BTC + โอกาส",
    subs: [
      { id: "th",   label: "หุ้นไทย / RMF", icon: "🇹🇭", pct: 50, note: "กอง LTF/RMF หรือรายตัว" },
      { id: "btc",  label: "Bitcoin",       icon: "₿",  pct: 30, note: "DCA ทุกอาทิตย์" },
      { id: "opp",  label: "โอกาส",         icon: "🎯", pct: 20, note: "IPO / หุ้นเด่น / Trade" },
    ],
  },
  {
    id: "buffer", label: "สำรองเพิ่ม", icon: "🏦", color: "#10b981", pct: 18.75,
    note: "เพิ่มเงินสำรอง",
    subs: [
      { id: "bank",  label: "ออมทรัพย์",    icon: "🏧", pct: 100, note: "ธนาคารหลัก" },
    ],
  },
];

const DEFAULT_ASSETS: Omit<Asset, "sort_order">[] = [
  { id: "us_stocks", label: "หุ้น US",    icon: "🇺🇸", color: "#4f7df3", value: 0,     note: "ซิงก์จากพอร์ต", autoSync: true },
  { id: "gold",      label: "ทองคำ",      icon: "🥇", color: "#f0aa4f", value: 70000 },
  { id: "bitcoin",   label: "Bitcoin",    icon: "₿",  color: "#f7931a", value: 76000 },
  { id: "th_stocks", label: "หุ้นไทย",   icon: "🇹🇭", color: "#10b981", value: 0,     note: "ซิงก์จากพอร์ต THAI", autoSync: true },
  { id: "cash",      label: "เงินสำรอง", icon: "🏦", color: "#38bdf8", value: 0,     note: "6–12 เดือน (ไม่นับในพอร์ต)" },
];

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const fmtMonth  = (k: string) => { if (!k) return ""; const [y,m] = k.split("-"); return `${MONTHS_TH[+m-1]} ${+y}`; };
const getCurMon = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };

// ─── LocalStorage ─────────────────────────────────────────────────────────────
const LS_B = "yok_buckets_v2";
const loadB = (): Bucket[] => { try { const r = localStorage.getItem(LS_B); return r ? JSON.parse(r) : DEFAULT_BUCKETS; } catch { return DEFAULT_BUCKETS; } };
const saveB = (b: Bucket[]) => { try { localStorage.setItem(LS_B, JSON.stringify(b)); } catch {} };

// ─── Count-up ─────────────────────────────────────────────────────────────────
function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0);
  const f = useRef(0);
  useEffect(() => {
    const s = f.current, t0 = performance.now(); let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      setV(s + (target - s) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick); else f.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

// ─── Donut ────────────────────────────────────────────────────────────────────
function Donut({ segs }: { segs: { value: number; color: string }[] }) {
  const total = segs.reduce((s, x) => s + x.value, 0);
  if (!total) return <div className="w-28 h-28 rounded-full bg-[var(--fill)] flex items-center justify-center text-xs text-[var(--tx-4)]">ยังไม่มีข้อมูล</div>;
  const R = 44, C = 56, st = 16, ci = 2 * Math.PI * R; let off = 0;
  return (
    <svg width={112} height={112} viewBox="0 0 112 112">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--fill)" strokeWidth={st} />
      {segs.filter(s => s.value > 0).map((seg, i) => {
        const d = (seg.value / total) * ci;
        const el = <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={seg.color} strokeWidth={st}
          strokeDasharray={`${d} ${ci - d}`} strokeDashoffset={-off + ci * 0.25}
          style={{ transition: "stroke-dasharray 0.8s ease" }} />;
        off += d; return el;
      })}
    </svg>
  );
}

// ─── NW Sparkline ─────────────────────────────────────────────────────────────
function NWLine({ snaps }: { snaps: NWSnap[] }) {
  if (snaps.length < 2) return null;
  const vs = snaps.map(s => s.total);
  const mn = Math.min(...vs), mx = Math.max(...vs), W = 280, H = 52;
  const pts: [number,number][] = vs.map((v, i) => [
    (i / (vs.length - 1)) * W,
    H - ((mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (H - 8) + 4),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const col  = vs[vs.length-1] >= vs[0] ? "#10b981" : "#ef4444";
  return (
    <div className="mt-4">
      <p className="text-[10px] text-[var(--tx-5)] mb-1 uppercase tracking-wider">Net Worth ย้อนหลัง</p>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
        <defs><linearGradient id="ng" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity=".25"/><stop offset="100%" stopColor={col} stopOpacity="0"/>
        </linearGradient></defs>
        <path d={`${line} L${W},${H} L0,${H}Z`} fill="url(#ng)"/>
        <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={col} opacity=".8"><title>{fmtMonth(snaps[i].month)}: ฿{snaps[i].total.toLocaleString("th-TH")}</title></circle>)}
      </svg>
      <div className="flex justify-between text-[9px] text-[var(--tx-5)] mt-0.5">
        <span>{fmtMonth(snaps[0].month)}</span><span>{fmtMonth(snaps[snaps.length-1].month)}</span>
      </div>
    </div>
  );
}

// ─── Asset Row ────────────────────────────────────────────────────────────────
function AssetRow({ asset, total, onEdit, fmtV }: {
  asset: Asset; total: number; onEdit: (id: string, v: number) => void; fmtV: (n: number) => string;
}) {
  const [ed, setEd] = useState(false); const [dr, setDr] = useState(""); const ref = useRef<HTMLInputElement>(null);
  const pct = total > 0 ? (asset.value / total) * 100 : 0;
  const commit = () => { const v = parseFloat(dr.replace(/,/g,"")); if (!isNaN(v) && v>=0) onEdit(asset.id, v); setEd(false); };
  useEffect(() => { if (ed) { setDr(String(asset.value)); ref.current?.focus(); } }, [ed, asset.value]);
  return (
    <div className="group flex items-center gap-3 py-2.5 px-4 rounded-xl hover:bg-[var(--hover)] transition-colors">
      <span className="text-xl w-7 text-center flex-shrink-0">{asset.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold truncate">{asset.label}</p>
          {asset.autoSync && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-500/15 text-blue-400 flex-shrink-0">⚡ Auto</span>}
          {asset.note && !asset.autoSync && <p className="text-[10px] text-[var(--tx-5)] truncate hidden sm:block">{asset.note}</p>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-[var(--fill)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{ width:`${pct}%`, background: asset.color }} />
          </div>
          <span className="text-[10px] text-[var(--tx-4)] w-8 text-right">{pct.toFixed(1)}%</span>
        </div>
      </div>
      {asset.autoSync ? (
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-black tabular-nums">{fmtV(asset.value)}</p>
          {asset.valueUSD && <p className="text-[10px] text-[var(--tx-5)]">${asset.valueUSD.toLocaleString("en-US",{maximumFractionDigits:0})}</p>}
        </div>
      ) : ed ? (
        <div className="flex items-center gap-1">
          <input ref={ref} type="number" value={dr} onChange={e=>setDr(e.target.value)}
            onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")setEd(false);}}
            className="w-28 text-right text-sm font-mono bg-[var(--fill)] border border-[var(--border-2)] rounded-lg px-2 py-1 text-[var(--tx)] outline-none focus:border-emerald-500"/>
          <span className="text-[10px] text-[var(--tx-5)]">฿</span>
        </div>
      ) : (
        <button onClick={()=>setEd(true)} className="text-right text-sm font-mono font-black hover:text-emerald-400 transition-colors tabular-nums flex-shrink-0">
          {fmtV(asset.value)}<span className="ml-1 text-[10px] opacity-0 group-hover:opacity-50 transition-opacity">✏️</span>
        </button>
      )}
    </div>
  );
}

// ─── Sub-item editor ──────────────────────────────────────────────────────────
function SubEditor({ bucket, onChange }: {
  bucket: Bucket;
  onChange: (subs: SubItem[]) => void;
}) {
  const [subs, setSubs] = useState<SubItem[]>(bucket.subs);
  const total = subs.reduce((s, x) => s + x.pct, 0);
  const ok    = Math.abs(total - 100) < 0.1 || subs.length === 0;

  const upd = (id: string, field: keyof SubItem, val: string | number) => {
    setSubs(prev => { const next = prev.map(s => s.id === id ? { ...s, [field]: val } : s); onChange(next); return next; });
  };
  const add = () => {
    const next = [...subs, { id: `sub_${Date.now()}`, label: "ใหม่", icon: "📌", pct: 0, note: "" }];
    setSubs(next); onChange(next);
  };
  const del = (id: string) => {
    const next = subs.filter(s => s.id !== id); setSubs(next); onChange(next);
  };

  return (
    <div className="mt-2 space-y-2">
      {subs.map(s => (
        <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--fill)] border border-[var(--border)]">
          <input value={s.icon} onChange={e => upd(s.id,"icon",e.target.value)}
            className="w-8 text-center text-base bg-transparent outline-none" maxLength={2}/>
          <input value={s.label} onChange={e => upd(s.id,"label",e.target.value)}
            className="flex-1 text-xs font-bold bg-transparent outline-none text-[var(--tx)] placeholder:text-[var(--tx-5)]"
            placeholder="ชื่อ"/>
          <input value={s.note} onChange={e => upd(s.id,"note",e.target.value)}
            className="flex-1 text-[10px] bg-transparent outline-none text-[var(--tx-4)] placeholder:text-[var(--tx-5)] hidden sm:block"
            placeholder="รายละเอียด (เช่น SCB Easy)"/>
          <div className="flex items-center gap-1 flex-shrink-0">
            <input type="number" value={s.pct} min={0} max={100} step={0.5}
              onChange={e => upd(s.id,"pct",parseFloat(e.target.value)||0)}
              className="w-14 text-right text-xs font-black bg-[var(--surface)] border border-[var(--border)] rounded-lg px-1.5 py-0.5 outline-none"
              style={{ color: bucket.color }}/>
            <span className="text-[10px] text-[var(--tx-4)]">%</span>
          </div>
          <button onClick={() => del(s.id)} className="text-red-400/60 hover:text-red-400 text-xs transition-colors">✕</button>
        </div>
      ))}

      <div className="flex items-center justify-between px-1">
        <button onClick={add}
          className="text-[10px] px-2.5 py-1 rounded-lg font-bold bg-[var(--fill)] hover:bg-[var(--fill-strong)] text-[var(--tx-3)] transition-colors">
          + เพิ่มรายการ
        </button>
        {subs.length > 0 && (
          <span className={`text-[10px] font-black ${ok ? "text-emerald-400" : "text-red-400"}`}>
            รวม {total.toFixed(1)}% {ok ? "✓" : `(ต้องครบ 100%)`}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Bucket Card (planner view) ───────────────────────────────────────────────
function BucketCard({ bucket, income, editMode, onPctChange, onSubChange }: {
  bucket: Bucket; income: number; editMode: boolean;
  onPctChange: (id: string, pct: number) => void;
  onSubChange: (id: string, subs: SubItem[]) => void;
}) {
  const [openSub, setOpenSub] = useState(false);
  const amt        = income * (bucket.pct / 100);
  const hasSubs    = bucket.subs.length > 0;
  const subOk      = Math.abs(bucket.subs.reduce((s,x)=>s+x.pct,0)-100)<0.1;

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: `${bucket.color}0d` }}>
        <span className="text-lg flex-shrink-0">{bucket.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black">{bucket.label}</p>
            {editMode ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
                <input type="range" min={0} max={100} step={0.25} value={bucket.pct}
                  onChange={e => onPctChange(bucket.id, parseFloat(e.target.value))}
                  className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: bucket.color }}/>
                <input type="number" min={0} max={100} step={0.25} value={bucket.pct}
                  onChange={e => onPctChange(bucket.id, parseFloat(e.target.value)||0)}
                  className="w-14 text-center text-xs font-black bg-[var(--fill)] border border-[var(--border-2)] rounded-lg px-1 py-0.5 outline-none"
                  style={{ color: bucket.color }}/>
                <span className="text-xs font-bold" style={{ color: bucket.color }}>%</span>
              </div>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                style={{ background:`${bucket.color}22`, color: bucket.color }}>{bucket.pct}%</span>
            )}
          </div>
          {!editMode && <p className="text-[10px] text-[var(--tx-5)] truncate mt-0.5">{bucket.note}</p>}
        </div>

        {/* Amount + expand toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!editMode && income > 0 && (
            <p className="text-base font-black tabular-nums" style={{ color: bucket.color }}>
              ฿{Math.round(amt).toLocaleString("th-TH")}
            </p>
          )}
          {!editMode && income <= 0 && <p className="text-xs text-[var(--tx-5)]">—</p>}
          {hasSubs && !editMode && (
            <button onClick={() => setOpenSub(o => !o)}
              className="text-[10px] px-2 py-0.5 rounded font-bold transition-colors flex-shrink-0"
              style={{ background: openSub ? `${bucket.color}25` : "var(--fill)", color: openSub ? bucket.color : "var(--tx-4)" }}>
              {openSub ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!editMode && income > 0 && (
        <div className="h-1 bg-[var(--fill)]">
          <div className="h-full transition-all duration-700" style={{ width:`${bucket.pct}%`, background: bucket.color }}/>
        </div>
      )}

      {/* Sub-items — view mode */}
      {!editMode && openSub && hasSubs && income > 0 && (
        <div className="px-4 py-2 space-y-1.5 border-t border-[var(--border)]">
          {bucket.subs.map(sub => {
            const subAmt = subOk ? amt * (sub.pct / 100) : 0;
            return (
              <div key={sub.id} className="flex items-center gap-2 py-1">
                <span className="text-base w-6 text-center flex-shrink-0">{sub.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[var(--tx)]">{sub.label}</p>
                  {sub.note && <p className="text-[9px] text-[var(--tx-5)] truncate">{sub.note}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black tabular-nums" style={{ color: bucket.color }}>
                    ฿{Math.round(subAmt).toLocaleString("th-TH")}
                  </p>
                  <p className="text-[9px] text-[var(--tx-5)]">{sub.pct}%</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sub-items — edit mode */}
      {editMode && (
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--tx-4)] font-bold uppercase tracking-wider mb-2">รายการย่อยใน {bucket.label}</p>
          <SubEditor bucket={bucket} onChange={subs => onSubChange(bucket.id, subs)}/>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LifePage() {
  const [assets,  setAssets]  = useState<Asset[]>([]);
  const [logs,    setLogs]    = useState<MonthLog[]>([]);
  const [nwSnaps, setNwSnaps] = useState<NWSnap[]>([]);
  const [buckets, setBuckets] = useState<Bucket[]>(DEFAULT_BUCKETS);
  const [income,  setIncome]  = useState("");
  const [month,   setMonth]   = useState(getCurMon());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [editMode,setEditMode]= useState(false);
  const [userId,  setUserId]  = useState<string|null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const { currency, rate, lastUpdate: rateUp, toggleCurrency } = useCurrency();

  const fmtV = useCallback((thb: number) => {
    if (currency === "THB") return "฿" + Math.round(thb).toLocaleString("th-TH");
    const usd = thb / (rate || 33);
    return "$" + usd.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  }, [currency, rate]);

  // ── Sync US portfolio ────────────────────────────────────────────────────────
  const syncUS = useCallback(async (uid: string, r: number) => {
    setSyncing(true);
    try {
      // ── Sync หุ้น US (พอร์ตหลัก) ──────────────────────────────────────
      const { data: grp } = await supabase.from("portfolio_groups").select("id")
        .eq("user_id",uid).eq("is_default",true).maybeSingle();
      if (grp?.id) {
        const { data: usRows } = await supabase.from("portfolios")
          .select("shares,avg_cost,current_price").eq("user_id",uid).eq("portfolio_id",grp.id);
        if (usRows?.length) {
          const usd = usRows.reduce((s:number, p:any) => s + (Number(p.shares)||0)*(Number(p.current_price)||Number(p.avg_cost)||0), 0);
          const thb = Math.round(usd * (r||33));
          await supabase.from("life_assets").upsert({ id:"us_stocks", user_id:uid, label:"หุ้น US", icon:"🇺🇸", color:"#4f7df3", value:thb, note:"ซิงก์จากพอร์ต", sort_order:0 });
          setAssets(prev => prev.map(a => a.id==="us_stocks" ? {...a, value:thb, valueUSD:usd} : a));
        }
      }

      // ── Sync หุ้นไทย (custom_portfolios ที่มี name ลงท้าย THAI) ────────
      const { data: customGroups } = await supabase.from("custom_portfolios")
        .select("id,name").eq("user_id",uid);
      const thaiGroup = customGroups?.find((g:any) =>
        g.name?.toUpperCase().includes("THAI") || g.name?.includes("ไทย")
      );
      if (thaiGroup?.id) {
        const { data: thRows } = await supabase.from("custom_portfolio_positions")
          .select("shares,avg_cost,current_price").eq("user_id",uid).eq("custom_portfolio_id",thaiGroup.id);
        if (thRows?.length) {
          const thbVal = Math.round(thRows.reduce((s:number, p:any) =>
            s + (Number(p.shares)||0)*(Number(p.current_price)||Number(p.avg_cost)||0), 0));
          await supabase.from("life_assets").upsert({ id:"th_stocks", user_id:uid, label:"หุ้นไทย", icon:"🇹🇭", color:"#10b981", value:thbVal, note:"ซิงก์จากพอร์ต THAI", sort_order:3 });
          setAssets(prev => prev.map(a => a.id==="th_stocks" ? {...a, value:thbVal} : a));
        }
      }
    } catch(e) { console.error(e); }
    setSyncing(false);
  }, []);

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setBuckets(loadB());
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data:rows } = await supabase.from("life_assets").select("*")
        .eq("user_id",user.id).order("sort_order",{ascending:true});
      let loaded: Asset[];
      if (rows?.length) {
        loaded = rows.map((r:any) => ({ id:r.id, label:r.label, icon:r.icon, color:r.color,
          value:Number(r.value), note:r.note, sort_order:r.sort_order, autoSync:r.id==="us_stocks"||r.id==="th_stocks" }));
      } else {
        const defs = DEFAULT_ASSETS.map((a,i)=>({...a,sort_order:i,user_id:user.id}));
        await supabase.from("life_assets").upsert(defs);
        loaded = DEFAULT_ASSETS.map((a,i)=>({...a,sort_order:i}));
      }
      setAssets(loaded);

      const { data:logRows } = await supabase.from("life_monthly_logs").select("month,income")
        .eq("user_id",user.id).order("month",{ascending:true}).limit(12);
      const ls: MonthLog[] = (logRows||[]).map((r:any)=>({month:r.month,income:Number(r.income)}));
      setLogs([...ls].reverse());

      const nw = loaded.filter(a=>a.id!=="cash").reduce((s,a)=>s+a.value,0);
      setNwSnaps(ls.map(l=>({month:l.month,total:nw})));
      setLoading(false);
      syncUS(user.id, rate||33);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const netWorth  = assets.filter(a=>a.id!=="cash").reduce((s,a)=>s+a.value,0);
  const animNW    = useCountUp(netWorth);
  const incomeNum = parseFloat(income.replace(/,/g,""))||0;
  const totalPct  = buckets.reduce((s,b)=>s+b.pct,0);
  const pctOk     = Math.abs(totalPct-100)<0.1;

  // ── Edit asset ───────────────────────────────────────────────────────────────
  const handleEdit = useCallback((id:string, value:number) => {
    setAssets(prev => {
      const next = prev.map(a=>a.id===id?{...a,value}:a);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (!userId) return;
        const t = next.find(a=>a.id===id); if (!t) return;
        await supabase.from("life_assets").upsert({ id, user_id:userId, label:t.label, icon:t.icon, color:t.color, value, note:t.note??null, sort_order:t.sort_order });
      }, 800);
      return next;
    });
  }, [userId]);

  // ── Edit bucket pct ──────────────────────────────────────────────────────────
  const handlePct = (id:string, pct:number) => {
    setBuckets(prev => { const next = prev.map(b=>b.id===id?{...b,pct}:b); saveB(next); return next; });
  };

  // ── Edit sub-items ───────────────────────────────────────────────────────────
  const handleSubs = (id:string, subs:SubItem[]) => {
    setBuckets(prev => { const next = prev.map(b=>b.id===id?{...b,subs}:b); saveB(next); return next; });
  };

  // ── Save month ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!incomeNum||!userId) return;
    setSaving(true);
    await supabase.from("life_monthly_logs").upsert({ user_id:userId, month, income:incomeNum });
    setLogs(prev=>[{ month, income:incomeNum },...prev.filter(l=>l.month!==month)].sort((a,b)=>b.month.localeCompare(a.month)));
    setNwSnaps(prev=>[...prev.filter(s=>s.month!==month),{month,total:netWorth}].sort((a,b)=>a.month.localeCompare(b.month)));
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fu {animation:fadeInUp .4s ease both} .fu1{animation:fadeInUp .4s .07s ease both}
        .fu2{animation:fadeInUp .4s .14s ease both} .fu3{animation:fadeInUp .4s .21s ease both}
        @keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin .8s linear infinite;display:inline-block}
      `}</style>

      <main className="min-h-screen bg-[var(--bg)] text-[var(--tx)]" style={{fontFamily:"'Inter','Noto Sans Thai',sans-serif"}}>

        {/* Header */}
        <header className="border-b border-[var(--border)] px-3 lg:px-6 py-2 lg:py-3 flex items-center justify-between bg-[var(--bg)]/90 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/" className="w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center rounded-lg bg-[var(--fill)] hover:bg-[var(--fill-strong)] text-sm transition-colors">←</Link>
            <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-black font-black text-xs">🌱</div>
            <span className="font-bold text-sm lg:text-base tracking-tight hidden sm:block">LIFE PORTFOLIO</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={()=>userId&&syncUS(userId,rate)} disabled={syncing} title="Sync พอร์ต US"
              className="w-8 h-8 flex items-center justify-center bg-[var(--fill)] hover:bg-[var(--fill-strong)] rounded-lg text-sm transition-colors disabled:opacity-40">
              <span className={syncing?"spin":""}>⟳</span>
            </button>
            <CurrencyToggle currency={currency} rate={rate} lastUpdate={rateUp} onToggle={toggleCurrency}/>
            <ThemeToggle/>
          </div>
        </header>

        {loading ? (
          <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto space-y-4">
            {[140,300,240].map((h,i)=><div key={i} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] animate-pulse" style={{height:h}}/>)}
          </div>
        ) : (
          <div className="px-4 lg:px-8 py-5 max-w-2xl mx-auto space-y-4 pb-24">

            {/* ── NET WORTH CARD ── */}
            <div className="fu relative bg-gradient-to-br from-[#0d1117] to-[#0a0e14] border border-emerald-900/40 rounded-2xl p-5 lg:p-6 overflow-hidden"
              style={{boxShadow:"0 0 48px #10b98112,0 0 1px #10b98130"}}>
              <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
                style={{background:"radial-gradient(circle,#10b98118,transparent 70%)"}}/>
              <p className="text-[10px] text-[var(--tx-4)] uppercase tracking-widest mb-1">NET WORTH รวม (ไม่รวมเงินสำรอง)</p>
              <p className="text-3xl lg:text-4xl font-black tabular-nums leading-none text-white">{fmtV(Math.round(animNW))}</p>
              <p className="text-xs text-emerald-400/60 mt-1">
                {currency==="THB" ? `≈ $${(animNW/(rate||33)).toLocaleString("en-US",{maximumFractionDigits:0})} USD` : `≈ ฿${Math.round(animNW).toLocaleString("th-TH")}`}
                {rate>0&&` · เรท ${rate} ฿/$`}
              </p>
              <div className="mt-5 flex gap-5 items-center">
                <div className="flex-shrink-0">
                  <Donut segs={assets.filter(a=>a.id!=="cash").map(a=>({value:a.value,color:a.color}))}/>
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  {assets.filter(a=>a.id!=="cash").map(a=>(
                    <div key={a.id} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:a.color}}/>
                      <span className="text-xs text-[var(--tx-3)] flex-1 truncate">{a.label}</span>
                      <span className="text-xs font-bold tabular-nums text-[var(--tx-2)] flex-shrink-0">
                        {netWorth>0?((a.value/netWorth)*100).toFixed(1):0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {nwSnaps.length>=2&&<NWLine snaps={nwSnaps}/>}
            </div>

            {/* ── ASSET LIST ── */}
            <div className="fu1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">มูลค่าสินทรัพย์</p>
                <p className="text-[10px] text-[var(--tx-5)]">แตะตัวเลขเพื่อแก้ไข</p>
              </div>
              <div className="py-1">{assets.map(a=><AssetRow key={a.id} asset={a} total={netWorth} onEdit={handleEdit} fmtV={fmtV}/>)}</div>
              <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-2">
                <span className="text-[10px] text-[var(--tx-5)]">☁️ ซิงก์ผ่าน Supabase</span>
                {syncing&&<><span className="spin text-[10px] text-blue-400">⟳</span><span className="text-[10px] text-blue-400">อัปเดตพอร์ต US...</span></>}
              </div>
            </div>

            {/* ── BUCKET PLANNER ── */}
            <div className="fu2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">Bucket Planner</p>
                  <p className="text-[10px] text-[var(--tx-5)] mt-0.5">กรอกรายรับจริง → ระบบแบ่งตาม % ที่ตั้งไว้</p>
                </div>
                <button onClick={()=>setEditMode(e=>!e)}
                  className="text-[10px] px-2.5 py-1 rounded-lg font-bold transition-colors flex-shrink-0"
                  style={{ background:editMode?"rgba(167,139,250,0.15)":"var(--fill)", color:editMode?"#a78bfa":"var(--tx-4)" }}>
                  {editMode ? "✓ เสร็จแล้ว" : "⚙️ ปรับ / แก้ย่อย"}
                </button>
              </div>

              <div className="p-4 space-y-3">
                {/* เดือน + รายรับ */}
                {!editMode && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-[var(--tx-4)] mb-1">เดือน</p>
                      <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
                        className="w-full bg-[var(--fill)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--tx)] outline-none focus:border-emerald-500"/>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--tx-4)] mb-1">รายรับจริง (บาท)</p>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--tx-4)]">฿</span>
                        <input type="number" placeholder="200000" value={income} onChange={e=>setIncome(e.target.value)}
                          className="w-full pl-6 pr-3 py-1.5 bg-[var(--fill)] border border-[var(--border)] rounded-lg text-sm font-mono text-[var(--tx)] outline-none focus:border-emerald-500"/>
                      </div>
                    </div>
                  </div>
                )}

                {/* % warning */}
                {editMode && !pctOk && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30">
                    <span>⚠️</span>
                    <p className="text-xs text-red-400">รวมทุก Bucket = <strong>{totalPct.toFixed(2)}%</strong> ต้องครบ 100%</p>
                  </div>
                )}

                {/* Buckets */}
                <div className="space-y-2">
                  {buckets.map(b=>(
                    <BucketCard key={b.id} bucket={b} income={incomeNum}
                      editMode={editMode} onPctChange={handlePct} onSubChange={handleSubs}/>
                  ))}
                </div>

                {/* Total % bar (edit mode) */}
                {editMode && (
                  <div>
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[var(--tx-4)]">รวมทั้งหมด</span>
                      <span className={pctOk?"text-emerald-400 font-black":"text-red-400 font-black"}>
                        {totalPct.toFixed(2)}% {pctOk?"✓":`(ขาด ${(100-totalPct).toFixed(2)}%)`}
                      </span>
                    </div>
                    <div className="h-2 bg-[var(--fill)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{ width:`${Math.min(totalPct,100)}%`, background:pctOk?"linear-gradient(90deg,#10b981,#059669)":"linear-gradient(90deg,#f97316,#ef4444)" }}/>
                    </div>
                    <button onClick={()=>{setBuckets(DEFAULT_BUCKETS);saveB(DEFAULT_BUCKETS);}}
                      className="mt-2 text-[10px] text-[var(--tx-5)] hover:text-[var(--tx-3)] transition-colors">
                      ↺ รีเซ็ตกลับค่าเริ่มต้น
                    </button>
                  </div>
                )}

                {/* Summary */}
                {incomeNum>0&&!editMode&&(
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="rounded-xl px-3 py-2.5 border border-[var(--border)] bg-[var(--fill)]">
                      <p className="text-[10px] text-[var(--tx-5)]">รายรับทั้งหมด</p>
                      <p className="text-sm font-black tabular-nums">฿{incomeNum.toLocaleString("th-TH")}</p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 border border-emerald-500/25" style={{background:"rgba(16,185,129,0.06)"}}>
                      <p className="text-[10px] text-[var(--tx-5)]">เก็บรวม ({buckets.filter(b=>b.id!=="spend").reduce((s,b)=>s+b.pct,0).toFixed(2)}%)</p>
                      <p className="text-sm font-black tabular-nums text-emerald-400">
                        ฿{Math.round(incomeNum*buckets.filter(b=>b.id!=="spend").reduce((s,b)=>s+b.pct,0)/100).toLocaleString("th-TH")}
                      </p>
                    </div>
                  </div>
                )}

                <button onClick={handleSave} disabled={!incomeNum||saving||!pctOk||editMode}
                  className="w-full py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                  style={{ background:saved?"rgba(16,185,129,0.12)":"linear-gradient(135deg,#10b981,#059669)", color:saved?"#10b981":"#fff", border:saved?"1px solid rgba(16,185,129,0.3)":"none" }}>
                  {saving?<><span className="spin">⟳</span> กำลังบันทึก...</>
                    :saved?`✓ บันทึก ${fmtMonth(month)} แล้ว`
                    :editMode?"ปิดโหมดแก้ไขก่อนบันทึก"
                    :!pctOk?"⚠️ % ยังไม่ครบ 100"
                    :`☁️ บันทึก ${fmtMonth(month)}`}
                </button>
              </div>
            </div>

            {/* ── HISTORY ── */}
            {logs.length>0&&(
              <div className="fu3 bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                  <p className="text-xs font-bold text-[var(--tx-2)] uppercase tracking-wider">ประวัติรายเดือน</p>
                  <p className="text-[10px] text-[var(--tx-5)]">{logs.length} เดือน</p>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {logs.map(log=>(
                    <div key={log.month} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold">{fmtMonth(log.month)}</p>
                        <p className="text-sm font-black tabular-nums">฿{log.income.toLocaleString("th-TH")}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {buckets.map(b=>(
                          <div key={b.id} className="rounded-lg py-2 px-2 text-center" style={{background:`${b.color}12`}}>
                            <p className="text-[10px] text-[var(--tx-4)]">{b.icon} {b.label}</p>
                            <p className="text-xs font-black tabular-nums mt-0.5" style={{color:b.color}}>
                              ฿{Math.round(log.income*b.pct/100).toLocaleString("th-TH")}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <footer className="text-center text-xs text-[var(--tx-6)] pb-2">
              Life Portfolio · ☁️ Supabase · ไม่ใช่คำแนะนำการลงทุน
            </footer>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-[var(--bg)]/95 backdrop-blur border-t border-[var(--border)] z-30 lg:hidden">
          <div className="flex justify-around items-center py-2 px-2">
            {[
              {href:"/",label:"หน้าหลัก",icon:"🏠"},{href:"/portfolio",label:"พอร์ต",icon:"📊"},
              {href:"/chart",label:"กราฟ",icon:"📈"},{href:"/journal",label:"Journal",icon:"📓"},
              {href:"/life",label:"ชีวิต",icon:"🌱",active:true},
            ].map(n=>(
              <Link key={n.href} href={n.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors ${n.active?"text-emerald-400 bg-emerald-400/10":"text-[var(--tx-4)] hover:text-[var(--tx-2)]"}`}>
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
