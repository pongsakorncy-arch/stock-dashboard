"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { resizeImage, fileToDataUrl } from "@/lib/imageUtils";
import { calcDailyStatus } from "@/lib/dailyStatus";

function AICoachPanel({dailyStatus,setLightbox}:{dailyStatus:ReturnType<typeof calcDailyStatus>;setLightbox:(v:string|null)=>void}) {
  const AI_COACH_CACHE_KEY = "yok_ai_coach_cache_v3_smc";
  const AI_BUCKET = "ai-coach-images";
  const [htfImg,setHtfImg] = useState("");
  const [ltfImg,setLtfImg] = useState("");
  const [currentPrice,setCurrentPrice] = useState("");
  const [loading,setLoading] = useState(false);
  const [savingHistory,setSavingHistory] = useState(false);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [showHistory,setShowHistory] = useState(false);
  const [history,setHistory] = useState<any[]>([]);
  const [error,setError] = useState("");
  const [result,setResult] = useState<any>(null);
  const canAnalyze = htfImg && ltfImg && !loading;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_COACH_CACHE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        setHtfImg(data.htfImg || "");
        setLtfImg(data.ltfImg || "");
        setCurrentPrice(data.currentPrice || "");
        setResult(data.result || null);
      }
    } catch {}
    loadAnalyzeHistory();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(AI_COACH_CACHE_KEY, JSON.stringify({ htfImg, ltfImg, result, currentPrice }));
    } catch {}
  }, [htfImg, ltfImg, result, currentPrice]);
  const safeText = (v:any, fallback = "-") => {
    if (v === null || v === undefined || v === "") return fallback;
    return String(v);
  };
  const arr = (v:any): string[] => Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  const clampPct = (v:any) => Math.min(100, Math.max(0, Number(v) || 0));
  const getSetupLabel = (key?: string) => {
    const map:Record<string,string> = {
      smcProMax: "SMC Pro Max",
      sidewayRange: "Sideway Range",
      breakoutRunTrend: "Breakout / Run Trend",
      pullbackShort: "Pullback Short",
      m5Reversal: "M5 Reversal",
      pullback: "Pullback",
      รอ: "รอ",
    };
    return map[String(key || "")] || safeText(key);
  };
  const getSetupEmoji = (key?: string) => {
    const map:Record<string,string> = {
      smcProMax: "🔵",
      sidewayRange: "🟦",
      breakoutRunTrend: "🟡",
      pullbackShort: "🟠",
      m5Reversal: "🟢",
      pullback: "🟠",
      รอ: "⏳",
    };
    return map[String(key || "")] || "📌";
  };
  const boolIcon = (v:any) => v ? "✓" : "✕";
  const boolBg = (v:any) => v ? "var(--j-mint)" : "var(--j-coral)";
  const loadAnalyzeHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data:{user} } = await supabase.auth.getUser();
      const qs = user?.id ? `?userId=${encodeURIComponent(user.id)}` : "";
      const res = await fetch(`/api/get-ai-history${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Load AI history failed");
      setHistory(data?.history || []);
    } catch(e) {
      console.error("AI history load error:", e);
    } finally {
      setHistoryLoading(false);
    }
  };
  const saveAnalyzeHistory = async (aiResult:any, htfDataUrl:string, ltfDataUrl:string) => {
    try {
      setSavingHistory(true);
      const { data:{user} } = await supabase.auth.getUser();
      const res = await fetch("/api/save-ai-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id || null,
          htfImage: htfDataUrl,
          ltfImage: ltfDataUrl,
          aiResult,
          market: "XAUUSD",
          timeframe: "HTF+LTF",
          version: "smc-promax-ui-v3-hardgate",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || "Save AI history failed");
      await loadAnalyzeHistory();
    } catch(e:any) {
      console.error("AI history save error:", e);
      setError(`Analyze สำเร็จ แต่บันทึก History ไม่สำเร็จ: ${e?.message || String(e)}`);
    } finally {
      setSavingHistory(false);
    }
  };
  const restoreHistory = (row:any) => {
    setHtfImg(row.htf_image || "");
    setLtfImg(row.ltf_image || "");
    setResult(row.ai_result || null);
    setError("");
    setShowHistory(false);
    try {
      localStorage.setItem(AI_COACH_CACHE_KEY, JSON.stringify({
        htfImg: row.htf_image || "",
        ltfImg: row.ltf_image || "",
        result: row.ai_result || null,
      }));
    } catch {}
  };
  const deleteHistory = async (id:string) => {
    if (!confirm("ลบรายการ Analyze นี้ใช่ไหม?")) return;
    const res = await fetch("/api/delete-ai-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || data?.message || "Delete failed"); return; }
    setHistory(p => p.filter(x => x.id !== id));
  };
  const toggleFavorite = async (row:any) => {
    const next = !row.favorite;
    const res = await fetch("/api/favorite-ai-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, favorite: next }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data?.error || data?.message || "Favorite update failed"); return; }
    setHistory(p => p.map(x => x.id === row.id ? {...x, favorite: next} : x));
  };
  const clearAICoach = () => {
    setHtfImg("");
    setLtfImg("");
    setCurrentPrice("");
    setResult(null);
    setError("");
    try { localStorage.removeItem(AI_COACH_CACHE_KEY); } catch {}
  };
  const setHtfAndClear = (v:string) => { setHtfImg(v); setResult(null); setError(""); };
  const setLtfAndClear = (v:string) => { setLtfImg(v); setResult(null); setError(""); };
  const analyze = async () => {
    if(!canAnalyze) return;
    setLoading(true); setError("");
    try {
      const [htfResized, ltfResized] = await Promise.all([
        resizeImage(htfImg), resizeImage(ltfImg),
      ]);
      const res = await fetch("/api/ai/analyze", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ htfImage:htfResized, ltfImage:ltfResized, lossesToday:dailyStatus.todayLosses, currentPrice }),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data?.error || data?.message || "API error");
      setResult(data);
      await saveAnalyzeHistory(data, htfResized, ltfResized);
    } catch(e:any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setLoading(false);
    }
  };
  const saveCurrentResultOnly = async () => {
    if (!result || !htfImg || !ltfImg || savingHistory) return;
    setError("");
    try {
      const [htfResized, ltfResized] = await Promise.all([
        resizeImage(htfImg), resizeImage(ltfImg),
      ]);
      await saveAnalyzeHistory(result, htfResized, ltfResized);
    } catch(e:any) {
      setError(e?.message || "Save history failed");
    }
  };
  const UploadBox = ({title,label,img,setImg}:{title:string;label:string;img:string;setImg:(v:string)=>void}) => (
    <div style={{border:"2.5px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"3px 3px 0 var(--j-ink)"}}>
      <div style={{background:"var(--j-lav)",borderBottom:"2px solid var(--j-ink)",padding:"6px 12px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600}}>{title}</span>
        {img && <button onClick={()=>{setImg(""); setResult(null); setError("");}} style={{fontFamily:"'DM Mono',monospace",fontSize:9,border:"1.5px solid var(--j-ink)",borderRadius:5,padding:"2px 7px",cursor:"pointer",background:"var(--j-coral)"}}>✕ clear</button>}
      </div>
      {img ? (
        <img src={img} onClick={()=>setLightbox(img)} style={{width:"100%",maxHeight:180,objectFit:"cover",cursor:"zoom-in",display:"block"}}/>
      ) : (
        <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:130,cursor:"pointer",background:"#fbf6ea",gap:8}}>
          <span style={{fontSize:28}}>📸</span>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>{label}</span>
          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0]; if(f) fileToDataUrl(f,setImg);}}/>
        </label>
      )}
    </div>
  );
  const MiniInfo = ({label,value,color="var(--j-win)",big=false}:{label:string;value:any;color?:string;big?:boolean}) => (
    <div style={{background:color,border:"1.5px solid var(--j-ink)",borderRadius:8,padding:"8px 10px",boxShadow:"1.5px 1.5px 0 var(--j-ink)"}}>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",textTransform:"uppercase",marginBottom:2}}>{label}</div>
      <div style={{fontFamily:big?"'VT323',monospace":"'DM Mono',monospace",fontSize:big?24:11,lineHeight:1.35,fontWeight:big?400:700}}>{safeText(value)}</div>
    </div>
  );
  const Section = ({title,color,children}:{title:string;color:string;children:any}) => (
    <div style={{background:"var(--j-win)",border:"2.5px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"3px 3px 0 var(--j-ink)"}}>
      <div style={{background:color,borderBottom:"2px solid var(--j-ink)",padding:"7px 12px"}}>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600}}>{title}</span>
      </div>
      <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>{children}</div>
    </div>
  );
  const CheckRow = ({ok,label,detail,hard}:{ok:any;label:string;detail?:string;hard?:boolean}) => (
    <div style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:9,alignItems:"start",background:ok?"var(--j-mint)":hard?"var(--j-coral)":"#fbf6ea",border:"1.5px solid var(--j-ink)",borderRadius:8,padding:"7px 9px",boxShadow:ok?"1.5px 1.5px 0 var(--j-ink)":"none"}}>
      <div style={{width:22,height:22,border:"2px solid var(--j-ink)",borderRadius:5,background:ok?"var(--j-ink)":"var(--j-win)",color:ok?"var(--j-win)":"var(--j-ink)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'VT323',monospace",fontSize:16}}>
        {boolIcon(ok)}
      </div>
      <div>
        <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:700,lineHeight:1.35}}>{label}</div>
        {detail && <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",lineHeight:1.4,marginTop:2}}>{detail}</div>}
      </div>
    </div>
  );
  const verdictColor = result?.verdict === "เข้า" ? "var(--j-mint)" : result?.verdict === "รอ" ? "var(--j-butter)" : result?.verdict ? "var(--j-coral)" : "var(--j-win)";
  const verdictEmoji = result?.verdict === "เข้า" ? "🟢" : result?.verdict === "รอ" ? "🟡" : result?.verdict ? "🔴" : "⬜";
  const biasColor = result?.bias === "Bull" ? "var(--j-mint)" : result?.bias === "Bear" ? "var(--j-coral)" : "var(--j-lav)";
  const phaseValue = result?.phase || result?.cycle || "-";
  const setupScore = clampPct(result?.setupScore ?? 0);
  const c = result?.smcChecklist || {};
  const hardGateFail = result?.hardGateFail && result.hardGateFail !== "null" ? result.hardGateFail : null;
  const smcSteps = [
    {key:"step1_bos_choch", label:"1. BOS / CHoCH เกิดแล้ว", hard:false},
    {key:"step2_orderBlock", label:"2. หา Order Block", hard:false},
    {key:"step3_dz_sz", label:"3. หา DZ / SZ", hard:false},
    {key:"step4_liquidityZone", label:"4. หา Liquidity Zone $$$", hard:false},
    {key:"step5_swept", label:"5. $$$ ถูก Sweep แล้ว", hard:true},
    {key:"step6_rejection", label:"6. เกิด Rejection แล้ว", hard:true},
    {key:"step7_ltfRetest", label:"7. LTF Retest ถูกเงื่อนไข", detail:c.step7_detail, hard:true},
    {key:"step8_mss", label:"8. MSS ผ่าน", hard:true},
    {key:"step9_tp_set", label:"9. ตั้ง TP จาก HTF Swing", hard:false},
    {key:"step10_m15Retest", label:"10. รอ M15 Retest แล้ว", hard:true},
    {key:"step11_sl_ready", label:"11. SL พร้อม / โดดทันที", hard:true},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <UploadBox title="📊 HTF — M15" label="อัปโหลด screenshot M15" img={htfImg} setImg={setHtfAndClear}/>
        <UploadBox title="📈 LTF — M5/M1" label="อัปโหลด screenshot M5/M1" img={ltfImg} setImg={setLtfAndClear}/>
      </div>
      <div style={{border:"2.5px solid var(--j-ink)",borderRadius:10,overflow:"hidden",boxShadow:"3px 3px 0 var(--j-ink)"}}>
        <div style={{background:"var(--j-butter)",borderBottom:"2px solid var(--j-ink)",padding:"6px 12px"}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:600}}>💰 ราคาปัจจุบัน (ช่วยให้ AI อ่านโซนแม่นขึ้น)</span>
        </div>
        <div style={{padding:"10px 12px"}}>
          <input
            type="text"
            inputMode="decimal"
            value={currentPrice}
            onChange={e=>{const v=e.target.value; if(v===""||/^\d*\.?\d*$/.test(v)) setCurrentPrice(v);}}
            placeholder="เช่น 4139.24"
            style={{width:"100%",border:"2px solid var(--j-ink)",borderRadius:7,padding:"10px 12px",fontFamily:"'DM Mono',monospace",fontSize:15,fontWeight:700,background:"#fbf6ea",color:"var(--j-ink)",outline:"none"}}
          />
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"var(--j-soft)",marginTop:6,lineHeight:1.5}}>
            กรอกราคา XAUUSD ตอนนี้ (ดูจากมุมขวาบนของกราฟ) — AI จะยึดราคานี้เป็นฐาน ไม่ต้องเดาเอง ทำให้ Entry/SL/TP แม่นขึ้นมาก
          </div>
        </div>
      </div>
      <button onClick={analyze} disabled={!canAnalyze}
        style={{width:"100%",padding:"14px",border:"2.5px solid var(--j-ink)",borderRadius:10,
          cursor:canAnalyze?"pointer":"not-allowed",
          background:loading?"#e3d9c4":canAnalyze?"var(--j-lav)":"#e3d9c4",
          fontFamily:"'Fredoka',sans-serif",fontWeight:700,fontSize:16,
          boxShadow:canAnalyze?"3px 3px 0 var(--j-ink)":"none",
          opacity:(!htfImg||!ltfImg)?0.5:1}}>
        {loading ? "⏳ AI กำลังเช็ก SMC Pro Max..." : (!htfImg||!ltfImg) ? "📸 อัปโหลดรูปทั้ง 2 ใบก่อน" : "🧠 ANALYZE — SMC PRO MAX"}
      </button>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>{setShowHistory(v=>!v); if(!showHistory) loadAnalyzeHistory();}} className="j-chip" style={{fontSize:11,background:"var(--j-butter)"}}>
          📜 Analyze History {history.length ? `(${history.length})` : ""}
        </button>
        {result && htfImg && ltfImg && (
          <button onClick={saveCurrentResultOnly} disabled={savingHistory} className="j-chip" style={{fontSize:11,background:"var(--j-mint)",opacity:savingHistory?0.6:1}}>
            💾 Save Latest ไม่ใช้ token
          </button>
        )}
        <button onClick={clearAICoach} className="j-chip off" style={{fontSize:11}}>
          🧹 Clear AI Coach
        </button>
        {savingHistory && <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",alignSelf:"center"}}>saving history...</span>}
      </div>
      {showHistory && (
        <Section title="📜 Analyze History" color="var(--j-butter)">
          <button onClick={loadAnalyzeHistory} className="j-chip off" style={{fontSize:10,alignSelf:"flex-start"}}>refresh</button>
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:360,overflow:"auto"}}>
            {historyLoading && <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)",padding:10}}>กำลังโหลด...</div>}
            {!historyLoading && history.length === 0 && (
              <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--j-soft)",padding:10,textAlign:"center"}}>ยังไม่มีประวัติ Analyze</div>
            )}
            {history.map((row:any)=>{
              const r = row.ai_result || {};
              const dt = row.created_at ? new Date(row.created_at).toLocaleString("th-TH", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";
              const vc = r.verdict === "เข้า" ? "var(--j-mint)" : r.verdict === "รอ" ? "var(--j-butter)" : "var(--j-coral)";
              return (
                <div key={row.id} style={{border:"2px solid var(--j-ink)",borderRadius:9,background:row.favorite?"#fff7d7":"#fbf6ea",padding:9,display:"grid",gridTemplateColumns:"54px 1fr",gap:10,alignItems:"center"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr",gap:4}}>
                    {row.htf_image && <img src={row.htf_image} onClick={()=>setLightbox(row.htf_image)} style={{width:54,height:36,objectFit:"cover",border:"1.5px solid var(--j-ink)",borderRadius:5,cursor:"zoom-in"}}/>}
                    {row.ltf_image && <img src={row.ltf_image} onClick={()=>setLightbox(row.ltf_image)} style={{width:54,height:36,objectFit:"cover",border:"1.5px solid var(--j-ink)",borderRadius:5,cursor:"zoom-in"}}/>}
                  </div>
                  <div>
                    <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                      <b style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)"}}>{dt}</b>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,background:vc,border:"1.5px solid var(--j-ink)",borderRadius:5,padding:"2px 6px"}}>{r.verdict || "-"}</span>
                    </div>
                    <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:13,fontWeight:700,lineHeight:1.25,marginBottom:3}}>
                      {getSetupEmoji(r.recommendedSetup)} {getSetupLabel(r.recommendedSetup)}
                    </div>
                    <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",marginBottom:7}}>
                      Bias: {r.bias || "-"} · Phase: {r.phase || r.cycle || "-"} · Score: {r.setupScore ?? "-"}
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <button onClick={()=>restoreHistory(row)} className="j-chip" style={{fontSize:10,background:"var(--j-mint)"}}>View / Restore</button>
                      <button onClick={()=>toggleFavorite(row)} className="j-chip off" style={{fontSize:10,background:row.favorite?"var(--j-butter)":"var(--j-win)"}}>{row.favorite?"★ Favorite":"☆ Favorite"}</button>
                      <button onClick={()=>deleteHistory(row.id)} className="j-chip off" style={{fontSize:10,background:"var(--j-coral)"}}>Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {error && (
        <div style={{background:"var(--j-coral)",border:"2px solid var(--j-ink)",borderRadius:9,padding:"10px 14px",fontFamily:"'DM Mono',monospace",fontSize:11}}>
          ❌ {error}
        </div>
      )}
      {result && (() => {
        const hardGateRows = [
          { ok: c.step5_swept, label: "5. Liquidity ถูก Sweep", detail: "ยังไม่ sweep = ห้ามเข้า" },
          { ok: c.step6_rejection, label: "6. มี Rejection จากโซน", detail: "ต้องมีแรงปฏิเสธราคา" },
          { ok: c.step7_ltfRetest, label: "7. LTF Retest ถูกต้อง", detail: c.step7_detail || "ต้องกลับมา retest โซน" },
          { ok: c.step8_mss, label: "8. MSS ยืนยัน", detail: "ต้องมี Market Structure Shift" },
          { ok: c.step10_m15Retest, label: "10. M15 Retest แล้ว", detail: "ถ้ายังไม่ retest = รอ" },
          { ok: c.step11_sl_ready, label: "11. SL พร้อม / โดดทันที", detail: "SL ไม่พร้อม = ไม่เข้า" },
        ];
        const hardPass = hardGateRows.filter(x => !!x.ok).length;
        const allHardPassed = hardPass === hardGateRows.length;
        const stepPassed = smcSteps.filter(x => !!c?.[x.key]).length;
        const tradePermission = result.verdict === "เข้า" && allHardPassed && !hardGateFail;
        const permissionText = tradePermission ? "READY" : result.verdict === "รอ" ? "WAIT" : "NO TRADE";
        const permissionColor = tradePermission ? "var(--j-mint)" : permissionText === "WAIT" ? "var(--j-butter)" : "var(--j-coral)";
        return (<>
        <div style={{background:permissionColor,border:"3px solid var(--j-ink)",borderRadius:12,padding:"14px",boxShadow:"4px 4px 0 var(--j-ink)",textAlign:"center"}}>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",textTransform:"uppercase",marginBottom:4}}>① MARKET VERDICT</div>
          <div style={{fontFamily:"'VT323',monospace",fontSize:50,lineHeight:1}}>
            {permissionText === "READY" ? "🟢" : permissionText === "WAIT" ? "🟡" : "🔴"} {permissionText}
          </div>
          <div style={{fontFamily:"'Fredoka',sans-serif",fontSize:16,fontWeight:700,marginTop:2}}>
            AI Verdict: {verdictEmoji} {safeText(result.verdict)}
          </div>
          {result.verdictReason && (
            <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,marginTop:8,lineHeight:1.5,maxWidth:680,marginLeft:"auto",marginRight:"auto"}}>
              {result.verdictReason}
            </div>
          )}
          {dailyStatus.todayLosses >= 3 && (
            <div style={{marginTop:10,background:"var(--j-coral)",border:"2px solid var(--j-ink)",borderRadius:9,padding:"8px 10px",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700}}>
              🚫 Daily Lock: วันนี้แพ้ครบ {dailyStatus.todayLosses} ไม้แล้ว — หยุดเทรดก่อน
            </div>
          )}
        </div>
        <Section title={`② HARD GATE — สำคัญที่สุด (${hardPass}/${hardGateRows.length})`} color={allHardPassed ? "var(--j-mint)" : "var(--j-coral)"}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {hardGateRows.map((row,i)=>(
              <CheckRow key={i} ok={row.ok} label={row.label} detail={row.detail} hard={!row.ok}/>
            ))}
          </div>
          {hardGateFail ? (
            <div style={{background:"var(--j-coral)",border:"2px solid var(--j-ink)",borderRadius:9,padding:"9px 11px",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,lineHeight:1.45}}>
              🚫 HARD GATE FAIL: {hardGateFail}
            </div>
          ) : allHardPassed ? (
            <div style={{background:"var(--j-mint)",border:"2px solid var(--j-ink)",borderRadius:9,padding:"9px 11px",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700}}>
              ✅ Hard Gate ผ่านครบ — ค่อยดู Action Plan / RR ต่อ
            </div>
          ) : (
            <div style={{background:"var(--j-butter)",border:"2px solid var(--j-ink)",borderRadius:9,padding:"9px 11px",fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700}}>
              ⏳ Hard Gate ยังไม่ครบ — ห้ามฝืนเข้า รอให้ครบก่อน
            </div>
          )}
        </Section>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <MiniInfo label="Bias" value={result.bias === "Bull" ? "▲ Bull" : result.bias === "Bear" ? "▼ Bear" : "→ Neutral"} color={biasColor} big/>
          <MiniInfo label="Phase / Cycle" value={phaseValue} color="var(--j-sky)" big/>
          <MiniInfo label="Setup Score" value={`${setupScore}/100`} color={setupScore >= 80 ? "var(--j-mint)" : setupScore >= 55 ? "var(--j-butter)" : "var(--j-coral)"} big/>
        </div>
        {result.actionPlan && (
          <Section title="③ ACTION PLAN — เข้าได้เฉพาะเมื่อ Hard Gate ผ่าน" color={tradePermission ? "var(--j-mint)" : "var(--j-butter)"}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <MiniInfo label="Direction" value={result.actionPlan.direction} color={result.actionPlan.direction === "Buy" ? "var(--j-mint)" : result.actionPlan.direction === "Sell" ? "var(--j-coral)" : "var(--j-butter)"} big/>
              <MiniInfo label="RR" value={result.actionPlan.rr} color="var(--j-lav)" big/>
              <MiniInfo label="Entry Zone" value={result.actionPlan.entryZone} color="var(--j-sky)" big/>
              <MiniInfo label="SL" value={result.actionPlan.sl} color="var(--j-coral)" big/>
              <MiniInfo label="TP1" value={result.actionPlan.tp1} color="var(--j-mint)" big/>
              <MiniInfo label="TP2" value={result.actionPlan.tp2} color="var(--j-mint)" big/>
            </div>
            {result.actionPlan.invalidation && <MiniInfo label="Invalidation" value={result.actionPlan.invalidation} color="var(--j-coral)"/>}
            {arr(result.actionPlan.next3Candles).length > 0 && (
              <div style={{border:"1.5px solid var(--j-ink)",borderRadius:8,overflow:"hidden"}}>
                <div style={{background:"var(--j-lav)",borderBottom:"1.5px solid var(--j-ink)",padding:"5px 10px",fontFamily:"'DM Mono',monospace",fontSize:9,fontWeight:600}}>🕯 Next 3 Candles — ต้องเห็นอะไร</div>
                <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:5}}>
                  {arr(result.actionPlan.next3Candles).map((n:string,i:number)=>(
                    <div key={i} style={{display:"flex",gap:8,fontFamily:"'DM Mono',monospace",fontSize:10,lineHeight:1.4}}>
                      <span style={{color:"var(--j-soft)",flexShrink:0}}>{i+1}.</span><span>{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}
        {result.waitFor && (
          <Section title="④ WAIT FOR — ถ้ายังไม่ครบ ให้รอสิ่งนี้" color="var(--j-butter)">
            {result.waitFor.keyLevel && <MiniInfo label="Key Level" value={result.waitFor.keyLevel} color="var(--j-sky)" big/>}
            {arr(result.waitFor.conditions).length > 0 && (
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {arr(result.waitFor.conditions).map((item:string,i:number)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"26px 1fr",gap:8,alignItems:"start",background:"var(--j-butter)",border:"1.5px solid var(--j-ink)",borderRadius:8,padding:"7px 10px"}}>
                    <span style={{fontFamily:"'VT323',monospace",fontSize:18,lineHeight:1}}>⏸</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,lineHeight:1.45}}>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
        <Section title="⑤ MARKET CONTEXT / SETUP" color="var(--j-butter)">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <MiniInfo label="HTF Zone" value={result.htfZone} color="#fbf6ea"/>
            <MiniInfo label="Setup Group" value={result.setupGroup} color="var(--j-lav)"/>
            <MiniInfo label="Recommended Setup" value={`${getSetupEmoji(result.recommendedSetup)} ${getSetupLabel(result.recommendedSetup)}`} color="var(--j-mint)"/>
            <MiniInfo label="SMC Checklist" value={`${stepPassed}/${smcSteps.length} ผ่าน`} color={stepPassed >= 9 ? "var(--j-mint)" : stepPassed >= 6 ? "var(--j-butter)" : "var(--j-coral)"}/>
          </div>
          <div style={{height:16,border:"2px solid var(--j-ink)",borderRadius:6,overflow:"hidden",background:"#e3d9c4"}}>
            <div style={{height:"100%",width:`${setupScore}%`,background:setupScore>=80?"var(--j-mint)":setupScore>=55?"var(--j-butter)":"var(--j-coral)",transition:"width .4s"}}/>
          </div>
        </Section>
        {result.liquidityStatus && (
          <Section title="⑥ LIQUIDITY / SWEEP STATUS" color={result.liquidityStatus?.swept ? "var(--j-mint)" : "var(--j-coral)"}>
            <div style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:8}}>
              <MiniInfo label="Swept" value={result.liquidityStatus?.swept ? "✓ YES" : "✕ NO"} color={boolBg(result.liquidityStatus?.swept)} big/>
              <MiniInfo label="Location" value={result.liquidityStatus?.location} color="#fbf6ea"/>
            </div>
            {result.liquidityStatus?.note && <MiniInfo label="Note" value={result.liquidityStatus.note} color="#fbf6ea"/>}
          </Section>
        )}
        <Section title="⑦ FULL SMC PRO MAX — 11 STEP CHECKLIST" color="var(--j-lav)">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {smcSteps.map((s)=>(
              <CheckRow key={s.key} ok={c?.[s.key]} label={s.label} detail={s.detail} hard={s.hard && !c?.[s.key]}/>
            ))}
          </div>
        </Section>
        {result.nonSmcSetup && (
          <Section title="⑧ NON-SMC BACKUP SETUP — ใช้เมื่อ SMC ไม่มา" color={result.nonSmcSetup?.active ? "var(--j-sky)" : "var(--j-win)"}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <MiniInfo label="Active" value={result.nonSmcSetup?.active ? "✓ ใช้งานได้" : "✕ ยังไม่ใช่"} color={result.nonSmcSetup?.active ? "var(--j-mint)" : "#fbf6ea"} big/>
              <MiniInfo label="Type" value={`${getSetupEmoji(result.nonSmcSetup?.type)} ${getSetupLabel(result.nonSmcSetup?.type)}`} color="var(--j-sky)"/>
              <MiniInfo label="PA Status" value={result.nonSmcSetup?.paStatus} color="var(--j-butter)"/>
              <MiniInfo label="Condition" value={result.nonSmcSetup?.condition} color="#fbf6ea"/>
            </div>
          </Section>
        )}
        {arr(result.reasons).length > 0 && (
          <Section title="⑨ AI REASONS — เหตุผลสรุป" color="var(--j-peach)">
            {arr(result.reasons).map((r:string,i:number)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{color:"var(--j-soft)",fontFamily:"'DM Mono',monospace",fontSize:11,flexShrink:0}}>•</span>
                <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,lineHeight:1.5}}>{r}</span>
              </div>
            ))}
          </Section>
        )}
        <div style={{background:"#fbf6ea",border:"2px solid var(--j-ink)",borderRadius:9,padding:"10px",fontFamily:"'DM Mono',monospace",fontSize:10,color:"var(--j-soft)",textAlign:"center",lineHeight:1.6}}>
          กฎหลัก: Hard Gate ไม่ผ่าน = ห้ามฝืน · READY เท่านั้นถึงค่อยคำนวณ Lot/Risk · AI เป็น Checklist ช่วยตัดสินใจ ไม่ใช่สัญญาณบังคับเข้า
        </div>
      </>);
      })()}
    </div>
  );
}

export default AICoachPanel;
