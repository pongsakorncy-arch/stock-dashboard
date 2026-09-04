"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
// ─── Types ────────────────────────────────────────────────────────────────────
type Direction   = "LONG"|"SHORT";
type Result      = "WIN"|"LOSS"|"BE";
type Session     = "Tokyo"|"London"|"New York"|"Overlap";
type AccountType = "cent"|"standard";
type TradeMode    = "WYCKOFF"|"SMC"|"SW_RANGE"|"SW_BREAKOUT"|"PULLBACK"|"M5_REVERSAL";
type Emotion     = "😌 Calm"|"😎 Confident"|"😤 FOMO"|"😰 Fearful"|"😡 Revenge";
type ExitReason  = "TP Hit"|"SL Hit"|"Manual"|"Rejection"|"MSS Failed"|"Other";
type TradeStatus = "OPEN"|"CLOSED";
type ChecklistSMC = {
  c1_trend: boolean;      // M15 วัฏจักร = TREND
  c2_bos: boolean;        // M15 BOS/CHoCH เกิดแล้ว
  c3_dzsz: boolean;       // M15 หา DZ/SZ สำคัญ
  c4_ob: boolean;         // M5 หา OB + DZ/SZ
  c5_liq: boolean;        // M5 Liquidity $$$ เคลียร์
  c6_reject: boolean;     // M5 มี Rejection
  c7_retest: boolean;     // M1 LTF Retest
  c8_mss: boolean;        // M1 MSS ผ่าน
};
type ChecklistSWRange = {
  c1_sw: boolean;         // M15 วัฏจักร = SW
  c2_level: boolean;      // ระบุกรอบบน/ล่างชัดเจน
  c3_near: boolean;       // ราคาใกล้กรอบ
  c4_pa: boolean;         // M5 PA ยืนยัน Pa2
  c5_rr: boolean;         // RR ≥ 3
};
type ChecklistSWBreakout = {
  c1_sw: boolean;         // M15 กรอบ SW ชัดเจน
  c2_close: boolean;      // ราคาปิดออกนอกกรอบ (ไม่ใช่ Wick)
  c3_retest: boolean;     // รอ Retest กลับมาก่อน
  c4_noFomo: boolean;     // ยืนยันว่าไม่ FOMO
};
type ChecklistPullback = {
  c1_trend: boolean;      // M15 ระบุทิศเทรนด์หลัก
  c2_dzsz: boolean;       // ราคา Pullback มาที่ DZ/SZ ใหญ่
  c3_pa: boolean;         // M5 PA ยืนยันกลับตัว
  c4_short: boolean;      // เป้าหมายเก็บสั้น ขยันซอย
};
type ChecklistM5Rev = {
  c1_pa2: boolean;        // M5 Pa ที่ 2 ยืนยัน
  c2_dir: boolean;        // Buy=ยกโลว์ / Sell=กดไฮ
  c3_plan: boolean;       // วางแผนแล้วว่าตามเทรนด์=ถือยาว / สวน=รีบโดด
};
type Trade = {
  id: string;
  status: TradeStatus;
  mode: TradeMode;
  date: string; time: string;
  session: Session;
  direction: Direction;
  // New Wyckoff journal fields
  asset?: string;
  timeframe?: string;
  grade?: string;
  screenshotBeforeUrl?: string;
  screenshotAfterUrl?: string;
  // Legacy fields kept so Dashboard / Calendar / old records continue to work
  entryPrice: number;
  slPrice: number;
  lotPerOrder: number;
  lotInput: string;
  riskAmount: number;
  emotion: Emotion;
  checklistJson: string;
  exitPrices: number[];
  avgExit: number;
  orderCount: number;
  totalLot: number;
  totalPL: number;
  rr: number;
  result: Result;
  exitReason: ExitReason|"";
  notes: string;
  screenshotUrl: string;
  createdAt: string;
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (v: number) => {
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
};
const uid  = () => Math.random().toString(36).slice(2, 10);
const KEY   = "yok_journal_v4";
const KEY_OLD = "yok_journal_v3";
const KOPEN = "yok_open_trade";
const ALERT_ACK_KEY = "yok_journal_alert_ack_date";
// ─── Discipline lock storage keys (ใหม่) ───────────────────────────────────────
const COOLDOWN_KEY    = "yok_cooldown_until";     // epoch ms string — cooldown 15 นาทีหลัง LOSS 2 ติด
const HARDLOCK_KEY     = "yok_hardlock_state";     // JSON {date, submitted, reflectionText, submittedAt}
const FORCED_LOCK_KEY  = "yok_forced_lock_dates";  // JSON string[] — วันที่โดนล็อกข้ามวันจาก pattern ซ้ำ
type HardlockState = { date: string; submitted: boolean; reflectionText: string; submittedAt: string };
const loadCooldownUntil = (): number => { try { return Number(localStorage.getItem(COOLDOWN_KEY) || 0) || 0; } catch { return 0; } };
const saveCooldownUntil = (ts: number) => { try { if (ts > 0) localStorage.setItem(COOLDOWN_KEY, String(ts)); else localStorage.removeItem(COOLDOWN_KEY); } catch {} };
const loadHardlock = (): HardlockState | null => {
  try { const s = localStorage.getItem(HARDLOCK_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
};
const saveHardlock = (v: HardlockState | null) => {
  try { if (v) localStorage.setItem(HARDLOCK_KEY, JSON.stringify(v)); else localStorage.removeItem(HARDLOCK_KEY); } catch {}
};
const loadForcedLockDates = (): string[] => {
  try { return JSON.parse(localStorage.getItem(FORCED_LOCK_KEY) || "[]"); } catch { return []; }
};
const saveForcedLockDates = (v: string[]) => { try { localStorage.setItem(FORCED_LOCK_KEY, JSON.stringify(v)); } catch {} };
function tomorrowStr(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function getWeekDatesOf(dateStr: string): string[] {
  const base = new Date(dateStr + "T00:00:00");
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (dow === 0 ? 6 : dow - 1));
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}
function fmtMMSS(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
const WYCKOFF_META_PREFIX = "__WYCKOFF_V1__";
function packWyckoffNotes(text:string, meta:{asset:string;timeframe:string;grade:string;before:string;after:string}) {
  return WYCKOFF_META_PREFIX + JSON.stringify({text, ...meta});
}
function unpackWyckoffNotes(raw:string) {
  if(!raw?.startsWith(WYCKOFF_META_PREFIX)) return null;
  try { return JSON.parse(raw.slice(WYCKOFF_META_PREFIX.length)); } catch { return null; }
}

// migrate ข้อมูลจาก v3 → v4 (เพิ่ม status/mode/checklistJson/exitReason ให้ของเก่า)
function migrateOldTrades(rawTrades: any[]): Trade[] {
  return (rawTrades || []).map((t: any) => ({
    id: t.id || uid(),
    status: t.status || "CLOSED",
    mode: (["WYCKOFF","SMC","SW_RANGE","SW_BREAKOUT","PULLBACK","M5_REVERSAL"].includes(String(t.mode || t.entry_model)) ? String(t.mode || t.entry_model) : "SMC") as TradeMode,
    date: t.date || new Date().toISOString().split("T")[0],
    time: t.time || "00:00",
    session: (t.session || "Tokyo") as Session,
    direction: (t.direction || "SHORT") as Direction,
    asset: t.asset || t.symbol || unpackWyckoffNotes(String(t.notes || ""))?.asset || "XAUUSD",
    timeframe: t.timeframe || t.tf || unpackWyckoffNotes(String(t.notes || ""))?.timeframe || "15s",
    grade: t.grade || unpackWyckoffNotes(String(t.notes || ""))?.grade || "A+",
    screenshotBeforeUrl: t.screenshotBeforeUrl || t.screenshot_before_url || unpackWyckoffNotes(String(t.notes || ""))?.before || "",
    screenshotAfterUrl: t.screenshotAfterUrl || t.screenshot_after_url || unpackWyckoffNotes(String(t.notes || ""))?.after || t.screenshotUrl || t.screenshot_url || "",
    entryPrice: Number(t.entryPrice ?? t.entry_price ?? 0),
    slPrice: Number(t.slPrice ?? t.sl_price ?? 0),
    lotPerOrder: Number(t.lotPerOrder ?? t.lot_per_order ?? 0.1),
    lotInput: String(t.lotInput ?? t.lot_per_order ?? "0.10"),
    riskAmount: Number(t.riskAmount ?? t.risk_amount ?? 5),
    emotion: (t.emotion || "😌 Calm") as Emotion,
    checklistJson: t.checklistJson || "{}",
    exitPrices: t.exitPrices || t.exit_prices || [],
    avgExit: Number(t.avgExit ?? t.avg_exit ?? 0),
    orderCount: Number(t.orderCount ?? t.order_count ?? 0),
    totalLot: Number(t.totalLot ?? t.total_lot ?? 0),
    totalPL: Number(t.totalPL ?? t.total_pl ?? 0),
    rr: Number(t.rr ?? 0),
    result: (t.result || "BE") as Result,
    exitReason: (t.exitReason || "") as ExitReason | "",
    notes: (unpackWyckoffNotes(String(t.notes || ""))?.text ?? t.notes) || "",
    screenshotUrl: t.screenshotUrl || t.screenshot_url || unpackWyckoffNotes(String(t.notes || ""))?.after || unpackWyckoffNotes(String(t.notes || ""))?.before || "",
    createdAt: t.createdAt || t.created_at || new Date().toISOString(),
  }));
}
const load = (): Trade[] => {
  try {
    const v4 = localStorage.getItem(KEY);
    if (v4) {
      const migrated = migrateOldTrades(JSON.parse(v4));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    }
    const v3 = localStorage.getItem(KEY_OLD);
    if (v3) {
      const migrated = migrateOldTrades(JSON.parse(v3));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KOPEN);
    return [];
  }
};
const save = (t: Trade[]) => localStorage.setItem(KEY, JSON.stringify(t));
const loadOpen = (): Trade|null => { try { const s=localStorage.getItem(KOPEN); return s?JSON.parse(s):null; } catch { return null; } };
const saveOpen = (t: Trade|null) => { if(t) localStorage.setItem(KOPEN,JSON.stringify(t)); else localStorage.removeItem(KOPEN); };
const SESSIONS: Session[] = ["Tokyo","London","New York","Overlap"];
const EMOTIONS: Emotion[] = ["😌 Calm","😎 Confident","😤 FOMO","😰 Fearful","😡 Revenge"];
const EXIT_REASONS: ExitReason[] = ["TP Hit","SL Hit","Manual","Rejection","MSS Failed","Other"];
const MAX_TRADES_PER_DAY = 3;
const COOLDOWN_MS = 15 * 60 * 1000; // 15 นาที
function pad2(n: number) { return String(n).padStart(2, "0"); }
function nowTime24() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function autoSessionFromTime(time: string): Session {
  const hour = Number((time || "00:00").split(":")[0]);
  if (hour >= 0 && hour < 8) return "Tokyo";
  if (hour >= 8 && hour < 14) return "London";
  if (hour >= 14 && hour < 20) return "New York";
  return "Overlap";
}
function calcPL(direction: Direction, entry: number, exit: number, lot: number, isCent: boolean): number {
  const diff = direction==="LONG" ? exit-entry : entry-exit;
  return Math.round(diff*lot*(isCent?1:100)*100)/100;
}
function calcStats(trades: Trade[]) {
  const closed = trades.filter(t=>t.status==="CLOSED");
  if(!closed.length) return {total:0,wins:0,losses:0,be:0,winRate:0,totalPL:0,avgRR:0,best:0,worst:0,streak:0,streakType:""};
  const wins=closed.filter(t=>t.result==="WIN").length;
  const losses=closed.filter(t=>t.result==="LOSS").length;
  const be=closed.filter(t=>t.result==="BE").length;
  const totalPL=closed.reduce((s,t)=>s+t.totalPL,0);
  const avgRR=closed.reduce((s,t)=>s+(t.rr||0),0)/closed.length;
  const pls=closed.map(t=>t.totalPL);
  const sorted=[...closed].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  let streak=0; const first=sorted[0]?.result;
  for(const t of sorted){ if(t.result===first) streak++; else break; }
  return {total:closed.length,wins,losses,be,winRate:wins/closed.length*100,totalPL,avgRR,
    best:Math.max(...pls),worst:Math.min(...pls),streak,streakType:first||""};
}
function calcDD(trades: Trade[]) {
  const closed=[...trades].filter(t=>t.status==="CLOSED").sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  if(closed.length<2) return {dd:0,maxDD:0,ddPct:0,maxDDPct:0};
  let cum=0,peak=0,maxDD=0;
  for(const t of closed){ cum+=t.totalPL; if(cum>peak) peak=cum; const dd=peak-cum; if(dd>maxDD) maxDD=dd; }
  const currentDD=peak-cum, ddPct=peak>0?(currentDD/peak)*100:0, maxDDPct=peak>0?(maxDD/peak)*100:0;
  return {dd:currentDD,maxDD,ddPct,maxDDPct};
}
function calcDailyStatus(trades: Trade[], todayStr: string) {
  const todayTrades=[...trades].filter(t=>t.date===todayStr&&t.status==="CLOSED").sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  let lossStreak=0;
  for(let i=todayTrades.length-1;i>=0;i--){ if(todayTrades[i].result==="LOSS") lossStreak++; else break; }
  const totalToday=todayTrades.length;
  const isDayDone=totalToday>=MAX_TRADES_PER_DAY;
  const isHardStop=lossStreak>=3;
  const isWarnBreak=lossStreak===2&&!isHardStop;
  return {totalToday,tradesLeft:Math.max(0,MAX_TRADES_PER_DAY-totalToday),isDayDone,isHardStop,isWarnBreak,
    lossStreak,todayWins:todayTrades.filter(t=>t.result==="WIN").length,
    todayLosses:todayTrades.filter(t=>t.result==="LOSS").length,
    todayBE:todayTrades.filter(t=>t.result==="BE").length,
    todayPL:todayTrades.reduce((s,t)=>s+t.totalPL,0),todayTrades};
}
function countHardStopDaysThisWeek(trades: Trade[], todayStr: string): number {
  const weekDates = getWeekDatesOf(todayStr).filter(d => d <= todayStr);
  let count = 0;
  for (const d of weekDates) {
    if (calcDailyStatus(trades, d).isHardStop) count++;
  }
  return count;
}
// ─── PLChart ──────────────────────────────────────────────────────────────────
function PLChart({trades}:{trades:Trade[]}) {
  const [tab,setTab]=useState<"equity"|"dd">("equity");
  const closed=[...trades].filter(t=>t.status==="CLOSED").sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  if(closed.length<2) return (
    <div style={{
      color:"var(--j-soft)",fontFamily:"'DM Mono',monospace",fontSize:11,
      textAlign:"center",padding:"34px 0",letterSpacing:".08em",
      background:"linear-gradient(180deg,#080909,#050606)",
      border:"1px solid rgba(255,255,255,.10)",borderRadius:6
    }}>
      NEED AT LEAST 2 CLOSED SESSIONS
    </div>
  );

  let cum=0;
  const pts=closed.map(t=>{cum+=t.totalPL;return cum;});

  // Ninja chart palette — charcoal / iron / crimson.
  const W=300,H=112,pL=8,pR=8,pT=10,pB=12,iW=W-pL-pR,iH=H-pT-pB;
  const mn=Math.min(0,...pts),mx=Math.max(0,...pts),rng=mx-mn||1;
  const X=(i:number)=>pL+(pts.length===1?iW/2:(i/(pts.length-1))*iW);
  const Y=(v:number)=>pT+iH-((v-mn)/rng)*iH;

  const up=pts[pts.length-1]>=0;
  const col=up?"#d92332":"#e15b63";
  const fill=up?"rgba(217,35,50,.18)":"rgba(225,91,99,.16)";

  let d=`M ${X(0)} ${Y(pts[0])}`;
  for(let i=1;i<pts.length;i++){
    d+=` L ${X(i)} ${Y(pts[i-1])} L ${X(i)} ${Y(pts[i])}`;
  }
  const area=`${d} L ${X(pts.length-1)} ${pT+iH} L ${X(0)} ${pT+iH} Z`;

  const {dd,maxDD:mxDD,ddPct,maxDDPct}=calcDD(trades);
  let pk3=0;
  const dds=pts.map(v=>{if(v>pk3)pk3=v;return pk3-v;});
  const ddm=Math.max(...dds)||1;
  const Yd=(v:number)=>pT+iH*(v/ddm);

  let dp=`M ${X(0)} ${Yd(dds[0])}`;
  for(let i=1;i<dds.length;i++){
    dp+=` L ${X(i)} ${Yd(dds[i-1])} L ${X(i)} ${Yd(dds[i])}`;
  }
  const da=`${dp} L ${X(dds.length-1)} ${pT+iH} L ${X(0)} ${pT+iH} Z`;

  const TB=(t:"equity"|"dd",label:string)=>(
    <button
      onClick={()=>setTab(t)}
      style={{
        fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:".08em",
        padding:"7px 12px",cursor:"pointer",
        border:"1px solid rgba(255,255,255,.14)",
        borderBottom:tab===t?"1px solid #090a0a":"1px solid rgba(255,255,255,.14)",
        borderRadius:"5px 5px 0 0",
        background:tab===t?"#0d0e0e":"#060707",
        color:tab===t?"#f1f1ef":"#777b7b",
        fontWeight:700,marginBottom:tab===t?-1:0,
        textTransform:"uppercase"
      }}
    >
      {label}
    </button>
  );

  const gridColor="rgba(255,255,255,.055)";
  const axisColor="rgba(255,255,255,.16)";

  return (
    <div style={{
      background:"linear-gradient(145deg,#0a0b0b 0%,#050606 100%)",
      border:"1px solid rgba(255,255,255,.10)",
      borderRadius:7,
      padding:"10px 10px 11px",
      boxShadow:"inset 0 1px 0 rgba(255,255,255,.025)"
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{display:"flex",gap:3}}>{TB("equity","EQUITY")}{TB("dd","DRAWDOWN")}</div>
        <span style={{
          fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:".08em",
          color:up?"#d92332":"#e15b63"
        }}>
          {up?"▲ PROFIT":"▼ LOSS"}
        </span>
      </div>

      <div style={{
        border:"1px solid rgba(255,255,255,.10)",
        borderRadius:4,
        background:"#070808",
        padding:"7px 6px 4px",
        overflow:"hidden"
      }}>
        {tab==="equity"?(
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
            {/* vertical session grid */}
            {pts.map((_,i)=>(
              <line key={i} x1={X(i)} y1={pT} x2={X(i)} y2={pT+iH}
                stroke={gridColor} strokeWidth="1"/>
            ))}
            {/* horizontal grid */}
            {[0,.25,.5,.75,1].map((r,i)=>(
              <line key={`h${i}`} x1={pL} y1={pT+iH*r} x2={W-pR} y2={pT+iH*r}
                stroke={gridColor} strokeWidth="1"/>
            ))}
            <line x1={pL} y1={Y(0)} x2={W-pR} y2={Y(0)}
              stroke={axisColor} strokeWidth="1" strokeDasharray="4 4"/>
            <path d={area} fill={fill}/>
            <path d={d} fill="none" stroke={col} strokeWidth="2.4"
              strokeLinecap="square" strokeLinejoin="miter"/>
            {pts.map((v,i)=>(
              <rect key={i}
                x={X(i)-2.2} y={Y(v)-2.2} width="4.4" height="4.4"
                fill={i===pts.length-1?col:"#0b0c0c"}
                stroke={col} strokeWidth="1"
              />
            ))}
          </svg>
        ):(
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
            {dds.map((_,i)=>(
              <line key={i} x1={X(i)} y1={pT} x2={X(i)} y2={pT+iH}
                stroke={gridColor} strokeWidth="1"/>
            ))}
            {[0,.25,.5,.75,1].map((r,i)=>(
              <line key={`h${i}`} x1={pL} y1={pT+iH*r} x2={W-pR} y2={pT+iH*r}
                stroke={gridColor} strokeWidth="1"/>
            ))}
            <path d={da} fill="rgba(217,35,50,.16)"/>
            <path d={dp} fill="none" stroke="#d92332" strokeWidth="2.4"
              strokeLinecap="square" strokeLinejoin="miter"/>
            {dds.map((v,i)=>(
              <rect key={i}
                x={X(i)-2.2} y={Yd(v)-2.2} width="4.4" height="4.4"
                fill={i===dds.length-1?"#d92332":"#0b0c0c"}
                stroke="#d92332" strokeWidth="1"
              />
            ))}
          </svg>
        )}
      </div>

      {tab==="dd"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:5,marginTop:7}}>
          {[
            {l:"CURRENT DD",v:dd>0?`-$${dd.toFixed(2)}`:"+$0.00",c:dd>0?"#d92332":"#6caa89",sub:ddPct>0?`-${ddPct.toFixed(1)}%`:"0%"},
            {l:"MAX DD",v:mxDD>0?`-$${mxDD.toFixed(2)}`:"+$0.00",c:"#d92332",sub:maxDDPct>0?`-${maxDDPct.toFixed(1)}%`:"0%"},
            {l:"STATUS",v:maxDDPct<=10?"SAFE":maxDDPct<=20?"WATCH":"DANGER",c:maxDDPct>20?"#d92332":maxDDPct>10?"#c6a45b":"#6caa89",sub:"LIMIT 20%"}
          ].map(s=>(
            <div key={s.l} style={{
              background:"#0a0b0b",
              border:"1px solid rgba(255,255,255,.09)",
              borderRadius:4,padding:"7px 8px",minWidth:0
            }}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:7.5,color:"#666b6b",letterSpacing:".08em",marginBottom:3}}>{s.l}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:19,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:7.5,color:"#777b7b",marginTop:2}}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ─── DailyStatusBar ───────────────────────────────────────────────────────────
 ───────────────────────────────────────────────────────────
function DailyStatusBar({status,cooldownRemainingMs,isHardLockToday,isForcedLockToday}:{status:ReturnType<typeof calcDailyStatus>;cooldownRemainingMs:number;isHardLockToday:boolean;isForcedLockToday:boolean}) {
  const {totalToday,lossStreak,isHardStop,isWarnBreak,isDayDone,todayWins,todayLosses,todayBE,todayPL} = status;
  const barBg=isForcedLockToday?"#c98a8a":isHardLockToday?"var(--j-coral)":cooldownRemainingMs>0?"var(--j-butter)":isWarnBreak?"var(--j-butter)":"var(--j-mint)";
  const statusTxt=isForcedLockToday?"🔒 WEEK LOCK — Pattern ซ้ำ":isHardLockToday?"🛑 STOP — LOSS 3 ติด":cooldownRemainingMs>0?`⏸️ Cooldown ${fmtMMSS(cooldownRemainingMs)}`:isWarnBreak?"⚠️ LOSS 2 ติด — ระวัง":isDayDone?"✓ ครบ 3 ไม้แล้ว":`เหลือ ${status.tradesLeft} ไม้`;
  return (
    <div style={{border:"2.5px solid var(--j-ink)",borderRadius:9,overflow:"hidden",boxShadow:"3px 3px 0 var(--j-ink)"}}>
      <div style={{background:barBg,borderBottom:"2px solid var(--j-ink)",padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600}}>📅 TODAY</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600}}>{statusTxt}</span>
      </div>
      <div style={{background:"var(--j-win)",padding:"10px 12px"}}>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {Array.from({length:MAX_TRADES_PER_DAY}).map((_,i)=>{
            const t=status.todayTrades[i];
            const bg=!t?"#e3d9c4":t.result==="WIN"?"var(--j-mint)":t.result==="LOSS"?"var(--j-coral)":"var(--j-lav)";
            return (
              <div key={i} style={{flex:1,border:"2px solid var(--j-ink)",borderRadius:7,padding:"7px 4px",textAlign:"center",background:bg,boxShadow:t?"2px 2px 0 var(--j-ink)":"none"}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:15,lineHeight:1}}>{!t?`ไม้ ${i+1}`:t.result==="WIN"?"✓ WIN":t.result==="LOSS"?"✕ LOSS":"= BE"}</div>
                {t&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",marginTop:1}}>{t.mode}</div>}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8}}>
          {[{l:"WIN",v:todayWins,c:"#5fae89"},{l:"LOSS",v:todayLosses,c:"#e08a82"},{l:"BE",v:todayBE,c:"var(--j-soft)"},
            {l:"P/L",v:(todayPL>=0?"+":"")+todayPL.toFixed(2),c:todayPL>=0?"#5fae89":"#e08a82"}].map(s=>(
            <div key={s.l} style={{flex:1,textAlign:"center"}}>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",textTransform:"uppercase"}}>{s.l}</div>
            </div>
          ))}
        </div>
        {isForcedLockToday && (
          <div style={{marginTop:8,background:"#c98a8a",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",fontFamily:"'DM Mono',monospace",fontSize:10,textAlign:"center",color:"var(--j-win)",fontWeight:700}}>
            🔒 ล็อกทั้งวัน — LOSS 3 ติดเกิน 2 ครั้งในสัปดาห์นี้ ป้องกัน pattern ซ้ำ
          </div>
        )}
        {!isForcedLockToday && isHardLockToday && (
          <div style={{marginTop:8,background:"var(--j-coral)",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",fontFamily:"'DM Mono',monospace",fontSize:10,textAlign:"center"}}>
            🛑 LOSS 3 ติดกัน — หยุดเทรดวันนี้เด็ดขาด
          </div>
        )}
        {!isForcedLockToday && !isHardLockToday && cooldownRemainingMs>0 && (
          <div style={{marginTop:8,background:"var(--j-butter)",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",fontFamily:"'DM Mono',monospace",fontSize:10,textAlign:"center"}}>
            ⏸️ LOSS 2 ติด — พักบังคับ เหลือ {fmtMMSS(cooldownRemainingMs)}
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Win component ────────────────────────────────────────────────────────────
function Win({title,color,children,controls=true}:{title:string;color:string;children:any;controls?:boolean}) {
  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"linear-gradient(90deg,#b51221 0%,#7e0d17 45%,#0b0c0c 100%)",borderBottom:"1px solid rgba(217,35,50,.35)"}}>
        <span className="j-t">{title}</span>
        {controls&&<span className="j-ctrl"><span>_</span><span>▢</span><span>✕</span></span>}
      </div>
      <div className="j-body">{children}</div>
    </div>
  );
}
// ─── Checklist UI helper ──────────────────────────────────────────────────────
function CL({checked,label,onChange,warn}:{checked:boolean;label:string;onChange:(v:boolean)=>void;warn?:boolean}) {
  return (
    <div onClick={()=>onChange(!checked)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 10px",border:"2px solid var(--j-ink)",borderRadius:8,cursor:"pointer",background:checked?"var(--j-mint)":"var(--j-win)",boxShadow:checked?"2px 2px 0 var(--j-ink)":"none",transition:"all .15s",marginBottom:6}}>
      <div style={{width:22,height:22,border:"2px solid var(--j-ink)",borderRadius:5,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:checked?"var(--j-ink)":"transparent",fontFamily:"'VT323',monospace",fontSize:14,color:"var(--j-win)"}}>
        {checked?"✓":""}
      </div>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:checked?"var(--j-ink)":warn?"#d4685f":"var(--j-soft)",fontWeight:checked?600:400,lineHeight:1.4}}>{label}</span>
    </div>
  );
}
// ─── Mode labels ──────────────────────────────────────────────────────────────
const MODE_INFO: Record<TradeMode,{label:string;color:string;emoji:string;desc:string}> = {
  WYCKOFF:      {label:"Wyckoff",          color:"var(--j-lav)",    emoji:"🟣",desc:"Wyckoff setup"},
  SMC:          {label:"SMC Pro Max",     color:"var(--j-lav)",    emoji:"🔵",desc:"Trend เท่านั้น · BOS→OB→MSS"},
  SW_RANGE:     {label:"SW Range",        color:"var(--j-sky)",    emoji:"🟦",desc:"กรอบบน=Sell / ล่าง=Buy · RR≥3"},
  SW_BREAKOUT:  {label:"SW Breakout",     color:"var(--j-butter)", emoji:"🟡",desc:"ปิดออกกรอบ → รอ Retest"},
  PULLBACK:     {label:"Pullback",        color:"var(--j-peach)",  emoji:"🟠",desc:"DZ/SZ ใหญ่ · เก็บสั้น"},
  M5_REVERSAL:  {label:"M5 Reversal",     color:"var(--j-mint)",   emoji:"🟢",desc:"Pa2 ยืนยัน · Buy=ยกโลว์ / Sell=กดไฮ"},
};
const getModeInfo = (mode?: string | null) => {
  return MODE_INFO[mode as TradeMode] || MODE_INFO.SMC;
};
// ─── Default checklists ───────────────────────────────────────────────────────
const defSMC       = ():ChecklistSMC       => ({c1_trend:false,c2_bos:false,c3_dzsz:false,c4_ob:false,c5_liq:false,c6_reject:false,c7_retest:false,c8_mss:false});
const defSWRange   = ():ChecklistSWRange   => ({c1_sw:false,c2_level:false,c3_near:false,c4_pa:false,c5_rr:false});
const defSWBreak   = ():ChecklistSWBreakout=> ({c1_sw:false,c2_close:false,c3_retest:false,c4_noFomo:false});
const defPullback  = ():ChecklistPullback  => ({c1_trend:false,c2_dzsz:false,c3_pa:false,c4_short:false});
const defM5Rev     = ():ChecklistM5Rev     => ({c1_pa2:false,c2_dir:false,c3_plan:false});
const STARTING_CAPITAL=50, MONTHLY_GOAL=2000, TOTAL_TARGET=20000;
const PHASES=[
  {id:1,label:"Phase 1",months:"Month 1–8",from:50,to:1000,color:"var(--j-coral)",risk:"$5/trade",focus:"No lot increase · journal every trade",reminder:"✦ Phase 1 : No FOMO · Journal every trade · R:R ≥ 1:2 only ✦"},
  {id:2,label:"Phase 2",months:"Month 9–18",from:1000,to:12000,color:"var(--j-butter)",risk:"$20–150/trade",focus:"Add $500/mo · win rate ≥ 55%",reminder:"✦ Phase 2 : Add capital regularly · Win rate ≥ 55% · No overtrade ✦"},
  {id:3,label:"Phase 3",months:"Month 19–24",from:12000,to:20000,color:"var(--j-mint)",risk:"$150–200/trade",focus:"Withdraw $2,000/mo · control DD",reminder:"✦ Phase 3 : Withdraw $2,000/mo · Control DD · You are almost there ✦"},
];
const WEEKLY_GOALS = [
  { id:"w1", label:"Win 3 trades",        check:(t:Trade[])=>t.filter(x=>x.result==="WIN").length>=3 },
  { id:"w2", label:"R:R ≥ 2 × 3 trades", check:(t:Trade[])=>t.filter(x=>x.rr>=2).length>=3 },
  { id:"w3", label:"No LOSS streak >2",   check:(t:Trade[])=>{ let streak=0,max=0; [...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{ if(x.result==="LOSS"){streak++;max=Math.max(max,streak);}else streak=0; }); return max<=2; }},
  { id:"w4", label:"Journal 5 sessions",  check:(t:Trade[])=>t.length>=5 },
  { id:"w5", label:"Win Rate ≥ 60%",      check:(t:Trade[])=>t.length>=3&&t.filter(x=>x.result==="WIN").length/t.length>=0.6 },
];
function WeeklyGoals({ trades }: { trades: Trade[] }) {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now); monday.setDate(now.getDate()-(dow===0?6:dow-1)); monday.setHours(0,0,0,0);
  const weekStr = monday.toISOString().split("T")[0];
  const weekTrades = trades.filter(t=>t.date>=weekStr);
  const done = WEEKLY_GOALS.filter(g=>g.check(weekTrades)).length;
  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"var(--j-butter)"}}>
        <span className="j-t">🎯 WEEKLY GOALS</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-ink)",fontWeight:600}}>{done}/{WEEKLY_GOALS.length} done</span>
        <span className="j-ctrl"><span>_</span><span>▢</span><span>✕</span></span>
      </div>
      <div className="j-body" style={{display:"flex",flexDirection:"column",gap:7}}>
        <div>
          <div style={{height:10,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",background:"var(--j-win)",display:"flex",marginBottom:6}}>
            <div style={{background:"var(--j-mint)",width:`${(done/WEEKLY_GOALS.length)*100}%`,transition:"width .4s"}}/>
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)"}}>Week of {weekStr} · {weekTrades.length} sessions logged</div>
        </div>
        {WEEKLY_GOALS.map(g=>{ const ok=g.check(weekTrades); return (
          <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",border:"2px solid var(--j-ink)",borderRadius:8,background:ok?"var(--j-mint)":"var(--j-win)",boxShadow:ok?"2px 2px 0 var(--j-ink)":"none",transition:"all .2s"}}>
            <div style={{width:22,height:22,border:"2px solid var(--j-ink)",borderRadius:5,background:ok?"var(--j-ink)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"'VT323',monospace",fontSize:14,color:"var(--j-win)",boxShadow:ok?"none":"1px 1px 0 var(--j-ink)"}}>{ok?"✓":""}</div>
            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:ok?"var(--j-ink)":"var(--j-soft)",textDecoration:ok?"line-through":"none",fontWeight:ok?600:400}}>{g.label}</span>
            {ok&&<span style={{marginLeft:"auto",fontSize:14}}>⭐</span>}
          </div>
        ); })}
        {done===WEEKLY_GOALS.length&&(<div style={{background:"var(--j-lav)",border:"2px solid var(--j-ink)",borderRadius:8,padding:"10px",textAlign:"center",fontFamily:"'VT323',monospace",fontSize:22,boxShadow:"2px 2px 0 var(--j-ink)"}}>🏆 PERFECT WEEK! ALL GOALS DONE!</div>)}
      </div>
    </div>
  );
}
const BADGES = [
  { id:"b01", icon:"🔥", label:"First Blood",    desc:"First WIN trade",                 check:(t:Trade[])=>t.some(x=>x.result==="WIN") },
  { id:"b02", icon:"⚡", label:"Hat Trick",       desc:"3 WIN streak",                    check:(t:Trade[])=>{ let s=0,mx=0; [...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{if(x.result==="WIN"){s++;mx=Math.max(mx,s);}else s=0;}); return mx>=3; }},
  { id:"b03", icon:"💎", label:"Diamond Hands",   desc:"5 WIN streak",                    check:(t:Trade[])=>{ let s=0,mx=0; [...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{if(x.result==="WIN"){s++;mx=Math.max(mx,s);}else s=0;}); return mx>=5; }},
  { id:"b04", icon:"📐", label:"R:R Master",      desc:"R:R ≥ 2 five times",             check:(t:Trade[])=>t.filter(x=>x.rr>=2).length>=5 },
  { id:"b05", icon:"🎯", label:"Sniper",          desc:"R:R ≥ 3 three times",            check:(t:Trade[])=>t.filter(x=>x.rr>=3).length>=3 },
  { id:"b06", icon:"📓", label:"Loyal Logger",    desc:"10 sessions journaled",           check:(t:Trade[])=>t.length>=10 },
  { id:"b07", icon:"📚", label:"Veteran",         desc:"50 sessions journaled",           check:(t:Trade[])=>t.length>=50 },
  { id:"b08", icon:"💰", label:"First $50",       desc:"Cumulative profit ≥ $50",         check:(t:Trade[])=>t.filter(x=>x.status==="CLOSED").reduce((s,x)=>s+x.totalPL,0)>=50 },
  { id:"b09", icon:"💵", label:"Century Club",    desc:"Cumulative profit ≥ $100",        check:(t:Trade[])=>t.filter(x=>x.status==="CLOSED").reduce((s,x)=>s+x.totalPL,0)>=100 },
  { id:"b10", icon:"🏦", label:"Phase 1 Clear",   desc:"Equity reached $1,000",           check:(t:Trade[])=>STARTING_CAPITAL+t.filter(x=>x.status==="CLOSED").reduce((s,x)=>s+x.totalPL,0)>=1000 },
  { id:"b11", icon:"📊", label:"Win Machine",     desc:"Win rate ≥ 60% (min 10 trades)", check:(t:Trade[])=>t.length>=10&&t.filter(x=>x.result==="WIN").length/t.length>=0.6 },
  { id:"b12", icon:"🛡", label:"DD Guardian",     desc:"Max DD ≤ 10% (min 5 trades)",    check:(t:Trade[])=>{ if(t.length<5) return false; const {maxDDPct}=calcDD(t); return maxDDPct<=10; }},
  { id:"b13", icon:"🌙", label:"Night Owl",       desc:"5 Tokyo session trades",          check:(t:Trade[])=>t.filter(x=>x.session==="Tokyo").length>=5 },
  { id:"b14", icon:"☀️", label:"London Caller",  desc:"5 London session trades",         check:(t:Trade[])=>t.filter(x=>x.session==="London").length>=5 },
  { id:"b15", icon:"🗺", label:"Session Master",  desc:"Trade all 4 sessions",            check:(t:Trade[])=>["Tokyo","London","New York","Overlap"].every(s=>t.some(x=>x.session===s)) },
  { id:"b16", icon:"🧘", label:"Iron Mind",       desc:"หยุดได้หลัง LOSS 3 ติด ×3 ครั้ง",
    check:(t:Trade[])=>{
      const byDate: Record<string,Trade[]> = {};
      t.forEach(x=>{ (byDate[x.date]||=[]).push(x); });
      let ironCount = 0;
      Object.values(byDate).forEach(dayTrades=>{
        const sorted = [...dayTrades].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
        let lStreak=0;
        for(const x of sorted){ if(x.result==="LOSS") lStreak++; else lStreak=0; }
        if(lStreak>=3 && sorted.length<=3) ironCount++;
      });
      return ironCount>=3;
    }},
];
function AchievementBadges({ trades }: { trades: Trade[] }) {
  const [expand, setExpand] = useState(false);
  const unlocked = BADGES.filter(b=>b.check(trades));
  const locked   = BADGES.filter(b=>!b.check(trades));
  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"var(--j-lav)"}}>
        <span className="j-t">🏆 ACHIEVEMENTS</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-ink)",fontWeight:600}}>{unlocked.length}/{BADGES.length} unlocked</span>
        <span className="j-ctrl"><span>_</span><span>▢</span><span>✕</span></span>
      </div>
      <div className="j-body">
        <div style={{marginBottom:12}}>
          <div style={{height:8,border:"2px solid var(--j-ink)",borderRadius:5,overflow:"hidden",background:"var(--j-win)",marginBottom:4}}>
            <div style={{height:"100%",background:"var(--j-lav)",width:`${(unlocked.length/BADGES.length)*100}%`,transition:"width .4s"}}/>
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)"}}>{unlocked.length} unlocked · {locked.length} remaining</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {(expand?BADGES:BADGES.slice(0,9)).map(b=>{ const ok=b.check(trades); return (
            <div key={b.id} title={b.desc} style={{border:"2px solid var(--j-ink)",borderRadius:9,padding:"10px 8px",textAlign:"center",cursor:"default",background:ok?"var(--j-win)":"#f1e9da",boxShadow:ok?"3px 3px 0 var(--j-ink)":"none",opacity:ok?1:0.45,transition:"all .2s",position:"relative"}}>
              {ok&&<div style={{position:"absolute",top:4,right:5,width:7,height:7,borderRadius:"50%",background:"#5fae89",border:"1.5px solid var(--j-ink)"}}/>}
              <div style={{fontSize:22,marginBottom:4,filter:ok?"none":"grayscale(1)"}}>{b.icon}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600,color:"var(--j-ink)",lineHeight:1.2}}>{b.label}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",marginTop:2,lineHeight:1.2}}>{b.desc}</div>
            </div>
          ); })}
        </div>
        <button onClick={()=>setExpand(!expand)} className="j-chip off" style={{width:"100%",marginTop:10,fontSize:10,textAlign:"center"}}>
          {expand?"▲ Show less":`▼ Show all ${BADGES.length} badges`}
        </button>
      </div>
    </div>
  );
}
function RoadmapWidget({ trades }: { trades: Trade[] }) {
  const totalPL=trades.reduce((s,t)=>s+t.totalPL,0);
  const currentEquity=Math.max(0,STARTING_CAPITAL+totalPL);
  const currentPhase=PHASES.find(p=>currentEquity<p.to)||PHASES[PHASES.length-1];
  const phaseProgress=Math.min(100,Math.max(0,((currentEquity-currentPhase.from)/(currentPhase.to-currentPhase.from))*100));
  const overallPct=Math.min(100,(currentEquity/TOTAL_TARGET)*100);
  const now=new Date();
  const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthlyPL=trades.filter(t=>t.date.startsWith(thisMonth)).reduce((s,t)=>s+t.totalPL,0);
  const fmt=(v:number)=>`$${Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const sign=(v:number)=>v>=0?"+":"-";
  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"var(--j-lav)"}}>
        <span className="j-t">🎯 ROADMAP — 2 YEAR PLAN</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>target: {fmt(MONTHLY_GOAL)}/mo</span>
      </div>
      <div className="j-body" style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
          <div><div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",marginBottom:2}}>CURRENT EQUITY</div><div style={{fontFamily:"'VT323',monospace",fontSize:36,lineHeight:1}}>{fmt(currentEquity)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",marginBottom:2}}>THIS MONTH</div><div style={{fontFamily:"'VT323',monospace",fontSize:24,lineHeight:1,color:monthlyPL>=0?"#5fae89":"#e08a82"}}>{sign(monthlyPL)}{fmt(monthlyPL)}</div></div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginBottom:4}}><span>$50</span><span style={{color:"var(--j-ink)",fontWeight:500}}>{overallPct.toFixed(1)}% to {fmt(TOTAL_TARGET)}</span><span>{fmt(TOTAL_TARGET)}</span></div>
          <div style={{height:12,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",background:"var(--j-win)",display:"flex"}}>
            {PHASES.map(p=>{ const segW=((p.to-p.from)/TOTAL_TARGET)*100; const filled=Math.min(100,Math.max(0,((currentEquity-p.from)/(p.to-p.from))*100)); return (<div key={p.id} style={{width:`${segW}%`,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",inset:0,background:"#e3d9c4"}}/><div style={{position:"absolute",top:0,left:0,height:"100%",width:`${filled}%`,background:p.color,transition:"width .4s"}}/></div>); })}
          </div>
          <div style={{display:"flex",marginTop:3}}>{PHASES.map(p=>(<div key={p.id} style={{width:`${((p.to-p.from)/TOTAL_TARGET)*100}%`,textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)"}}>P{p.id}</div>))}</div>
        </div>
        <div style={{background:currentPhase.color+"55",border:"2px solid var(--j-ink)",borderRadius:8,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,background:currentPhase.color,border:"1.5px solid var(--j-ink)",borderRadius:5,padding:"2px 7px",marginRight:6}}>{currentPhase.label}</span><span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>{currentPhase.months}</span></div>
            <span style={{fontFamily:"'VT323',monospace",fontSize:20}}>{phaseProgress.toFixed(0)}%</span>
          </div>
          <div style={{height:8,border:"1.5px solid var(--j-ink)",borderRadius:5,overflow:"hidden",background:"var(--j-win)",marginBottom:8}}><div style={{height:"100%",width:`${phaseProgress}%`,background:currentPhase.color,transition:"width .4s"}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginBottom:6}}><span>{fmt(currentPhase.from)}</span><span style={{color:"var(--j-ink)",fontSize:10}}>{fmt(currentEquity)} → {fmt(currentPhase.to)}</span><span>{fmt(currentPhase.to)}</span></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}><div style={{fontFamily:"'DM Mono',monospace",fontSize:10}}><span style={{color:"var(--j-soft)"}}>Risk </span><b>{currentPhase.risk}</b></div><div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>{currentPhase.focus}</div></div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {PHASES.map(p=>{ const done=currentEquity>=p.to,cur=p.id===currentPhase.id; return (<div key={p.id} style={{flex:1,border:"2px solid var(--j-ink)",borderRadius:7,background:done?p.color:cur?p.color+"44":"var(--j-win)",padding:"7px 6px",textAlign:"center",boxShadow:cur?"2px 2px 0 var(--j-ink)":"none"}}><div style={{fontFamily:"'VT323',monospace",fontSize:11,color:done?"#3a3028":"var(--j-soft)"}}>{done?"✓":cur?"▶":"○"}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:600}}>P{p.id}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"var(--j-soft)"}}>{fmt(p.to)}</div></div>); })}
          <div style={{flex:1,border:"2px solid var(--j-ink)",borderRadius:7,background:currentEquity>=TOTAL_TARGET?"var(--j-mint)":"var(--j-win)",padding:"7px 6px",textAlign:"center"}}><div style={{fontFamily:"'VT323',monospace",fontSize:11,color:"var(--j-soft)"}}>{currentEquity>=TOTAL_TARGET?"★":"◎"}</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:600}}>GOAL</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"var(--j-soft)"}}>$2K/mo</div></div>
        </div>
        <div style={{background:"#fbf6ea",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"8px 10px",fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",lineHeight:1.6,textAlign:"center"}}>{currentPhase.reminder}</div>
      </div>
    </div>
  );
}
// ─── ReflectionModal — บังคับเขียนสรุป/บทเรียนก่อนปิดวัน ตอน Hard Lock ───────
function ReflectionModal({initialText,onSubmit,onClose}:{initialText:string;onSubmit:(text:string)=>void;onClose:()=>void}) {
  const [text,setText] = useState(initialText);
  const [busy,setBusy] = useState(false);
  const trimmed = text.trim();
  const ok = trimmed.length >= 10;
  return (
    <div style={{position:"fixed",inset:0,zIndex:9997,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(4,5,5,.88)",backdropFilter:"blur(3px)"}}>
      <div className="j-win" style={{maxWidth:420,width:"100%"}}>
        <div className="j-bar" style={{background:"var(--j-red)"}}>
          <span className="j-t" style={{color:"#fff"}}>🛑 สรุปวันนี้ ก่อนปิดแอป</span>
        </div>
        <div className="j-body">
          <div style={{fontSize:40,textAlign:"center",marginBottom:8}}>🧘</div>
          <div style={{fontFamily:"'Noto Sans Thai',sans-serif",fontSize:15,fontWeight:700,textAlign:"center",marginBottom:6,color:"var(--j-ink)"}}>
            วันนี้ LOSS 3 ติด — หยุดเทรดแล้ว
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)",textAlign:"center",marginBottom:16,lineHeight:1.8}}>
            เขียนสั้นๆ ว่าเกิดอะไรขึ้น อะไรที่ทำให้เสียการควบคุม<br/>
            และพรุ่งนี้จะทำอะไรต่างไป — ต้องเขียนก่อนถึงจะปิดแอปได้
          </div>
          <label className="j-lab">บทเรียนวันนี้ (อย่างน้อย 10 ตัวอักษร)</label>
          <textarea
            value={text}
            onChange={e=>setText(e.target.value)}
            rows={4}
            placeholder="เช่น: เข้าเร็วเกินไปโดยไม่รอ retest, อารมณ์ revenge หลัง loss ตัวที่ 2..."
            className="j-in"
            style={{resize:"none",marginBottom:6}}
            autoFocus
          />
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",textAlign:"right",marginBottom:14}}>{trimmed.length} ตัวอักษร</div>
          <button
            onClick={async ()=>{ if(!ok||busy) return; setBusy(true); await onSubmit(trimmed); }}
            disabled={!ok||busy}
            className="j-btn j-save-primary w-full"
            style={{padding:14,fontSize:14}}
          >
            {busy ? "⌛ กำลังบันทึก..." : ok ? "✓ บันทึกบทเรียน — ปิดวันนี้" : "พิมพ์อย่างน้อย 10 ตัวอักษร"}
          </button>
          <button onClick={onClose} disabled={busy} className="j-chip off" style={{width:"100%",marginTop:8,fontSize:11,textAlign:"center"}}>
            ไว้เขียนทีหลัง (ระบบจะเตือนอีกครั้งก่อนปิดแท็บ)
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── ResetConfirmModal (ใหม่) — ยืนยันก่อนล้างข้อมูลทั้งหมด ───────────────────
function ResetConfirmModal({onConfirm,onClose}:{onConfirm:()=>void;onClose:()=>void}) {
  const [text,setText] = useState("");
  const [busy,setBusy] = useState(false);
  const ok = text.trim().toUpperCase() === "RESET";
  return (
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(42,31,20,.9)",backdropFilter:"blur(3px)"}}>
      <div className="j-win" style={{maxWidth:380,width:"100%"}}>
        <div className="j-bar" style={{background:"var(--j-coral)"}}>
          <span className="j-t">⚠️ รีเซ็ตข้อมูลทั้งหมด</span>
        </div>
        <div className="j-body">
          <div style={{fontSize:44,textAlign:"center",marginBottom:10}}>🗑️</div>
          <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:15,fontWeight:700,textAlign:"center",marginBottom:6}}>
            ลบทุกไม้เทรด + สถิติทั้งหมด
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)",textAlign:"center",marginBottom:16,lineHeight:1.7}}>
            การกระทำนี้ย้อนกลับไม่ได้ — ลบทั้งในเครื่องนี้ และในระบบ (ถ้า login อยู่)<br/>
            พิมพ์ <b>RESET</b> เพื่อยืนยัน
          </div>
          <input
            value={text}
            onChange={e=>setText(e.target.value)}
            placeholder="พิมพ์ RESET"
            className="j-in"
            style={{textAlign:"center",fontWeight:700,marginBottom:14}}
            autoFocus
          />
          <button
            onClick={async ()=>{ if(!ok||busy) return; setBusy(true); await onConfirm(); }}
            disabled={!ok||busy}
            className="j-btn w-full"
            style={{padding:14,background:ok?"var(--j-coral)":"#e3d9c4",fontSize:14}}
          >
            {busy ? "⌛ กำลังรีเซ็ต..." : ok ? "🗑️ ยืนยันรีเซ็ตทั้งหมด" : "พิมพ์ RESET ให้ตรงก่อน"}
          </button>
          <button onClick={onClose} disabled={busy} className="j-chip off" style={{width:"100%",marginTop:8,fontSize:11,textAlign:"center"}}>
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [trades,setTrades]     = useState<Trade[]>([]);
  const [openTrade,setOpenTrade] = useState<Trade|null>(null);
  const [view,setView]         = useState<"dashboard"|"list"|"checklist"|"exit"|"calendar">("checklist");
  const [filter,setFilter]     = useState<"ALL"|Result>("ALL");
  const [accountType,setAccountType] = useState<AccountType>("cent");
  const [lightbox,setLightbox] = useState<string|null>(null);
  const [booting,setBooting]   = useState(true);
  const [bootText,setBootText] = useState("");
  const [bootDone,setBootDone] = useState(false);
  const [pixels,setPixels]     = useState<{id:number;x:number;y:number;c:string}[]>([]);
  const [saving,setSaving]     = useState(false);
  const [showAlert,setShowAlert] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [mounted,setMounted] = useState(false);
  // ── Discipline lock states (ใหม่) ──────────────────────────────────────────
  const [cooldownUntil,setCooldownUntil]   = useState(0);
  const [nowTick,setNowTick]               = useState(Date.now());
  const [hardlock,setHardlock]             = useState<HardlockState|null>(null);
  const [forcedLockDates,setForcedLockDates] = useState<string[]>([]);
  const [showReflection,setShowReflection] = useState(false);
  const [showResetConfirm,setShowResetConfirm] = useState(false);
  // ── Calendar states ────────────────────────────────────────────────────────
  const [calRef,setCalRef]           = useState(()=>{ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1); });
  const [calSelected,setCalSelected] = useState<string|null>(null);
  // ── Checklist Phase state ──────────────────────────────────────────────────
  const [step,setStep]         = useState<"mode"|"checklist"|"entry">("mode");
  const [selMode,setSelMode]   = useState<TradeMode|null>(null);
  const [clSMC,setClSMC]       = useState<ChecklistSMC>(defSMC());
  const [clSWR,setClSWR]       = useState<ChecklistSWRange>(defSWRange());
  const [clSWB,setClSWB]       = useState<ChecklistSWBreakout>(defSWBreak());
  const [clPB,setClPB]         = useState<ChecklistPullback>(defPullback());
  const [clM5,setClM5]         = useState<ChecklistM5Rev>(defM5Rev());
  // ── Entry form ─────────────────────────────────────────────────────────────
  const [entryDate,setEntryDate]   = useState(new Date().toISOString().split("T")[0]);
  const [entryTime,setEntryTime]   = useState(nowTime24());
  const [session,setSession]       = useState<Session>(()=>autoSessionFromTime(nowTime24()));
  const [sessionManual,setSessionManual] = useState(false);
  const [direction,setDirection]   = useState<Direction>("SHORT");
  const [entryPrice,setEntryPrice] = useState<number|"">("");
  const [slPrice,setSlPrice]       = useState<number|"">("");
  const [lotInput,setLotInput]     = useState("0.10");
  const [riskAmount]               = useState(5);
  const [emotion,setEmotion]       = useState<Emotion>("😌 Calm");
  // ── Wyckoff journal form ──────────────────────────────────────────────────
  const [asset,setAsset]           = useState("XAUUSD");
  const [timeframe,setTimeframe]   = useState("15s");
  const [grade,setGrade]           = useState("A+");
  const [wyResult,setWyResult]     = useState<Result>("WIN");
  const [wyRR,setWyRR]             = useState("1");
  const [wyNotes,setWyNotes]       = useState("");
  const [beforeScreenshotUrl,setBeforeScreenshotUrl] = useState("");
  const [afterScreenshotUrl,setAfterScreenshotUrl]   = useState("");
  const [editingWyckoffId,setEditingWyckoffId] = useState<string|null>(null);
  // ── Exit form (legacy trades only) ────────────────────────────────────────
  const [exitInput,setExitInput]   = useState("");
  const [exitPrices,setExitPrices] = useState<number[]>([]);
  const [pasteInput,setPasteInput] = useState("");
  const [exitReason,setExitReason] = useState<ExitReason|"">("");
  const [exitNotes,setExitNotes]   = useState("");
  const [screenshotUrl,setScreenshotUrl] = useState("");
  const todayStr    = new Date().toISOString().split("T")[0];
  const dailyStatus = calcDailyStatus(trades, todayStr);
  const isCent      = accountType==="cent";
  const stats       = calcStats(trades);
  // ── Discipline lock derived state ──────────────────────────────────────────
  const cooldownRemainingMs = Math.max(0, cooldownUntil - nowTick);
  const isForcedLockToday = forcedLockDates.includes(todayStr);
  const isHardLockToday = (hardlock?.date === todayStr) || dailyStatus.isHardStop || isForcedLockToday;
  const isLockedFromTrading = isForcedLockToday || isHardLockToday || cooldownRemainingMs > 0;
  const needsReflection = isHardLockToday && !isForcedLockToday && !(hardlock?.date===todayStr && hardlock?.submitted);
  const setEntryTimeAuto = (time: string) => {
    const clean = time.slice(0,5);
    setEntryTime(clean);
    if (!sessionManual) setSession(autoSessionFromTime(clean));
  };
  const setNowEntryTime = () => {
    const d = new Date();
    const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    setEntryDate(d.toISOString().split("T")[0]);
    setEntryTime(t);
    setSession(autoSessionFromTime(t));
    setSessionManual(false);
  };

  useEffect(()=>{ document.title="YOKIMURA SHINOBI — TRADING JOURNAL"; setMounted(true); },[]);
  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(()=>{
    const lines=["JOURNAL.EXE","LOADING... 🥇"];
    let i=0,c=0,cur="";
    const next=()=>{
      if(i>=lines.length){ setTimeout(()=>setBootDone(true),200); setTimeout(()=>setBooting(false),600); return; }
      if(c<lines[i].length){ cur+=lines[i][c]; c++; setBootText(lines.slice(0,i).join("\n")+(i>0?"\n":"")+cur); setTimeout(next,22); }
      else{ i++; c=0; cur=""; setTimeout(next,150); }
    };
    setTimeout(next,100);
  },[]);
  // ── Load trades / cross-device sync ───────────────────────────────────────
  useEffect(()=>{
    let alive = true;

    const mapSupabaseTrades = (rows:any[]): Trade[] => migrateOldTrades(rows.map((r:any) => ({
      id: r.id,
      status: "CLOSED" as TradeStatus,
      mode: (r.entry_model as TradeMode) || "SMC",
      date: r.date,
      time: r.time,
      session: r.session,
      direction: r.direction,
      asset: r.symbol || "XAUUSD",
      timeframe: r.tf || "M5",
      entryPrice: Number(r.entry_price ?? 0),
      slPrice: Number(r.sl_price ?? 0),
      lotPerOrder: Number(r.lot_per_order ?? 0),
      lotInput: String(r.lot_per_order ?? ""),
      riskAmount: Number(r.risk_amount) || 5,
      emotion: "😌 Calm" as Emotion,
      checklistJson: "{}",
      exitPrices: r.exit_prices || [],
      avgExit: Number(r.avg_exit ?? 0),
      orderCount: Number(r.order_count ?? 0),
      totalLot: Number(r.total_lot ?? 0),
      totalPL: Number(r.total_pl ?? 0),
      rr: Number(r.rr ?? 0),
      result: r.result || "BE",
      exitReason: "" as ExitReason|"",
      notes: r.notes || "",
      screenshotUrl: r.screenshot_url || "",
      createdAt: r.created_at || new Date().toISOString(),
    })));

    const syncFromCloud = async () => {
      const local = load();
      if (alive && local.length) setTrades(local);

      try {
        const { data:{user}, error:userError } = await supabase.auth.getUser();

        // สำคัญ: localStorage เป็นข้อมูล "ต่อเครื่อง" เท่านั้น
        // ข้อมูลที่จะข้าม PC ↔ มือถือได้ ต้องมาจาก Supabase และต้องเป็น user เดียวกัน
        if (userError) {
          console.error("Supabase auth error:", userError);
          return;
        }
        if (!user) {
          console.warn("Journal sync: no Supabase session on this device. Using localStorage only.");
          return;
        }

        const { data, error } = await supabase
          .from("journal_trades")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at",{ascending:false});

        if (error) {
          console.error("Journal cloud load error:", error);
          return;
        }

        const cloud = mapSupabaseTrades(data || []);

        // Merge cloud + local by id. Cloud wins for the same id,
        // while local-only records are retained instead of disappearing.
        const byId = new Map<string,Trade>();
        for (const t of local) byId.set(t.id,t);
        for (const t of cloud) byId.set(t.id,t);
        const merged = Array.from(byId.values()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));

        if (!alive) return;
        setTrades(merged);
        save(merged);

        // ถ้ามี local-only records และ user login อยู่ ให้ push ขึ้น cloud
        // เพื่อให้ trade ที่สร้างตอน offline ปรากฏบนมือถือ/เครื่องอื่นด้วย
        const cloudIds = new Set(cloud.map(t=>t.id));
        const pending = local.filter(t=>!cloudIds.has(t.id));
        if (pending.length) {
          for (const t of pending) {
            const { error:pushError } = await supabase.from("journal_trades").upsert({
              id:t.id,
              user_id:user.id,
              date:t.date,
              time:t.time,
              symbol:t.asset||"XAUUSD",
              direction:t.direction,
              session:t.session,
              entry_price:t.entryPrice||null,
              exit_prices:t.exitPrices||[],
              avg_exit:t.avgExit||null,
              lot_per_order:t.lotPerOrder||null,
              order_count:t.orderCount||0,
              total_lot:t.totalLot||0,
              total_pl:t.totalPL||0,
              sl_price:t.slPrice||null,
              tp_price:0,
              rr:t.rr||0,
              result:t.result,
              smc_concept:[],
              htf_bias:"Neutral",
              entry_model:t.mode,
              tf:t.timeframe||"M5",
              notes:t.mode==="WYCKOFF"
                ? packWyckoffNotes(t.notes,{asset:t.asset||"XAUUSD",timeframe:t.timeframe||"15s",grade:t.grade||"A+",before:t.screenshotBeforeUrl||"",after:t.screenshotAfterUrl||""})
                : t.notes,
              screenshot_url:t.screenshotUrl||null,
              created_at:t.createdAt,
            },{onConflict:"id"});
            if (pushError) console.error("Journal cloud push error:", pushError);
          }
        }
      } catch(e) {
        console.error("Journal sync error:",e);
      }
    };

    syncFromCloud();

    // If auth becomes available after the first render (e.g. mobile session
    // restoration), sync again instead of leaving the page empty.
    const { data:authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setTimeout(()=>{ if (alive) syncFromCloud(); },0);
      }
    });

    const op=loadOpen(); setOpenTrade(op);
    // ── โหลดสถานะ lock ที่ค้างไว้จาก localStorage ──
    setCooldownUntil(loadCooldownUntil());
    setHardlock(loadHardlock());
    setForcedLockDates(loadForcedLockDates());

    return ()=>{
      alive=false;
      authListener.subscription.unsubscribe();
    };
  },[]);
  // ── Countdown ticker (อัปเดตทุกวินาทีตอน cooldown ทำงาน) ────────────────────
  useEffect(()=>{
    if (cooldownRemainingMs <= 0) return;
    const id = setInterval(()=>setNowTick(Date.now()), 1000);
    return ()=>clearInterval(id);
  },[cooldownRemainingMs>0]);
  // เคลียร์ cooldown อัตโนมัติเมื่อหมดเวลา
  useEffect(()=>{
    if (cooldownUntil > 0 && Date.now() >= cooldownUntil) {
      saveCooldownUntil(0);
      setCooldownUntil(0);
    }
  },[nowTick, cooldownUntil]);
  // ── เตือนก่อนปิดแท็บถ้ายังไม่ได้เขียนสรุป (Hard Lock วันนี้) ──────────────────
  useEffect(()=>{
    const handler = (e: BeforeUnloadEvent) => {
      if (needsReflection) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return ()=>window.removeEventListener("beforeunload", handler);
  },[needsReflection]);
  // ── เปิด ReflectionModal อัตโนมัติเมื่อโดน Hard Lock และยังไม่ได้เขียนสรุป ──────
  useEffect(()=>{
    if (needsReflection) setShowReflection(true);
  },[needsReflection]);
  // ── Loss alert ────────────────────────────────────────────────────────────
  // แจ้งเตือนวันละ 1 ครั้ง หลังผู้ใช้กดรับทราบแล้วจะไม่เด้งซ้ำ
  // และจะรีเซ็ตอัตโนมัติเมื่อขึ้นวันใหม่หลังเที่ยงคืน
  useEffect(()=>{
    const shouldAlert = dailyStatus.isHardStop || dailyStatus.isDayDone;
    if (!shouldAlert) {
      setShowAlert(false);
      return;
    }
    try {
      const ackDate = localStorage.getItem(ALERT_ACK_KEY);
      setShowAlert(ackDate !== todayStr);
    } catch {
      setShowAlert(true);
    }
  },[trades,view,todayStr,dailyStatus.isHardStop,dailyStatus.isDayDone]);
  // ── Sparkle ───────────────────────────────────────────────────────────────
  const sparkle=()=>{
    const c=["var(--j-mint)","var(--j-pink)","var(--j-butter)","var(--j-lav)","var(--j-coral)","var(--j-sky)"];
    setPixels(Array.from({length:18},(_,i)=>({id:i,x:Math.random()*200-100,y:Math.random()*-120-20,c:c[Math.floor(Math.random()*c.length)]})));
    setTimeout(()=>setPixels([]),800);
  };
  // ── Checklist completeness ─────────────────────────────────────────────────
  const checklistComplete = () => {
    if(!selMode) return false;
    if(selMode==="SMC")         return Object.values(clSMC).every(Boolean);
    if(selMode==="SW_RANGE")    return Object.values(clSWR).every(Boolean);
    if(selMode==="SW_BREAKOUT") return Object.values(clSWB).every(Boolean);
    if(selMode==="PULLBACK")    return Object.values(clPB).every(Boolean);
    if(selMode==="M5_REVERSAL") return Object.values(clM5).every(Boolean);
    return false;
  };
  const checklistObj = () => {
    if(selMode==="SMC")         return clSMC;
    if(selMode==="SW_RANGE")    return clSWR;
    if(selMode==="SW_BREAKOUT") return clSWB;
    if(selMode==="PULLBACK")    return clPB;
    if(selMode==="M5_REVERSAL") return clM5;
    return {};
  };
  // ── Save Wyckoff Journal Trade — single-page record ───────────────────────
  const saveWyckoffTrade = async () => {
    if (isLockedFromTrading || saving) return;
    const rr = wyResult === "WIN" ? 1 : wyResult === "LOSS" ? -1 : 0;
    const risk = 5;
    const trade: Trade = {
      id:editingWyckoffId || uid(), status:"CLOSED", mode:"WYCKOFF",
      date:entryDate, time:entryTime, session,
      direction, asset, timeframe, grade,
      entryPrice:0, slPrice:0, lotPerOrder:0, lotInput:"", riskAmount:risk,
      emotion:"😌 Calm", checklistJson:"{}",
      exitPrices:[], avgExit:0, orderCount:0, totalLot:0,
      totalPL:Math.round(rr*risk*100)/100, rr, result:wyResult, exitReason:"",
      notes:wyNotes.trim(),
      screenshotUrl:afterScreenshotUrl || beforeScreenshotUrl || "",
      screenshotBeforeUrl:beforeScreenshotUrl,
      screenshotAfterUrl:afterScreenshotUrl,
      createdAt:new Date().toISOString(),
    };
    const updated=editingWyckoffId ? trades.map(t=>t.id===editingWyckoffId?trade:t) : [trade,...trades];
    setTrades(updated); save(updated);
    const newStatus=calcDailyStatus(updated,trade.date);
    if(trade.date===todayStr){
      if(newStatus.isHardStop){
        saveCooldownUntil(0); setCooldownUntil(0);
        const hl:HardlockState={date:todayStr,submitted:false,reflectionText:"",submittedAt:""};
        saveHardlock(hl); setHardlock(hl);
        const weekCount=countHardStopDaysThisWeek(updated,todayStr);
        if(weekCount>=3){
          const tmr=tomorrowStr(todayStr); const existing=loadForcedLockDates();
          if(!existing.includes(tmr)){ const next=[...existing,tmr]; saveForcedLockDates(next); setForcedLockDates(next); }
        }
      }else if(newStatus.lossStreak===2){
        const until=Date.now()+COOLDOWN_MS; saveCooldownUntil(until); setCooldownUntil(until); setNowTick(Date.now());
      }else{ saveCooldownUntil(0); setCooldownUntil(0); }
    }
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(user){
        await supabase.from("journal_trades").upsert({
          id:trade.id,user_id:user.id,date:trade.date,time:trade.time,
          symbol:trade.asset||"XAUUSD",direction:trade.direction,session:trade.session,
          entry_price:null,exit_prices:[],avg_exit:null,lot_per_order:null,
          order_count:0,total_lot:0,total_pl:trade.totalPL,sl_price:null,tp_price:null,rr:trade.rr,
          result:trade.result,smc_concept:[],htf_bias:"Neutral",entry_model:"WYCKOFF",tf:trade.timeframe,
          notes:packWyckoffNotes(trade.notes,{asset:trade.asset||"XAUUSD",timeframe:trade.timeframe||"15s",grade:trade.grade||"A+",before:trade.screenshotBeforeUrl||"",after:trade.screenshotAfterUrl||""}),
          screenshot_url:trade.screenshotAfterUrl||trade.screenshotBeforeUrl||null,
          created_at:trade.createdAt,
        },{onConflict:"id"});
      }
    }catch(e){ console.error("Supabase save error:",e); }
    setBeforeScreenshotUrl(""); setAfterScreenshotUrl(""); setWyNotes(""); setWyResult("WIN"); setWyRR("1"); setGrade("A+"); setEditingWyckoffId(null);
    sparkle(); setSaving(true); setTimeout(()=>setSaving(false),900);
    setView("dashboard");
  };
  // ── Reset (clear) the Wyckoff execution form without saving ───────────────
  const resetWyckoffForm = () => {
    setBeforeScreenshotUrl("");
    setAfterScreenshotUrl("");
    setWyNotes("");
    setWyResult("WIN");
    setWyRR("1");
    setGrade("A+");
    setEditingWyckoffId(null);
    setAsset("XAUUSD");
    setTimeframe("15s");
    setEntryDate(new Date().toISOString().split("T")[0]);
    setEntryTime(nowTime24());
    setSession(autoSessionFromTime(nowTime24()));
    setSessionManual(false);
  };
  // ── Legacy open-trade saver kept for old records / old editor ─────────────
  const saveOpenTrade = async () => {
    if (isLockedFromTrading) return;
    if(!selMode||!entryPrice||!slPrice) return;
    const trade: Trade = { id:uid(),status:"OPEN",mode:selMode,date:entryDate,time:entryTime,session,direction,
      entryPrice:Number(entryPrice),slPrice:Number(slPrice),lotPerOrder:parseFloat(lotInput)||0.10,lotInput,riskAmount,emotion,
      checklistJson:JSON.stringify(checklistObj()),exitPrices:[],avgExit:0,orderCount:0,totalLot:0,totalPL:0,rr:0,result:"BE",exitReason:"",notes:"",screenshotUrl:"",createdAt:new Date().toISOString() };
    setOpenTrade(trade); saveOpen(trade); setView("dashboard");
  };
  // ── Legacy close handler kept for old OPEN trades ─────────────────────────
  const saveClosedTrade = async () => {
    if(!openTrade||!exitPrices.length) return;
    const ep=Number(openTrade.entryPrice),lot=openTrade.lotPerOrder;
    const perPLs=exitPrices.map(ex=>calcPL(openTrade.direction,ep,ex,lot,isCent));
    const totalPL=Math.round(perPLs.reduce((a,b)=>a+b,0)*100)/100;
    const avgExit=exitPrices.reduce((a,b)=>a+b,0)/exitPrices.length;
    const result:Result=totalPL>0.01?"WIN":totalPL<-0.01?"LOSS":"BE";
    const rr=openTrade.riskAmount>0?Math.round((totalPL/openTrade.riskAmount)*100)/100:0;
    const closed:Trade={...openTrade,status:"CLOSED",exitPrices,avgExit:Math.round(avgExit*1000)/1000,orderCount:exitPrices.length,totalLot:exitPrices.length*lot,totalPL,rr,result,exitReason,notes:exitNotes,screenshotUrl};
    const updated=[closed,...trades.filter(t=>t.id!==closed.id)]; setTrades(updated); save(updated); setOpenTrade(null); saveOpen(null);
    const newStatus=calcDailyStatus(updated,closed.date);
    if(closed.date===todayStr){ if(newStatus.isHardStop){saveCooldownUntil(0);setCooldownUntil(0);const hl:HardlockState={date:todayStr,submitted:false,reflectionText:"",submittedAt:""};saveHardlock(hl);setHardlock(hl);} else if(newStatus.lossStreak===2){const until=Date.now()+COOLDOWN_MS;saveCooldownUntil(until);setCooldownUntil(until);setNowTick(Date.now());} else {saveCooldownUntil(0);setCooldownUntil(0);} }
    try{const {data:{user}}=await supabase.auth.getUser();if(user){await supabase.from("journal_trades").upsert({id:closed.id,user_id:user.id,date:closed.date,time:closed.time,symbol:closed.asset||"XAUUSD",direction:closed.direction,session:closed.session,entry_price:closed.entryPrice,exit_prices:closed.exitPrices,avg_exit:closed.avgExit,lot_per_order:closed.lotPerOrder,order_count:closed.orderCount,total_lot:closed.totalLot,total_pl:closed.totalPL,sl_price:closed.slPrice,tp_price:0,rr:closed.rr,result:closed.result,smc_concept:[],htf_bias:"Neutral",entry_model:closed.mode,tf:closed.timeframe||"M5",notes:closed.notes,screenshot_url:closed.screenshotUrl||null,created_at:closed.createdAt},{onConflict:"id"});}}catch(e){console.error(e);}
    setExitPrices([]);setExitInput("");setPasteInput("");setExitReason("");setExitNotes("");setScreenshotUrl("");sparkle();setSaving(true);setTimeout(()=>setSaving(false),900);setView("dashboard");
  };
  const submitReflection = (text: string) => {
    const hl: HardlockState = { date: todayStr, submitted:true, reflectionText:text, submittedAt:new Date().toISOString() };
    saveHardlock(hl); setHardlock(hl);
    setShowReflection(false);
  };
  // ── Reset All (ใหม่) — ล้าง journal ทั้งหมด เริ่มใหม่ ────────────────────────
  const resetAllTrades = async () => {
    // ล้าง localStorage ทั้งหมดที่เกี่ยวกับ journal
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(KEY_OLD);
      localStorage.removeItem(KOPEN);
      localStorage.removeItem(COOLDOWN_KEY);
      localStorage.removeItem(HARDLOCK_KEY);
      localStorage.removeItem(FORCED_LOCK_KEY);
      localStorage.removeItem(ALERT_ACK_KEY);
    } catch {}
    // ลบข้อมูลใน Supabase ด้วย ถ้า login อยู่
    try {
      const { data:{user} } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("journal_trades").delete().eq("user_id", user.id);
      }
    } catch(e) { console.error("Supabase reset error:", e); }
    // เคลียร์ state ในแอปทั้งหมด
    setTrades([]);
    setOpenTrade(null);
    setCooldownUntil(0);
    setHardlock(null);
    setForcedLockDates([]);
    setShowAlert(false);
    setCalSelected(null);
    setShowResetConfirm(false);
    setView("dashboard");
  };
  const uploadJournalImage=async(file:File,target:"before"|"after")=>{
    setUploading(true);
    try{
      const {data:{user}}=await supabase.auth.getUser();
      if(user){
        const ext=(file.name.split(".").pop()||"png").toLowerCase();
        const path=`${user.id}/wyckoff-${Date.now()}-${target}.${ext}`;
        const {error}=await supabase.storage.from("journal-screenshots").upload(path,file,{upsert:true,contentType:file.type});
        if(error) throw error;
        const {data}=supabase.storage.from("journal-screenshots").getPublicUrl(path);
        if(target==="before") setBeforeScreenshotUrl(data.publicUrl);
        else setAfterScreenshotUrl(data.publicUrl);
      }else{
        const dataUrl=await new Promise<string>((resolve,reject)=>{
          const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result||"")); reader.onerror=reject; reader.readAsDataURL(file);
        });
        if(target==="before") setBeforeScreenshotUrl(dataUrl);
        else setAfterScreenshotUrl(dataUrl);
      }
    }catch(e){ console.error(e); alert("Upload รูปไม่สำเร็จ"); }
    setUploading(false);
  };
  // Legacy single-image uploader remains available for old trade editor.
  const uploadScreenshot=async(file:File)=>{ await uploadJournalImage(file,"after"); setScreenshotUrl(afterScreenshotUrl); };
  const addExit=()=>{const v=parseFloat(exitInput);if(!isNaN(v)&&v>0){setExitPrices(p=>[...p,v]);setExitInput("");}};
  const parsePaste=()=>{
    const ns=pasteInput.split(/[\n,\s]+/).map(s=>parseFloat(s.replace(/,/g,""))).filter(n=>!isNaN(n)&&n>0);
    if(ns.length){setExitPrices(p=>[...p,...ns]);setPasteInput("");}
  };
  const updateOpenTradePatch = (patch: Partial<Trade>) => {
    setOpenTrade(prev => {
      if(!prev) return prev;
      const next: Trade = { ...prev, ...patch };
      saveOpen(next);
      return next;
    });
  };
  const editTrade=(t:Trade)=>{
    if(t.mode==="WYCKOFF"){
      setEditingWyckoffId(t.id);
      setEntryDate(t.date||todayStr); setEntryTime(String(t.time||nowTime24()).slice(0,5)); setSession(t.session||"New York");
      setAsset(t.asset||"XAUUSD"); setTimeframe(t.timeframe||"15s"); setGrade(t.grade||"A+"); setWyResult(t.result||"BE"); setWyRR("1"); setWyNotes(t.notes||"");
      setBeforeScreenshotUrl(t.screenshotBeforeUrl||""); setAfterScreenshotUrl(t.screenshotAfterUrl||t.screenshotUrl||"");
      setOpenTrade(t); setView("checklist"); return;
    }
    setOpenTrade(t); setExitPrices(Array.isArray(t.exitPrices) ? t.exitPrices : []); setExitReason(t.exitReason || ""); setExitNotes(t.notes || ""); setScreenshotUrl(t.screenshotUrl || ""); saveOpen(t); setView("exit");
  };
  const deleteTrade=async(t:Trade)=>{
    const ok = window.confirm(`ลบการเทรดวันที่ ${t.date} เวลา ${t.time} ใช่ไหม?`);
    if(!ok) return;
    const updated = trades.filter(x=>x.id!==t.id);
    setTrades(updated);
    save(updated);
    if(openTrade?.id===t.id){
      setOpenTrade(null);
      saveOpen(null);
    }
    try{
      const {data:{user}} = await supabase.auth.getUser();
      if(user){
        await supabase.from("journal_trades").delete().eq("id",t.id).eq("user_id",user.id);
      }
    }catch(e){
      console.error("Supabase delete error:",e);
    }
  };
  const filtered=filter==="ALL"?trades.filter(t=>t.status==="CLOSED"):trades.filter(t=>t.status==="CLOSED"&&t.result===filter);
  // ── P/L preview ───────────────────────────────────────────────────────────
  const previewPL = openTrade&&exitPrices.length
    ? exitPrices.map(ex=>calcPL(openTrade.direction,openTrade.entryPrice,ex,openTrade.lotPerOrder,isCent)).reduce((a,b)=>a+b,0)
    : 0;
  const totalPages = openTrade&&exitPrices.length
    ? Math.round(previewPL*100)/100 : 0;
  if (!mounted) {
    return <main style={{minHeight:"100vh",background:"#f1e9da"}} />;
  }
  return (
    <main className="j-root theme-ninja">
      
<style id="yokimura-dashboard-theme">
  .j-dashboard .j-stat{
    background:linear-gradient(145deg,#101212 0%,#070808 100%)!important;
    border:1px solid rgba(255,255,255,.11)!important;
    border-radius:6px!important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 8px 24px rgba(0,0,0,.18)!important;
    color:#eee!important;
    position:relative;
    overflow:hidden;
  }
  .j-dashboard .j-stat::before{
    content:"";
    position:absolute;
    left:0;top:0;bottom:0;width:3px;
    background:#d92332;
    opacity:.9;
  }
  .j-dashboard .j-num{color:#f1f1ef!important}
  .j-dashboard .j-statlab{color:#747978!important}
  .j-dashboard .j-win,
  .j-dashboard .j-win .j-body{
    background:linear-gradient(145deg,#0a0b0b 0%,#050606 100%)!important;
    border-color:rgba(255,255,255,.10)!important;
  }
  .j-dashboard .j-bar{
    color:#f1f1ef!important;
  }
  .j-dashboard .j-bar .j-t{
    letter-spacing:.12em!important;
    text-shadow:0 1px 10px rgba(217,35,50,.18);
  }
  .j-dashboard .j-body{
    padding:10px!important;
  }
  @media(max-width:680px){
    .j-dashboard{gap:10px!important}
    .j-dashboard .j-stat{min-height:78px!important}
    .j-dashboard .j-num{font-size:27px!important}
  }
</style>

<style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&family=Noto+Serif+JP:wght@400;500;600;700;800&family=Shippori+Mincho:wght@400;500;600;700;800&display=swap');

        /* ================================================================
           YOKIMURA SHINOBI — DESKTOP + MOBILE SYSTEM
           ================================================================ */
        .j-root{
          --j-paper:#050606;
          --j-win:#0b0d0d;
          --j-field:#080a0a;
          --j-ink:#f3f3ef;
          --j-soft:#969b98;
          --j-line:rgba(255,255,255,.15);
          --j-line-strong:rgba(255,255,255,.32);
          --j-red:#d21f2b;
          --j-red-soft:rgba(210,31,43,.16);
          --j-green:#8de1b5;
          min-height:100vh;
          color:var(--j-ink);
          background:
            linear-gradient(rgba(3,4,4,.78),rgba(3,4,4,.92)),
            url("/images/ninja-mobile-bg.webp") center top / cover fixed no-repeat,
            radial-gradient(ellipse at 82% 15%,rgba(255,255,255,.055),transparent 24%),
            radial-gradient(ellipse at 72% 100%,rgba(210,31,43,.035),transparent 28%),
            linear-gradient(120deg,#030404 0%,#090b0b 52%,#050606 100%);
          font-family:'Noto Sans Thai','Inter',sans-serif;
          position:relative;
          overflow-x:hidden;
          -webkit-font-smoothing:antialiased;
          text-rendering:optimizeLegibility;
        }

        .j-root *{box-sizing:border-box}
        .j-root button,.j-root input,.j-root select,.j-root textarea{font:inherit}
        .j-root::before{
          content:'';
          position:fixed;inset:0;z-index:0;pointer-events:none;
          background:
            repeating-linear-gradient(0deg,transparent 0 4px,rgba(255,255,255,.012) 4px 5px),
            linear-gradient(125deg,transparent 0 74%,rgba(255,255,255,.025) 74% 74.2%,transparent 74.2%);
          opacity:.55;
        }
        .j-root::after{
          content:'忍';
          position:fixed;right:-45px;bottom:-90px;z-index:0;pointer-events:none;
          font-family:serif;font-size:360px;font-weight:700;line-height:1;
          color:rgba(255,255,255,.018);transform:rotate(-7deg);
        }


        .j-ink-decoration{
          position:absolute;pointer-events:none;z-index:0;opacity:.25;
          color:#fff;font-family:'Shippori Mincho','Noto Serif JP',serif;
        }
        .j-ink-decoration.left{
          left:17%;top:15%;font-size:180px;transform:rotate(-9deg);color:rgba(255,255,255,.025)
        }
        .j-ink-decoration.right{
          right:2%;top:17%;font-size:120px;transform:rotate(13deg);color:rgba(255,255,255,.03)
        }
        .j-bamboo{
          position:absolute;right:0;top:90px;width:190px;height:570px;pointer-events:none;z-index:0;opacity:.17;
          background:
            linear-gradient(82deg,transparent 0 19%,rgba(255,255,255,.10) 19.5% 20.5%,transparent 21%),
            linear-gradient(78deg,transparent 0 52%,rgba(255,255,255,.075) 52.5% 53.5%,transparent 54%),
            linear-gradient(75deg,transparent 0 79%,rgba(255,255,255,.06) 79.5% 80.5%,transparent 81%);
          transform:skewX(-8deg);
          mask-image:linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);
        }
        .j-bamboo:before,.j-bamboo:after{
          content:'';position:absolute;width:95px;height:330px;border-left:2px solid rgba(255,255,255,.12);
          border-radius:50%;transform:rotate(29deg)
        }
        .j-bamboo:before{right:20px;top:65px}.j-bamboo:after{right:75px;top:195px;transform:rotate(-20deg)}

        /* ---------- App shell ---------- */
        .j-app-frame{
          min-height:100vh;display:grid;grid-template-columns:248px minmax(0,1fr);
          position:relative;z-index:1;
        }
        .j-sidebar{
          position:sticky;top:0;height:100vh;overflow:hidden;
          border-right:1px solid var(--j-line);
          background:
            linear-gradient(180deg,rgba(3,4,4,.98),rgba(7,8,8,.97)),
            radial-gradient(circle at 50% 75%,rgba(255,255,255,.08),transparent 25%);
          padding:27px 20px 18px;display:flex;flex-direction:column;
        }
        .j-sidebar-brand{padding:3px 8px 22px;border-bottom:1px solid rgba(255,255,255,.10);position:relative;z-index:2}
        .j-sidebar-brand-top{
          font-family:'Montserrat','Noto Sans Thai',sans-serif;font-size:18px;font-weight:600;letter-spacing:5px;
          line-height:1.45;color:#fff
        }
        .j-sidebar-brand-mark{
          width:28px;height:28px;margin-top:11px;display:block;border-radius:50%;
          object-fit:cover;border:1px solid rgba(255,255,255,.2)
        }
        .j-sidebar-code{
          position:relative;z-index:2;margin:18px 8px 0;color:#656a68;
          font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2.5px;line-height:2
        }
        .j-side-nav{position:relative;z-index:3;display:flex;flex-direction:column;gap:5px;margin-top:22px}
        .j-side-btn{
          width:100%;min-height:42px;border:1px solid transparent;border-radius:2px;
          display:flex;align-items:center;gap:12px;padding:9px 10px;
          background:transparent;color:#858a88;cursor:pointer;text-align:left;
          font-family:'Noto Sans Thai','Inter',sans-serif;font-size:12px;font-weight:500;
          transition:background .15s,border-color .15s,color .15s,transform .15s;
        }
        .j-side-btn:hover{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.12);color:#fff}
        .j-side-btn.active{
          background:linear-gradient(90deg,rgba(255,255,255,.10),rgba(255,255,255,.025));
          border-color:rgba(255,255,255,.58);color:#fff;box-shadow:inset 2px 0 #fff
        }
        .j-side-icon{width:23px;flex:0 0 23px;text-align:center;color:#ddd;font-family:'DM Mono';font-size:17px;line-height:1}
        .j-sidebar-footer{
          position:relative;z-index:3;margin-top:auto;padding:15px 8px 2px;border-top:1px solid rgba(255,255,255,.10)
        }
        .j-sidebar-footer-main{font-family:'DM Mono';font-size:8px;letter-spacing:2.4px;line-height:1.9;color:#727775}
        .j-sidebar-footer-sub{font-family:'DM Mono';font-size:7px;letter-spacing:2px;color:#525654;margin-top:7px}
        .j-sidebar-line{width:25px;height:1px;background:#fff;margin-top:10px;opacity:.6}
        .j-sidebar-hero{
          position:absolute;left:-25px;right:-25px;bottom:0;height:400px;z-index:1;pointer-events:none;
          overflow:hidden
        }
        .j-sidebar-hero-img{
          width:100%;height:100%;object-fit:cover;object-position:42% 12%;
          display:block;filter:contrast(1.12) brightness(1.04) saturate(1.05);
          -webkit-mask-image:linear-gradient(180deg,transparent,#000 6%,#000 78%,transparent);
          mask-image:linear-gradient(180deg,transparent,#000 6%,#000 78%,transparent);
        }
        .j-sidebar-hero-fade{
          position:absolute;inset:0;pointer-events:none;
          background:linear-gradient(180deg,rgba(3,4,4,.05) 0%,transparent 22%,transparent 62%,rgba(3,4,4,.94) 100%);
        }

        .j-app-main{position:relative;min-width:0}
        .j-app-main:before{
          content:'';position:absolute;inset:0;pointer-events:none;
          background:
            radial-gradient(ellipse at 84% 18%,rgba(255,255,255,.045),transparent 22%),
            repeating-linear-gradient(95deg,transparent 0 85px,rgba(255,255,255,.012) 85px 87px);
        }
        .j-header-wrap,.j-page-shell{position:relative;z-index:2}
        .j-header-wrap{padding:15px 24px 0!important}
        .j-page-shell{max-width:min(1500px,93vw)!important;margin:0 auto;padding:18px 24px 36px!important}
        .j-app-main .j-header-wrap > .j-win{max-width:min(1500px,93vw)!important;margin:0 auto}
        .j-app-main .j-tabs-wrap{max-width:min(1500px,93vw)!important;margin:15px auto 0!important;padding:0!important}
        .j-app-main .j-shinobi-header{min-height:124px;padding:23px 28px!important}

        /* ---------- Brand ---------- */
        .j-shinobi-header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center}
        .j-brand-kicker{font-family:'DM Mono';font-size:8px;letter-spacing:3px;color:#777c79;margin-bottom:8px}
        .j-brand{display:flex;align-items:center;gap:13px}
        .j-brand-mark{
          width:51px;height:51px;display:block;border-radius:50%;object-fit:cover;
          border:1px solid rgba(255,255,255,.26);flex:0 0 auto
        }
        .j-brand-name{
          font-family:'Montserrat','Noto Sans Thai',sans-serif;font-size:clamp(28px,3.3vw,44px);font-weight:800;
          letter-spacing:5px;line-height:1;color:#fff
        }
        .j-brand-logo-img{
          display:block;height:clamp(30px,4vw,52px);width:auto;max-width:100%;object-fit:contain;
          filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));
        }
        .j-brand-sub{
          margin-top:7px;font-family:'DM Mono';font-size:8px;letter-spacing:2px;color:#777c79
        }
        .j-mantra{max-width:365px;text-align:right;font-family:'DM Mono';font-size:8px;line-height:1.85;letter-spacing:1.5px;color:#7f8481;text-transform:uppercase}
        .j-mantra strong{display:block;color:#eee;font-size:9px;letter-spacing:1.8px}
        .j-quote-strip{
          max-width:1180px;margin:12px auto 0;padding:0 4px;
          display:flex;align-items:center;gap:12px;color:#777c79
        }
        .j-quote-strip i{width:30px;height:1px;background:var(--j-red);display:block;flex:0 0 auto}
        .j-quote-strip span,.j-quote-strip b{font-family:'DM Mono';font-size:7px;letter-spacing:1.5px}
        .j-quote-strip b{color:#bfc2bf;font-weight:500}
        .j-page-footer{
          max-width:1180px;margin:28px auto 0;padding:16px 4px 0;border-top:1px solid rgba(255,255,255,.08);
          display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;
        }
        .j-page-footer span{font-family:'DM Mono';font-size:8px;letter-spacing:2px;color:#6d726f;text-transform:uppercase}
        .j-page-footer i{width:22px;height:1px;background:rgba(255,255,255,.18);display:block;flex:0 0 auto}

        /* ---------- Windows / form ---------- */
        .j-win{
          background:rgba(10,12,12,.86);border:1px solid var(--j-line);border-radius:2px;
          box-shadow:0 20px 55px rgba(0,0,0,.30);overflow:hidden
        }
        .j-bar{
          min-height:32px;display:flex;align-items:center;gap:9px;padding:7px 11px;
          border-bottom:1px solid rgba(255,255,255,.09);
          background:linear-gradient(90deg,rgba(255,255,255,.035),transparent)
        }
        .j-t{
          flex:1;font-family:'DM Mono';font-size:8px;letter-spacing:1.1px;font-weight:600;
          color:#d8dad7;overflow:hidden;white-space:nowrap;text-overflow:ellipsis
        }
        .j-ctrl{display:flex;gap:4px;flex-shrink:0}
        .j-ctrl span{
          width:13px;height:13px;border:1px solid rgba(255,255,255,.24);border-radius:1px;
          display:flex;align-items:center;justify-content:center;color:#bbb;font-family:'DM Mono';font-size:7px
        }
        .j-body{padding:18px}
        .j-execution-card{border-color:rgba(255,255,255,.20)!important}
        .j-execution-title{font-family:'Montserrat';font-size:9px;letter-spacing:2.5px;font-weight:700;color:#ddd;text-transform:uppercase}
        .j-execution-heading{
          font-family:'Noto Sans Thai','Inter',sans-serif;font-size:clamp(30px,3.5vw,48px);
          font-weight:800;letter-spacing:-.5px;line-height:1.25;color:#fff;margin:2px 0 3px
        }
        .j-execution-sub{font-family:'Noto Sans Thai','Inter',sans-serif;font-size:11px;font-weight:400;color:#8b908d;line-height:1.75}
        .j-kanji-quote{text-align:right;flex:0 0 auto;max-width:200px}
        .j-kanji-quote-mark{display:block;font-family:'Shippori Mincho','Noto Serif JP',serif;font-size:26px;color:rgba(255,255,255,.15);line-height:1}
        .j-kanji-quote-jp{font-family:'Shippori Mincho','Noto Serif JP',serif;font-size:15px;color:#c9cbc8;letter-spacing:1px;margin-top:-4px}
        .j-kanji-quote-en{font-family:'DM Mono';font-size:7px;letter-spacing:1.6px;color:#6d726f;margin-top:4px;text-transform:uppercase}
        .j-ninja-divider{height:1px;background:linear-gradient(90deg,rgba(255,255,255,.3),transparent);opacity:.6}
        .j-lab{
          display:block;margin-bottom:6px;font-family:'DM Mono','Noto Sans Thai',sans-serif;
          font-size:9px;font-weight:600;letter-spacing:1px;color:#aeb2af;text-transform:uppercase
        }
        .j-in{
          width:100%;min-height:39px;background:#080a0a!important;color:#eee!important;
          border:1px solid rgba(255,255,255,.18)!important;border-radius:2px!important;
          padding:9px 11px!important;font-family:'Noto Sans Thai','DM Mono',sans-serif!important;
          font-size:12px!important;font-weight:500!important;outline:none
        }
        .j-in:focus{border-color:rgba(255,255,255,.62)!important;box-shadow:0 0 0 1px rgba(255,255,255,.06)!important}
        .j-in::placeholder{color:#575c59}
        .j-in option{background:#0c0e0e;color:#fff}
        .j-result-row{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
        .j-result-btn{
          min-height:39px;border:1px solid rgba(255,255,255,.16);border-radius:2px;
          background:#080a0a;color:#888d8a;font-family:'DM Mono';font-size:10px;cursor:pointer;transition:.15s
        }
        .j-result-btn:hover{border-color:rgba(255,255,255,.42);color:#fff}
        .j-result-btn.active{background:#f1f1ed;color:#070808;border-color:#fff;font-weight:700}
        .j-result-btn.loss.active{background:var(--j-red);color:#fff;border-color:var(--j-red)}
        .j-result-btn.be.active{background:#666a67;color:#fff;border-color:#8d918e}
        .j-rr-fixed{
          min-height:39px;display:flex;align-items:center;justify-content:space-between;
          padding:7px 11px;background:#080a0a;border:1px solid rgba(255,255,255,.18);border-radius:2px
        }
        .j-rr-fixed span{font-family:'DM Mono';font-size:7px;letter-spacing:1px;color:#686d6a}
        .j-rr-fixed b{font-family:'VT323';font-size:25px;line-height:1;color:var(--j-green)}
        textarea.j-in{min-height:78px!important;resize:vertical;line-height:1.7}
        .j-upload-box{
          min-height:154px;border:1px dashed rgba(255,255,255,.22);border-radius:2px;
          background:rgba(255,255,255,.012);display:flex;flex-direction:column;align-items:center;
          justify-content:center;padding:15px;transition:.15s
        }
        .j-upload-box:hover{border-color:rgba(255,255,255,.52);background:rgba(255,255,255,.028)}
        .j-upload-icon{font-size:29px;line-height:1;margin-bottom:9px;filter:grayscale(1)}
        .j-upload-title{font-family:'Noto Sans Thai',sans-serif;font-size:12px;font-weight:700;color:#eee}
        .j-upload-sub{font-family:'DM Mono';font-size:7px;color:#6e7370;margin-top:6px;text-align:center;letter-spacing:.6px}
        .j-save-primary{
          background:#f2f2ee!important;color:#080909!important;border-color:#fff!important;
          min-height:45px!important;font-family:'Noto Sans Thai','Inter',sans-serif!important;font-size:12px!important;font-weight:800!important
        }
        .j-save-primary:hover{background:#fff!important;box-shadow:0 0 28px rgba(255,255,255,.12)}
        .j-btn{border-radius:2px!important;font-family:'Noto Sans Thai','Inter',sans-serif!important}
        .j-chip{font-family:'Noto Sans Thai','Inter',sans-serif!important;border-radius:2px!important}
        .j-tab{
          border:1px solid transparent;border-radius:2px 2px 0 0;background:transparent;color:#6f7471;
          font-family:'DM Mono';font-size:8px;letter-spacing:1px;padding:9px 13px;cursor:pointer
        }
        .j-tab.on{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.18);color:#fff}
        .j-tab:hover{color:#fff}

        /* ---------- Legacy screens inherit the same visual language ---------- */
        .j-stat,.j-cal-summary-card,.j-cal-empty-note,.j-open-edit-note{
          background:#0b0d0d!important;border-color:var(--j-line)!important;box-shadow:none!important
        }
        .j-statlab,.j-cal-count,.j-cal-mini,.j-cal-legend{font-family:'DM Mono','Noto Sans Thai',sans-serif!important}
        .j-num{font-family:'VT323',monospace}
        .j-cal-cell{
          background:#080a0a!important;border-color:rgba(255,255,255,.13)!important;
          color:#eee!important;box-shadow:none!important;border-radius:2px!important
        }
        .j-cal-cell.has.win{background:rgba(141,225,181,.08)!important}
        .j-cal-cell.has.loss{background:rgba(210,31,43,.12)!important}
        .j-cal-cell.has.be{background:rgba(255,255,255,.05)!important}
        .j-cal-cell.selected{outline:1px solid #fff}
        .j-cal-pl,.j-cal-day{color:#eee!important}
        .j-cal-mini span{background:rgba(255,255,255,.04)!important;border-color:rgba(255,255,255,.13)!important}
        .j-cal-nav{background:#090b0b!important;color:#eee!important;border-color:rgba(255,255,255,.2)!important;border-radius:2px!important}

        /* ---------- Base layout for stat tiles / calendar / open-edit grids (previously missing) ---------- */
        .j-stat,.j-cal-summary-card{
          border:1px solid var(--j-line);border-radius:2px;padding:12px 14px;
          display:flex;flex-direction:column;gap:4px
        }
        .j-stat .j-num,.j-cal-summary-card b{font-size:26px;line-height:1;font-weight:400}
        .j-statlab,.j-cal-summary-card span{font-size:9px;letter-spacing:1.2px;color:var(--j-soft);text-transform:uppercase}
        .j-cal-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
        .j-cal-summary-card.win b{color:var(--j-green)}
        .j-cal-summary-card.loss b{color:#e08a82}

        .j-cal-weekdays{
          display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:8px;
          font-family:'DM Mono';font-size:9px;letter-spacing:1px;color:var(--j-soft);
          text-transform:uppercase;text-align:center
        }
        .j-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:14px}
        .j-cal-cell{
          min-height:80px;border:1px solid var(--j-line);border-radius:2px;padding:8px;
          display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;
          cursor:pointer;text-align:left;position:relative;overflow:hidden;transition:.15s;width:100%
        }
        .j-cal-cell:hover{border-color:rgba(255,255,255,.4)}
        .j-cal-cell.empty{border-color:transparent!important;background:transparent!important;cursor:default;pointer-events:none}
        .j-cal-cell.today{outline:1px dashed rgba(255,255,255,.45);outline-offset:-1px}
        .j-cal-day{font-family:'DM Mono';font-size:11px;font-weight:600}
        .j-cal-content{display:flex;flex-direction:column;gap:3px;margin-top:auto;width:100%}
        .j-cal-pl{font-family:'DM Mono';font-size:10px;font-weight:700}
        .j-cal-count{font-family:'DM Mono';font-size:8px;color:var(--j-soft)}
        .j-cal-mini{display:flex;gap:4px;flex-wrap:wrap}
        .j-cal-mini span{
          font-family:'DM Mono';font-size:7px;padding:1px 4px;border:1px solid rgba(255,255,255,.13);border-radius:2px
        }
        .j-cal-legend{display:flex;gap:16px;margin-top:4px;flex-wrap:wrap}
        .j-cal-legend span{display:flex;align-items:center;gap:6px;font-size:9px;letter-spacing:1px;text-transform:uppercase}
        .j-cal-legend i{width:10px;height:10px;border-radius:2px;display:block}
        .j-cal-nav{
          width:26px;height:26px;display:flex;align-items:center;justify-content:center;
          border:1px solid rgba(255,255,255,.2);cursor:pointer;font-family:'DM Mono';font-size:11px
        }
        .j-cal-trade-row{
          display:flex;align-items:center;gap:10px;padding:9px 11px;
          border:1px solid var(--j-line);border-radius:2px;flex-wrap:wrap
        }
        .j-cal-empty-note,.j-open-edit-note{
          border:1px dashed rgba(255,255,255,.18);border-radius:2px;padding:10px 12px;
          font-family:'DM Mono';font-size:10px;color:var(--j-soft);text-align:center;line-height:1.8
        }
        .j-open-edit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}

        /* ---------- Mobile bottom navigation ---------- */
        .j-mobile-nav{display:none}
        .j-mobile-brand{display:none}

        /* ---------- Wide desktop scale-up (large monitors) ---------- */
        @media(min-width:1400px){
          .j-app-main .j-shinobi-header{min-height:150px;padding:32px 40px!important}
          .j-brand-mark{width:64px;height:64px}
          .j-brand-logo-img{height:62px}
          .j-brand-sub{font-size:9px;letter-spacing:2.4px}
          .j-brand-kicker{font-size:9px;margin-bottom:10px}
          .j-mantra{max-width:420px;font-size:9px}
          .j-mantra strong{font-size:10.5px}
          .j-kanji-quote{max-width:240px}
          .j-kanji-quote-mark{font-size:32px}
          .j-kanji-quote-jp{font-size:19px}
          .j-kanji-quote-en{font-size:8px}
          .j-execution-heading{font-size:52px}
          .j-execution-sub{font-size:13px}
          .j-sidebar-hero{height:460px}

        @media(max-width:980px){
          .j-app-frame{grid-template-columns:78px minmax(0,1fr)}
          .j-sidebar{padding:20px 10px 15px}
          .j-sidebar-brand{display:flex;justify-content:center;padding:0 0 18px}
          .j-sidebar-brand-top{font-size:0;letter-spacing:0}
          .j-sidebar-brand-top:after{content:'忍';font-family:serif;font-size:29px;color:#fff}
          .j-sidebar-brand-mark{display:none}
          .j-sidebar-code,.j-sidebar-footer,.j-sidebar-hero{display:none}
          .j-side-btn{justify-content:center;padding:11px 6px}
          .j-side-btn span:last-child{display:none}
          .j-side-icon{font-size:19px}
          .j-app-main .j-header-wrap{padding:12px 16px 0!important}
          .j-page-shell{padding:15px 16px 30px!important}
        }

        @media(max-width:680px){
          .j-root{padding-bottom:68px}
          .j-root::after{font-size:220px;right:-35px;bottom:20px}
          .j-page-footer{margin-top:18px;padding-top:12px;gap:8px}
          .j-page-footer span{font-size:6.5px;letter-spacing:1.4px}
          .j-page-footer i{width:14px}
          .j-app-frame{display:block}
          .j-sidebar{
            position:sticky;top:0;height:57px;min-height:57px;width:100%;
            z-index:100;border:0;border-bottom:1px solid rgba(255,255,255,.16);
            padding:0 10px;background:rgba(4,5,5,.94);backdrop-filter:blur(14px)
          }
          .j-sidebar-brand{
            display:flex;align-items:center;justify-content:flex-start;height:57px;padding:0;border:0
          }
          .j-sidebar-brand-top{font-size:13px!important;letter-spacing:3px!important;line-height:1!important}
          .j-sidebar-brand-top:after{display:none}
          .j-sidebar-brand-mark{
            display:block;width:25px;height:25px;margin:0 0 0 8px
          }
          .j-sidebar-code,.j-sidebar-footer,.j-sidebar-hero{display:none}
          .j-side-nav{
            position:absolute;right:7px;top:7px;margin:0;display:flex;flex-direction:row;gap:3px;
            overflow:visible
          }
          .j-side-btn{
            width:36px;height:42px;min-height:42px;padding:0;justify-content:center;
            border-radius:2px;background:transparent
          }
          .j-side-btn span:last-child{display:none}
          .j-side-icon{font-size:16px;width:auto;flex:0 0 auto}
          .j-side-btn.active{box-shadow:none;background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.34)}
          .j-app-main{width:100%}
          .j-app-main .j-header-wrap{padding:9px 8px 0!important}
          .j-app-main .j-page-shell{padding:9px 8px 20px!important}
          .j-app-main .j-header-wrap > .j-win{width:100%!important}
          .j-app-main .j-shinobi-header{
            display:block;min-height:auto;padding:17px 15px!important
          }
          .j-brand{gap:9px}
          .j-brand-mark{width:39px;height:39px}
          .j-brand-logo-img{height:34px}
          .j-brand-sub{font-size:6px;letter-spacing:1px;margin-top:5px;white-space:nowrap}
          .j-brand-kicker{font-size:6px;letter-spacing:1.8px;margin-bottom:7px}
          .j-mantra{
            margin-top:13px;max-width:none;text-align:left;font-size:7px;line-height:1.7;
            letter-spacing:1px;padding-left:48px
          }
          .j-mantra strong{font-size:8px}
          .j-mobile-nav button{
            flex:1;border:0;background:transparent;color:#6d726f;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:3px;font-family:'Noto Sans Thai';font-size:7px;cursor:pointer
          }
          .j-mobile-nav button b{font-family:'DM Mono';font-size:17px;font-weight:400;line-height:1}
          .j-mobile-nav button.active{color:#fff}
          .j-mobile-nav button.active b{color:var(--j-red)}
          .j-cal-weekdays{font-size:7px;gap:3px}
          .j-cal-grid{gap:3px}
          .j-cal-cell{min-height:53px;padding:4px}
          .j-cal-pl{font-size:8px}
          .j-cal-count,.j-cal-mini{display:none}
          .j-cal-day{font-size:9px}
          .j-cal-summary-grid{grid-template-columns:1fr 1fr!important}
          .j-open-edit-grid,.j-open-edit-grid.two{grid-template-columns:1fr!important}
        }

        /* ---------- Ninja Mobile V3 ---------- */
        @media(max-width:680px){
          .j-root{
            padding-bottom:74px;
            background-attachment:scroll;
            background:
              linear-gradient(rgba(3,4,4,.54),rgba(3,4,4,.93)),
              url("/images/ninja-mobile-bg.webp") center top / cover fixed no-repeat,
              linear-gradient(120deg,#030404 0%,#090b0b 55%,#050606 100%);
          }
          .j-root::before{opacity:.25}
          .j-root::after{font-size:180px;right:-45px;bottom:55px;color:rgba(255,255,255,.025)}

          /* Hide desktop rail and duplicate desktop navigation. */
          .j-sidebar{display:none!important}
          .j-app-frame{display:block!important}
          .j-app-main{width:100%;min-width:0}
          .j-app-main .j-header-wrap{padding:0!important;margin:0!important}
          .j-app-main .j-header-wrap > .j-win{
            width:100%!important;max-width:none!important;margin:0!important;
            border:0!important;border-radius:0!important;
            background:transparent!important;box-shadow:none!important;
          }
          .j-app-main .j-header-wrap > .j-win > .j-bar{display:none!important}

          /* Hero header: big logo, small amount of chrome. */
          .j-app-main .j-shinobi-header{
            position:relative;display:block!important;
            min-height:205px!important;
            padding:30px 22px 24px!important;
            overflow:hidden;
            border-bottom:1px solid rgba(255,255,255,.16);
            background:
              linear-gradient(90deg,rgba(2,3,3,.92) 0%,rgba(2,3,3,.58) 58%,rgba(2,3,3,.24) 100%),
              radial-gradient(circle at 82% 35%,rgba(210,31,43,.14),transparent 32%);
          }
          .j-app-main .j-shinobi-header::before{
            content:"";position:absolute;inset:0;pointer-events:none;
            background:linear-gradient(180deg,transparent 52%,rgba(0,0,0,.78) 100%);
          }
          .j-app-main .j-shinobi-header::after{
            content:"忍";position:absolute;right:-12px;top:8px;
            font-family:serif;font-size:145px;line-height:1;
            color:rgba(255,255,255,.035);transform:rotate(-8deg);pointer-events:none;
          }
          .j-app-main .j-shinobi-header > div{position:relative;z-index:1}

          .j-brand-kicker{font-size:7px!important;letter-spacing:3px!important;margin-bottom:13px!important;color:#a0a4a2!important}
          .j-brand{gap:13px!important;align-items:center!important}
          .j-brand-mark{
            width:54px!important;height:54px!important;border-width:1.5px!important;
            box-shadow:0 0 22px rgba(210,31,43,.22);
          }
          .j-brand-logo-img{
            height:60px!important;width:auto!important;
            max-width:calc(100vw - 120px)!important;
          }
          .j-brand-sub{
            margin-top:8px!important;font-size:7px!important;
            letter-spacing:1.45px!important;white-space:normal!important;
            line-height:1.6!important;color:#b0b4b1!important;
          }

          /* Only one small useful control remains. */
          .j-app-main .j-shinobi-header > div:nth-child(2){
            display:block!important;position:absolute!important;
            right:18px!important;bottom:18px!important;width:auto!important;
          }
          .j-app-main .j-shinobi-header > div:nth-child(2) > div:first-child,
          .j-mantra,.j-theme-label{display:none!important}

          .j-quote-strip,.j-tabs-wrap{display:none!important}

          /* New Execution row. */
          .j-page-shell{
            max-width:none!important;width:100%!important;margin:0!important;
            padding:0 12px 22px!important;
          }
          .j-page-shell > .j-tabcontent{width:100%!important;max-width:none!important}
          .j-page-shell > .j-tabcontent > .flex.items-center.gap-3{
            margin:0 -12px 10px!important;padding:12px 15px 8px!important;
            min-height:48px;border-bottom:1px solid rgba(255,255,255,.12);
          }
          .j-page-shell > .j-tabcontent > .flex.items-center.gap-3 .j-chip{
            border:0!important;background:transparent!important;padding:4px!important;
            font-size:0!important;box-shadow:none!important;
          }
          .j-page-shell > .j-tabcontent > .flex.items-center.gap-3 .j-chip::before{
            content:"☰";display:block;font-family:'DM Mono',monospace;
            font-size:23px;line-height:1;color:#eee;
          }
          .j-page-shell > .j-tabcontent > .flex.items-center.gap-3 > div{
            font-size:9px!important;letter-spacing:3px!important;
            color:var(--j-red)!important;font-weight:700;
          }
          .j-page-shell > .j-tabcontent > .flex.items-center.gap-3 > div::before{
            content:"—";margin-right:8px;color:var(--j-red);
          }

          /* Main trade card. */
          .j-page-shell > .j-tabcontent > .j-win{
            width:100%!important;max-width:none!important;margin:0!important;
            border:1px solid rgba(255,255,255,.24)!important;border-radius:10px!important;
            background:linear-gradient(145deg,rgba(5,7,7,.93),rgba(2,3,3,.86))!important;
            box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;
          }
          .j-page-shell > .j-tabcontent > .j-win > .j-bar{
            padding:10px 12px!important;min-height:38px;background:rgba(255,255,255,.025)!important;
          }
          .j-page-shell > .j-tabcontent > .j-win > .j-body{padding:20px 16px 16px!important}
          .j-execution-title{font-size:8px!important;letter-spacing:2.4px!important;color:#c8ccca!important}
          .j-execution-heading{font-size:34px!important;line-height:1.15!important;margin-top:5px!important;letter-spacing:-.7px!important}
          .j-execution-sub{font-size:10px!important;line-height:1.8!important;color:#969b98!important}
          .j-kanji-quote{display:block!important;position:absolute!important;right:18px!important;top:18px!important;opacity:.9}
          .j-kanji-quote-mark{font-size:25px!important}
          .j-kanji-quote-jp{font-size:15px!important}
          .j-kanji-quote-en{font-size:6px!important;letter-spacing:1px!important}
          .j-ninja-divider{margin:15px 0 17px!important}
          .j-page-shell .j-in{
            min-height:48px!important;border-radius:6px!important;
            background:rgba(2,4,4,.72)!important;border-color:rgba(255,255,255,.22)!important;
          }
          .j-page-shell .j-lab{font-size:8px!important;letter-spacing:1.5px!important;color:#c2c6c4!important}
          .j-result-btn{min-height:44px!important;border-radius:6px!important}
          textarea.j-in{min-height:105px!important}
          .j-upload-box{min-height:150px!important;border-radius:7px!important;background:rgba(2,4,4,.52)!important}
          .j-save-primary{min-height:50px!important;font-size:13px!important;border-radius:7px!important}

          /* Primary mobile navigation only. */
          .j-mobile-nav{
            height:68px!important;background:rgba(3,4,4,.94)!important;
            border-top:1px solid rgba(255,255,255,.16)!important;
            box-shadow:0 -12px 35px rgba(0,0,0,.35);
          }
          .j-mobile-nav button{font-size:7px!important;gap:4px!important}
          .j-mobile-nav button b{font-size:19px!important}
          .j-mobile-nav button.active b{
            color:var(--j-red)!important;filter:drop-shadow(0 0 7px rgba(210,31,43,.5));
          }
        }

        @media(min-width:681px){
          .j-mobile-nav{display:none!important}
        }

        @media(max-width:390px){
          .j-brand-logo-img{height:51px!important;max-width:calc(100vw - 108px)!important}
          .j-brand-mark{width:48px!important;height:48px!important}
          .j-brand-sub{font-size:6.3px!important;letter-spacing:1.15px!important}

        /* Small utility animation */
        @keyframes blink{50%{opacity:.65}}
        @keyframes savepulse{0%,100%{box-shadow:none}50%{box-shadow:0 0 22px rgba(255,255,255,.14)}}
        .j-saving{animation:savepulse .2s steps(2,end) 4}
        .open-badge{animation:blink .8s step-end infinite}
      `}</style>
      {/* Boot */}
      {booting&&(<div className={`j-boot ${bootDone?"done":""}`}><div className="j-boot-logo">YOKIMURA</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:"#c0e6d4",minHeight:40,whiteSpace:"pre"}}>{bootText}<span className="j-boot-cursor"/></div><div className="j-boot-bar"><div className="j-boot-fill"/></div><div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#8b8f8e",opacity:.8,letterSpacing:2}}>YOKIMURA SHINOBI · WYCKOFF · TRUST YOUR PROCESS</div></div>)}
      <div className="j-ink-decoration left">忍</div>
      <div className="j-ink-decoration right">継</div>
      <div className="j-bamboo" aria-hidden="true"></div>
      <div className="j-app-frame">
        <aside className="j-sidebar" aria-label="Yokimura Shinobi navigation">
          <div className="j-sidebar-brand">
            <div>
              <div className="j-sidebar-brand-top">TRADING<br/>JOURNAL</div>
              <img src="/images/badge.webp" alt="忍" className="j-sidebar-brand-mark"/>
            </div>
          </div>

          <div className="j-sidebar-code">
            DISCIPLINE<br/>
            CREATES<br/>
            FREEDOM
          </div>

          <nav className="j-side-nav">
            <button onClick={()=>setView("checklist" as any)} className={`j-side-btn ${view==="checklist"?"active":""}`}>
              <span className="j-side-icon">✎</span><span>บันทึกการเทรด</span>
            </button>
            <button onClick={()=>setView("dashboard")} className={`j-side-btn ${view==="dashboard"?"active":""}`}>
              <span className="j-side-icon">▮</span><span>ภาพรวม</span>
            </button>
            <button onClick={()=>setView("calendar" as any)} className={`j-side-btn ${view==="calendar"?"active":""}`}>
              <span className="j-side-icon">▦</span><span>ปฏิทิน</span>
            </button>
            <button onClick={()=>setView("list")} className={`j-side-btn ${view==="list"?"active":""}`}>
              <span className="j-side-icon">◔</span><span>สถิติ</span>
            </button>
            <button onClick={()=>setView("dashboard")} className="j-side-btn">
              <span className="j-side-icon">♜</span><span>เป้าหมาย</span>
            </button>
          </nav>

          <div className="j-sidebar-hero" aria-hidden="true">
            <img src="/images/ninja-hero.webp" alt="" className="j-sidebar-hero-img"/>
            <div className="j-sidebar-hero-fade"/>
          </div>

          <div className="j-sidebar-footer">
            <div className="j-sidebar-footer-main">BETTER<br/>TRADER<br/>THAN<br/>YESTERDAY</div>
            <div className="j-sidebar-footer-sub">YOKIMURA SHINOBI</div>
            <div className="j-sidebar-line"/>
          </div>
        </aside>

        <section className="j-app-main">
      {/* Header — Yokimura Shinobi */}
      <div className="j-header-wrap" style={{padding:"14px 12px 0"}}>
        <div className="j-win" style={{maxWidth:780,margin:"0 auto"}}>
          <div className="j-bar" style={{background:"rgba(255,255,255,.025)"}}>
            <span className="j-t">忍 YOKIMURA SHINOBI — TRADING JOURNAL / WYCKOFF</span>
            <span className="j-ctrl">
              <span>_</span><span>▢</span>
              <Link href="/" style={{textDecoration:"none",color:"var(--j-ink)"}}><span>✕</span></Link>
            </span>
          </div>

          <div className="j-body j-shinobi-header">
            <div>
              <div className="j-brand-kicker">TRADER JOURNAL · 01 / DISCIPLINE SYSTEM</div>
              <div className="j-brand">
                <img src="/images/badge.webp" alt="忍" className="j-brand-mark"/>
                <div>
                  <img src="/images/yokimura-logo.webp" alt="YOKIMURA SHINOBI" className="j-brand-logo-img"/>
                  <div className="j-brand-sub">PRACTICE · PATIENCE · DISCIPLINE · FOR THE FAMILY.</div>
                </div>
              </div>
            </div>

            <div>
              <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{position:"relative",width:30,height:30,borderRadius:"50%",border:"1px solid rgba(255,255,255,.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>
                  🔔
                  <span style={{position:"absolute",top:2,right:2,width:6,height:6,borderRadius:"50%",background:"var(--j-red)"}}/>
                </div>
                <img src="/images/badge.webp" alt="忍" style={{width:34,height:34,borderRadius:"50%",border:"1px solid rgba(255,255,255,.28)",objectFit:"cover"}}/>
              </div>
              <div className="j-mantra">
                <strong>"SMALL DISCIPLINES MAKE A BIG DIFFERENCE."</strong>
                PRACTICE. PATIENCE. DISCIPLINE.<br/>
                <span>FOR THE FAMILY.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="j-quote-strip">
          <i/>
          <span>YOKIMURA SHINOBI</span>
          <b>PRACTICE · PATIENCE · DISCIPLINE · FOR THE FAMILY.</b>
        </div>

        {/* Tabs */}
        <div className="j-tabs-wrap">
          {([["dashboard","◫ Dashboard"],["list","▤ Sessions"]] as const).map(([v,label])=>(
            <button key={v} onClick={()=>setView(v)} className={`j-tab ${view===v?"on":""}`}>{label}</button>
          ))}
          <button onClick={()=>setView("calendar" as any)} className={`j-tab ${view==="calendar"?"on":""}`}>▦ Calendar</button>
          {openTrade&&!isLockedFromTrading&&(
            <button onClick={()=>setView("exit")} className={`j-tab ${view==="exit"?"on":""}`} style={{color:"#c9232c",fontWeight:700}}>
              ● OPEN TRADE
            </button>
          )}
        </div>
      </div>
      {/* Pixel sparkle */}
      <div style={{position:"fixed",top:"50%",left:"50%",pointerEvents:"none",zIndex:1000}}>
        {pixels.map(p=>(<div key={p.id} className="j-pixel" style={{"--px":`${p.x}px`,"--py":`${p.y}px`,background:p.c} as any}/>))}
      </div>
      <div className="j-page-shell" style={{maxWidth:780,margin:"0 auto",padding:"16px 12px 0"}}>
        {/* ── DASHBOARD ── */}
        {view==="dashboard"&&(
          <div className="space-y-4 j-tabcontent j-dashboard">
            <DailyStatusBar status={dailyStatus} cooldownRemainingMs={cooldownRemainingMs} isHardLockToday={isHardLockToday} isForcedLockToday={isForcedLockToday}/>
            {needsReflection && !showReflection && (
              <button onClick={()=>setShowReflection(true)} className="j-btn w-full" style={{padding:12,background:"var(--j-coral)",fontSize:13}}>
                ✎ ยังไม่ได้เขียนบทเรียนวันนี้ — กดเพื่อเขียน
              </button>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="j-stat"><div className="j-num">{stats.winRate.toFixed(0)}%</div><div className="j-statlab">Win Rate</div></div>
              <div className="j-stat"><div className="j-num">{money(stats.totalPL)}</div><div className="j-statlab">Total P/L</div></div>
              <div className="j-stat"><div className="j-num">{stats.total}</div><div className="j-statlab">Sessions</div></div>
              <div className="j-stat"><div className="j-num">{stats.avgRR.toFixed(1)}R</div><div className="j-statlab">Avg R:R</div></div>
            </div>
            <Win title="📈 EQUITY + DRAWDOWN" color="var(--j-red)"><PLChart trades={trades}/></Win>
            {/* Roadmap mini */}
            {(()=>{
              const eq=Math.max(0,STARTING_CAPITAL+stats.totalPL);
              const ph=PHASES.find(p=>eq<p.to)||PHASES[PHASES.length-1];
              const pct=Math.min(100,Math.max(0,((eq-ph.from)/(ph.to-ph.from))*100));
              return (
                <Win title="🎯 ROADMAP" color="var(--j-red)" controls={false}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:28}}>${eq.toFixed(2)}</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",alignSelf:"flex-end"}}>{ph.label} · {pct.toFixed(0)}%</span>
                  </div>
                  <div style={{height:12,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",background:"var(--j-win)"}}>
                    <div style={{height:"100%",background:ph.color,width:`${pct}%`,transition:"width .4s"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)"}}>
                    <span>${ph.from}</span><span>→ ${ph.to.toLocaleString()}</span>
                  </div>
                </Win>
              );
            })()}
            <WeeklyGoals trades={trades}/>
            <AchievementBadges trades={trades}/>
            <RoadmapWidget trades={trades}/>
            <Win title="🕘 RECENT" color="var(--j-peach)">
              {trades.filter(t=>t.status==="CLOSED").slice(0,5).map(t=>(
                <div key={t.id} className="flex items-center gap-2 py-2" style={{borderBottom:"1.5px dashed #e3d9c4"}}>
                  <span className="j-mini" style={{background:getModeInfo(t.mode).color,fontSize:10}}>{getModeInfo(t.mode).emoji} {t.mode.replace("_"," ")}</span>
                  <span className="j-mini" style={{background:t.direction==="LONG"?"var(--j-mint)":"var(--j-coral)",fontSize:10}}>{t.direction}</span>
                  <div className="flex-1 min-w-0"><div style={{fontSize:11,fontWeight:600}}>{t.date} · {t.session}</div></div>
                  {t.screenshotUrl&&<span title="screenshot" style={{cursor:"zoom-in"}} onClick={()=>setLightbox(t.screenshotUrl)}>🖼</span>}
                  <b style={{fontFamily:"'DM Mono'",color:t.totalPL>=0?"#5fae89":"#e08a82",fontSize:13}}>{money(t.totalPL)}</b>
                </div>
              ))}
              {!trades.filter(t=>t.status==="CLOSED").length&&<p className="text-center py-6" style={{color:"var(--j-soft)",fontSize:13}}>No sessions yet</p>}
            </Win>
          </div>
        )}
        {/* ── LIST ── */}
        {view==="list"&&(
          <div className="space-y-3 j-tabcontent">
            <div className="flex gap-2 items-center flex-wrap">
              {(["ALL","WIN","LOSS","BE"] as const).map(r=>(<button key={r} onClick={()=>setFilter(r)} className={`j-chip ${filter===r?"":"off"}`} style={filter===r?{background:r==="WIN"?"var(--j-mint)":r==="LOSS"?"var(--j-coral)":r==="BE"?"var(--j-lav)":"var(--j-butter)"}:{}}>{r}</button>))}
              <span className="ml-auto" style={{fontSize:11,color:"var(--j-soft)",fontFamily:"'DM Mono'"}}>{filtered.length} sessions</span>
            </div>
            {filtered.map(t=>(
              <div key={t.id} className="j-win">
                <div className="j-bar" style={{background:t.result==="WIN"?"var(--j-mint)":t.result==="LOSS"?"var(--j-pink)":"var(--j-lav)"}}>
                  <span className="j-t">{getModeInfo(t.mode).emoji} {getModeInfo(t.mode).label} · {t.direction}</span>
                  <span style={{fontFamily:"'DM Mono'",fontSize:10}}>{t.date}</span>
                </div>
                <div className="j-body">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="j-mini" style={{background:t.result==="WIN"?"var(--j-mint)":t.result==="LOSS"?"var(--j-coral)":"var(--j-lav)",boxShadow:"2px 2px 0 var(--j-ink)"}}>{t.result==="WIN"?"✓ WIN":t.result==="LOSS"?"✕ LOSS":"= BE"}</span>
                    <span style={{fontFamily:"'DM Mono'",fontSize:10,color:"var(--j-soft)"}}>{t.time} · {t.session}</span>
                    <span style={{fontFamily:"'DM Mono'",fontSize:10,color:"var(--j-soft)"}}>{t.emotion}</span>
                    <b className="ml-auto" style={{fontFamily:"'DM Mono'",fontSize:15,color:t.totalPL>=0?"#5fae89":"#e08a82"}}>{money(t.totalPL)}</b>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2" style={{fontSize:11,fontFamily:"'DM Mono'"}}>
                    <div><span style={{color:"var(--j-soft)"}}>Entry </span><b>{t.entryPrice}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>Avg </span><b>{t.avgExit.toFixed(3)}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>R:R </span><b>{t.rr?`${t.rr.toFixed(1)}R`:"-"}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>Lot </span><b>{t.lotPerOrder}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>SL </span><b style={{color:"#e08a82"}}>{t.slPrice}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>Exit </span><b>{t.exitReason||"-"}</b></div>
                  </div>
                  {(t.screenshotBeforeUrl||t.screenshotAfterUrl||t.screenshotUrl)&&(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>{(t.screenshotBeforeUrl||t.screenshotUrl)&&<img src={t.screenshotBeforeUrl||t.screenshotUrl} alt="before" onClick={()=>setLightbox(t.screenshotBeforeUrl||t.screenshotUrl)} style={{width:"100%",height:140,objectFit:"cover",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in"}}/>}{t.screenshotAfterUrl&&<img src={t.screenshotAfterUrl} alt="after" onClick={()=>setLightbox(t.screenshotAfterUrl||"")} style={{width:"100%",height:140,objectFit:"cover",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in"}}/>}</div>)}
                  {t.notes&&<p style={{fontFamily:"'DM Mono'",fontSize:12,borderTop:"1.5px dashed #d8cdbd",paddingTop:8}}>"{t.notes}"</p>}
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10,paddingTop:10,borderTop:"1.5px dashed #e3d9c4"}}>
                    <button onClick={()=>editTrade(t)} className="j-chip" style={{fontSize:11,background:"var(--j-butter)",padding:"5px 10px"}}>✎ แก้ไข</button>
                    <button onClick={()=>deleteTrade(t)} className="j-chip" style={{fontSize:11,background:"var(--j-coral)",padding:"5px 10px"}}>🗑 ลบ</button>
                  </div>
                </div>
              </div>
            ))}
            {!filtered.length&&<p className="text-center py-10" style={{color:"var(--j-soft)"}}>No sessions</p>}
          </div>
        )}
        {/* ── WYCKOFF JOURNAL ── */}
        {view==="checklist"&&(
          <div className="space-y-4 j-tabcontent" style={{maxWidth:780,margin:"0 auto"}}>
            <div className="flex items-center gap-3">
              <button onClick={()=>setView("dashboard")} className="j-chip off" style={{fontSize:12}}>← Cancel</button>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)"}}>NEW EXECUTION</div>
            </div>
            <Win title="忍  NEW EXECUTION · WYCKOFF" color="rgba(255,255,255,.035)">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 260px"}}>
                  <div className="j-execution-title">YOKIMURA SHINOBI / TRADE RECORD</div>
                  <div className="j-execution-heading">บันทึกการฝึก</div>
                  <div className="j-execution-sub">บันทึกทุกการเทรด เพื่อพัฒนาตัวเองในวันพรุ่งนี้</div>
                </div>
                <div className="j-kanji-quote">
                  <span className="j-kanji-quote-mark">"</span>
                  <div className="j-kanji-quote-jp">継続は力なり</div>
                  <div className="j-kanji-quote-en">CONSISTENCY IS POWER</div>
                </div>
              </div>
              <div className="j-ninja-divider" style={{margin:"14px 0 16px"}}/>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="j-lab">วันที่</label><input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} className="j-in"/></div>
                <div><label className="j-lab">สินทรัพย์</label><select value={asset} onChange={e=>setAsset(e.target.value)} className="j-in"><option value="XAUUSD">XAUUSD</option><option value="BTCUSD">BTCUSD</option><option value="EURUSD">EURUSD</option><option value="GBPUSD">GBPUSD</option><option value="NAS100">NAS100</option><option value="US30">US30</option><option value="OTHER">อื่นๆ</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="j-lab">Session</label><select value={session} onChange={e=>setSession(e.target.value as Session)} className="j-in">{SESSIONS.map(s=><option key={s}>{s}</option>)}</select></div>
                <div><label className="j-lab">Timeframe</label><select value={timeframe} onChange={e=>setTimeframe(e.target.value)} className="j-in"><option>15s</option><option>1m</option><option>5m</option><option>15m</option><option>1H</option><option>4H</option><option>Daily</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="j-lab">Setup</label><select value="WYCKOFF" className="j-in"><option value="WYCKOFF">Wyckoff</option></select></div>
                <div>
  <label className="j-lab">ผลลัพธ์</label>
  <div className="j-result-row">
    {(["WIN","LOSS","BE"] as const).map(r=>(
      <button
        key={r}
        type="button"
        onClick={()=>{setWyResult(r);setWyRR(r==="WIN"?"1":r==="LOSS"?"-1":"0");}}
        className={`j-result-btn ${r==="LOSS"?"loss":r==="BE"?"be":""} ${wyResult===r?"active":""}`}
      >
        {r==="WIN"?"✓ WIN":r==="LOSS"?"✕ LOSS":"= BE"}
      </button>
    ))}
  </div>
</div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="j-lab">RR</label><input value={wyRR+"R"} readOnly className="j-in" style={{fontWeight:700,color:wyResult==="WIN"?"#5fae89":wyResult==="LOSS"?"#d4685f":"var(--j-soft)"}}/><div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginTop:4}}>ระบบ 1:1 · Win = +1R · Loss = -1R · BE = 0R</div></div>
                <div><label className="j-lab">Grade</label><select value={grade} onChange={e=>setGrade(e.target.value)} className="j-in"><option>A+</option><option>A</option><option>B+</option><option>B</option><option>C</option><option>D</option></select></div>
              </div>
              <label className="j-lab">เหตุผล / บทเรียน</label>
              <textarea value={wyNotes} onChange={e=>setWyNotes(e.target.value)} rows={3} placeholder="เห็นอะไร เข้าเพราะอะไร สิ่งที่ทำได้ดี / สิ่งที่ต้องแก้..." className="j-in mb-3" style={{resize:"none",fontSize:13,fontFamily:"'Fredoka'"}}/>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[{key:"before",label:"ภาพก่อนเข้า",url:beforeScreenshotUrl,set:setBeforeScreenshotUrl},{key:"after",label:"ภาพหลังจบ",url:afterScreenshotUrl,set:setAfterScreenshotUrl}].map(item=>(
                  <div key={item.key} className="j-upload-box">
                    <label className="j-lab" style={{textAlign:"center",display:"block"}}>{item.key==="before"?"ก่อน":"หลัง"}</label>
                    <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:13,fontWeight:600,textAlign:"center",marginBottom:6}}>{item.label}</div>
                    {item.url ? <div><img src={item.url} alt={item.label} onClick={()=>setLightbox(item.url)} style={{width:"100%",height:150,objectFit:"cover",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in"}}/><button onClick={()=>item.set("")} className="j-chip mt-2" style={{fontSize:10,background:"var(--j-coral)",width:"100%"}}>🗑 ลบรูป</button></div> : <label className="j-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:12,background:item.key==="before"?"var(--j-sky)":"var(--j-mint)",fontSize:12,cursor:uploading?"wait":"pointer",marginTop:12}}>{uploading?"⌛ Uploading...":"📎 อัพรูป"}<input type="file" accept="image/*" disabled={uploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadJournalImage(f,item.key as "before"|"after");}}/></label>}
                  </div>
                ))}
              </div>
              <div style={{background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.14)",borderRadius:2,padding:"9px 12px",marginBottom:12,fontFamily:"'DM Mono',monospace",fontSize:9,textAlign:"center",letterSpacing:1}}>Wyckoff · {asset} · {timeframe} · {session} · {wyResult} · {wyRR}R · {grade}</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={resetWyckoffForm} disabled={saving} className="j-btn" style={{flex:"0 0 34%",padding:14,background:"transparent",border:"1px solid rgba(255,255,255,.28)",color:"var(--j-ink)",fontSize:13}}>↻ ล้างแบบฟอร์ม</button>
                <button onClick={saveWyckoffTrade} disabled={isLockedFromTrading||saving||!entryDate||!asset||!wyResult} className={`j-btn j-save-primary ${saving?"j-saving":""}`} style={{flex:1,padding:14,fontSize:15}}>{saving?"💾 SAVING...":"💾 บันทึกการฝึก"}</button>
              </div>
            </Win>
          </div>
        )}
        {/* ── EXIT (Post-Exit) ── */}
        {view==="exit"&&openTrade&&(
          <div className="space-y-4 j-tabcontent" style={{maxWidth:560,margin:"0 auto"}}>
            {/* Open trade editor */}
            <div className="j-win">
              <div className="j-bar" style={{background:getModeInfo(openTrade.mode).color}}>
                <span className="j-t">🟡 OPEN EDIT: {getModeInfo(openTrade.mode).emoji} {getModeInfo(openTrade.mode).label} · {openTrade.direction}</span>
                <span className="j-ctrl"><span>✎</span></span>
              </div>
              <div className="j-body">
                <div className="j-open-edit-grid">
                  <div>
                    <label className="j-lab">Date</label>
                    <input type="date" value={openTrade.date} onChange={e=>updateOpenTradePatch({date:e.target.value})} className="j-in" style={{fontSize:11}}/>
                  </div>
                  <div>
                    <label className="j-lab">Time 24H</label>
                    <input type="time" step="60" value={String(openTrade.time||"00:00").slice(0,5)} onChange={e=>{const t=e.target.value.slice(0,5); updateOpenTradePatch({time:t,session:autoSessionFromTime(t)});}} className="j-in" style={{fontSize:11}}/>
                  </div>
                  <div>
                    <label className="j-lab">Session</label>
                    <select value={openTrade.session} onChange={e=>updateOpenTradePatch({session:e.target.value as Session})} className="j-in" style={{fontSize:11}}>
                      {SESSIONS.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="j-open-edit-grid" style={{marginTop:10}}>
                  <div>
                    <label className="j-lab">Direction</label>
                    <select value={openTrade.direction} onChange={e=>updateOpenTradePatch({direction:e.target.value as Direction})} className="j-in" style={{fontSize:11}}>
                      <option value="LONG">LONG</option>
                      <option value="SHORT">SHORT</option>
                    </select>
                  </div>
                  <div>
                    <label className="j-lab">Mode</label>
                    <select value={openTrade.mode} onChange={e=>updateOpenTradePatch({mode:e.target.value as TradeMode})} className="j-in" style={{fontSize:11}}>
                      {(Object.keys(MODE_INFO) as TradeMode[]).map(m=><option key={m} value={m}>{MODE_INFO[m].label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="j-lab">Emotion</label>
                    <select value={openTrade.emotion} onChange={e=>updateOpenTradePatch({emotion:e.target.value as Emotion})} className="j-in" style={{fontSize:11}}>
                      {EMOTIONS.map(e=><option key={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
                <div className="j-open-edit-grid" style={{marginTop:10}}>
                  <div>
                    <label className="j-lab">Entry</label>
                    <input type="number" step="0.001" value={openTrade.entryPrice || ""} onChange={e=>updateOpenTradePatch({entryPrice:Number(e.target.value||0)})} className="j-in"/>
                  </div>
                  <div>
                    <label className="j-lab">SL</label>
                    <input type="number" step="0.001" value={openTrade.slPrice || ""} onChange={e=>updateOpenTradePatch({slPrice:Number(e.target.value||0)})} className="j-in" style={{color:"#d4685f",fontWeight:700}}/>
                  </div>
                  <div>
                    <label className="j-lab">Lot / Order</label>
                    <input type="number" step="0.01" value={openTrade.lotPerOrder || ""} onChange={e=>{const lot=Number(e.target.value||0); updateOpenTradePatch({lotPerOrder:lot,lotInput:String(e.target.value||"")});}} className="j-in"/>
                  </div>
                </div>
                <div className="j-open-edit-note">
                  แก้ตรงนี้แล้วบันทึกทันทีในเครื่อง · ถ้าใส่ Exit price ไว้แล้ว ค่า P/L preview จะคำนวณใหม่ตาม Entry / SL / Lot ล่าสุด
                </div>
              </div>
            </div>
            {/* Exit prices */}
            <Win title="📤 EXIT PRICES" color="var(--j-mint)">
              <div className="flex gap-2 mb-3">
                <input type="number" step="0.001" value={exitInput} placeholder="exit price" onChange={e=>setExitInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addExit()} className="j-in flex-1"/>
                <button onClick={addExit} className="j-btn" style={{padding:"0 16px",background:"var(--j-mint)",fontSize:13}}>+ Add</button>
              </div>
              <label className="j-lab">Or paste many</label>
              <div className="flex gap-2 mb-3">
                <textarea value={pasteInput} placeholder={"4177.027\n4178.018"} rows={2} onChange={e=>setPasteInput(e.target.value)} className="j-in flex-1" style={{resize:"none",fontSize:12}}/>
                <button onClick={parsePaste} className="j-btn self-end" style={{padding:"9px 11px",background:"var(--j-butter)",fontSize:11}}>Paste</button>
              </div>
              {exitPrices.length>0&&(
                <div style={{background:"#fbf6ea",border:"2px solid var(--j-ink)",borderRadius:7,padding:10}}>
                  <div className="flex justify-between mb-2">
                    <span style={{fontSize:10,color:"var(--j-soft)",fontFamily:"'DM Mono'"}}>{exitPrices.length} orders</span>
                    <button onClick={()=>setExitPrices([])} style={{fontSize:10,color:"#e08a82",cursor:"pointer",background:"none",border:"none"}}>clear all</button>
                  </div>
                  {exitPrices.map((ex,i)=>{
                    const pl=calcPL(openTrade.direction,openTrade.entryPrice,ex,openTrade.lotPerOrder,isCent);
                    return (<div key={i} className="flex gap-2 py-0.5" style={{fontFamily:"'DM Mono'",fontSize:12}}>
                      <span style={{color:"var(--j-soft)",width:16}}>{i+1}.</span>
                      <span className="flex-1" style={{fontWeight:700}}>{ex}</span>
                      <b style={{color:pl>=0?"#5fae89":"#e08a82"}}>{money(pl)}</b>
                      <button onClick={()=>setExitPrices(p=>p.filter((_,j)=>j!==i))} style={{color:"var(--j-soft)",cursor:"pointer",background:"none",border:"none"}}>✕</button>
                    </div>);
                  })}
                  <div style={{borderTop:"1.5px dashed #d8cdbd",marginTop:6,paddingTop:6,fontFamily:"'DM Mono'",fontSize:12}}>
                    <div className="flex justify-between items-center"><span style={{color:"var(--j-soft)"}}>Total P/L</span>
                      <b style={{fontSize:18,color:totalPages>=0?"#5fae89":"#e08a82"}}>{money(totalPages)}</b></div>
                    <div className="flex justify-between items-center mt-1"><span style={{color:"var(--j-soft)"}}>Result</span>
                      <span className="j-mini" style={{background:totalPages>0?"var(--j-mint)":totalPages<0?"var(--j-coral)":"var(--j-lav)"}}>{totalPages>0?"WIN":totalPages<0?"LOSS":"BE"}</span></div>
                  </div>
                </div>
              )}
            </Win>
            {/* Exit reason + notes */}
            <Win title="📝 DEBRIEF" color="var(--j-peach)">
              <label className="j-lab">เหตุผลที่ออก</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {EXIT_REASONS.map(r=>(
                  <button key={r} onClick={()=>setExitReason(r)} className={`j-chip ${exitReason===r?"":"off"}`}
                    style={exitReason===r?{background:r==="TP Hit"?"var(--j-mint)":r==="SL Hit"?"var(--j-coral)":"var(--j-butter)",fontSize:11}:{fontSize:11}}>{r}</button>
                ))}
              </div>
              <label className="j-lab">บทเรียน / โน้ต</label>
              <textarea value={exitNotes} onChange={e=>setExitNotes(e.target.value)} rows={3} placeholder="lessons, mistakes, what went well..." className="j-in mb-3" style={{resize:"none",fontSize:13,fontFamily:"'Fredoka'"}}/>
              <label className="j-lab">📸 Screenshot</label>
              {screenshotUrl?(
                <div>
                  <img src={screenshotUrl} alt="ss" onClick={()=>setLightbox(screenshotUrl)} style={{width:"100%",maxHeight:180,objectFit:"contain",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in",background:"#fbf6ea"}}/>
                  <button onClick={()=>setScreenshotUrl("")} className="j-chip mt-2" style={{fontSize:11,background:"var(--j-coral)"}}>🗑 Remove</button>
                </div>
              ):(
                <label className="j-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:12,background:"var(--j-sky)",fontSize:13,cursor:uploading?"wait":"pointer"}}>
                  {uploading?"⌛ Uploading...":"📎 Upload Screenshot"}
                  <input type="file" accept="image/*" disabled={uploading} style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadScreenshot(f);}}/>
                </label>
              )}
            </Win>
            <button onClick={saveClosedTrade} disabled={!exitPrices.length} className={`j-btn w-full ${saving?"j-saving":""}`} style={{padding:16,background:"var(--j-coral)",fontSize:16}}>
              {saving?"💾 SAVING...":"💾 ปิดไม้ — บันทึกสำเร็จ"}
            </button>
          </div>
        )}
      </div>
        {/* ── CALENDAR ── */}
        {(view as string)==="calendar"&&(()=>{
          const y = calRef.getFullYear();
          const m = calRef.getMonth();
          const startDow = new Date(y, m, 1).getDay();
          const daysInMonth = new Date(y, m + 1, 0).getDate();
          const pad = (n:number) => String(n).padStart(2,"0");
          const key = (d:number) => `${y}-${pad(m+1)}-${pad(d)}`;
          const monthName = new Date(y,m,1).toLocaleString("en-US",{month:"long",year:"numeric"});
          const byDate: Record<string, Trade[]> = {};
          trades.filter(t=>t.status==="CLOSED").forEach(t=>{
            const safeDate = String(t.date || "").slice(0,10);
            if(!safeDate) return;
            (byDate[safeDate] ||= []).push(t);
          });
          const cells: (number|null)[] = [];
          for(let i=0;i<startDow;i++) cells.push(null);
          for(let d=1; d<=daysInMonth; d++) cells.push(d);
          while(cells.length % 7 !== 0) cells.push(null);
          const selTrades = calSelected ? (byDate[calSelected] || []) : [];
          const selectedPL = selTrades.reduce((s,t)=>s + Number(t.totalPL || 0),0);
          const monthKey = `${y}-${pad(m+1)}`;
          const monthTrades = trades.filter(t=>t.status==="CLOSED" && String(t.date||"").startsWith(monthKey));
          const monthPL = monthTrades.reduce((s,t)=>s+Number(t.totalPL||0),0);
          const monthWins = monthTrades.filter(t=>t.result==="WIN").length;
          const monthLosses = monthTrades.filter(t=>t.result==="LOSS").length;
          const monthWinRate = monthTrades.length ? (monthWins/monthTrades.length)*100 : 0;
          const monthAvgRR = monthTrades.length ? monthTrades.reduce((s,t)=>s+Number(t.rr||0),0)/monthTrades.length : 0;
          const todayKey = new Date().toISOString().split("T")[0];
          return (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div className="j-win">
                <div className="j-bar" style={{background:"var(--j-sky)",alignItems:"center"}}>
                  <button onClick={()=>setCalRef(new Date(y,m-1,1))} className="j-cal-nav" aria-label="Previous month">◀</button>
                  <span className="j-t" style={{justifyContent:"center",fontSize:13}}>📅 {monthName}</span>
                  <button onClick={()=>setCalRef(new Date())} className="j-chip off" style={{fontSize:10,padding:"3px 8px",borderStyle:"solid"}}>Today</button>
                  <button onClick={()=>setCalRef(new Date(y,m+1,1))} className="j-cal-nav" aria-label="Next month">▶</button>
                </div>
                <div className="j-body">
                  <div className="j-cal-summary-grid">
                    <div className={`j-cal-summary-card ${monthPL>=0?"win":"loss"}`}><span>Month P/L</span><b>{monthPL>=0?"+":"-"}${Math.abs(monthPL).toFixed(2)}</b></div>
                    <div className="j-cal-summary-card"><span>Trades</span><b>{monthTrades.length}</b></div>
                    <div className="j-cal-summary-card win"><span>Win Rate</span><b>{monthWinRate.toFixed(0)}%</b></div>
                    <div className="j-cal-summary-card"><span>Avg RR</span><b>{monthAvgRR.toFixed(2)}</b></div>
                  </div>
                  <div className="j-cal-weekdays">
                    {[
                      ["S","Sun"],["M","Mon"],["T","Tue"],["W","Wed"],["T","Thu"],["F","Fri"],["S","Sat"]
                    ].map(([short,full],i)=><div key={i} title={full}>{short}</div>)}
                  </div>
                  <div className="j-cal-grid">
                    {cells.map((d,i)=>{
                      if(d===null) return <div key={i} className="j-cal-cell empty" />;
                      const k = key(d);
                      const dayTrades = byDate[k] || [];
                      const has = dayTrades.length > 0;
                      const net = dayTrades.reduce((s,t)=>s + Number(t.totalPL || 0),0);
                      const wins = dayTrades.filter(t=>t.result==="WIN").length;
                      const losses = dayTrades.filter(t=>t.result==="LOSS").length;
                      const bes = dayTrades.filter(t=>t.result==="BE").length;
                      const isWin = net > 0.0001;
                      const isLoss = net < -0.0001;
                      const isSelected = calSelected === k;
                      const isToday = todayKey === k;
                      const plText = `${net>=0?"+":"-"}$${Math.abs(net).toFixed(2)}`;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={()=>setCalSelected(isSelected ? null : k)}
                          className={`j-cal-cell ${has?"has":""} ${isWin?"win":isLoss?"loss":"be"} ${isSelected?"selected":""} ${isToday?"today":""}`}
                          title={has ? `${k} · ${plText} · ${dayTrades.length} trades` : k}
                        >
                          <span className="j-cal-day">{d}</span>
                          {has&&(
                            <span className="j-cal-content">
                              <b className="j-cal-pl">{plText}</b>
                              <span className="j-cal-count">
                                {dayTrades.length} trade{dayTrades.length>1?"s":""}
                              </span>
                              <span className="j-cal-mini">
                                {wins>0&&<span>W{wins}</span>}
                                {losses>0&&<span>L{losses}</span>}
                                {bes>0&&<span>BE{bes}</span>}
                              </span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="j-cal-legend">
                    <span><i style={{background:"var(--j-mint)"}}/> Win day</span>
                    <span><i style={{background:"var(--j-pink)"}}/> Loss day</span>
                    <span><i style={{background:"var(--j-lav)"}}/> BE day</span>
                  </div>
                </div>
              </div>
              {calSelected&&(
                <Win title={`📋 ${calSelected} · ${selTrades.length} trade${selTrades.length>1?"s":""} · ${selectedPL>=0?"+":"-"}$${Math.abs(selectedPL).toFixed(2)}`} color="var(--j-peach)">
                  {selTrades.length===0 ? (
                    <p className="text-center py-4" style={{color:"var(--j-soft)",fontSize:13}}>No trades this day</p>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {selTrades.map(t=>{
                        const info = getModeInfo(t.mode);
                        return (
                          <div key={t.id} className="j-cal-trade-row">
                            <span className="j-mini" style={{background:t.direction==="LONG"?"var(--j-mint)":"var(--j-coral)",minWidth:54,textAlign:"center"}}>{t.direction}</span>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:700,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                                <span>{t.time}</span>
                                <span>·</span>
                                <span>{t.session}</span>
                                <span style={{background:info.color,border:"1.5px solid var(--j-ink)",borderRadius:6,padding:"1px 6px",fontSize:10}}>{info.label}</span>
                              </div>
                              <div style={{fontSize:10,color:"var(--j-soft)",fontFamily:"'DM Mono',monospace",marginTop:2}}>
                                {t.asset||"XAUUSD"} · {t.timeframe||"-"} · {t.mode==="WYCKOFF"?"Wyckoff":getModeInfo(t.mode).label} · RR {Number(t.rr||0).toFixed(1)}R · Grade {t.grade||"-"}
                              </div>
                            </div>
                            {(t.screenshotBeforeUrl||t.screenshotAfterUrl||t.screenshotUrl)&&<button onClick={()=>setLightbox(t.screenshotAfterUrl||t.screenshotBeforeUrl||t.screenshotUrl)} className="j-chip off" style={{fontSize:10,padding:"3px 7px"}}>🖼</button>}
                            <b style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:t.totalPL>=0?"#3f9b73":"#d4685f",minWidth:76,textAlign:"right"}}>{money(t.totalPL)}</b>
                            <button onClick={()=>editTrade(t)} className="j-chip off" style={{fontSize:10,padding:"3px 7px"}}>✎</button>
                            <button onClick={()=>deleteTrade(t)} className="j-chip off" style={{fontSize:10,padding:"3px 7px",color:"#d4685f"}}>🗑</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Win>
              )}
              {!calSelected&&(
                <div className="j-cal-empty-note">
                  แตะวันที่มีสีเพื่อดูรายการเทรด · ปุ่ม Today จะพากลับมาที่เดือนปัจจุบัน · สีเขียว/ชมพู/ม่วง = วันกำไร/ขาดทุน/BE
                </div>
              )}
            </div>
          );
        })()}
        <div className="j-page-footer">
          <span>YOKIMURA SHINOBI</span>
          <i/>
          <span>PLAN&nbsp;&nbsp;|&nbsp;&nbsp;EXECUTE&nbsp;&nbsp;|&nbsp;&nbsp;REVIEW&nbsp;&nbsp;|&nbsp;&nbsp;REPEAT</span>
        </div>
      </section>
      </div>
      {/* Mobile bottom navigation */}
      <nav className="j-mobile-nav" aria-label="Mobile navigation">
        <button onClick={()=>setView("checklist" as any)} className={view==="checklist"?"active":""}>
          <b>✎</b><span>บันทึก</span>
        </button>
        <button onClick={()=>setView("dashboard")} className={view==="dashboard"?"active":""}>
          <b>▮</b><span>ภาพรวม</span>
        </button>
        <button onClick={()=>setView("calendar" as any)} className={view==="calendar"?"active":""}>
          <b>▦</b><span>ปฏิทิน</span>
        </button>
        <button onClick={()=>setView("list")} className={view==="list"?"active":""}>
          <b>◔</b><span>สถิติ</span>
        </button>
      </nav>
      {/* Alert Popup */}
      {showAlert&&(dailyStatus.isHardStop||dailyStatus.isDayDone)&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"rgba(42,31,20,.85)",backdropFilter:"blur(3px)"}}>
          <div className="j-win" style={{maxWidth:340,width:"100%"}}>
            <div className="j-bar" style={{background:dailyStatus.isHardStop?"var(--j-coral)":"var(--j-mint)"}}>
              <span className="j-t">{dailyStatus.isHardStop?"🛑 HARD STOP":"✓ ครบ 3 ไม้แล้ว"}</span>
              <span className="j-ctrl"><span>!</span></span>
            </div>
            <div className="j-body" style={{textAlign:"center",padding:"24px 20px"}}>
              <div style={{fontSize:48,marginBottom:10}}>{dailyStatus.isHardStop?"🛑":"✅"}</div>
              <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:18,fontWeight:700,marginBottom:8}}>
                {dailyStatus.isHardStop?"พักเทรดก่อนนะ 🌿":"วันนี้ทำหน้าที่ครบแล้ว 👏"}
              </div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)",marginBottom:20,lineHeight:1.8}}>
                {dailyStatus.isHardStop?`"ตลาดไม่ไปไหน โอกาสมีเสมอ"`:`"พักผ่อน review journal ได้เลย"`}
              </div>
              <div style={{display:"flex",gap:8,marginBottom:20}}>
                {[{l:"WIN",v:dailyStatus.todayWins,c:"#5fae89",bg:"var(--j-mint)"},{l:"LOSS",v:dailyStatus.todayLosses,c:"#e08a82",bg:"var(--j-coral)"},{l:"P/L",v:(dailyStatus.todayPL>=0?"+":"")+dailyStatus.todayPL.toFixed(2),c:dailyStatus.todayPL>=0?"#5fae89":"#e08a82",bg:"var(--j-butter)"}].map(s=>(
                  <div key={s.l} style={{flex:1,background:s.bg,border:"2px solid var(--j-ink)",borderRadius:7,padding:"8px 4px",boxShadow:"2px 2px 0 var(--j-ink)"}}>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"var(--j-soft)",textTransform:"uppercase"}}>{s.l}</div>
                    <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>
              <button onClick={()=>{try{localStorage.setItem(ALERT_ACK_KEY,todayStr);}catch{} setShowAlert(false);}} className="j-btn" style={{width:"100%",padding:"13px",background:dailyStatus.isHardStop?"var(--j-coral)":"var(--j-mint)",fontSize:14}}>
                {dailyStatus.isHardStop?"✓ รับทราบ — หยุดแล้ว":"✓ โอเค"}
              </button>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginTop:8}}>กดรับทราบแล้วจะไม่เด้งซ้ำวันนี้ และจะรีเซ็ตหลังเที่ยงคืน</div>
            </div>
          </div>
        </div>
      )}
      {/* Reflection Modal — บังคับกรอกก่อนปิดแอปตอน Hard Lock */}
      {showReflection && needsReflection && (
        <ReflectionModal
          initialText={hardlock?.reflectionText || ""}
          onSubmit={submitReflection}
          onClose={()=>setShowReflection(false)}
        />
      )}
      {/* Reset Confirm Modal — ยืนยันก่อนล้างข้อมูลทั้งหมด (ใหม่) */}
      {showResetConfirm && (
        <ResetConfirmModal
          onConfirm={resetAllTrades}
          onClose={()=>setShowResetConfirm(false)}
        />
      )}
      {/* Lightbox */}
      {lightbox&&(<div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(90,77,66,.75)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}><div style={{border:"3px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"6px 6px 0 var(--j-ink)",background:"var(--j-win)"}}><div className="j-bar" style={{background:"var(--j-sky)"}}><span className="j-t">🖼 SCREENSHOT.bmp</span><span className="j-ctrl"><span>✕</span></span></div><img src={lightbox} alt="full" style={{display:"block",maxWidth:"90vw",maxHeight:"75vh",objectFit:"contain"}}/></div></div>)}
    </main>
  );
}
