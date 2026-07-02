"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type Direction   = "LONG"|"SHORT";
type Result      = "WIN"|"LOSS"|"BE";
type Session     = "Tokyo"|"London"|"New York"|"Overlap";
type AccountType = "cent"|"standard";
type TradeMode   = "SMC"|"SW_RANGE"|"SW_BREAKOUT"|"PULLBACK"|"M5_REVERSAL";
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
  entryPrice: number;
  slPrice: number;
  lotPerOrder: number;
  lotInput: string;
  riskAmount: number;
  emotion: Emotion;
  // checklist (stored as JSON string)
  checklistJson: string;
  // post-exit
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

// migrate ข้อมูลจาก v3 → v4 (เพิ่ม status/mode/checklistJson/exitReason ให้ของเก่า)
function migrateOldTrades(rawTrades: any[]): Trade[] {
  return (rawTrades || []).map((t: any) => ({
    id: t.id || uid(),
    status: t.status || "CLOSED",
    mode: (["SMC","SW_RANGE","SW_BREAKOUT","PULLBACK","M5_REVERSAL"].includes(String(t.mode || t.entry_model)) ? String(t.mode || t.entry_model) : "SMC") as TradeMode,
    date: t.date || new Date().toISOString().split("T")[0],
    time: t.time || "00:00",
    session: (t.session || "Tokyo") as Session,
    direction: (t.direction || "SHORT") as Direction,
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
    notes: t.notes || "",
    screenshotUrl: t.screenshotUrl || t.screenshot_url || "",
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

// ─── PLChart ──────────────────────────────────────────────────────────────────
function PLChart({trades}:{trades:Trade[]}) {
  const [tab,setTab]=useState<"equity"|"dd">("equity");
  const closed=[...trades].filter(t=>t.status==="CLOSED").sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  if(closed.length<2) return <p style={{color:"var(--j-soft)",fontFamily:"'DM Mono',monospace",fontSize:12,textAlign:"center",padding:"24px 0"}}>need at least 2 closed sessions</p>;
  let cum=0;
  const pts=closed.map(t=>{cum+=t.totalPL;return cum;});
  const W=300,H=88,pL=6,pR=6,pT=8,pB=8,iW=W-pL-pR,iH=H-pT-pB;
  const mn=Math.min(0,...pts),mx=Math.max(...pts),rng=mx-mn||1;
  const X=(i:number)=>pL+(pts.length===1?iW/2:(i/(pts.length-1))*iW);
  const Y=(v:number)=>pT+iH-((v-mn)/rng)*iH;
  const up=pts[pts.length-1]>=0,col=up?"#3f9b73":"#d4685f",fc=up?"#bfe3d0":"#f3c4cb";
  let d=`M ${X(0)} ${Y(pts[0])}`;
  for(let i=1;i<pts.length;i++) d+=` L ${X(i)} ${Y(pts[i-1])} L ${X(i)} ${Y(pts[i])}`;
  const area=`${d} L ${X(pts.length-1)} ${pT+iH} L ${X(0)} ${pT+iH} Z`;
  const {dd,maxDD:mxDD,ddPct,maxDDPct}=calcDD(trades);
  let pk3=0;
  const dds=pts.map(v=>{if(v>pk3)pk3=v;return pk3-v;});
  const ddm=Math.max(...dds)||1;
  const Yd=(v:number)=>pT+iH*(v/ddm);
  let dp=`M ${X(0)} ${Yd(dds[0])}`;
  for(let i=1;i<dds.length;i++) dp+=` L ${X(i)} ${Yd(dds[i-1])} L ${X(i)} ${Yd(dds[i])}`;
  const da=`${dp} L ${X(dds.length-1)} ${pT+iH} L ${X(0)} ${pT+iH} Z`;
  const TB=(t:"equity"|"dd",label:string,bg:string)=>(
    <button onClick={()=>setTab(t)} style={{fontFamily:"'DM Mono',monospace",fontSize:10,padding:"3px 10px",cursor:"pointer",border:"1.5px solid var(--j-ink)",borderRadius:"5px 5px 0 0",background:tab===t?bg:"var(--j-win)",color:"var(--j-ink)",fontWeight:tab===t?600:400,borderBottom:tab===t?`1.5px solid ${bg}`:"1.5px solid var(--j-ink)",marginBottom:tab===t?-1.5:0}}>{label}</button>
  );
  return (
    <div>
      <div style={{display:"flex",gap:4,position:"relative",zIndex:1}}>{TB("equity","📈 Equity","var(--j-sky)")}{TB("dd","📉 Drawdown","var(--j-coral)")}</div>
      <div style={{border:"2px solid var(--j-ink)",borderRadius:"0 7px 7px 7px",background:"#fbf6ea",padding:4}}>
        {tab==="equity"?(
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
            {pts.map((_,i)=><line key={i} x1={X(i)} y1={pT} x2={X(i)} y2={pT+iH} stroke="#e3d9c4" strokeWidth="1"/>)}
            <line x1={pL} y1={Y(0)} x2={W-pR} y2={Y(0)} stroke="#b0a290" strokeWidth="1.5" strokeDasharray="3 2"/>
            <path d={area} fill={fc} fillOpacity="0.55"/><path d={d} fill="none" stroke={col} strokeWidth="3"/>
            {pts.map((v,i)=><rect key={i} x={X(i)-2.5} y={Y(v)-2.5} width="5" height="5" fill={fc} stroke="var(--j-ink)" strokeWidth="1.5"/>)}
          </svg>
        ):(
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
            <line x1={pL} y1={Yd(ddm*0.2)} x2={W-pR} y2={Yd(ddm*0.2)} stroke="#d4685f" strokeWidth="1" strokeDasharray="3 2"/>
            <path d={da} fill="#f3c4cb" fillOpacity="0.55"/><path d={dp} fill="none" stroke="#d4685f" strokeWidth="3"/>
            {dds.map((v,i)=><rect key={i} x={X(i)-2.5} y={Yd(v)-2.5} width="5" height="5" fill="#f3c4cb" stroke="var(--j-ink)" strokeWidth="1.5"/>)}
          </svg>
        )}
      </div>
      {tab==="dd"&&(
        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
          {[{l:"Current DD",v:dd>0?`-$${dd.toFixed(2)}`:"+$0.00",c:dd>0?"#d4685f":"#5fae89",sub:ddPct>0?`-${ddPct.toFixed(1)}% from peak`:""},
            {l:"Max DD",v:mxDD>0?`-$${mxDD.toFixed(2)}`:"+$0.00",c:"#d4685f",sub:maxDDPct>0?`-${maxDDPct.toFixed(1)}% worst`:""},
            {l:"Status",v:maxDDPct<=10?"✓ SAFE":maxDDPct<=20?"⚠ WATCH":"✕ DANGER",c:maxDDPct>20?"#d4685f":maxDDPct>10?"#d4a65f":"#5fae89",sub:"limit 20%"}
          ].map(s=>(
            <div key={s.l} style={{flex:1,background:"#f3c4cb55",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",minWidth:90}}>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",textTransform:"uppercase",marginBottom:2}}>{s.l}</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:20,color:s.c,lineHeight:1}}>{s.v}</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#d4685f"}}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DailyStatusBar ───────────────────────────────────────────────────────────
function DailyStatusBar({status}:{status:ReturnType<typeof calcDailyStatus>}) {
  const {totalToday,lossStreak,isHardStop,isWarnBreak,isDayDone,todayWins,todayLosses,todayBE,todayPL} = status;
  const barBg=isHardStop?"var(--j-coral)":isWarnBreak?"var(--j-butter)":"var(--j-mint)";
  const statusTxt=isHardStop?"🛑 STOP — LOSS 3 ติด":isWarnBreak?"⚠️ LOSS 2 ติด — ระวัง":isDayDone?"✓ ครบ 3 ไม้แล้ว":`เหลือ ${status.tradesLeft} ไม้`;
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
        {lossStreak>=2&&(
          <div style={{marginTop:8,background:isHardStop?"var(--j-coral)":"var(--j-butter)",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",fontFamily:"'DM Mono',monospace",fontSize:10,textAlign:"center"}}>
            {isHardStop?`🛑 LOSS ${lossStreak} ติดกัน — หยุดเทรดวันนี้เด็ดขาด`:`⚠️ LOSS ${lossStreak} ติดกัน — พัก 1 ชั่วโมงก่อนไม้สุดท้าย`}
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
      <div className="j-bar" style={{background:color}}>
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


// ─── Market Tools: Trader RPG Coach + Retro HP/MP Bars ────────────────────────
type ForexSessionInfo = {
  name: Session | "Sydney";
  emoji: string;
  openUtc: number;
  closeUtc: number;
  color: string;
  note: string;
};

type RetroBarTone = "mint" | "sky" | "lav" | "butter" | "coral" | "peach" | "ink";
type StatRow = { key:string; label:string; trades:number; wins:number; losses:number; be:number; winRate:number; avgRR:number; totalPL:number };

const FOREX_SESSIONS: ForexSessionInfo[] = [
  { name:"Sydney",   emoji:"🌏", openUtc:21, closeUtc:6,  color:"var(--j-peach)",  note:"Early liquidity" },
  { name:"Tokyo",    emoji:"🌙", openUtc:0,  closeUtc:9,  color:"var(--j-lav)",    note:"Asian range" },
  { name:"London",   emoji:"☀️", openUtc:7,  closeUtc:16, color:"var(--j-sky)",    note:"Main volatility" },
  { name:"New York", emoji:"🗽", openUtc:12, closeUtc:21, color:"var(--j-mint)",   note:"XAUUSD active" },
];

function clampNum(v:number,min=0,max=100){ return Math.min(max,Math.max(min,v)); }
function pctText(v:number){ return `${Math.round(v)}%`; }
function utcHourFloat(d: Date) { return d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600; }
function isForexSessionOpen(session: ForexSessionInfo, nowUtcHour: number) {
  if (session.openUtc < session.closeUtc) return nowUtcHour >= session.openUtc && nowUtcHour < session.closeUtc;
  return nowUtcHour >= session.openUtc || nowUtcHour < session.closeUtc;
}
function sessionProgress(session: ForexSessionInfo, nowUtcHour: number) {
  const start = session.openUtc;
  const end = session.closeUtc <= start ? session.closeUtc + 24 : session.closeUtc;
  const now = nowUtcHour < start && session.closeUtc <= start ? nowUtcHour + 24 : nowUtcHour;
  if (!isForexSessionOpen(session, nowUtcHour)) return 0;
  return clampNum(((now - start) / (end - start)) * 100);
}
function hoursUntil(openUtc: number, nowUtcHour: number) {
  let diff = openUtc - nowUtcHour;
  if (diff < 0) diff += 24;
  return diff;
}
function fmtHours(v: number) {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${h}h ${String(m).padStart(2,"0")}m`;
}
function localWindowText(openUtc: number, closeUtc: number) {
  const toLocal = (h: number) => `${pad2((h + 7) % 24)}:00`;
  return `${toLocal(openUtc)}–${toLocal(closeUtc)} TH`;
}
function toStatRows(trades: Trade[], keyGetter:(t:Trade)=>string, labelGetter?:(key:string)=>string): StatRow[] {
  const closed = trades.filter(t=>t.status==="CLOSED");
  const map:Record<string,Trade[]> = {};
  closed.forEach(t=>{ const k=keyGetter(t)||"Unknown"; (map[k] ||= []).push(t); });
  return Object.entries(map).map(([key,items])=>{
    const wins=items.filter(t=>t.result==="WIN").length;
    const losses=items.filter(t=>t.result==="LOSS").length;
    const be=items.filter(t=>t.result==="BE").length;
    const rrAvg=items.reduce((s,t)=>s+(Number(t.rr)||0),0)/(items.length||1);
    return {
      key,label:labelGetter?labelGetter(key):key,trades:items.length,wins,losses,be,
      winRate: items.length ? wins/items.length*100 : 0,
      avgRR: rrAvg,
      totalPL: items.reduce((s,t)=>s+(Number(t.totalPL)||0),0),
    };
  }).sort((a,b)=>b.trades-a.trades);
}
function bestRow(rows: StatRow[], minTrades=3) {
  const eligible=rows.filter(r=>r.trades>=minTrades);
  return (eligible.length?eligible:rows).sort((a,b)=>b.winRate-a.winRate || b.avgRR-a.avgRR)[0];
}
function weakRow(rows: StatRow[], minTrades=3) {
  const eligible=rows.filter(r=>r.trades>=minTrades);
  return (eligible.length?eligible:rows).sort((a,b)=>a.winRate-b.winRate || a.avgRR-b.avgRR)[0];
}
function scoreFromRow(row?: StatRow) {
  if(!row) return 50;
  const rrScore=clampNum((row.avgRR+1)*28,0,100);
  return clampNum(row.winRate*0.68 + rrScore*0.32);
}
function modeLabel(k:string){ return getModeInfo(k).label; }

function RetroStatBar({label,value,max=100,tone="mint",right,size="normal"}:{label:string;value:number;max?:number;tone?:RetroBarTone;right?:string;size?:"normal"|"big"}) {
  const safeMax = max <= 0 ? 100 : max;
  const pct = clampNum((value / safeMax) * 100);
  const blocks = size==="big" ? 16 : 12;
  const filled = Math.round((pct / 100) * blocks);
  return (
    <div className={`j-rpg-line ${tone} ${size}`}>
      <div className="j-rpg-meta"><span>{label}</span><b>{right || `${Math.round(value)}/${safeMax}`}</b></div>
      <div className="j-rpg-bar" aria-label={`${label} ${pct.toFixed(0)}%`}>
        <i style={{width:`${pct}%`}} />
        <div className="j-rpg-segments">
          {Array.from({length:blocks}).map((_,i)=><span key={i} className={i < filled ? "fill" : ""}/>) }
        </div>
      </div>
    </div>
  );
}

function PixelSignalBadge({score,hardStop}:{score:number;hardStop?:boolean}) {
  const label = hardStop ? "STOP TODAY" : score >= 78 ? "READY" : score >= 60 ? "WATCH" : score >= 43 ? "WAIT" : "NO TRADE";
  const tone = hardStop ? "coral" : score >= 78 ? "mint" : score >= 60 ? "butter" : score >= 43 ? "lav" : "coral";
  const emoji = hardStop ? "🛑" : score >= 78 ? "🟢" : score >= 60 ? "🟡" : score >= 43 ? "🟣" : "🔴";
  return <div className={`j-signal-badge ${tone}`}><span>{emoji}</span><b>{label}</b></div>;
}

function CoachChip({label,value,tone="mint"}:{label:string;value:string;tone?:RetroBarTone}) {
  return <div className={`j-coach-chip ${tone}`}><span>{label}</span><b>{value}</b></div>;
}

function XauusdBattleCoach({trades,dailyStatus}:{trades:Trade[];dailyStatus:ReturnType<typeof calcDailyStatus>}) {
  const closed = trades.filter(t=>t.status==="CLOSED");
  const modeRows = toStatRows(closed,t=>t.mode,modeLabel);
  const sessionRows = toStatRows(closed,t=>t.session);
  const emotionRows = toStatRows(closed,t=>t.emotion);
  const bestMode = bestRow(modeRows);
  const weakMode = weakRow(modeRows);
  const currentSession = autoSessionFromTime(nowTime24());
  const currentSessionRow = sessionRows.find(r=>r.key===currentSession);
  const bestSession = bestRow(sessionRows);
  const badEmotion = emotionRows.sort((a,b)=>a.winRate-b.winRate || b.losses-a.losses)[0];
  const allStats = calcStats(closed);

  const dataPower = clampNum((closed.length/30)*100);
  const setupPower = scoreFromRow(bestMode);
  const sessionPower = scoreFromRow(currentSessionRow || bestSession);
  const rrPower = clampNum((allStats.avgRR+1)*30);
  const disciplinePower = dailyStatus.isHardStop ? 0 : dailyStatus.isDayDone ? 36 : clampNum(88 - dailyStatus.lossStreak*26 - dailyStatus.totalToday*7);
  const readiness = closed.length < 3
    ? 48
    : Math.round(setupPower*0.32 + sessionPower*0.24 + rrPower*0.18 + disciplinePower*0.26);

  const command = dailyStatus.isHardStop
    ? "หยุดวันนี้ก่อน ระบบเจอ LOSS streak ถึงจุดเสี่ยงแล้ว"
    : dailyStatus.isDayDone
      ? "ครบจำนวนไม้วันนี้แล้ว ไม่ต้องฝืนเพิ่ม"
      : closed.length < 3
        ? "ข้อมูลยังน้อย ให้เก็บ Journal เพิ่มก่อน ระบบจะเริ่มแม่นขึ้นเมื่อมี 10–30 ไม้"
        : readiness >= 78
          ? `วันนี้ถ้าจะเล่น ให้โฟกัส ${bestMode?.label || "setup ที่ checklist ครบ"} และรอ confirmation เท่านั้น`
          : readiness >= 60
            ? "พอเทรดได้ แต่ต้องลดความถี่ รอจังหวะชัด และห้ามเข้าเพราะ FOMO"
            : "ยังไม่ใช่สนามที่ได้เปรียบ รอ setup ชัดกว่านี้ก่อน";

  return (
    <div className="j-rpg-panel">
      <div className="j-rpg-top j-battle-top">
        <div>
          <div className="j-tool-label">TRADER RPG COACH</div>
          <div className="j-rpg-name">XAUUSD BATTLE STATUS</div>
          <div className="j-rpg-note">วิเคราะห์จาก Journal ที่บันทึกไว้ ไม่ใช่สัญญาณทำนายราคา</div>
        </div>
        <PixelSignalBadge score={readiness} hardStop={dailyStatus.isHardStop || dailyStatus.isDayDone}/>
      </div>

      <div className="j-readiness-card">
        <div className="j-readiness-score">
          <span>⚔️</span>
          <div><small>BATTLE READINESS</small><b>{readiness}/100</b></div>
        </div>
        <RetroStatBar label="READY BAR" value={readiness} tone={readiness>=78?"mint":readiness>=60?"butter":readiness>=43?"lav":"coral"} right={pctText(readiness)} size="big" />
      </div>

      <div className="j-rpg-avatar-row">
        <div className="j-rpg-avatar">🧙‍♂️</div>
        <div className="j-rpg-bars">
          <RetroStatBar label="HP / BEST SETUP" value={setupPower} tone="mint" right={bestMode ? `${bestMode.label} · ${bestMode.winRate.toFixed(0)}%` : "No data"} />
          <RetroStatBar label="MP / SESSION EDGE" value={sessionPower} tone="sky" right={currentSessionRow ? `${currentSession} · ${currentSessionRow.winRate.toFixed(0)}%` : `${currentSession} · new`} />
          <RetroStatBar label="EXP / DATA POWER" value={dataPower} tone="lav" right={`${closed.length} trades`} />
        </div>
      </div>

      <div className="j-rpg-grid coach-grid">
        <RetroStatBar label="RR POWER" value={rrPower} tone="butter" right={`Avg RR ${allStats.avgRR.toFixed(2)}`} />
        <RetroStatBar label="DISCIPLINE" value={disciplinePower} tone={disciplinePower>=70?"mint":disciplinePower>=45?"butter":"coral"} right={`${dailyStatus.totalToday}/${MAX_TRADES_PER_DAY} trades`} />
        <RetroStatBar label="DANGER" value={dailyStatus.lossStreak*34} tone="coral" right={`LOSS streak ${dailyStatus.lossStreak}`} />
      </div>

      <div className="j-coach-chips">
        <CoachChip label="Best setup" value={bestMode ? `${bestMode.label} (${bestMode.trades})` : "Need data"} tone="mint" />
        <CoachChip label="Best session" value={bestSession ? `${bestSession.label} ${bestSession.winRate.toFixed(0)}%` : "Need data"} tone="sky" />
        <CoachChip label="Weak point" value={weakMode ? `${weakMode.label} ${weakMode.winRate.toFixed(0)}%` : "Need data"} tone="coral" />
        <CoachChip label="Emotion trap" value={badEmotion ? badEmotion.label.replace(/^.*? /,"") : "Need data"} tone="peach" />
      </div>

      <div className="j-rpg-command-box">
        <div className="j-rpg-command-title">COMMAND</div>
        <div className="j-rpg-command-text">{command}</div>
      </div>
    </div>
  );
}

function ForexSessionsTool() {
  const [now,setNow]=useState(new Date());
  useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); },[]);
  const nowUtc = utcHourFloat(now);
  const openSessions = FOREX_SESSIONS.filter(s=>isForexSessionOpen(s,nowUtc));
  const isOverlap = isForexSessionOpen(FOREX_SESSIONS[2],nowUtc) && isForexSessionOpen(FOREX_SESSIONS[3],nowUtc);
  const nextSession = [...FOREX_SESSIONS].sort((a,b)=>hoursUntil(a.openUtc,nowUtc)-hoursUntil(b.openUtc,nowUtc))[0];
  const activity = isOverlap ? 92 : openSessions.length >= 2 ? 76 : openSessions.length === 1 ? 54 : 20;

  return (
    <div className="j-tool-stack">
      <div className="j-rpg-mini-header">
        <div>
          <div className="j-tool-label">FOREX SESSIONS</div>
          <div className="j-rpg-title-sm">{isOverlap ? "⚡ OVERLAP MODE" : openSessions.length ? `${openSessions.map(s=>s.name).join(" + ")}` : "MARKET QUIET"}</div>
          <div className="j-tool-sub">TH {now.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false})} · UTC {pad2(now.getUTCHours())}:{pad2(now.getUTCMinutes())}</div>
        </div>
        <div className="j-tool-next"><span>Next</span><b>{nextSession.name}</b><small>{fmtHours(hoursUntil(nextSession.openUtc,nowUtc))}</small></div>
      </div>

      <RetroStatBar label="SP / SESSION POWER" value={activity} tone={activity >= 75 ? "mint" : activity >= 45 ? "butter" : "coral"} right={`${activity}%`} size="big" />

      <div className="j-session-grid hp-style">
        {FOREX_SESSIONS.map(s=>{
          const open=isForexSessionOpen(s,nowUtc);
          const pct=sessionProgress(s,nowUtc);
          const tone: RetroBarTone = s.name === "London" ? "sky" : s.name === "New York" ? "mint" : s.name === "Tokyo" ? "lav" : "peach";
          return (
            <div key={s.name} className={`j-session-card ${open?"on":"off"}`}>
              <div className="j-session-head">
                <span className="j-session-icon" style={{background:s.color}}>{s.emoji}</span>
                <div><b>{s.name}</b><small>{localWindowText(s.openUtc,s.closeUtc)}</small></div>
                <em>{open?"OPEN":"CLOSED"}</em>
              </div>
              <RetroStatBar label={open ? "TIME / ACTIVE" : "WAIT"} value={open ? pct : 0} tone={tone} right={open ? `${pct.toFixed(0)}%` : s.note} />
            </div>
          );
        })}
      </div>

      <div className="j-tool-tip"><b>Trade note:</b> XAUUSD มักขยับแรงช่วง London, New York และ Overlap · ใช้คู่กับ Checklist / Journal Stats ก่อนเข้าไม้</div>
    </div>
  );
}

function MissionPanel({dailyStatus}:{dailyStatus:ReturnType<typeof calcDailyStatus>}) {
  const missions = [
    {label:"ไม่ Revenge", ok:dailyStatus.lossStreak<2},
    {label:"ไม่เกิน 3 ไม้", ok:dailyStatus.totalToday<MAX_TRADES_PER_DAY},
    {label:"พักหลังแพ้ติด", ok:dailyStatus.lossStreak===0},
    {label:"รอ Checklist ครบ", ok:false},
  ];
  return (
    <Win title="🎯 TODAY QUEST" color="var(--j-mint)">
      <div className="j-quest-list">
        {missions.map((m,i)=><div key={i} className={m.ok?"done":""}><span>{m.ok?"☑":"☐"}</span><b>{m.label}</b></div>)}
      </div>
    </Win>
  );
}

function MarketToolsPanel({trades,dailyStatus}:{trades:Trade[];dailyStatus:ReturnType<typeof calcDailyStatus>}) {
  return (
    <div className="j-tools-screen">
      <div className="j-tools-layout advanced">
        <Win title="⚔️ XAUUSD Battle Coach" color="var(--j-lav)">
          <XauusdBattleCoach trades={trades} dailyStatus={dailyStatus} />
        </Win>

        <div className="j-tools-side">
          <Win title="🌍 Session HP / MP" color="var(--j-sky)">
            <ForexSessionsTool />
          </Win>
          <MissionPanel dailyStatus={dailyStatus} />
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [trades,setTrades]     = useState<Trade[]>([]);
  const [openTrade,setOpenTrade] = useState<Trade|null>(null);
  const [view,setView]         = useState<"dashboard"|"list"|"checklist"|"exit"|"calendar"|"tools">("dashboard");
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

  // ── Exit form ─────────────────────────────────────────────────────────────
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

  useEffect(()=>{ setMounted(true); },[]);

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

  // ── Load trades ───────────────────────────────────────────────────────────
  useEffect(()=>{
    const loadData = async () => {
      // โหลด localStorage ก่อน (เร็ว + migrate v3→v4 อัตโนมัติ)
      const local = load();
      if (local.length > 0) { setTrades(local); }

      // ถ้า login ให้ดึงจาก Supabase ด้วย
      try {
        const { data:{user} } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from("journal_trades")
          .select("*").eq("user_id", user.id).order("created_at",{ascending:false});
        if (error || !data?.length) return;
        const mapped: Trade[] = migrateOldTrades(data.map((r:any) => ({
          id: r.id, status: "CLOSED" as TradeStatus,
          mode: (r.entry_model as TradeMode) || "SMC",
          date: r.date, time: r.time, session: r.session,
          direction: r.direction, entryPrice: Number(r.entry_price),
          slPrice: Number(r.sl_price), lotPerOrder: Number(r.lot_per_order),
          lotInput: String(r.lot_per_order), riskAmount: Number(r.risk_amount)||5,
          emotion: "😌 Calm" as Emotion, checklistJson: "{}",
          exitPrices: r.exit_prices||[], avgExit: Number(r.avg_exit),
          orderCount: Number(r.order_count), totalLot: Number(r.total_lot),
          totalPL: Number(r.total_pl), rr: Number(r.rr), result: r.result,
          exitReason: "" as ExitReason|"", notes: r.notes||"",
          screenshotUrl: r.screenshot_url||"", createdAt: r.created_at,
        })));
        setTrades(mapped); save(mapped);
      } catch(e) { console.error("Supabase load error:", e); }
    };
    loadData();
    const op=loadOpen(); setOpenTrade(op);
  },[]);

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

  // ── Save Open Trade (Pre-entry) ────────────────────────────────────────────
  const saveOpenTrade = async () => {
    if(!selMode||!entryPrice||!slPrice) return;
    const trade: Trade = {
      id:uid(), status:"OPEN", mode:selMode,
      date:entryDate, time:entryTime, session,
      direction, entryPrice:Number(entryPrice), slPrice:Number(slPrice),
      lotPerOrder:parseFloat(lotInput)||0.10, lotInput, riskAmount,
      emotion, checklistJson:JSON.stringify(checklistObj()),
      exitPrices:[], avgExit:0, orderCount:0, totalLot:0, totalPL:0,
      rr:0, result:"BE", exitReason:"", notes:"", screenshotUrl:"",
      createdAt:new Date().toISOString(),
    };
    setOpenTrade(trade); saveOpen(trade);
    // reset form
    setStep("mode"); setSelMode(null); setClSMC(defSMC()); setClSWR(defSWRange()); setClSWB(defSWBreak()); setClPB(defPullback()); setClM5(defM5Rev());
    setEntryPrice(""); setSlPrice(""); setLotInput("0.10"); setEmotion("😌 Calm"); setSessionManual(false);
    setView("dashboard");
  };

  // ── Save Closed Trade (Post-exit) ──────────────────────────────────────────
  const saveClosedTrade = async () => {
    if(!openTrade||!exitPrices.length) return;
    const ep=Number(openTrade.entryPrice), lot=openTrade.lotPerOrder;
    const perPLs=exitPrices.map(ex=>calcPL(openTrade.direction,ep,ex,lot,isCent));
    const totalPL=Math.round(perPLs.reduce((a,b)=>a+b,0)*100)/100;
    const avgExit=exitPrices.reduce((a,b)=>a+b,0)/exitPrices.length;
    const result:Result=totalPL>0.01?"WIN":totalPL<-0.01?"LOSS":"BE";
    const rr=openTrade.riskAmount>0?Math.round((totalPL/openTrade.riskAmount)*100)/100:0;
    const closed:Trade={
      ...openTrade, status:"CLOSED",
      exitPrices, avgExit:Math.round(avgExit*1000)/1000,
      orderCount:exitPrices.length, totalLot:exitPrices.length*lot,
      totalPL, rr, result, exitReason, notes:exitNotes, screenshotUrl,
    };
    const updated=[closed,...trades.filter(t=>t.id!==closed.id)];
    setTrades(updated); save(updated);
    setOpenTrade(null); saveOpen(null);
    // supabase
    const {data:{user}}=await supabase.auth.getUser();
    if(user){
      await supabase.from("journal_trades").upsert({
        id:closed.id,user_id:user.id,date:closed.date,time:closed.time,
        symbol:"XAUUSDc",direction:closed.direction,session:closed.session,
        entry_price:closed.entryPrice,exit_prices:closed.exitPrices,
        avg_exit:closed.avgExit,lot_per_order:closed.lotPerOrder,
        order_count:closed.orderCount,total_lot:closed.totalLot,
        total_pl:closed.totalPL,sl_price:closed.slPrice,tp_price:0,rr:closed.rr,
        result:closed.result,smc_concept:[],htf_bias:"Neutral",
        entry_model:closed.mode,tf:"M5",notes:closed.notes,
        screenshot_url:closed.screenshotUrl||null,created_at:closed.createdAt,
      },{onConflict:"id"});
    }
    setExitPrices([]); setExitInput(""); setPasteInput(""); setExitReason(""); setExitNotes(""); setScreenshotUrl("");
    sparkle(); setSaving(true); setTimeout(()=>setSaving(false),900);
    setView("dashboard");
  };

  const uploadScreenshot=async(file:File)=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){alert("Please log in");return;}
    setUploading(true);
    try{
      const ext=(file.name.split(".").pop()||"png").toLowerCase();
      const path=`${user.id}/${Date.now()}.${ext}`;
      const {error}=await supabase.storage.from("journal-screenshots").upload(path,file,{upsert:true,contentType:file.type});
      if(error)alert("Upload failed");
      else{const{data}=supabase.storage.from("journal-screenshots").getPublicUrl(path);setScreenshotUrl(data.publicUrl);}
    }catch{alert("Upload error");}
    setUploading(false);
  };

  const addExit=()=>{const v=parseFloat(exitInput);if(!isNaN(v)&&v>0){setExitPrices(p=>[...p,v]);setExitInput("");}};
  const parsePaste=()=>{
    const ns=pasteInput.split(/[\n,\s]+/).map(s=>parseFloat(s.replace(/,/g,""))).filter(n=>!isNaN(n)&&n>0);
    if(ns.length){setExitPrices(p=>[...p,...ns]);setPasteInput("");}
  };

  const editTrade=(t:Trade)=>{
    // calendar / session → กดแก้ไข trade ที่ปิดแล้ว (เปิด exit view)
    setOpenTrade(t);
    setExitPrices(Array.isArray(t.exitPrices) ? t.exitPrices : []);
    setExitReason(t.exitReason || "");
    setExitNotes(t.notes || "");
    setScreenshotUrl(t.screenshotUrl || "");
    saveOpen(t);
    setView("exit");
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
    <main className="j-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fredoka:wght@500;600;700&family=VT323&display=swap');
        .j-root{--j-paper:#f1e9da;--j-win:#fffdf8;--j-ink:#5a4d42;--j-soft:#9a8d80;--j-pink:#f6cdd5;--j-mint:#c0e6d4;--j-butter:#f6e6ac;--j-lav:#ddccf0;--j-sky:#c6def0;--j-peach:#f8d6ba;--j-coral:#f3b0a8;min-height:100vh;color:var(--j-ink);font-family:'Fredoka',sans-serif;background-color:var(--j-paper);background-image:radial-gradient(var(--j-ink) 0.5px,transparent 0.6px);background-size:14px 14px;background-position:-7px -7px;padding-bottom:40px;}
        .j-root::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:999;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(90,77,66,.03) 2px,rgba(90,77,66,.03) 4px);animation:scanmove 8s linear infinite;}
        @keyframes scanmove{from{background-position:0 0}to{background-position:0 40px}}
        @keyframes bootfade{from{opacity:1}to{opacity:0;transform:scale(1.04)}}
        .j-boot{position:fixed;inset:0;z-index:9999;background:#2a1f14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;}
        .j-boot.done{animation:bootfade .5s ease forwards;}
        .j-boot-logo{font-family:'VT323',monospace;font-size:52px;color:#f6e6ac;letter-spacing:3px;text-shadow:0 0 20px #f6e6ac88;animation:blink 1s step-end infinite;}
        @keyframes blink{50%{opacity:.7}}
        .j-boot-cursor{display:inline-block;width:9px;height:15px;background:#c0e6d4;animation:cur .7s step-end infinite;vertical-align:middle;}
        @keyframes cur{50%{opacity:0}}
        .j-boot-bar{width:280px;height:22px;border:2px solid #c0e6d4;border-radius:4px;overflow:hidden;position:relative;}
        .j-boot-fill{height:100%;background:linear-gradient(90deg,#c0e6d4,#8fd3b4);animation:barfill 1.2s ease forwards;}
        @keyframes barfill{from{width:0%}to{width:100%}}
        @keyframes winpop{0%{opacity:0;transform:scale(.92) translate(0,6px)}60%{transform:scale(1.03) translate(0,-2px)}80%{transform:scale(.98)}100%{opacity:1;transform:scale(1)}}
        .j-win{animation:winpop .18s steps(3,end) both;background:var(--j-win);border:2.5px solid var(--j-ink);border-radius:9px;box-shadow:4px 4px 0 var(--j-ink);overflow:hidden;}
        .j-bar{display:flex;align-items:center;gap:7px;padding:7px 10px;border-bottom:2.5px solid var(--j-ink);}
        .j-t{font-family:'DM Mono',monospace;font-size:12px;font-weight:500;letter-spacing:.5px;flex:1;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
        .j-ctrl{display:flex;gap:4px;flex-shrink:0;}
        .j-ctrl span{width:15px;height:15px;border:2px solid var(--j-ink);border-radius:3px;background:var(--j-win);font-size:9px;line-height:11px;text-align:center;font-family:'DM Mono';}
        .j-body{padding:13px;}
        .j-lab{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--j-soft);margin-bottom:6px;display:block;}
        .j-chip{font-size:13px;font-weight:500;padding:6px 12px;border:2px solid var(--j-ink);border-radius:7px;background:var(--j-win);color:var(--j-ink);cursor:pointer;box-shadow:2px 2px 0 var(--j-ink);transition:.1s;font-family:'Fredoka';}
        .j-chip:active{transform:translate(2px,2px);box-shadow:0 0 0 var(--j-ink);}
        .j-chip.off{box-shadow:none;border-style:dashed;color:var(--j-soft);background:transparent;}
        .j-in{width:100%;background:#fbf6ea;border:2px solid var(--j-ink);border-radius:7px;padding:9px 11px;font-family:'DM Mono',monospace;font-size:14px;color:var(--j-ink);outline:none;box-shadow:inset 1px 1px 0 rgba(90,77,66,.08);}
        .j-in:focus{box-shadow:2px 2px 0 var(--j-ink);}
        .j-in::placeholder{color:#c3b8a8;}
        .j-btn{border:2.5px solid var(--j-ink);border-radius:9px;cursor:pointer;font-family:'Fredoka';font-weight:700;box-shadow:3px 3px 0 var(--j-ink);transition:.1s;color:var(--j-ink);}
        .j-btn:active{transform:translate(3px,3px);box-shadow:0 0 0 var(--j-ink);}
        .j-btn:disabled{opacity:.45;cursor:not-allowed;}
        .j-stat{background:var(--j-win);border:2.5px solid var(--j-ink);border-radius:9px;box-shadow:3px 3px 0 var(--j-ink);padding:10px;text-align:center;}
        .j-num{font-family:'VT323',monospace;font-size:30px;line-height:.9;}
        .j-statlab{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:1px;color:var(--j-soft);text-transform:uppercase;margin-top:2px;}
        .j-mini{font-size:11px;font-weight:500;padding:3px 9px;border:1.5px solid var(--j-ink);border-radius:6px;}
        .j-tab{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.5px;padding:9px 12px;cursor:pointer;border:2px solid transparent;border-radius:7px 7px 0 0;background:transparent;color:var(--j-soft);font-weight:500;}
        .j-tab.on{background:var(--j-win);border-color:var(--j-ink);border-bottom-color:var(--j-win);color:var(--j-ink);}
        @keyframes savepulse{0%,100%{box-shadow:3px 3px 0 var(--j-ink)}50%{box-shadow:0 0 0 var(--j-ink),0 0 14px var(--j-mint)}}
        .j-saving{animation:savepulse .2s steps(2,end) 4;}
        @keyframes tabslide{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .j-tabcontent{animation:tabslide .15s steps(2,end) both;}
        .j-pixel{position:absolute;width:8px;height:8px;border:1.5px solid var(--j-ink);pointer-events:none;animation:pixelfly .7s steps(4,end) forwards;}
        @keyframes pixelfly{0%{opacity:1;transform:translate(0,0) scale(1)}50%{opacity:1;transform:translate(var(--px),var(--py)) scale(1.2)}100%{opacity:0;transform:translate(var(--px),calc(var(--py) + 20px)) scale(0)}}

        .j-cal-nav{width:24px;height:24px;border:2px solid var(--j-ink);border-radius:5px;background:var(--j-win);color:var(--j-ink);font-family:'DM Mono',monospace;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:1px 1px 0 var(--j-ink);}
        .j-cal-nav:active{transform:translate(1px,1px);box-shadow:none;}
        .j-cal-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:8px;text-align:center;font-family:'DM Mono',monospace;font-size:10px;color:var(--j-soft);letter-spacing:1px;}
        .j-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;}
        .j-cal-cell{position:relative;min-height:86px;border:2px solid var(--j-ink);border-radius:8px;background:#fbf6ea;color:var(--j-ink);padding:8px;display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;cursor:pointer;text-align:left;font-family:'Fredoka','Noto Sans Thai',sans-serif;box-shadow:2px 2px 0 var(--j-ink);overflow:hidden;}
        .j-cal-cell.empty{visibility:hidden;box-shadow:none;cursor:default;}
        .j-cal-cell.has.win{background:var(--j-mint);}
        .j-cal-cell.has.loss{background:var(--j-pink);}
        .j-cal-cell.has.be{background:var(--j-lav);}
        .j-cal-cell.selected{outline:3px solid var(--j-butter);transform:translate(1px,1px);box-shadow:1px 1px 0 var(--j-ink);}
        .j-cal-day{position:absolute;top:6px;right:8px;font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--j-ink);line-height:1;}
        .j-cal-content{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding-top:8px;}
        .j-cal-pl{font-family:'DM Mono',monospace;font-size:15px;line-height:1;white-space:nowrap;color:var(--j-ink);}
        .j-cal-count{font-family:'DM Mono',monospace;font-size:9px;color:var(--j-soft);white-space:nowrap;}
        .j-cal-mini{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;font-family:'DM Mono',monospace;font-size:8px;color:var(--j-soft);}
        .j-cal-mini span{border:1px solid var(--j-ink);border-radius:4px;background:rgba(255,253,248,.55);padding:1px 4px;}
        .j-cal-legend{display:flex;gap:14px;justify-content:center;align-items:center;margin-top:12px;flex-wrap:wrap;font-size:10px;font-family:'DM Mono',monospace;color:var(--j-soft);}
        .j-cal-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid var(--j-ink);margin-right:5px;vertical-align:-1px;}
        .j-cal-trade-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1.5px dashed #e3d9c4;}
        .j-cal-trade-row:last-child{border-bottom:none;}
        @media(max-width:720px){.j-cal-grid{gap:5px}.j-cal-weekdays{gap:5px}.j-cal-cell{min-height:70px;padding:6px}.j-cal-pl{font-size:12px}.j-cal-count,.j-cal-mini{display:none}.j-cal-day{font-size:11px;top:5px;right:6px}.j-cal-trade-row{align-items:flex-start;flex-wrap:wrap}.j-cal-trade-row b{margin-left:auto}}


        .j-tools-screen{display:flex;flex-direction:column;gap:12px;}
        .j-tools-layout{display:grid;grid-template-columns:minmax(0,1fr) 370px;gap:12px;align-items:start;}
        .j-tools-layout.advanced{grid-template-columns:minmax(0,1.18fr) minmax(330px,.82fr);}
        .j-tools-side{display:flex;flex-direction:column;gap:12px;}
        .j-tool-label{font-family:'DM Mono',monospace;font-size:9px;color:var(--j-soft);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px;}
        .j-tool-sub{font-family:'DM Mono',monospace;font-size:10px;color:var(--j-soft);line-height:1.5;margin-top:4px;}
        .j-tool-stack{display:flex;flex-direction:column;gap:10px;}
        .j-tool-next{min-width:94px;text-align:center;border:2px solid var(--j-ink);border-radius:8px;background:var(--j-win);padding:7px 8px;font-family:'DM Mono',monospace;box-shadow:2px 2px 0 var(--j-ink);}
        .j-tool-next span{display:block;font-size:8px;color:var(--j-soft);text-transform:uppercase;}
        .j-tool-next b{display:block;font-size:12px;margin-top:2px;}
        .j-tool-next small{display:block;font-size:9px;color:#3f9b73;margin-top:1px;}
        .j-tool-tip{font-family:'DM Mono',monospace;font-size:10px;color:var(--j-soft);line-height:1.55;background:#fbf6ea;border:1.5px dashed var(--j-ink);border-radius:8px;padding:9px 10px;}
        .j-rpg-panel{display:flex;flex-direction:column;gap:12px;}
        .j-rpg-top{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fbf6ea;border:2px solid var(--j-ink);border-radius:9px;padding:12px;box-shadow:2px 2px 0 var(--j-ink);}
        .j-battle-top{background:linear-gradient(135deg,#fffdf8,#f6e6ac55);}
        .j-rpg-name{font-family:'VT323',monospace;font-size:34px;line-height:1;color:var(--j-ink);letter-spacing:1px;}
        .j-rpg-title-sm{font-family:'VT323',monospace;font-size:26px;line-height:1;color:var(--j-ink);letter-spacing:.5px;}
        .j-signal-badge{border:2px solid var(--j-ink);border-radius:9px;padding:8px 10px;box-shadow:2px 2px 0 var(--j-ink);font-family:'DM Mono',monospace;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;white-space:nowrap;}
        .j-signal-badge.mint{background:var(--j-mint);}.j-signal-badge.butter{background:var(--j-butter);}.j-signal-badge.coral{background:var(--j-coral);}
        .j-rpg-avatar-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:12px;align-items:stretch;}
        .j-rpg-avatar{border:3px solid var(--j-ink);border-radius:12px;background:linear-gradient(180deg,var(--j-butter),var(--j-peach));box-shadow:3px 3px 0 var(--j-ink);display:flex;align-items:center;justify-content:center;font-size:42px;min-height:112px;image-rendering:pixelated;}
        .j-rpg-bars{display:flex;flex-direction:column;gap:9px;justify-content:center;}
        .j-rpg-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;}
        .j-rpg-line{display:flex;flex-direction:column;gap:5px;min-width:0;}
        .j-rpg-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-family:'DM Mono',monospace;font-size:9px;color:var(--j-soft);text-transform:uppercase;}
        .j-rpg-meta b{color:var(--j-ink);font-size:9px;white-space:nowrap;}
        .j-rpg-bar{height:20px;position:relative;border:2px solid var(--j-ink);border-radius:6px;background:#5a4d42;box-shadow:2px 2px 0 var(--j-ink), inset 0 0 0 2px rgba(255,253,248,.18);overflow:hidden;}
        .j-rpg-line.big .j-rpg-bar{height:26px;border-width:2.5px;}
        .j-rpg-bar i{position:absolute;inset:0 auto 0 0;width:0%;transition:width .45s steps(8,end);background:#4fce8a;box-shadow:inset 0 -5px 0 rgba(0,0,0,.14), inset 0 5px 0 rgba(255,255,255,.24);}
        .j-rpg-line.sky .j-rpg-bar i{background:#68b7e8;}.j-rpg-line.lav .j-rpg-bar i{background:#a985e8;}.j-rpg-line.butter .j-rpg-bar i{background:#e4c650;}.j-rpg-line.coral .j-rpg-bar i{background:#e86f66;}.j-rpg-line.peach .j-rpg-bar i{background:#e99b5d;}.j-rpg-line.ink .j-rpg-bar i{background:#5a4d42;}
        .j-rpg-segments{position:absolute;inset:2px;display:grid;grid-template-columns:repeat(12,1fr);gap:2px;}
        .j-rpg-segments span{border-right:1px solid rgba(255,253,248,.35);background:rgba(255,253,248,.10);}
        .j-rpg-segments span.fill{background:rgba(255,255,255,.20);}
        .j-rpg-command-box{border:2px solid var(--j-ink);border-radius:9px;background:var(--j-win);padding:10px 12px;box-shadow:2px 2px 0 var(--j-ink);}
        .j-rpg-command-title{font-family:'VT323',monospace;font-size:20px;line-height:1;margin-bottom:4px;}
        .j-rpg-command-text{font-family:'DM Mono',monospace;font-size:10px;color:var(--j-soft);line-height:1.6;}
        .j-rpg-mini-header{display:flex;justify-content:space-between;gap:10px;align-items:center;background:#fbf6ea;border:2px solid var(--j-ink);border-radius:9px;padding:12px;box-shadow:2px 2px 0 var(--j-ink);}
        .j-session-grid{display:grid;grid-template-columns:1fr;gap:9px;}
        .j-session-card{border:2px solid var(--j-ink);border-radius:9px;background:var(--j-win);padding:10px;box-shadow:2px 2px 0 var(--j-ink);transition:.15s;}
        .j-session-card.off{opacity:.72;box-shadow:none;background:#fbf6ea;}
        .j-session-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
        .j-session-icon{width:30px;height:30px;border:2px solid var(--j-ink);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:1px 1px 0 var(--j-ink);}
        .j-session-head b{display:block;font-family:'DM Mono',monospace;font-size:12px;line-height:1;color:var(--j-ink);}
        .j-session-head small{display:block;font-family:'DM Mono',monospace;font-size:8px;color:var(--j-soft);margin-top:3px;}
        .j-session-head em{margin-left:auto;font-style:normal;font-family:'DM Mono',monospace;font-size:8px;font-weight:700;border:1.5px solid var(--j-ink);border-radius:5px;padding:2px 5px;background:rgba(255,253,248,.65);}
        .j-readiness-card{border:2.5px solid var(--j-ink);border-radius:12px;background:#fffdf8;padding:12px;box-shadow:3px 3px 0 var(--j-ink);display:flex;flex-direction:column;gap:8px;}
        .j-readiness-score{display:flex;align-items:center;gap:10px;}
        .j-readiness-score>span{width:42px;height:42px;border:2px solid var(--j-ink);border-radius:10px;background:var(--j-butter);display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:2px 2px 0 var(--j-ink);}
        .j-readiness-score small{display:block;font-family:'DM Mono',monospace;font-size:9px;color:var(--j-soft);letter-spacing:1px;}
        .j-readiness-score b{display:block;font-family:'VT323',monospace;font-size:34px;line-height:.9;color:var(--j-ink);}
        .j-rpg-note{font-family:'DM Mono',monospace;font-size:9px;color:var(--j-soft);margin-top:4px;}
        .j-coach-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
        .j-coach-chip{border:2px solid var(--j-ink);border-radius:8px;background:#fffdf8;padding:8px;box-shadow:2px 2px 0 var(--j-ink);min-width:0;}
        .j-coach-chip span{display:block;font-family:'DM Mono',monospace;font-size:8px;color:var(--j-soft);text-transform:uppercase;margin-bottom:3px;}
        .j-coach-chip b{display:block;font-family:'DM Mono',monospace;font-size:10px;color:var(--j-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .j-coach-chip.mint{background:#c0e6d455}.j-coach-chip.sky{background:#c6def055}.j-coach-chip.coral{background:#f3b0a855}.j-coach-chip.peach{background:#f8d6ba66}.j-coach-chip.butter{background:#f6e6ac66}.j-coach-chip.lav{background:#ddccf066}
        .j-quest-list{display:flex;flex-direction:column;gap:8px;}
        .j-quest-list div{display:flex;align-items:center;gap:9px;border:2px solid var(--j-ink);border-radius:8px;background:#fbf6ea;padding:8px 10px;font-family:'DM Mono',monospace;font-size:11px;color:var(--j-soft);}
        .j-quest-list div.done{background:var(--j-mint);color:var(--j-ink);box-shadow:2px 2px 0 var(--j-ink);}
        .j-quest-list span{font-size:15px;line-height:1;}
        @media(max-width:920px){.j-tools-layout,.j-tools-layout.advanced{grid-template-columns:1fr}.j-rpg-avatar-row{grid-template-columns:1fr}.j-rpg-avatar{min-height:76px}.j-rpg-grid,.coach-grid{grid-template-columns:1fr}.j-coach-chips{grid-template-columns:1fr 1fr}.j-rpg-mini-header{align-items:flex-start;flex-direction:column}.j-tool-next{width:100%;}.j-rpg-top{align-items:flex-start;flex-direction:column}.j-signal-badge{width:100%;justify-content:center;}} 

        .open-badge{animation:blink .8s step-end infinite;}
      `}</style>

      {/* Boot */}
      {booting&&(<div className={`j-boot ${bootDone?"done":""}`}><div className="j-boot-logo">JOURNAL.EXE</div><div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:"#c0e6d4",minHeight:40,whiteSpace:"pre"}}>{bootText}<span className="j-boot-cursor"/></div><div className="j-boot-bar"><div className="j-boot-fill"/></div><div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#c0e6d4",opacity:.6,letterSpacing:2}}>SMC · XAUUSD · TRUST YOUR OWN</div></div>)}

      {/* Header */}
      <div style={{padding:"14px 12px 0"}}>
        <div className="j-win" style={{maxWidth:780,margin:"0 auto"}}>
          <div className="j-bar" style={{background:"var(--j-pink)"}}>
            <span className="j-t">★ JOURNAL.EXE — XAUUSD SMC</span>
            <span className="j-ctrl"><span>_</span><span>▢</span><Link href="/" style={{textDecoration:"none",color:"var(--j-ink)"}}><span>✕</span></Link></span>
          </div>
          <div className="j-body" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:34,lineHeight:.8}}>TRADING JOURNAL</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2,color:"var(--j-soft)",marginTop:4}}>✦ SMC PRO MAX · M15/M5/M1 ✦</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAccountType(accountType==="cent"?"standard":"cent")} className="j-chip" style={{fontSize:11,background:accountType==="cent"?"var(--j-butter)":"var(--j-lav)"}}>{accountType==="cent"?"Cent":"Std"}</button>
              {openTrade ? (
                <button onClick={()=>setView("exit")} className="j-btn open-badge" style={{padding:"9px 14px",background:"var(--j-butter)",fontSize:12}}>
                  🟡 ไม้ค้างอยู่! → กรอกจุดออก
                </button>
              ) : (
                <button onClick={()=>{setStep("mode");setSelMode(null);setView("checklist");}} className="j-btn" style={{padding:"9px 14px",background:"var(--j-mint)",fontSize:13}}>
                  ✎ New Trade
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div style={{maxWidth:780,margin:"14px auto 0",display:"flex",gap:6,borderBottom:"2.5px solid var(--j-ink)"}}>
          {([["dashboard","📊 Dashboard"],["list","📋 Sessions"]] as const).map(([v,label])=>(
            <button key={v} onClick={()=>setView(v)} className={`j-tab ${view===v?"on":""}`}>{label}</button>
          ))}
          <button onClick={()=>setView("calendar" as any)} className={`j-tab ${view==="calendar"?"on":""}`}>📅 Calendar</button>
          <button onClick={()=>setView("tools")} className={`j-tab ${view==="tools"?"on":""}`}>🧰 Tools</button>
          {openTrade&&(
            <button onClick={()=>setView("exit")} className={`j-tab ${view==="exit"?"on":""}`} style={{color:"#d4a65f",fontWeight:600}}>
              🟡 OPEN TRADE
            </button>
          )}
        </div>
      </div>

      {/* Pixel sparkle */}
      <div style={{position:"fixed",top:"50%",left:"50%",pointerEvents:"none",zIndex:1000}}>
        {pixels.map(p=>(<div key={p.id} className="j-pixel" style={{"--px":`${p.x}px`,"--py":`${p.y}px`,background:p.c} as any}/>))}
      </div>

      <div style={{maxWidth:780,margin:"0 auto",padding:"16px 12px 0"}}>

        {/* ── DASHBOARD ── */}
        {view==="dashboard"&&(
          <div className="space-y-4 j-tabcontent">
            <DailyStatusBar status={dailyStatus}/>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="j-stat" style={{background:"var(--j-mint)"}}><div className="j-num">{stats.winRate.toFixed(0)}%</div><div className="j-statlab">Win Rate</div></div>
              <div className="j-stat" style={{background:stats.totalPL>=0?"var(--j-sky)":"var(--j-coral)"}}><div className="j-num">{money(stats.totalPL)}</div><div className="j-statlab">Total P/L</div></div>
              <div className="j-stat" style={{background:"var(--j-butter)"}}><div className="j-num">{stats.total}</div><div className="j-statlab">Sessions</div></div>
              <div className="j-stat" style={{background:"var(--j-lav)"}}><div className="j-num">{stats.avgRR.toFixed(1)}R</div><div className="j-statlab">Avg R:R</div></div>
            </div>
            <Win title="📈 EQUITY + DRAWDOWN" color="var(--j-sky)"><PLChart trades={trades}/></Win>
            {/* Roadmap mini */}
            {(()=>{
              const eq=Math.max(0,STARTING_CAPITAL+stats.totalPL);
              const ph=PHASES.find(p=>eq<p.to)||PHASES[PHASES.length-1];
              const pct=Math.min(100,Math.max(0,((eq-ph.from)/(ph.to-ph.from))*100));
              return (
                <Win title="🎯 ROADMAP" color="var(--j-lav)" controls={false}>
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
                  {t.screenshotUrl&&(<img src={t.screenshotUrl} alt="ss" onClick={()=>setLightbox(t.screenshotUrl)} style={{width:"100%",maxHeight:160,objectFit:"cover",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in",marginBottom:8,boxShadow:"2px 2px 0 var(--j-ink)"}}/>)}
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

        {/* ── CHECKLIST (Pre-Entry) ── */}
        {view==="checklist"&&(
          <div className="space-y-4 j-tabcontent" style={{maxWidth:560,margin:"0 auto"}}>
            <div className="flex items-center gap-3">
              <button onClick={()=>setView("dashboard")} className="j-chip off" style={{fontSize:12}}>← Cancel</button>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)"}}>
                {step==="mode"?"Step 1/3 — เลือก Mode":step==="checklist"?"Step 2/3 — Checklist":"Step 3/3 — Entry Details"}
              </div>
            </div>

            {/* STEP 1: เลือก Mode */}
            {step==="mode"&&(
              <Win title="🎯 STEP 1 — วัฏจักรตอนนี้คืออะไร?" color="var(--j-lav)">
                <div className="space-y-3">
                  {(Object.entries(MODE_INFO) as [TradeMode,typeof MODE_INFO[TradeMode]][]).map(([mode,info])=>(
                    <button key={mode} onClick={()=>{setSelMode(mode);setStep("checklist");}}
                      style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"12px 14px",border:"2.5px solid var(--j-ink)",borderRadius:9,background:info.color,cursor:"pointer",boxShadow:"3px 3px 0 var(--j-ink)",textAlign:"left",fontFamily:"'Fredoka',sans-serif",transition:".1s"}}
                      onMouseDown={e=>(e.currentTarget.style.transform="translate(2px,2px)")}
                      onMouseUp={e=>(e.currentTarget.style.transform="")}>
                      <span style={{fontSize:26}}>{info.emoji}</span>
                      <div>
                        <div style={{fontSize:16,fontWeight:700,color:"var(--j-ink)"}}>{info.label}</div>
                        <div style={{fontSize:11,color:"var(--j-soft)",fontFamily:"'DM Mono',monospace"}}>{info.desc}</div>
                      </div>
                      <span style={{marginLeft:"auto",fontSize:18}}>→</span>
                    </button>
                  ))}
                </div>
              </Win>
            )}

            {/* STEP 2: Checklist */}
            {step==="checklist"&&selMode&&(()=>{
              const info=MODE_INFO[selMode];
              const done=checklistComplete();
              return (
                <Win title={`${info.emoji} STEP 2 — ${info.label} Checklist`} color={info.color}>
                  {selMode==="SMC"&&(<>
                    <div style={{background:"#fbf6ea",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"7px 10px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#d4685f"}}>⚠️ ไม่ครบทุกข้อ = ไม่เข้า เด็ดขาด</div>
                    <CL checked={clSMC.c1_trend} onChange={v=>setClSMC(p=>({...p,c1_trend:v}))} label="M15 — วัฏจักร = TREND ยืนยัน (ไม่ใช่ SW/Pullback)"/>
                    <CL checked={clSMC.c2_bos}   onChange={v=>setClSMC(p=>({...p,c2_bos:v}))}   label="M15 — BOS หรือ CHoCH เกิดแล้ว"/>
                    <CL checked={clSMC.c3_dzsz}  onChange={v=>setClSMC(p=>({...p,c3_dzsz:v}))}  label="M15 — Mark DZ/SZ สำคัญไว้แล้ว"/>
                    <CL checked={clSMC.c4_ob}    onChange={v=>setClSMC(p=>({...p,c4_ob:v}))}    label="M5 — หา Order Block + DZ/SZ ได้แล้ว"/>
                    <CL checked={clSMC.c5_liq}   onChange={v=>setClSMC(p=>({...p,c5_liq:v}))}   label="M5 — Liquidity $$$ เคลียร์แล้ว"/>
                    <CL checked={clSMC.c6_reject} onChange={v=>setClSMC(p=>({...p,c6_reject:v}))} label="M5 — มี Rejection ยืนยัน"/>
                    <CL checked={clSMC.c7_retest} onChange={v=>setClSMC(p=>({...p,c7_retest:v}))} label="M1 — LTF Retest ครบ (Buy=ยกโลว์ / Sell=กดไฮ)"/>
                    <CL checked={clSMC.c8_mss}   onChange={v=>setClSMC(p=>({...p,c8_mss:v}))}   label="M1 — MSS ผ่านแล้ว → พร้อมโดด" warn/>
                  </>)}
                  {selMode==="SW_RANGE"&&(<>
                    <div style={{background:"#fbf6ea",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"7px 10px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#5a8de0"}}>กรอบบน = Sell / กรอบล่าง = Buy · RR ≥ 3 เท่านั้น</div>
                    <CL checked={clSWR.c1_sw}    onChange={v=>setClSWR(p=>({...p,c1_sw:v}))}    label="M15 — วัฏจักร = SIDE WAY ยืนยัน"/>
                    <CL checked={clSWR.c2_level} onChange={v=>setClSWR(p=>({...p,c2_level:v}))} label="ระบุกรอบบน (Resistance) และกรอบล่าง (Support) ชัดเจน"/>
                    <CL checked={clSWR.c3_near}  onChange={v=>setClSWR(p=>({...p,c3_near:v}))}  label="ราคาอยู่ใกล้กรอบที่จะเทรด (ไม่ใช่กลางกรอบ)"/>
                    <CL checked={clSWR.c4_pa}    onChange={v=>setClSWR(p=>({...p,c4_pa:v}))}    label="M5 PA ยืนยัน — Pa sell ที่ 2 กดไฮ / Pa buy ที่ 2 ยกโลว์"/>
                    <CL checked={clSWR.c5_rr}    onChange={v=>setClSWR(p=>({...p,c5_rr:v}))}    label="RR ≥ 3 ถึงจะเข้า (คำนวณแล้ว ยืนยัน)" warn/>
                  </>)}
                  {selMode==="SW_BREAKOUT"&&(<>
                    <div style={{background:"#f6e6ac88",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"7px 10px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#d4a65f"}}>⚠️ ระวัง FOMO — รอ Retest ก่อนเสมอ</div>
                    <CL checked={clSWB.c1_sw}     onChange={v=>setClSWB(p=>({...p,c1_sw:v}))}     label="M15 — กรอบ SW ชัดเจน Mark ไว้แล้ว"/>
                    <CL checked={clSWB.c2_close}  onChange={v=>setClSWB(p=>({...p,c2_close:v}))}  label="ราคาปิดออกนอกกรอบจริง (ไม่ใช่แค่ Wick)"/>
                    <CL checked={clSWB.c3_retest} onChange={v=>setClSWB(p=>({...p,c3_retest:v}))} label="รอ Retest กลับมาที่กรอบก่อน ถึงเข้า" warn/>
                    <CL checked={clSWB.c4_noFomo} onChange={v=>setClSWB(p=>({...p,c4_noFomo:v}))} label="ยืนยัน: ฉันไม่ได้ FOMO เข้าทันทีหลัง Breakout" warn/>
                  </>)}
                  {selMode==="PULLBACK"&&(<>
                    <div style={{background:"#f8d6ba88",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"7px 10px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#c47c3a"}}>เก็บสั้น ขยันซอย — ไม่ถือยาว</div>
                    <CL checked={clPB.c1_trend} onChange={v=>setClPB(p=>({...p,c1_trend:v}))} label="M15 — ระบุทิศเทรนด์หลักชัดเจน"/>
                    <CL checked={clPB.c2_dzsz}  onChange={v=>setClPB(p=>({...p,c2_dzsz:v}))}  label="ราคา Pullback มาที่ DZ/SZ ใหญ่ที่ Mark ไว้"/>
                    <CL checked={clPB.c3_pa}    onChange={v=>setClPB(p=>({...p,c3_pa:v}))}    label="M5 — PA ยืนยันกลับตัว"/>
                    <CL checked={clPB.c4_short} onChange={v=>setClPB(p=>({...p,c4_short:v}))} label="วางแผนเก็บสั้น ขยันซอย — ไม่โลภถือยาว" warn/>
                  </>)}
                  {selMode==="M5_REVERSAL"&&(<>
                    <div style={{background:"#c0e6d488",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"7px 10px",marginBottom:10,fontFamily:"'DM Mono',monospace",fontSize:10,color:"#3f9b73"}}>ใช้ได้ทุกวัฏจักร · ตามเทรนด์=ถือยาว / สวน=รีบโดด</div>
                    <CL checked={clM5.c1_pa2}  onChange={v=>setClM5(p=>({...p,c1_pa2:v}))}  label="M5 — Pa ที่ 2 ยืนยันแล้ว"/>
                    <CL checked={clM5.c2_dir}  onChange={v=>setClM5(p=>({...p,c2_dir:v}))}  label="Buy=ยกโลว์ยืนยัน / Sell=กดไฮยืนยัน"/>
                    <CL checked={clM5.c3_plan} onChange={v=>setClM5(p=>({...p,c3_plan:v}))} label="วางแผนแล้ว: ตามเทรนด์=ถือยาว / สวนเทรนด์=Rejection รีบโดด" warn/>
                  </>)}
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <button onClick={()=>setStep("mode")} className="j-chip off" style={{fontSize:12}}>← กลับ</button>
                    <button onClick={()=>setStep("entry")} disabled={!done} className="j-btn" style={{flex:1,padding:"12px",background:done?"var(--j-mint)":"#e3d9c4",fontSize:14}}>
                      {done?"✓ Checklist ครบ → กรอก Entry":"ยังไม่ครบทุกข้อ"}
                    </button>
                  </div>
                </Win>
              );
            })()}

            {/* STEP 3: Entry Details */}
            {step==="entry"&&selMode&&(
              <Win title={`${getModeInfo(selMode).emoji} STEP 3 — Entry Details`} color={getModeInfo(selMode).color}>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className="j-lab">Date</label>
                    <input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} className="j-in" style={{fontSize:11}}/>
                  </div>
                  <div>
                    <label className="j-lab">Time 24H</label>
                    <div style={{display:"flex",gap:6}}>
                      <input
                        type="time"
                        lang="en-GB"
                        step="60"
                        value={entryTime}
                        onChange={e=>setEntryTimeAuto(e.target.value)}
                        className="j-in"
                        style={{fontSize:14,fontWeight:700}}
                      />
                      <button type="button" onClick={setNowEntryTime} className="j-chip" style={{fontSize:10,padding:"6px 8px",boxShadow:"none",whiteSpace:"nowrap"}}>NOW</button>
                    </div>
                  </div>
                  <div><label className="j-lab">Session {sessionManual?"Manual":"Auto"}</label>
                    <select
                      value={session}
                      onChange={e=>{setSession(e.target.value as Session);setSessionManual(true);}}
                      className="j-in"
                      style={{fontSize:11,fontWeight:700}}
                    >
                      {SESSIONS.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginBottom:10}}>
                  เวลาใช้รูปแบบ 24 ชั่วโมง เช่น 09:30 / 14:45 · Session ตั้งให้อัตโนมัติตามเวลา แต่เลือกเองได้
                </div>
                <label className="j-lab">Direction</label>
                <div className="flex gap-2 mb-3">
                  {(["LONG","SHORT"] as Direction[]).map(d=>(
                    <button key={d} onClick={()=>setDirection(d)} className={`j-chip flex-1 ${direction===d?"":"off"}`} style={direction===d?{background:d==="LONG"?"var(--j-mint)":"var(--j-coral)",textAlign:"center"}:{textAlign:"center"}}>
                      {d==="LONG"?"▲ LONG":"▼ SHORT"}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div><label className="j-lab">Entry Price</label>
                    <input type="number" step="0.001" value={entryPrice} placeholder="4171.200" onChange={e=>setEntryPrice(parseFloat(e.target.value)||"")} className="j-in" style={{fontSize:16,fontWeight:700}}/>
                  </div>
                  <div><label className="j-lab">🔴 SL Price</label>
                    <input type="number" step="0.001" value={slPrice} placeholder="SL" onChange={e=>setSlPrice(parseFloat(e.target.value)||"")} className="j-in" style={{color:"#d4685f",fontWeight:700}}/>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="j-lab">Lot / Order</label>
                  <input type="text" inputMode="decimal" value={lotInput} placeholder="0.10"
                    onChange={e=>{const v=e.target.value;if(v===""||/^\d*\.?\d*$/.test(v))setLotInput(v);}} className="j-in"/>
                </div>
                <label className="j-lab">อารมณ์ตอนเข้า</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {EMOTIONS.map(em=>(
                    <button key={em} onClick={()=>setEmotion(em)} className={`j-chip ${emotion===em?"":"off"}`}
                      style={emotion===em?{background:em.includes("FOMO")||em.includes("Fearful")||em.includes("Revenge")?"var(--j-coral)":"var(--j-mint)",fontSize:12}:{fontSize:12}}>
                      {em}
                    </button>
                  ))}
                </div>
                <div style={{background:"var(--j-lav)",border:"2px solid var(--j-ink)",borderRadius:7,padding:"8px 12px",marginBottom:12,fontFamily:"'DM Mono',monospace",fontSize:10}}>
                  Risk $5 · Mode: {MODE_INFO[selMode].label} · {direction}
                  {entryPrice&&slPrice&&<span> · SL = {Math.abs(Number(entryPrice)-Number(slPrice)).toFixed(3)} pts</span>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setStep("checklist")} className="j-chip off" style={{fontSize:12}}>← กลับ</button>
                  <button onClick={saveOpenTrade} disabled={!entryPrice||!slPrice} className="j-btn" style={{flex:1,padding:"13px",background:"var(--j-coral)",fontSize:14}}>
                    🟡 บันทึกไม้ — รอกรอกจุดออก
                  </button>
                </div>
              </Win>
            )}
          </div>
        )}

        {/* ── EXIT (Post-Exit) ── */}
        {view==="exit"&&openTrade&&(
          <div className="space-y-4 j-tabcontent" style={{maxWidth:560,margin:"0 auto"}}>
            {/* Open trade summary */}
            <div className="j-win">
              <div className="j-bar" style={{background:getModeInfo(openTrade.mode).color}}>
                <span className="j-t">🟡 OPEN: {getModeInfo(openTrade.mode).emoji} {getModeInfo(openTrade.mode).label} · {openTrade.direction}</span>
              </div>
              <div className="j-body">
                <div className="grid grid-cols-3 gap-3" style={{fontFamily:"'DM Mono',monospace",fontSize:12}}>
                  <div><span style={{color:"var(--j-soft)"}}>Entry</span><br/><b style={{fontSize:15}}>{openTrade.entryPrice}</b></div>
                  <div><span style={{color:"var(--j-soft)"}}>SL</span><br/><b style={{fontSize:15,color:"#d4685f"}}>{openTrade.slPrice}</b></div>
                  <div><span style={{color:"var(--j-soft)"}}>Lot</span><br/><b style={{fontSize:15}}>{openTrade.lotPerOrder}</b></div>
                </div>
                <div style={{marginTop:8,fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>
                  {openTrade.date} · {openTrade.time} · {openTrade.session} · {openTrade.emotion}
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

          return (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div className="j-win">
                <div className="j-bar" style={{background:"var(--j-sky)",alignItems:"center"}}>
                  <button onClick={()=>setCalRef(new Date(y,m-1,1))} className="j-cal-nav" aria-label="Previous month">◀</button>
                  <span className="j-t" style={{justifyContent:"center",fontSize:13}}>📅 {monthName}</span>
                  <button onClick={()=>setCalRef(new Date(y,m+1,1))} className="j-cal-nav" aria-label="Next month">▶</button>
                </div>

                <div className="j-body">
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
                      const plText = `${net>=0?"+":"-"}$${Math.abs(net).toFixed(2)}`;

                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={()=>setCalSelected(isSelected ? null : k)}
                          className={`j-cal-cell ${has?"has":""} ${isWin?"win":isLoss?"loss":"be"} ${isSelected?"selected":""}`}
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
                                Entry {t.entryPrice} → Exit {t.avgExit} · {t.orderCount} order{t.orderCount>1?"s":""} · RR {Number(t.rr||0).toFixed(2)}
                              </div>
                            </div>
                            {t.screenshotUrl&&<button onClick={()=>setLightbox(t.screenshotUrl)} className="j-chip off" style={{fontSize:10,padding:"3px 7px"}}>🖼</button>}
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
                <p className="text-center py-2" style={{color:"var(--j-soft)",fontSize:12,fontFamily:"'DM Mono',monospace"}}>tap a colored day to see trades</p>
              )}
            </div>
          );
        })()}


        {/* ── TOOLS ── */}
        {view==="tools"&&(<MarketToolsPanel trades={trades} dailyStatus={dailyStatus} />)}

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

      {/* Lightbox */}
      {lightbox&&(<div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(90,77,66,.75)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}><div style={{border:"3px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"6px 6px 0 var(--j-ink)",background:"var(--j-win)"}}><div className="j-bar" style={{background:"var(--j-sky)"}}><span className="j-t">🖼 SCREENSHOT.bmp</span><span className="j-ctrl"><span>✕</span></span></div><img src={lightbox} alt="full" style={{display:"block",maxWidth:"90vw",maxHeight:"75vh",objectFit:"contain"}}/></div></div>)}
    </main>
  );
}
