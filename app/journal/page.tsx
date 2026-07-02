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
const KEY  = "yok_journal_v4";
const KOPEN = "yok_open_trade";
const load = (): Trade[] => { try { return JSON.parse(localStorage.getItem(KEY)||"[]"); } catch { return []; } };
const save = (t: Trade[]) => localStorage.setItem(KEY, JSON.stringify(t));
const loadOpen = (): Trade|null => { try { const s=localStorage.getItem(KOPEN); return s?JSON.parse(s):null; } catch { return null; } };
const saveOpen = (t: Trade|null) => { if(t) localStorage.setItem(KOPEN,JSON.stringify(t)); else localStorage.removeItem(KOPEN); };

const SESSIONS: Session[] = ["Tokyo","London","New York","Overlap"];
const EMOTIONS: Emotion[] = ["😌 Calm","😎 Confident","😤 FOMO","😰 Fearful","😡 Revenge"];
const EXIT_REASONS: ExitReason[] = ["TP Hit","SL Hit","Manual","Rejection","MSS Failed","Other"];

const MAX_TRADES_PER_DAY = 3;

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

// ─── Default checklists ───────────────────────────────────────────────────────
const defSMC       = ():ChecklistSMC       => ({c1_trend:false,c2_bos:false,c3_dzsz:false,c4_ob:false,c5_liq:false,c6_reject:false,c7_retest:false,c8_mss:false});
const defSWRange   = ():ChecklistSWRange   => ({c1_sw:false,c2_level:false,c3_near:false,c4_pa:false,c5_rr:false});
const defSWBreak   = ():ChecklistSWBreakout=> ({c1_sw:false,c2_close:false,c3_retest:false,c4_noFomo:false});
const defPullback  = ():ChecklistPullback  => ({c1_trend:false,c2_dzsz:false,c3_pa:false,c4_short:false});
const defM5Rev     = ():ChecklistM5Rev     => ({c1_pa2:false,c2_dir:false,c3_plan:false});

const STARTING_CAPITAL=50, TOTAL_TARGET=20000;
const PHASES=[
  {id:1,from:50,to:1000,color:"var(--j-coral)",label:"Phase 1"},
  {id:2,from:1000,to:12000,color:"var(--j-butter)",label:"Phase 2"},
  {id:3,from:12000,to:20000,color:"var(--j-mint)",label:"Phase 3"},
];

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function JournalPage() {
  const [trades,setTrades]     = useState<Trade[]>([]);
  const [openTrade,setOpenTrade] = useState<Trade|null>(null);
  const [view,setView]         = useState<"dashboard"|"list"|"checklist"|"exit">("dashboard");
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
  const [entryTime,setEntryTime]   = useState(new Date().toTimeString().slice(0,5));
  const [session,setSession]       = useState<Session>("Tokyo");
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
    const t=load(); setTrades(t);
    const op=loadOpen(); setOpenTrade(op);
  },[]);

  // ── Loss alert ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(dailyStatus.isHardStop||dailyStatus.isDayDone) setShowAlert(true);
  },[trades,view]);

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
    setEntryPrice(""); setSlPrice(""); setLotInput("0.10"); setEmotion("😌 Calm");
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
    const updated=[closed,...trades];
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

  const filtered=filter==="ALL"?trades.filter(t=>t.status==="CLOSED"):trades.filter(t=>t.status==="CLOSED"&&t.result===filter);

  // ── P/L preview ───────────────────────────────────────────────────────────
  const previewPL = openTrade&&exitPrices.length
    ? exitPrices.map(ex=>calcPL(openTrade.direction,openTrade.entryPrice,ex,openTrade.lotPerOrder,isCent)).reduce((a,b)=>a+b,0)
    : 0;

  const totalPages = openTrade&&exitPrices.length
    ? Math.round(previewPL*100)/100 : 0;

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
            <Win title="🕘 RECENT" color="var(--j-peach)">
              {trades.filter(t=>t.status==="CLOSED").slice(0,5).map(t=>(
                <div key={t.id} className="flex items-center gap-2 py-2" style={{borderBottom:"1.5px dashed #e3d9c4"}}>
                  <span className="j-mini" style={{background:MODE_INFO[t.mode].color,fontSize:10}}>{MODE_INFO[t.mode].emoji} {t.mode.replace("_"," ")}</span>
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
                  <span className="j-t">{MODE_INFO[t.mode].emoji} {MODE_INFO[t.mode].label} · {t.direction}</span>
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
              <Win title={`${MODE_INFO[selMode].emoji} STEP 3 — Entry Details`} color={MODE_INFO[selMode].color}>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div><label className="j-lab">Date</label><input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} className="j-in" style={{fontSize:11}}/></div>
                  <div><label className="j-lab">Time</label><input type="time" value={entryTime} onChange={e=>setEntryTime(e.target.value)} className="j-in" style={{fontSize:11}}/></div>
                  <div><label className="j-lab">Session</label>
                    <select value={session} onChange={e=>setSession(e.target.value as Session)} className="j-in" style={{fontSize:11}}>
                      {SESSIONS.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
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
              <div className="j-bar" style={{background:MODE_INFO[openTrade.mode].color}}>
                <span className="j-t">🟡 OPEN: {MODE_INFO[openTrade.mode].emoji} {MODE_INFO[openTrade.mode].label} · {openTrade.direction}</span>
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
              <button onClick={()=>setShowAlert(false)} className="j-btn" style={{width:"100%",padding:"13px",background:dailyStatus.isHardStop?"var(--j-coral)":"var(--j-mint)",fontSize:14}}>
                {dailyStatus.isHardStop?"✓ รับทราบ — หยุดแล้ว":"✓ โอเค"}
              </button>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginTop:8}}>จะขึ้นอีกทุกครั้งที่เปิดหน้านี้</div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox&&(<div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(90,77,66,.75)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}><div style={{border:"3px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"6px 6px 0 var(--j-ink)",background:"var(--j-win)"}}><div className="j-bar" style={{background:"var(--j-sky)"}}><span className="j-t">🖼 SCREENSHOT.bmp</span><span className="j-ctrl"><span>✕</span></span></div><img src={lightbox} alt="full" style={{display:"block",maxWidth:"90vw",maxHeight:"75vh",objectFit:"contain"}}/></div></div>)}
    </main>
  );
}
