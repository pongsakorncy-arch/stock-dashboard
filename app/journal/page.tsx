"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Direction  = "LONG" | "SHORT";
type Result     = "WIN" | "LOSS" | "BE";
type SMCConcept = "OB"|"FVG"|"BOS"|"CHoCH"|"Liquidity"|"MSB"|"W-Pattern"|"M-Pattern"|"Other";
type TF = "M1"|"M5"|"M15";
type AccountType = "cent" | "standard";
type Session    = "Tokyo"|"London"|"New York"|"Overlap";

type Trade = {
  id: string; date: string; time: string; symbol: string;
  direction: Direction; session: Session; entryPrice: number;
  exitPrices: number[]; avgExit: number; lotPerOrder: number;
  orderCount: number; totalLot: number; totalPL: number;
  slPrice: number; tpPrice: number; riskAmount: number; rr: number;
  result: Result; smcConcept: SMCConcept[];
  htfBias: "Bullish"|"Bearish"|"Neutral";
  entryModel: string; tf: TF; notes: string;
  screenshotUrl: string; createdAt: string;
};

const money = (v: number) => {
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);
const KEY = "yok_journal_v3";
const load = (): Trade[] => { try { return JSON.parse(localStorage.getItem(KEY)||"[]"); } catch { return []; } };
const save = (t: Trade[]) => localStorage.setItem(KEY, JSON.stringify(t));
const SMC_LIST: SMCConcept[] = ["OB","FVG","BOS","CHoCH","Liquidity","MSB","W-Pattern","M-Pattern","Other"];
const SESSIONS: Session[]    = ["Tokyo","London","New York","Overlap"];

function calcPL(direction: Direction, entry: number, exit: number, lot: number, isCent = true): number {
  const diff = direction === "LONG" ? exit - entry : entry - exit;
  return Math.round(diff * lot * (isCent ? 1 : 100) * 100) / 100;
}

function calcStats(trades: Trade[]) {
  if (!trades.length) return { total:0,wins:0,losses:0,be:0,winRate:0,totalPL:0,avgRR:0,best:0,worst:0,streak:0,streakType:"" };
  const wins = trades.filter(t=>t.result==="WIN").length;
  const losses = trades.filter(t=>t.result==="LOSS").length;
  const be = trades.filter(t=>t.result==="BE").length;
  const totalPL = trades.reduce((s,t)=>s+t.totalPL, 0);
  const avgRR = trades.reduce((s,t)=>s+(t.rr||0), 0) / trades.length;
  const pls = trades.map(t=>t.totalPL);
  const sorted = [...trades].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  let streak=0; const first=sorted[0]?.result;
  for(const t of sorted){ if(t.result===first) streak++; else break; }
  return { total:trades.length,wins,losses,be,winRate:wins/trades.length*100,totalPL,avgRR,best:Math.max(...pls),worst:Math.min(...pls),streak,streakType:first||"" };
}

// ─── DD Calculator ────────────────────────────────────────────────────────────
function calcDD(trades: Trade[]) {
  if (trades.length < 2) return { dd: 0, maxDD: 0, ddPct: 0, maxDDPct: 0 };
  const sorted = [...trades].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  let cum = 0, peak = 0, maxDD = 0;
  for (const t of sorted) {
    cum += t.totalPL;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  const currentDD = peak - cum;
  const ddPct   = peak > 0 ? (currentDD / peak) * 100 : 0;
  const maxDDPct = peak > 0 ? (maxDD / peak) * 100 : 0;
  return { dd: currentDD, maxDD, ddPct, maxDDPct };
}

// ─── Equity Curve + DD (tab สลับ) ────────────────────────────────────────────
function PLChart({ trades }: { trades: Trade[] }) {
  const [tab, setTab] = useState<"equity"|"dd">("equity");

  if (trades.length < 2) return <p className="text-xs text-center py-6" style={{color:"var(--j-soft)",fontFamily:"'DM Mono',monospace"}}>need at least 2 sessions</p>;
  const sorted = [...trades].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  let cum=0;
  const pts = sorted.map(t=>{ cum+=t.totalPL; return cum; });
  const W=300,H=88,padL=6,padR=6,padT=8,padB=8;
  const innerW=W-padL-padR, innerH=H-padT-padB;

  // Equity curve
  const mn=Math.min(0,...pts), mx=Math.max(...pts), range=mx-mn||1;
  const X=(i:number)=> padL+(pts.length===1?innerW/2:(i/(pts.length-1))*innerW);
  const Y=(v:number)=> padT+innerH-((v-mn)/range)*innerH;
  const zeroY=Y(0), up=pts[pts.length-1]>=0;
  const color=up?"#3f9b73":"#d4685f", fillCol=up?"#bfe3d0":"#f3c4cb";
  let d=`M ${X(0)} ${Y(pts[0])}`;
  for(let i=1;i<pts.length;i++){ d+=` L ${X(i)} ${Y(pts[i-1])} L ${X(i)} ${Y(pts[i])}`; }
  const area=`${d} L ${X(pts.length-1)} ${padT+innerH} L ${X(0)} ${padT+innerH} Z`;

  // DD series
  const { dd, maxDD: mxDD, ddPct, maxDDPct } = calcDD(trades);
  let peak3=0;
  const ddSeries = pts.map(v=>{ if(v>peak3) peak3=v; return peak3-v; });
  const ddMax = Math.max(...ddSeries)||1;
  const Ydd=(v:number)=> padT+innerH*( v/ddMax );
  let ddPath=`M ${X(0)} ${Ydd(ddSeries[0])}`;
  for(let i=1;i<ddSeries.length;i++){ ddPath+=` L ${X(i)} ${Ydd(ddSeries[i-1])} L ${X(i)} ${Ydd(ddSeries[i])}`; }
  const ddArea=`${ddPath} L ${X(ddSeries.length-1)} ${padT+innerH} L ${X(0)} ${padT+innerH} Z`;

  const tabBtn = (t:"equity"|"dd", label:string, bg:string) => (
    <button onClick={()=>setTab(t)} style={{
      fontFamily:"'DM Mono',monospace",fontSize:10,padding:"3px 10px",cursor:"pointer",
      border:"1.5px solid var(--j-ink)",borderRadius:"5px 5px 0 0",
      background: tab===t ? bg : "var(--j-win)",
      color:"var(--j-ink)", fontWeight: tab===t ? 600 : 400,
      borderBottom: tab===t ? `1.5px solid ${bg}` : "1.5px solid var(--j-ink)",
      marginBottom: tab===t ? -1.5 : 0,
    }}>{label}</button>
  );

  return (
    <div>
      {/* Tab bar */}
      <div style={{display:"flex",gap:4,marginBottom:0,position:"relative",zIndex:1}}>
        {tabBtn("equity","📈 Equity","var(--j-sky)")}
        {tabBtn("dd","📉 Drawdown","var(--j-coral)")}
      </div>

      {/* Chart area */}
      <div style={{border:"2px solid var(--j-ink)",borderRadius:"0 7px 7px 7px",background:"#fbf6ea",padding:"4px"}}>
        {tab==="equity" ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
            {pts.map((_,i)=><line key={`v${i}`} x1={X(i)} y1={padT} x2={X(i)} y2={padT+innerH} stroke="#e3d9c4" strokeWidth="1"/>)}
            {[0.5,1].map((g,i)=>{ const yy=padT+innerH*(1-g); return <line key={`h${i}`} x1={padL} y1={yy} x2={W-padR} y2={yy} stroke="#e3d9c4" strokeWidth="1"/>; })}
            <line x1={padL} y1={zeroY} x2={W-padR} y2={zeroY} stroke="#b0a290" strokeWidth="1.5" strokeDasharray="3 2"/>
            <path d={area} fill={fillCol} fillOpacity="0.55"/>
            <path d={d} fill="none" stroke={color} strokeWidth="3"/>
            {pts.map((v,i)=><rect key={`m${i}`} x={X(i)-2.5} y={Y(v)-2.5} width="5" height="5" fill={fillCol} stroke="var(--j-ink)" strokeWidth="1.5"/>)}
          </svg>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
            {pts.map((_,i)=><line key={`v${i}`} x1={X(i)} y1={padT} x2={X(i)} y2={padT+innerH} stroke="#e3d9c4" strokeWidth="1"/>)}
            {[0.25,0.5,0.75].map((g,i)=>{ const yy=padT+innerH*g; return <line key={`h${i}`} x1={padL} y1={yy} x2={W-padR} y2={yy} stroke="#e3d9c4" strokeWidth="1"/>; })}
            {/* DD 20% limit line */}
            <line x1={padL} y1={Ydd(ddMax*0.2)} x2={W-padR} y2={Ydd(ddMax*0.2)} stroke="#d4685f" strokeWidth="1" strokeDasharray="3 2"/>
            <path d={ddArea} fill="#f3c4cb" fillOpacity="0.55"/>
            <path d={ddPath} fill="none" stroke="#d4685f" strokeWidth="3"/>
            {ddSeries.map((v,i)=><rect key={`dm${i}`} x={X(i)-2.5} y={Ydd(v)-2.5} width="5" height="5" fill="#f3c4cb" stroke="var(--j-ink)" strokeWidth="1.5"/>)}
          </svg>
        )}
      </div>

      {/* DD stats — แสดงเฉพาะตอนกด DD tab */}
      {tab==="dd" && (
        <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
          <div style={{flex:1,background:"#f3c4cb55",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",minWidth:100}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Current DD</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:22,color:dd>0?"#d4685f":"#5fae89",lineHeight:1}}>{dd>0?`-$${dd.toFixed(2)}`:"+$0.00"}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#d4685f"}}>{ddPct>0?`-${ddPct.toFixed(1)}% from peak`:""}</div>
          </div>
          <div style={{flex:1,background:"#f6cdd555",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",minWidth:100}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Max DD</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:22,color:"#d4685f",lineHeight:1}}>{mxDD>0?`-$${mxDD.toFixed(2)}`:"+$0.00"}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#d4685f"}}>{maxDDPct>0?`-${maxDDPct.toFixed(1)}% worst`:""}</div>
          </div>
          <div style={{flex:1,background:"var(--j-lav)55",border:"1.5px solid var(--j-ink)",borderRadius:7,padding:"6px 10px",minWidth:100}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",textTransform:"uppercase",letterSpacing:1,marginBottom:2}}>Status</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:18,color:maxDDPct>20?"#d4685f":maxDDPct>10?"#d4a65f":"#5fae89",lineHeight:1.2}}>
              {maxDDPct<=10?"✓ SAFE":maxDDPct<=20?"⚠ WATCH":"✕ DANGER"}
            </div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)"}}>limit 20%</div>
          </div>
        </div>
      )}
    </div>
  );
}

const defaultForm = () => ({
  date: new Date().toISOString().split("T")[0],
  time: new Date().toTimeString().slice(0,5),
  symbol: "XAUUSDc", direction: "SHORT" as Direction, session: "Tokyo" as Session,
  entryPrice: 0, exitPrices: [] as number[], lotPerOrder: 0.10, lotInput: "0.10",
  slPrice: 0, tpPrice: 0, riskAmount: 5, rr: 0,
  htfBias: "Bearish" as "Bullish"|"Bearish"|"Neutral",
  smcConcept: [] as SMCConcept[], tf: "M5" as TF, result: "WIN" as Result,
  entryModel: "", notes: "", screenshotUrl: "",
});

function Win({title,color,children,controls=true}:{title:string;color:string;children:any;controls?:boolean}) {
  return (
    <div className="j-win">
      <div className="j-bar" style={{background:color}}>
        <span className="j-t">{title}</span>
        {controls && <span className="j-ctrl"><span>_</span><span>▢</span><span>✕</span></span>}
      </div>
      <div className="j-body">{children}</div>
    </div>
  );
}

// ─── Weekly Mini Goals ────────────────────────────────────────────────────────
const WEEKLY_GOALS = [
  { id:"w1", label:"Win 3 trades",        check:(t:Trade[])=>t.filter(x=>x.result==="WIN").length>=3 },
  { id:"w2", label:"R:R ≥ 2 × 3 trades", check:(t:Trade[])=>t.filter(x=>x.rr>=2).length>=3 },
  { id:"w3", label:"No LOSS streak >2",   check:(t:Trade[])=>{
    let streak=0,max=0;
    [...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{ if(x.result==="LOSS"){streak++;max=Math.max(max,streak);}else streak=0; });
    return max<=2;
  }},
  { id:"w4", label:"Journal 5 sessions",  check:(t:Trade[])=>t.length>=5 },
  { id:"w5", label:"Win Rate ≥ 60%",      check:(t:Trade[])=>t.length>=3&&t.filter(x=>x.result==="WIN").length/t.length>=0.6 },
];

function WeeklyGoals({ trades }: { trades: Trade[] }) {
  // เทรดของสัปดาห์นี้
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const monday = new Date(now); monday.setDate(now.getDate()-(dow===0?6:dow-1)); monday.setHours(0,0,0,0);
  const weekStr = monday.toISOString().split("T")[0];
  const weekTrades = trades.filter(t=>t.date>=weekStr);
  const done = WEEKLY_GOALS.filter(g=>g.check(weekTrades)).length;

  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"var(--j-butter)"}}>
        <span className="j-t">🎯 WEEKLY GOALS</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-ink)",fontWeight:600}}>
          {done}/{WEEKLY_GOALS.length} done
        </span>
        <span className="j-ctrl"><span>_</span><span>▢</span><span>✕</span></span>
      </div>
      <div className="j-body" style={{display:"flex",flexDirection:"column",gap:7}}>
        {/* progress bar */}
        <div>
          <div style={{height:10,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",background:"var(--j-win)",display:"flex",marginBottom:6}}>
            <div style={{background:"var(--j-mint)",width:`${(done/WEEKLY_GOALS.length)*100}%`,transition:"width .4s"}}/>
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)"}}>
            Week of {weekStr} · {weekTrades.length} sessions logged
          </div>
        </div>
        {/* goal list */}
        {WEEKLY_GOALS.map(g=>{
          const ok = g.check(weekTrades);
          return (
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",
              border:`2px solid var(--j-ink)`,borderRadius:8,
              background: ok ? "var(--j-mint)" : "var(--j-win)",
              boxShadow: ok ? "2px 2px 0 var(--j-ink)" : "none",
              transition:"all .2s"}}>
              <div style={{width:22,height:22,border:"2px solid var(--j-ink)",borderRadius:5,
                background: ok?"var(--j-ink)":"transparent",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                fontFamily:"'VT323',monospace",fontSize:14,color:"var(--j-win)",
                boxShadow: ok?"none":"1px 1px 0 var(--j-ink)"}}>
                {ok?"✓":""}
              </div>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,
                color: ok?"var(--j-ink)":"var(--j-soft)",
                textDecoration: ok?"line-through":"none",fontWeight:ok?600:400}}>
                {g.label}
              </span>
              {ok && <span style={{marginLeft:"auto",fontSize:14}}>⭐</span>}
            </div>
          );
        })}
        {done===WEEKLY_GOALS.length && (
          <div style={{background:"var(--j-lav)",border:"2px solid var(--j-ink)",borderRadius:8,padding:"10px",
            textAlign:"center",fontFamily:"'VT323',monospace",fontSize:22,boxShadow:"2px 2px 0 var(--j-ink)"}}>
            🏆 PERFECT WEEK! ALL GOALS DONE!
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Achievement Badges ───────────────────────────────────────────────────────
const BADGES = [
  { id:"b01", icon:"🔥", label:"First Blood",      desc:"First WIN trade",
    check:(t:Trade[])=>t.some(x=>x.result==="WIN") },
  { id:"b02", icon:"⚡", label:"Hat Trick",         desc:"3 WIN streak",
    check:(t:Trade[])=>{ let s=0,mx=0; [...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{if(x.result==="WIN"){s++;mx=Math.max(mx,s);}else s=0;}); return mx>=3; }},
  { id:"b03", icon:"💎", label:"Diamond Hands",     desc:"5 WIN streak",
    check:(t:Trade[])=>{ let s=0,mx=0; [...t].sort((a,b)=>a.date.localeCompare(b.date)).forEach(x=>{if(x.result==="WIN"){s++;mx=Math.max(mx,s);}else s=0;}); return mx>=5; }},
  { id:"b04", icon:"📐", label:"R:R Master",        desc:"R:R ≥ 2 five times",
    check:(t:Trade[])=>t.filter(x=>x.rr>=2).length>=5 },
  { id:"b05", icon:"🎯", label:"Sniper",            desc:"R:R ≥ 3 three times",
    check:(t:Trade[])=>t.filter(x=>x.rr>=3).length>=3 },
  { id:"b06", icon:"📓", label:"Loyal Logger",      desc:"10 sessions journaled",
    check:(t:Trade[])=>t.length>=10 },
  { id:"b07", icon:"📚", label:"Veteran",           desc:"50 sessions journaled",
    check:(t:Trade[])=>t.length>=50 },
  { id:"b08", icon:"💰", label:"First $50",         desc:"Cumulative profit ≥ $50",
    check:(t:Trade[])=>t.reduce((s,x)=>s+x.totalPL,0)>=50 },
  { id:"b09", icon:"💵", label:"Century Club",      desc:"Cumulative profit ≥ $100",
    check:(t:Trade[])=>t.reduce((s,x)=>s+x.totalPL,0)>=100 },
  { id:"b10", icon:"🏦", label:"Phase 1 Clear",     desc:"Equity reached $1,000",
    check:(t:Trade[])=>STARTING_CAPITAL+t.reduce((s,x)=>s+x.totalPL,0)>=1000 },
  { id:"b11", icon:"📊", label:"Win Machine",       desc:"Win rate ≥ 60% (min 10 trades)",
    check:(t:Trade[])=>t.length>=10&&t.filter(x=>x.result==="WIN").length/t.length>=0.6 },
  { id:"b12", icon:"🛡", label:"DD Guardian",       desc:"Max DD ≤ 10% (min 5 trades)",
    check:(t:Trade[])=>{ if(t.length<5) return false; const {maxDDPct}=calcDD(t); return maxDDPct<=10; }},
  { id:"b13", icon:"🌙", label:"Night Owl",         desc:"5 Tokyo session trades",
    check:(t:Trade[])=>t.filter(x=>x.session==="Tokyo").length>=5 },
  { id:"b14", icon:"☀️", label:"London Caller",    desc:"5 London session trades",
    check:(t:Trade[])=>t.filter(x=>x.session==="London").length>=5 },
  { id:"b15", icon:"🗺", label:"Session Master",    desc:"Trade all 4 sessions",
    check:(t:Trade[])=>["Tokyo","London","New York","Overlap"].every(s=>t.some(x=>x.session===s)) },
];

function AchievementBadges({ trades }: { trades: Trade[] }) {
  const [expand, setExpand] = useState(false);
  const unlocked = BADGES.filter(b=>b.check(trades));
  const locked   = BADGES.filter(b=>!b.check(trades));
  const show = expand ? BADGES : BADGES.slice(0, 8);

  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"var(--j-lav)"}}>
        <span className="j-t">🏆 ACHIEVEMENTS</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-ink)",fontWeight:600}}>
          {unlocked.length}/{BADGES.length} unlocked
        </span>
        <span className="j-ctrl"><span>_</span><span>▢</span><span>✕</span></span>
      </div>
      <div className="j-body">
        {/* summary bar */}
        <div style={{marginBottom:12}}>
          <div style={{height:8,border:"2px solid var(--j-ink)",borderRadius:5,overflow:"hidden",background:"var(--j-win)",marginBottom:4}}>
            <div style={{height:"100%",background:"var(--j-lav)",width:`${(unlocked.length/BADGES.length)*100}%`,transition:"width .4s"}}/>
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)"}}>
            {unlocked.length} unlocked · {locked.length} remaining
          </div>
        </div>

        {/* badge grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {(expand?BADGES:BADGES.slice(0,9)).map(b=>{
            const ok = b.check(trades);
            return (
              <div key={b.id} title={b.desc} style={{
                border:"2px solid var(--j-ink)",borderRadius:9,padding:"10px 8px",
                textAlign:"center",cursor:"default",
                background: ok ? "var(--j-win)" : "#f1e9da",
                boxShadow: ok ? "3px 3px 0 var(--j-ink)" : "none",
                opacity: ok ? 1 : 0.45,
                transition:"all .2s",position:"relative",
              }}>
                {ok && <div style={{position:"absolute",top:4,right:5,width:7,height:7,borderRadius:"50%",background:"#5fae89",border:"1.5px solid var(--j-ink)"}}/>}
                <div style={{fontSize:22,marginBottom:4,filter:ok?"none":"grayscale(1)"}}>{b.icon}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600,color:"var(--j-ink)",lineHeight:1.2}}>{b.label}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",marginTop:2,lineHeight:1.2}}>{b.desc}</div>
              </div>
            );
          })}
        </div>

        <button onClick={()=>setExpand(!expand)}
          className="j-chip off" style={{width:"100%",marginTop:10,fontSize:10,textAlign:"center"}}>
          {expand ? "▲ Show less" : `▼ Show all ${BADGES.length} badges`}
        </button>
      </div>
    </div>
  );
}

// ─── Roadmap Widget ───────────────────────────────────────────────────────────
const STARTING_CAPITAL = 50;   // ทุนเริ่มต้นจริง $50 (equity = 50 + P/L จาก journal)
const MONTHLY_GOAL     = 2000;
const TOTAL_TARGET     = 20000;

const PHASES = [
  { id:1, label:"Phase 1", months:"Month 1–8",   from:50,    to:1000,
    color:"var(--j-coral)",  risk:"$5/trade",
    focus:"No lot increase · journal every trade",
    reminder:"✦ Phase 1 : No FOMO · Journal every trade · R:R ≥ 1:2 only ✦" },
  { id:2, label:"Phase 2", months:"Month 9–18",  from:1000,  to:12000,
    color:"var(--j-butter)", risk:"$20–150/trade",
    focus:"Add $500/mo · win rate ≥ 55%",
    reminder:"✦ Phase 2 : Add capital regularly · Win rate ≥ 55% · No overtrade ✦" },
  { id:3, label:"Phase 3", months:"Month 19–24", from:12000, to:20000,
    color:"var(--j-mint)",   risk:"$150–200/trade",
    focus:"Withdraw $2,000/mo · control DD",
    reminder:"✦ Phase 3 : Withdraw $2,000/mo · Control DD · You are almost there ✦" },
];

function RoadmapWidget({ trades }: { trades: Trade[] }) {
  const totalPL       = trades.reduce((s,t) => s+t.totalPL, 0);
  const currentEquity = Math.max(0, STARTING_CAPITAL + totalPL);
  const currentPhase  = PHASES.find(p => currentEquity < p.to) || PHASES[PHASES.length-1];
  const phaseProgress = Math.min(100, Math.max(0,
    ((currentEquity - currentPhase.from) / (currentPhase.to - currentPhase.from)) * 100
  ));
  const overallPct = Math.min(100, (currentEquity / TOTAL_TARGET) * 100);
  const now       = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const monthlyPL = trades.filter(t => t.date.startsWith(thisMonth)).reduce((s,t) => s+t.totalPL, 0);
  const fmt  = (v: number) => `$${Math.abs(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const sign = (v: number) => v >= 0 ? "+" : "-";

  return (
    <div className="j-win">
      <div className="j-bar" style={{background:"var(--j-lav)"}}>
        <span className="j-t">🎯 ROADMAP — 2 YEAR PLAN</span>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>target: {fmt(MONTHLY_GOAL)}/mo</span>
      </div>
      <div className="j-body" style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",marginBottom:2}}>CURRENT EQUITY</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:36,lineHeight:1}}>{fmt(currentEquity)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",marginBottom:2}}>THIS MONTH</div>
            <div style={{fontFamily:"'VT323',monospace",fontSize:24,lineHeight:1,color:monthlyPL>=0?"#5fae89":"#e08a82"}}>
              {sign(monthlyPL)}{fmt(monthlyPL)}
            </div>
          </div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginBottom:4}}>
            <span>$100</span>
            <span style={{color:"var(--j-ink)",fontWeight:500}}>{overallPct.toFixed(1)}% to {fmt(TOTAL_TARGET)}</span>
            <span>{fmt(TOTAL_TARGET)}</span>
          </div>
          <div style={{height:12,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",background:"var(--j-win)",display:"flex"}}>
            {PHASES.map(p => {
              const segW  = ((p.to - p.from) / TOTAL_TARGET) * 100;
              const filled = Math.min(100, Math.max(0, ((currentEquity - p.from) / (p.to - p.from)) * 100));
              return (
                <div key={p.id} style={{width:`${segW}%`,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",inset:0,background:"#e3d9c4"}}/>
                  <div style={{position:"absolute",top:0,left:0,height:"100%",width:`${filled}%`,background:p.color,transition:"width .4s"}}/>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",marginTop:3}}>
            {PHASES.map(p=>(
              <div key={p.id} style={{width:`${((p.to-p.from)/TOTAL_TARGET)*100}%`,textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)"}}>P{p.id}</div>
            ))}
          </div>
        </div>
        <div style={{background:currentPhase.color+"55",border:"2px solid var(--j-ink)",borderRadius:8,padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600,background:currentPhase.color,border:"1.5px solid var(--j-ink)",borderRadius:5,padding:"2px 7px",marginRight:6}}>{currentPhase.label}</span>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>{currentPhase.months}</span>
            </div>
            <span style={{fontFamily:"'VT323',monospace",fontSize:20}}>{phaseProgress.toFixed(0)}%</span>
          </div>
          <div style={{height:8,border:"1.5px solid var(--j-ink)",borderRadius:5,overflow:"hidden",background:"var(--j-win)",marginBottom:8}}>
            <div style={{height:"100%",width:`${phaseProgress}%`,background:currentPhase.color,transition:"width .4s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginBottom:6}}>
            <span>{fmt(currentPhase.from)}</span>
            <span style={{color:"var(--j-ink)",fontSize:10}}>{fmt(currentEquity)} → {fmt(currentPhase.to)}</span>
            <span>{fmt(currentPhase.to)}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10}}><span style={{color:"var(--j-soft)"}}>Risk </span><b>{currentPhase.risk}</b></div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>{currentPhase.focus}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {PHASES.map(p => {
            const done=currentEquity>=p.to, cur=p.id===currentPhase.id;
            return (
              <div key={p.id} style={{flex:1,border:"2px solid var(--j-ink)",borderRadius:7,background:done?p.color:cur?p.color+"44":"var(--j-win)",padding:"7px 6px",textAlign:"center",boxShadow:cur?"2px 2px 0 var(--j-ink)":"none"}}>
                <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:done?"#3a3028":"var(--j-soft)"}}>{done?"✓":cur?"▶":"○"}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:600}}>P{p.id}</div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"var(--j-soft)"}}>{fmt(p.to)}</div>
              </div>
            );
          })}
          <div style={{flex:1,border:"2px solid var(--j-ink)",borderRadius:7,background:currentEquity>=TOTAL_TARGET?"var(--j-mint)":"var(--j-win)",padding:"7px 6px",textAlign:"center"}}>
            <div style={{fontFamily:"'VT323',monospace",fontSize:11,color:"var(--j-soft)"}}>{currentEquity>=TOTAL_TARGET?"★":"◎"}</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,fontWeight:600}}>GOAL</div>
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"var(--j-soft)"}}>$2K/mo</div>
          </div>
        </div>
        <div style={{background:"#fbf6ea",border:"1.5px dashed var(--j-ink)",borderRadius:7,padding:"8px 10px",fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",lineHeight:1.6,textAlign:"center"}}>
          {currentPhase.reminder}
        </div>
      </div>
    </div>
  );
}

export default function JournalPage() {
  const [trades,setTrades]   = useState<Trade[]>([]);
  const [view,setView]       = useState<"dashboard"|"list"|"calendar"|"add">("dashboard");
  const [form,setForm]       = useState(defaultForm());
  const [editId,setEditId]   = useState<string|null>(null);
  const [filter,setFilter]   = useState<"ALL"|Result>("ALL");
  const [accountType,setAccountType] = useState<AccountType>("cent");
  const [exitInput,setExitInput]     = useState("");
  const [pasteInput,setPasteInput]   = useState("");
  const [uploading,setUploading]     = useState(false);
  const [lightbox,setLightbox]       = useState<string|null>(null);
  const [calRef,setCalRef]           = useState(()=>{ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1); });
  const [calSelected,setCalSelected] = useState<string|null>(null);
  const [booting,setBooting]         = useState(true);
  const [bootText,setBootText]       = useState("");
  const [bootDone,setBootDone]       = useState(false);
  const [pixels,setPixels]           = useState<{id:number;x:number;y:number;c:string}[]>([]);
  const [saving,setSaving]           = useState(false);

  // ── Daily Loss Limit ───────────────────────────────────────────────────────
  const DAILY_LOSS_LIMIT = 3;
  const [showLossAlert, setShowLossAlert] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayLosses = trades.filter(t => t.date === todayStr && t.result === "LOSS").length;

  // ขึ้นทุกครั้งที่ trades โหลด / view เปลี่ยน ถ้า LOSS ≥ 3 วันนี้
  useEffect(()=>{
    if (todayLosses >= DAILY_LOSS_LIMIT) setShowLossAlert(true);
  }, [trades, todayLosses, view]);

  const dismissLossAlert = () => setShowLossAlert(false);

  useEffect(()=>{
    // Boot เร็วขึ้น — typewriter สั้นลง แล้วปิดเร็ว
    const lines=["JOURNAL.EXE","LOADING... 🥇"];
    let i=0,charIdx=0,current="";
    const next=()=>{
      if(i>=lines.length){ setTimeout(()=>setBootDone(true),200); setTimeout(()=>setBooting(false),600); return; }
      if(charIdx<lines[i].length){ current+=lines[i][charIdx]; charIdx++;
        setBootText(lines.slice(0,i).join("\n")+(i>0?"\n":"")+current); setTimeout(next,22);
      } else { i++; charIdx=0; current=""; setTimeout(next,150); }
    };
    setTimeout(next,100);
  },[]);

  const sparkle=()=>{
    const colors=["var(--j-mint)","var(--j-pink)","var(--j-butter)","var(--j-lav)","var(--j-coral)","var(--j-sky)"];
    setPixels(Array.from({length:18},(_,i)=>({id:i,x:Math.random()*200-100,y:Math.random()*-120-20,c:colors[Math.floor(Math.random()*colors.length)]})));
    setTimeout(()=>setPixels([]),800);
  };

  useEffect(()=>{
    const loadData=async()=>{
      const { data:{user} }=await supabase.auth.getUser();
      if(!user){ setTrades(load()); return; }
      const { data,error }=await supabase.from("journal_trades").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
      if(error){ console.error("Supabase error:",error); setTrades(load()); return; }
      if(data&&data.length>0){
        const mapped=data.map((r:any)=>({
          id:r.id,date:r.date,time:r.time,symbol:r.symbol,direction:r.direction,session:r.session,
          entryPrice:Number(r.entry_price),exitPrices:r.exit_prices||[],avgExit:Number(r.avg_exit),
          lotPerOrder:Number(r.lot_per_order),orderCount:Number(r.order_count),totalLot:Number(r.total_lot),
          totalPL:Number(r.total_pl),slPrice:Number(r.sl_price),tpPrice:Number(r.tp_price)||0,rr:Number(r.rr),
          result:r.result,smcConcept:r.smc_concept||[],htfBias:r.htf_bias,entryModel:r.entry_model||"",
          tf:r.tf||"M5",notes:r.notes||"",screenshotUrl:r.screenshot_url||"",createdAt:r.created_at,
        }));
        setTrades(mapped); save(mapped);
      } else { setTrades([]); }
    };
    loadData();
  },[]);

  const stats=calcStats(trades);
  const f=(k:any,v:any)=>setForm((p:any)=>({...p,[k]:v}));
  const exits=form.exitPrices;
  const avgExit=exits.length?exits.reduce((a,b)=>a+b,0)/exits.length:0;
  const isCent=accountType==="cent";
  const perOrderPLs=exits.map(ex=>calcPL(form.direction,form.entryPrice,ex,form.lotPerOrder,isCent));
  const totalPL=perOrderPLs.reduce((a,b)=>a+b,0);
  const totalLot=exits.length*form.lotPerOrder;
  const result:Result=totalPL>0.01?"WIN":totalPL<-0.01?"LOSS":"BE";
  const riskAmount=(form as any).riskAmount||5;
  const autoRR=(()=>{
    const e=form.entryPrice,sl=form.slPrice,tp=form.tpPrice;
    if(e&&sl&&tp){ const risk=Math.abs(e-sl),reward=Math.abs(tp-e); return risk>0?Math.round((reward/risk)*100)/100:0; }
    if(riskAmount>0&&totalPL!==0) return Math.round((totalPL/riskAmount)*100)/100;
    return 0;
  })();

  const addExit=()=>{ const v=parseFloat(exitInput); if(!isNaN(v)&&v>0){ f("exitPrices",[...exits,v]); setExitInput(""); } };
  const parsePaste=()=>{
    const nums=pasteInput.split(/[\n,\s]+/).map(s=>parseFloat(s.replace(/,/g,""))).filter(n=>!isNaN(n)&&n>0);
    if(nums.length){ f("exitPrices",[...exits,...nums]); setPasteInput(""); }
  };
  const removeExit=(i:number)=>f("exitPrices",exits.filter((_,j)=>j!==i));

  const uploadScreenshot=async(file:File)=>{
    const { data:{user} }=await supabase.auth.getUser();
    if(!user){ alert("Please log in to upload."); return; }
    setUploading(true);
    try {
      const ext=(file.name.split(".").pop()||"png").toLowerCase();
      const path=`${user.id}/${Date.now()}.${ext}`;
      const { error }=await supabase.storage.from("journal-screenshots").upload(path,file,{upsert:true,contentType:file.type});
      if(error){ console.error(error); alert("Upload failed: "+error.message); }
      else { const { data }=supabase.storage.from("journal-screenshots").getPublicUrl(path); f("screenshotUrl",data.publicUrl); }
    } catch(e:any){ console.error(e); alert("Upload error"); }
    setUploading(false);
  };

  const saveTrade=async()=>{
    if(!exits.length||!form.entryPrice) return;
    const trade:Trade={
      id:editId||uid(), createdAt:new Date().toISOString(),
      date:form.date,time:form.time,symbol:form.symbol,direction:form.direction,session:form.session,
      entryPrice:form.entryPrice,exitPrices:exits,avgExit:Math.round(avgExit*1000)/1000,
      lotPerOrder:form.lotPerOrder,orderCount:exits.length,totalLot,totalPL:Math.round(totalPL*100)/100,
      slPrice:form.slPrice,riskAmount:(form as any).riskAmount||5,rr:autoRR||form.rr,result,
      smcConcept:form.smcConcept,htfBias:form.htfBias,entryModel:form.entryModel,
      tf:(form as any).tf??"M5",notes:form.notes,tpPrice:(form as any).tpPrice??0,
      screenshotUrl:(form as any).screenshotUrl||"",
    };
    const updated=editId?trades.map(t=>t.id===editId?trade:t):[trade,...trades];
    setTrades(updated); save(updated);
    const { data:{user} }=await supabase.auth.getUser();
    if(user){
      const row={
        id:trade.id,user_id:user.id,date:trade.date,time:trade.time,symbol:trade.symbol,
        direction:trade.direction,session:trade.session,entry_price:trade.entryPrice,
        exit_prices:trade.exitPrices,avg_exit:trade.avgExit,lot_per_order:trade.lotPerOrder,
        order_count:trade.orderCount,total_lot:trade.totalLot,total_pl:trade.totalPL,
        sl_price:trade.slPrice,tp_price:trade.tpPrice||0,rr:trade.rr,result:trade.result,
        smc_concept:trade.smcConcept,htf_bias:trade.htfBias,entry_model:trade.entryModel,
        tf:trade.tf||"M5",notes:trade.notes,screenshot_url:trade.screenshotUrl||null,
        created_at:trade.createdAt,
      };
      await supabase.from("journal_trades").upsert(row,{onConflict:"id"});
    }
    setForm(defaultForm()); setExitInput(""); setPasteInput(""); setEditId(null);
    sparkle(); setSaving(true); setTimeout(()=>setSaving(false),900);
    setView("list");
  };

  const deleteTrade=async(id:string)=>{
    if(!confirm("Delete this session?")) return;
    const u=trades.filter(t=>t.id!==id); setTrades(u); save(u);
    const { data:{user} }=await supabase.auth.getUser();
    if(user) await supabase.from("journal_trades").delete().eq("id",id).eq("user_id",user.id);
  };
  const editTrade=(t:Trade)=>{
    (setForm as any)({...defaultForm(),date:t.date,time:t.time,symbol:t.symbol,direction:t.direction,session:t.session,
      entryPrice:t.entryPrice,exitPrices:t.exitPrices,lotPerOrder:t.lotPerOrder,lotInput:String(t.lotPerOrder),
      slPrice:t.slPrice,tpPrice:(t as any).tpPrice??0,rr:t.rr,result:t.result,htfBias:t.htfBias,
      smcConcept:t.smcConcept,entryModel:t.entryModel,tf:(t as any).tf??"M5",notes:t.notes,
      screenshotUrl:(t as any).screenshotUrl||""});
    setEditId(t.id); setView("add");
  };

  const filtered=filter==="ALL"?trades:trades.filter(t=>t.result===filter);

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
        .j-boot-logo{font-family:'VT323',monospace;font-size:52px;color:#f6e6ac;letter-spacing:3px;text-shadow:0 0 20px #f6e6ac88,0 0 40px #f6e6ac44;animation:blink 1s step-end infinite;}
        @keyframes blink{50%{opacity:.7}}
        .j-boot-text{font-family:'DM Mono',monospace;font-size:13px;color:#c0e6d4;white-space:pre;line-height:1.8;text-align:left;min-height:96px;}
        .j-boot-cursor{display:inline-block;width:9px;height:15px;background:#c0e6d4;animation:cur .7s step-end infinite;vertical-align:middle;}
        @keyframes cur{50%{opacity:0}}
        .j-boot-bar{width:280px;height:22px;border:2px solid #c0e6d4;border-radius:4px;overflow:hidden;position:relative;}
        .j-boot-fill{height:100%;background:linear-gradient(90deg,#c0e6d4,#8fd3b4);animation:barfill 2.5s ease forwards;}
        @keyframes barfill{from{width:0%}to{width:100%}}
        @keyframes winpop{0%{opacity:0;transform:scale(.92) translate(0,6px)}60%{transform:scale(1.03) translate(0,-2px)}80%{transform:scale(.98)}100%{opacity:1;transform:scale(1)}}
        .j-win{animation:winpop .18s steps(3,end) both;}
        .j-pixel{position:absolute;width:8px;height:8px;border:1.5px solid var(--j-ink);pointer-events:none;animation:pixelfly .7s steps(4,end) forwards;}
        @keyframes pixelfly{0%{opacity:1;transform:translate(0,0) scale(1)}50%{opacity:1;transform:translate(var(--px),var(--py)) scale(1.2)}100%{opacity:0;transform:translate(var(--px),calc(var(--py) + 20px)) scale(0)}}
        @keyframes savepulse{0%,100%{box-shadow:3px 3px 0 var(--j-ink)}50%{box-shadow:0 0 0 var(--j-ink),0 0 14px var(--j-mint)}}
        .j-saving{animation:savepulse .2s steps(2,end) 4;}
        @keyframes tabslide{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .j-tabcontent{animation:tabslide .15s steps(2,end) both;}
        .j-win{background:var(--j-win);border:2.5px solid var(--j-ink);border-radius:9px;box-shadow:4px 4px 0 var(--j-ink);overflow:hidden;}
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
        .j-cell{aspect-ratio:1;border:1.5px solid var(--j-ink);border-radius:6px;background:var(--j-win);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-family:'DM Mono';position:relative;transition:.1s;gap:1px;}
        .j-cell.empty{border:none;background:transparent;cursor:default;}
        .j-cell.sel{box-shadow:2px 2px 0 var(--j-ink);transform:translate(-1px,-1px);}
        .j-day{font-size:12px;line-height:1;}
        .j-pl{font-size:8px;font-weight:500;line-height:1;letter-spacing:-0.3px;}
      `}</style>

      {booting&&(
        <div className={`j-boot ${bootDone?"done":""}`}>
          <div className="j-boot-logo">JOURNAL.EXE</div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:13,color:"#c0e6d4",marginBottom:6,minHeight:40,whiteSpace:"pre"}}>
            {bootText}<span className="j-boot-cursor"/>
          </div>
          <div className="j-boot-bar" style={{position:"relative"}}>
            <div className="j-boot-fill"/>
            {/* เลข % วิ่งตาม bar */}
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'VT323',monospace",fontSize:12,color:"#2a1f14",mixBlendMode:"multiply"}}>
              LOADING...
            </div>
          </div>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"#c0e6d4",opacity:.6,letterSpacing:2}}>
            SMC · XAUUSD · TRUST YOUR OWN
          </div>
        </div>
      )}

      <div style={{padding:"14px 12px 0"}}>
        <div className="j-win" style={{maxWidth:780,margin:"0 auto"}}>
          <div className="j-bar" style={{background:"var(--j-pink)"}}>
            <span className="j-t">★ JOURNAL.EXE — XAUUSD</span>
            <span className="j-ctrl"><span>_</span><span>▢</span>
              <Link href="/" style={{textDecoration:"none",color:"var(--j-ink)"}} title="Home"><span>✕</span></Link>
            </span>
          </div>
          <div className="j-body" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:34,lineHeight:.8}}>TRADING JOURNAL</div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2,color:"var(--j-soft)",marginTop:4}}>✦ SMC · GOLD DIARY ✦</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={()=>setAccountType(accountType==="cent"?"standard":"cent")} className="j-chip" style={{fontSize:11,background:accountType==="cent"?"var(--j-butter)":"var(--j-lav)"}}>
                {accountType==="cent"?"Cent $":"Std $"}
              </button>
              <button onClick={()=>{ setForm(defaultForm()); setExitInput(""); setPasteInput(""); setEditId(null); setView("add"); }} className="j-btn" style={{padding:"9px 14px",background:"var(--j-mint)",fontSize:13}}>✎ New</button>
            </div>
          </div>
        </div>
        <div style={{maxWidth:780,margin:"14px auto 0",display:"flex",gap:6,borderBottom:"2.5px solid var(--j-ink)"}}>
          {([["dashboard","📊 Dashboard"],["list","📋 Sessions"],["calendar","📅 Calendar"]] as const).map(([v,label])=>(
            <button key={v} onClick={()=>setView(v as any)} className={`j-tab ${view===v?"on":""}`}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{maxWidth:780,margin:"0 auto",padding:"16px 12px 0"}}>
        <div style={{position:"fixed",top:"50%",left:"50%",pointerEvents:"none",zIndex:1000}}>
          {pixels.map(p=>(<div key={p.id} className="j-pixel" style={{"--px":`${p.x}px`,"--py":`${p.y}px`,background:p.c} as any}/>))}
        </div>

        {view==="dashboard"&&(
          <div className="space-y-4 j-tabcontent">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="j-stat" style={{background:"var(--j-mint)"}}><div className="j-num">{stats.winRate.toFixed(0)}%</div><div className="j-statlab">Win Rate</div></div>
              <div className="j-stat" style={{background:stats.totalPL>=0?"var(--j-sky)":"var(--j-coral)"}}><div className="j-num">{money(stats.totalPL)}</div><div className="j-statlab">Total P/L</div></div>
              <div className="j-stat" style={{background:"var(--j-butter)"}}><div className="j-num">{stats.total}</div><div className="j-statlab">Sessions</div></div>
              <div className="j-stat" style={{background:"var(--j-lav)"}}><div className="j-num">{stats.avgRR.toFixed(1)}R</div><div className="j-statlab">Avg R:R</div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Win title="WIN / LOSS / BE" color="var(--j-mint)" controls={false}>
                <div className="flex gap-4 mb-3">
                  <div className="text-center"><div className="j-num" style={{color:"#5fae89"}}>{stats.wins}</div><div className="j-statlab">Win</div></div>
                  <div className="text-center"><div className="j-num" style={{color:"#e08a82"}}>{stats.losses}</div><div className="j-statlab">Loss</div></div>
                  <div className="text-center"><div className="j-num" style={{color:"var(--j-soft)"}}>{stats.be}</div><div className="j-statlab">BE</div></div>
                </div>
                {stats.total>0&&(<div style={{height:10,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",display:"flex",background:"var(--j-win)"}}>
                  <div style={{background:"#8fd3b4",width:`${stats.winRate}%`}}/><div style={{background:"#d8cdbd",width:`${stats.be/stats.total*100}%`}}/><div style={{background:"#eda9a1",flex:1}}/>
                </div>)}
              </Win>
              <Win title="STREAK" color="var(--j-butter)" controls={false}>
                <div className="j-num" style={{fontSize:38,color:stats.streakType==="WIN"?"#5fae89":stats.streakType==="LOSS"?"#e08a82":"var(--j-soft)"}}>
                  {stats.streakType==="WIN"?`🔥${stats.streak}W`:stats.streakType==="LOSS"?`❄️${stats.streak}L`:"-"}
                </div>
                <div style={{marginTop:6,fontSize:12,fontFamily:"'DM Mono'"}}>
                  <div><span style={{color:"var(--j-soft)"}}>Best </span><b style={{color:"#5fae89"}}>{money(stats.best)}</b></div>
                  <div><span style={{color:"var(--j-soft)"}}>Worst </span><b style={{color:"#e08a82"}}>{money(stats.worst)}</b></div>
                </div>
              </Win>
            </div>
            <Win title="📈 EQUITY CURVE + DRAWDOWN" color="var(--j-sky)"><PLChart trades={trades}/></Win>
            <WeeklyGoals trades={trades}/>
            <AchievementBadges trades={trades}/>
            <RoadmapWidget trades={trades}/>
            <Win title="🕘 RECENT SESSIONS" color="var(--j-peach)">
              {trades.slice(0,5).map(t=>(
                <div key={t.id} className="flex items-center gap-2 py-2" style={{borderBottom:"1.5px dashed #e3d9c4"}}>
                  <span className="j-mini" style={{background:t.direction==="LONG"?"var(--j-mint)":"var(--j-coral)"}}>{t.direction}</span>
                  <div className="flex-1 min-w-0">
                    <div style={{fontSize:12,fontWeight:600}}>{t.date} · {t.session}</div>
                    <div style={{fontSize:10,color:"var(--j-soft)",fontFamily:"'DM Mono'"}}>{t.orderCount} orders · {t.entryPrice}→{t.avgExit}</div>
                  </div>
                  {t.screenshotUrl&&<span title="has screenshot">🖼</span>}
                  <b style={{fontFamily:"'DM Mono'",color:t.totalPL>=0?"#5fae89":"#e08a82"}}>{money(t.totalPL)}</b>
                </div>
              ))}
              {!trades.length&&<p className="text-center py-6" style={{color:"var(--j-soft)",fontSize:13}}>No sessions yet · tap ✎ New</p>}
            </Win>
          </div>
        )}

        {view==="list"&&(
          <div className="space-y-3 j-tabcontent">
            <div className="flex gap-2 items-center flex-wrap">
              {(["ALL","WIN","LOSS","BE"] as const).map(r=>(
                <button key={r} onClick={()=>setFilter(r)} className={`j-chip ${filter===r?"":"off"}`}
                  style={filter===r?{background:r==="WIN"?"var(--j-mint)":r==="LOSS"?"var(--j-coral)":r==="BE"?"var(--j-lav)":"var(--j-butter)"}:{}}>{r}</button>
              ))}
              <span className="ml-auto" style={{fontSize:11,color:"var(--j-soft)",fontFamily:"'DM Mono'"}}>{filtered.length} sessions</span>
            </div>
            {filtered.map(t=>(
              <div key={t.id} className="j-win">
                <div className="j-bar" style={{background:t.result==="WIN"?"var(--j-mint)":t.result==="LOSS"?"var(--j-pink)":"var(--j-lav)"}}>
                  <span className="j-t">🥇 {t.symbol} · {t.direction}</span>
                  <span style={{fontFamily:"'DM Mono'",fontSize:10}}>{t.date}</span>
                </div>
                <div className="j-body">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="j-mini" style={{background:t.result==="WIN"?"var(--j-mint)":t.result==="LOSS"?"var(--j-coral)":"var(--j-lav)",boxShadow:"2px 2px 0 var(--j-ink)"}}>
                      {t.result==="WIN"?"✓ WIN":t.result==="LOSS"?"✕ LOSS":"= BE"}
                    </span>
                    <span style={{fontFamily:"'DM Mono'",fontSize:11,color:"var(--j-soft)"}}>{t.time} · {t.session}</span>
                    <b className="ml-auto" style={{fontFamily:"'DM Mono'",fontSize:15,color:t.totalPL>=0?"#5fae89":"#e08a82"}}>{money(t.totalPL)}</b>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2" style={{fontSize:11,fontFamily:"'DM Mono'"}}>
                    <div><span style={{color:"var(--j-soft)"}}>Entry </span><b>{t.entryPrice}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>Avg </span><b>{t.avgExit}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>R:R </span><b>{t.rr?`${t.rr.toFixed(1)}R`:"-"}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>Orders </span><b>{t.orderCount}×{t.lotPerOrder}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>Lot </span><b>{t.totalLot.toFixed(2)}</b></div>
                    <div><span style={{color:"var(--j-soft)"}}>SL </span><b style={{color:"#e08a82"}}>{t.slPrice||"-"}</b></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="j-mini" style={{background:t.htfBias==="Bullish"?"var(--j-mint)":t.htfBias==="Bearish"?"var(--j-pink)":"var(--j-win)"}}>{t.htfBias}</span>
                    {t.tf&&<span className="j-mini" style={{background:"var(--j-sky)"}}>{t.tf}</span>}
                    {t.entryModel&&<span className="j-mini" style={{background:"var(--j-butter)"}}>{t.entryModel}</span>}
                    {t.smcConcept.map(c=><span key={c} className="j-mini" style={{background:"var(--j-lav)"}}>{c}</span>)}
                  </div>
                  {t.screenshotUrl&&(<img src={t.screenshotUrl} alt="screenshot" onClick={()=>setLightbox(t.screenshotUrl)} style={{width:"100%",maxHeight:170,objectFit:"cover",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in",marginBottom:8,boxShadow:"2px 2px 0 var(--j-ink)"}}/>)}
                  {t.notes&&<p style={{fontFamily:"'DM Mono'",fontSize:12,color:"var(--j-ink)",borderTop:"1.5px dashed #d8cdbd",paddingTop:8,lineHeight:1.4}}>"{t.notes}"</p>}
                  <div className="flex gap-2 mt-2">
                    <button onClick={()=>editTrade(t)} className="j-chip" style={{fontSize:11,background:"var(--j-butter)"}}>✎ Edit</button>
                    <button onClick={()=>deleteTrade(t.id)} className="j-chip" style={{fontSize:11,background:"var(--j-coral)"}}>🗑 Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {!filtered.length&&<p className="text-center py-10" style={{color:"var(--j-soft)"}}>No sessions</p>}
          </div>
        )}

        {view==="calendar"&&(()=>{
          const y=calRef.getFullYear(),m=calRef.getMonth();
          const startDow=new Date(y,m,1).getDay(), daysInMonth=new Date(y,m+1,0).getDate();
          const byDate:Record<string,Trade[]>={};
          trades.forEach(t=>{ (byDate[t.date]||=[]).push(t); });
          const cells:(number|null)[]=[];
          for(let i=0;i<startDow;i++) cells.push(null);
          for(let d=1;d<=daysInMonth;d++) cells.push(d);
          const pad=(n:number)=>String(n).padStart(2,"0");
          const key=(d:number)=>`${y}-${pad(m+1)}-${pad(d)}`;
          const monthName=new Date(y,m,1).toLocaleString("en-US",{month:"long",year:"numeric"});
          const selTrades=calSelected?(byDate[calSelected]||[]):[];
          return (
            <div className="space-y-3">
              <div className="j-win">
                <div className="j-bar" style={{background:"var(--j-sky)"}}>
                  <button onClick={()=>setCalRef(new Date(y,m-1,1))} className="j-ctrl"><span>◀</span></button>
                  <span className="j-t" style={{justifyContent:"center",fontSize:13}}>📅 {monthName}</span>
                  <button onClick={()=>setCalRef(new Date(y,m+1,1))} className="j-ctrl"><span>▶</span></button>
                </div>
                <div className="j-body">
                  <div className="grid grid-cols-7 gap-1.5 mb-1.5" style={{textAlign:"center",fontFamily:"'DM Mono'",fontSize:9,color:"var(--j-soft)"}}>
                    {["S","M","T","W","T","F","S"].map((d,i)=><div key={i}>{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {cells.map((d,i)=>{
                      if(d===null) return <div key={i} className="j-cell empty"/>;
                      const k=key(d), dayTrades=byDate[k]||[], net=dayTrades.reduce((s,t)=>s+t.totalPL,0), has=dayTrades.length>0;
                      const netTxt=net>0?`+${Math.round(net)}`:net<0?`${Math.round(net)}`:"0";
                      return (
                        <div key={i} className={`j-cell ${calSelected===k?"sel":""}`} onClick={()=>setCalSelected(k===calSelected?null:k)}
                          style={has?{background:net>0?"var(--j-mint)":net<0?"var(--j-pink)":"var(--j-lav)"}:{}}>
                          <span className="j-day">{d}</span>
                          {has&&<span className="j-pl" style={{color:net>0?"#3f9b73":net<0?"#d4685f":"var(--j-soft)"}}>{netTxt}</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 justify-center mt-3" style={{fontSize:10,fontFamily:"'DM Mono'",color:"var(--j-soft)"}}>
                    <span><span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:"#8fd3b4",border:"1px solid var(--j-ink)",marginRight:4}}/>Win day</span>
                    <span><span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:"#eda9a1",border:"1px solid var(--j-ink)",marginRight:4}}/>Loss day</span>
                  </div>
                </div>
              </div>
              {calSelected&&(
                <Win title={`📋 ${calSelected} (${selTrades.length})`} color="var(--j-peach)">
                  {selTrades.length===0?<p className="text-center py-4" style={{color:"var(--j-soft)",fontSize:13}}>No trades this day</p>:
                    selTrades.map(t=>(
                      <div key={t.id} className="flex items-center gap-2 py-2" style={{borderBottom:"1.5px dashed #e3d9c4"}}>
                        <span className="j-mini" style={{background:t.direction==="LONG"?"var(--j-mint)":"var(--j-coral)"}}>{t.direction}</span>
                        <div className="flex-1 min-w-0">
                          <div style={{fontSize:12,fontWeight:600}}>{t.time} · {t.session}</div>
                          <div style={{fontSize:10,color:"var(--j-soft)",fontFamily:"'DM Mono'"}}>{t.entryPrice}→{t.avgExit} · {t.orderCount} ord</div>
                        </div>
                        {t.screenshotUrl&&<span onClick={()=>setLightbox(t.screenshotUrl)} style={{cursor:"zoom-in"}}>🖼</span>}
                        <b style={{fontFamily:"'DM Mono'",color:t.totalPL>=0?"#5fae89":"#e08a82"}}>{money(t.totalPL)}</b>
                        <button onClick={()=>editTrade(t)} className="j-chip off" style={{fontSize:10,padding:"3px 7px"}}>✎</button>
                      </div>
                    ))
                  }
                </Win>
              )}
              {!calSelected&&<p className="text-center py-2" style={{color:"var(--j-soft)",fontSize:12,fontFamily:"'DM Mono'"}}>tap a colored day to see trades</p>}
            </div>
          );
        })()}

        {view==="add"&&(
          <div className="space-y-4" style={{maxWidth:560,margin:"0 auto"}}>
            <div className="flex items-center gap-3">
              <button onClick={()=>{setView("dashboard");setEditId(null);}} className="j-chip off" style={{fontSize:12}}>← Cancel</button>
              <h2 style={{fontSize:14,fontWeight:600}}>{editId?"Edit Session":"New Session"}</h2>
            </div>
            <Win title="① SESSION INFO" color="var(--j-lav)">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div><label className="j-lab">Date</label><input type="date" value={form.date} onChange={e=>f("date",e.target.value)} className="j-in" style={{fontSize:11}}/></div>
                <div><label className="j-lab">Time</label><input type="time" value={form.time} onChange={e=>f("time",e.target.value)} className="j-in" style={{fontSize:11}}/></div>
                <div><label className="j-lab">Session</label>
                  <select value={form.session} onChange={e=>f("session",e.target.value)} className="j-in" style={{fontSize:11}}>
                    {SESSIONS.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <label className="j-lab">Direction</label>
              <div className="flex gap-2">
                {(["LONG","SHORT"] as Direction[]).map(d=>(
                  <button key={d} onClick={()=>f("direction",d)} className={`j-chip flex-1 ${form.direction===d?"":"off"}`}
                    style={form.direction===d?{background:d==="LONG"?"var(--j-mint)":"var(--j-coral)",textAlign:"center"}:{textAlign:"center"}}>
                    {d==="LONG"?"▲ LONG":"▼ SHORT"}
                  </button>
                ))}
              </div>
            </Win>
            <Win title="② PRICE & LOT" color="var(--j-butter)">
              <div className="mb-3"><label className="j-lab">Entry Price</label>
                <input type="number" step="0.001" value={form.entryPrice||""} placeholder="4171.200" onChange={e=>f("entryPrice",parseFloat(e.target.value)||0)} className="j-in" style={{fontSize:16,fontWeight:700}}/>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="j-lab">💰 Risk ($)</label><input type="number" step="0.5" min="0.5" value={(form as any).riskAmount||5} placeholder="5" onChange={e=>f("riskAmount",parseFloat(e.target.value)||5)} className="j-in"/></div>
                <div><label className="j-lab">Lot / Order</label><input type="text" inputMode="decimal" value={form.lotInput} placeholder="0.01" onChange={e=>{const v=e.target.value; if(v===""||/^\d*\.?\d*$/.test(v)){f("lotInput",v);f("lotPerOrder",parseFloat(v)||0);}}} className="j-in"/></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="j-lab">🟢 TP (optional)</label><input type="number" step="0.001" value={form.tpPrice||""} placeholder="TP" onChange={e=>f("tpPrice",parseFloat(e.target.value)||0)} className="j-in"/></div>
                <div><label className="j-lab">🔴 SL (optional)</label><input type="number" step="0.001" value={form.slPrice||""} placeholder="SL" onChange={e=>f("slPrice",parseFloat(e.target.value)||0)} className="j-in"/></div>
              </div>
              {autoRR>0&&(<div className="flex items-center gap-2 mt-3" style={{background:"var(--j-lav)",border:"2px solid var(--j-ink)",borderRadius:7,padding:"7px 11px"}}>
                <span style={{fontSize:11,color:"var(--j-ink)",fontFamily:"'DM Mono'"}}>AUTO R:R</span>
                <b className="ml-auto" style={{fontSize:18,fontFamily:"'VT323'"}}>1 : {autoRR}</b>
              </div>)}
            </Win>
            <Win title="③ EXIT PRICES" color="var(--j-mint)">
              <div className="flex gap-2 mb-3">
                <input type="number" step="0.001" value={exitInput} placeholder="exit e.g. 4178.018" onChange={e=>setExitInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addExit()} className="j-in flex-1"/>
                <button onClick={addExit} className="j-btn" style={{padding:"0 16px",background:"var(--j-mint)",fontSize:13}}>+ Add</button>
              </div>
              <label className="j-lab">Or paste many (space / enter separated)</label>
              <div className="flex gap-2">
                <textarea value={pasteInput} placeholder={"4177.027\n4178.018\n4178.044"} rows={3} onChange={e=>setPasteInput(e.target.value)} className="j-in flex-1" style={{resize:"none",fontSize:12}}/>
                <button onClick={parsePaste} className="j-btn self-end" style={{padding:"9px 11px",background:"var(--j-butter)",fontSize:11}}>Paste<br/>All</button>
              </div>
              {exits.length>0&&(
                <div className="mt-3" style={{background:"#fbf6ea",border:"2px solid var(--j-ink)",borderRadius:7,padding:10}}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{fontSize:10,color:"var(--j-soft)",fontFamily:"'DM Mono'"}}>{exits.length} orders</span>
                    <button onClick={()=>f("exitPrices",[])} style={{fontSize:10,color:"#e08a82",fontFamily:"'DM Mono'",cursor:"pointer",background:"none",border:"none"}}>clear all</button>
                  </div>
                  {exits.map((ex,i)=>{
                    const pl=calcPL(form.direction,form.entryPrice,ex,form.lotPerOrder,isCent);
                    return (
                      <div key={i} className="flex items-center gap-2 py-0.5" style={{fontFamily:"'DM Mono'",fontSize:12}}>
                        <span style={{color:"var(--j-soft)",width:16}}>{i+1}.</span>
                        <span className="flex-1" style={{fontWeight:700}}>{ex}</span>
                        <b style={{color:pl>=0?"#5fae89":"#e08a82"}}>{money(pl)}</b>
                        <button onClick={()=>removeExit(i)} style={{color:"var(--j-soft)",cursor:"pointer",background:"none",border:"none"}}>✕</button>
                      </div>
                    );
                  })}
                  <div style={{borderTop:"1.5px dashed #d8cdbd",marginTop:6,paddingTop:6,fontFamily:"'DM Mono'",fontSize:12}}>
                    <div className="flex justify-between"><span style={{color:"var(--j-soft)"}}>Avg Exit</span><b>{avgExit.toFixed(3)}</b></div>
                    <div className="flex justify-between"><span style={{color:"var(--j-soft)"}}>Total Lot</span><b>{totalLot.toFixed(2)}</b></div>
                    <div className="flex justify-between items-center"><span style={{color:"var(--j-soft)"}}>Total P/L</span><b style={{fontSize:16,color:totalPL>=0?"#5fae89":"#e08a82"}}>{money(totalPL)}</b></div>
                    <div className="flex justify-between items-center mt-1"><span style={{color:"var(--j-soft)"}}>Result</span>
                      <span className="j-mini" style={{background:result==="WIN"?"var(--j-mint)":result==="LOSS"?"var(--j-coral)":"var(--j-lav)"}}>{result}</span></div>
                  </div>
                </div>
              )}
            </Win>
            <Win title="④ SMC ANALYSIS" color="var(--j-pink)">
              <label className="j-lab">Timeframe</label>
              <div className="flex gap-2 mb-3">
                {(["M1","M5","M15"] as TF[]).map(t=>(
                  <button key={t} onClick={()=>f("tf",t)} className={`j-chip flex-1 ${form.tf===t?"":"off"}`} style={form.tf===t?{background:"var(--j-butter)",textAlign:"center"}:{textAlign:"center"}}>{t}</button>
                ))}
              </div>
              <label className="j-lab">HTF Bias</label>
              <div className="flex gap-2 mb-3">
                {(["Bullish","Bearish","Neutral"] as const).map(b=>(
                  <button key={b} onClick={()=>f("htfBias",b)} className={`j-chip flex-1 ${form.htfBias===b?"":"off"}`}
                    style={form.htfBias===b?{background:b==="Bullish"?"var(--j-mint)":b==="Bearish"?"var(--j-pink)":"var(--j-lav)",textAlign:"center",fontSize:12}:{textAlign:"center",fontSize:12}}>{b}</button>
                ))}
              </div>
              <label className="j-lab">SMC Concept</label>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SMC_LIST.map(c=>{
                  const active=(form.smcConcept||[]).includes(c);
                  return <button key={c} onClick={()=>f("smcConcept",active?form.smcConcept.filter(x=>x!==c):[...form.smcConcept,c])} className={`j-chip ${active?"":"off"}`} style={active?{background:"var(--j-lav)",fontSize:12,padding:"5px 10px"}:{fontSize:12,padding:"5px 10px"}}>{c}</button>;
                })}
              </div>
              <label className="j-lab">Entry Model</label>
              <input value={form.entryModel} onChange={e=>f("entryModel",e.target.value)} placeholder="W2, BOS+OB, CHoCH+FVG" className="j-in mb-3" style={{fontSize:13,fontFamily:"'Fredoka'"}}/>
              <label className="j-lab">Notes / Lesson</label>
              <textarea value={form.notes} onChange={e=>f("notes",e.target.value)} rows={3} placeholder="lessons, mistakes, what went well..." className="j-in" style={{resize:"none",fontSize:13,fontFamily:"'Fredoka'"}}/>
            </Win>
            <Win title="⑤ 🖼 SCREENSHOT" color="var(--j-sky)">
              {form.screenshotUrl?(
                <div>
                  <img src={form.screenshotUrl} alt="screenshot" onClick={()=>setLightbox(form.screenshotUrl)} style={{width:"100%",maxHeight:220,objectFit:"contain",border:"2px solid var(--j-ink)",borderRadius:7,cursor:"zoom-in",background:"#fbf6ea"}}/>
                  <button onClick={()=>f("screenshotUrl","")} className="j-chip mt-2" style={{fontSize:11,background:"var(--j-coral)"}}>🗑 Remove image</button>
                </div>
              ):(
                <label className="j-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:14,background:"var(--j-sky)",fontSize:14,cursor:uploading?"wait":"pointer"}}>
                  {uploading?"⌛ Uploading...":"📎 Upload chart screenshot"}
                  <input type="file" accept="image/*" disabled={uploading} style={{display:"none"}} onChange={e=>{ const file=e.target.files?.[0]; if(file) uploadScreenshot(file); }}/>
                </label>
              )}
              <p style={{fontSize:10,color:"var(--j-soft)",fontFamily:"'DM Mono'",marginTop:8}}>saved to Supabase Storage · shows on this entry</p>
            </Win>
            <button onClick={saveTrade} disabled={!exits.length||!form.entryPrice} className={`j-btn w-full ${saving?"j-saving":""}`} style={{padding:16,background:"var(--j-coral)",fontSize:16}}>
              {saving?"💾 SAVING...":editId?"✓ UPDATE SESSION":`💾 SAVE (${exits.length} ord · ${money(totalPL)})`}
            </button>
          </div>
        )}
      </div>

      {/* ── Daily Loss Alert ── */}
      {showLossAlert && (
        <div style={{position:"fixed",inset:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:20,
          background:"rgba(42,31,20,.85)",backdropFilter:"blur(3px)"}}>
          <div className="j-win" style={{maxWidth:340,width:"100%",animation:"winpop .25s steps(3,end) both"}}>
            <div className="j-bar" style={{background:"var(--j-coral)"}}>
              <span className="j-t">⚠️ DAILY LIMIT REACHED</span>
              <span className="j-ctrl"><span>!</span></span>
            </div>
            <div className="j-body" style={{textAlign:"center",padding:"24px 20px"}}>
              <div style={{fontSize:52,marginBottom:12,animation:"blink 1s step-end infinite"}}>🛑</div>
              <div style={{fontFamily:"'VT323',monospace",fontSize:48,color:"#d4685f",lineHeight:1,marginBottom:4}}>
                {todayLosses} LOSSES
              </div>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",marginBottom:20,letterSpacing:1}}>
                TODAY · LIMIT: {DAILY_LOSS_LIMIT}
              </div>
              <div style={{background:"#fbf6ea",border:"2px solid var(--j-ink)",borderRadius:9,padding:"14px 16px",
                marginBottom:20,boxShadow:"2px 2px 0 var(--j-ink)"}}>
                <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:18,fontWeight:700,color:"var(--j-ink)",lineHeight:1.4,marginBottom:8}}>
                  พักเทรดก่อนนะ 🌿
                </div>
                <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)",lineHeight:1.8}}>
                  "ตลาดไม่เคยหนีไปไหน<br/>
                  โอกาสยังมีเสมอ"
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginBottom:20}}>
                <div style={{flex:1,background:"var(--j-mint)",border:"2px solid var(--j-ink)",borderRadius:7,padding:"8px",boxShadow:"2px 2px 0 var(--j-ink)"}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",textTransform:"uppercase"}}>Today WIN</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:26,color:"#5fae89"}}>
                    {trades.filter(t=>t.date===todayStr&&t.result==="WIN").length}
                  </div>
                </div>
                <div style={{flex:1,background:"var(--j-coral)",border:"2px solid var(--j-ink)",borderRadius:7,padding:"8px",boxShadow:"2px 2px 0 var(--j-ink)"}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",textTransform:"uppercase"}}>Today LOSS</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:26,color:"#d4685f"}}>{todayLosses}</div>
                </div>
                <div style={{flex:1,background:"var(--j-butter)",border:"2px solid var(--j-ink)",borderRadius:7,padding:"8px",boxShadow:"2px 2px 0 var(--j-ink)"}}>
                  <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"var(--j-soft)",textTransform:"uppercase"}}>Today P/L</div>
                  <div style={{fontFamily:"'VT323',monospace",fontSize:22,
                    color:trades.filter(t=>t.date===todayStr).reduce((s,t)=>s+t.totalPL,0)>=0?"#5fae89":"#d4685f"}}>
                    {(()=>{const pl=trades.filter(t=>t.date===todayStr).reduce((s,t)=>s+t.totalPL,0); return (pl>=0?"+":"")+pl.toFixed(2);})()}
                  </div>
                </div>
              </div>
              <button onClick={()=>setShowLossAlert(false)} className="j-btn" style={{
                width:"100%",padding:"13px",background:"var(--j-mint)",fontSize:14,
                fontFamily:"'Fredoka',sans-serif"}}>
                ✓ รับทราบ — พักก่อนแล้วกัน
              </button>
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginTop:8}}>
                จะขึ้นอีกทุกครั้งที่เข้าหน้านี้จนกว่าจะหมดวัน
              </div>
            </div>
          </div>
        </div>
      )}

      {lightbox&&(
        <div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(90,77,66,.75)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}>
          <div style={{border:"3px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"6px 6px 0 var(--j-ink)",maxWidth:"100%",maxHeight:"100%",background:"var(--j-win)"}}>
            <div className="j-bar" style={{background:"var(--j-sky)"}}><span className="j-t">🖼 SCREENSHOT.bmp</span><span className="j-ctrl"><span>✕</span></span></div>
            <img src={lightbox} alt="full" style={{display:"block",maxWidth:"90vw",maxHeight:"75vh",objectFit:"contain"}}/>
          </div>
        </div>
      )}
    </main>
  );
}
