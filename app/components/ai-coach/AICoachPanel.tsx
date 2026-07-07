"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// ── inline utils ──────────────────────────────────────────────────────────────
function resizeImage(dataUrl: string, maxW = 800, maxH = 600): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
function fileToDataUrl(file: File, cb: (v: string) => void) {
  const reader = new FileReader();
  reader.onload = () => cb(String(reader.result || ""));
  reader.readAsDataURL(file);
}

type DailyStatusData = { todayLosses: number; [key: string]: any };

// ── Setup definitions ─────────────────────────────────────────────────────────
type SetupKey = "smcProMax" | "sidewayRange" | "breakoutRunTrend" | "pullbackShort" | "m5Reversal";

type CheckItem = {
  label: string;
  pass: (r: any) => boolean;
  waitLabel: string; // ถ้าไม่ผ่าน รอสิ่งนี้
  hard?: boolean;    // Hard Gate = ห้ามเข้าถ้าไม่ผ่าน
};

const SETUPS: Record<SetupKey, { label: string; emoji: string; color: string; checks: CheckItem[] }> = {
  smcProMax: {
    label: "SMC Pro Max", emoji: "🔵", color: "var(--j-lav)",
    checks: [
      {
        label: "BOS/ChoCh + DZ/SZ พร้อม",
        pass: r => !!(r.smcChecklist?.step1_bos_choch && r.smcChecklist?.step3_dz_sz),
        waitLabel: "รอ BOS หรือ ChoCh ก่อน แล้วหา DZ/SZ",
      },
      {
        label: "$$$ ถูก Sweep แล้ว",
        pass: r => !!r.smcChecklist?.step5_swept,
        waitLabel: "รอ Liquidity $$$ ถูก Sweep",
        hard: true,
      },
      {
        label: "Rejection ยืนยัน",
        pass: r => !!r.smcChecklist?.step6_rejection,
        waitLabel: "รอ Rejection จากโซน",
        hard: true,
      },
      {
        label: "LTF Retest ถูกต้อง",
        pass: r => !!r.smcChecklist?.step7_ltfRetest,
        waitLabel: r => r.smcChecklist?.step7_detail === "Higher Low"
          ? "รอ Higher Low (Buy)"
          : r.smcChecklist?.step7_detail === "Lower High"
          ? "รอ Lower High (Sell)"
          : "รอ LTF Retest",
        hard: true,
      },
      {
        label: "MSS ผ่าน",
        pass: r => !!r.smcChecklist?.step8_mss,
        waitLabel: "รอ Market Structure Shift",
        hard: true,
      },
    ],
  },
  sidewayRange: {
    label: "Sideway Range", emoji: "🟦", color: "var(--j-sky)",
    checks: [
      {
        label: "Phase = Sideway ยืนยัน",
        pass: r => r.phase === "Sideway",
        waitLabel: "รอ Phase เข้าสู่ Sideway",
      },
      {
        label: "ระบุกรอบบน/ล่างชัดเจน",
        pass: r => r.nonSmcSetup?.type === "sidewayRange" || r.recommendedSetup === "sidewayRange",
        waitLabel: "Mark กรอบ Support/Resistance ก่อน",
      },
      {
        label: "ราคาใกล้ขอบกรอบ",
        pass: r => !!(r.nonSmcSetup?.active && r.nonSmcSetup?.type === "sidewayRange"),
        waitLabel: "รอราคาวิ่งมาชิดขอบกรอบ",
      },
      {
        label: "Rejection ที่ขอบกรอบ",
        pass: r => !!r.smcChecklist?.step6_rejection,
        waitLabel: "รอ Rejection ที่ขอบก่อนกด",
        hard: true,
      },
      {
        label: "RR ≥ 3 คุ้มค่า",
        pass: r => (r.setupScore ?? 0) >= 55 && r.recommendedSetup === "sidewayRange",
        waitLabel: "คำนวณ RR ให้ได้ ≥ 3 ก่อน",
      },
    ],
  },
  breakoutRunTrend: {
    label: "Breakout / Run Trend", emoji: "🟡", color: "var(--j-butter)",
    checks: [
      {
        label: "SW กรอบชัดเจน",
        pass: r => r.phase === "Sideway" || r.nonSmcSetup?.type === "breakoutRunTrend",
        waitLabel: "รอกรอบ Sideway ชัดก่อน",
      },
      {
        label: "ปิดออกนอกกรอบจริง (ไม่ใช่ Wick)",
        pass: r => !!(r.nonSmcSetup?.active && r.nonSmcSetup?.type === "breakoutRunTrend"),
        waitLabel: "รอแท่งเทียนปิดออกนอกกรอบ",
        hard: true,
      },
      {
        label: "รอ Retest กลับมาที่กรอบ",
        pass: r => !!r.smcChecklist?.step10_m15Retest || r.nonSmcSetup?.paStatus === "Pa ที่ 2",
        waitLabel: "ห้าม FOMO — รอ Retest กรอบเดิมก่อน",
        hard: true,
      },
      {
        label: "Bias ตรงทิศ Breakout",
        pass: r => r.bias !== "Neutral",
        waitLabel: "รอ Bias ชัดเจน (Bull/Bear)",
      },
      {
        label: "Action Plan พร้อม",
        pass: r => !!(r.actionPlan?.entryZone && r.actionPlan?.direction !== "รอ"),
        waitLabel: "ยังไม่มี Entry Zone ที่ชัด",
      },
    ],
  },
  pullbackShort: {
    label: "Pullback Short", emoji: "🟠", color: "var(--j-peach)",
    checks: [
      {
        label: "Phase = Pullback หรือ Trend",
        pass: r => r.phase === "Pullback" || r.phase === "Trend",
        waitLabel: "รอ Phase เข้า Pullback",
      },
      {
        label: "Pullback ถึง DZ/SZ ใหญ่",
        pass: r => !!(r.smcChecklist?.step3_dz_sz && r.smcChecklist?.step2_orderBlock),
        waitLabel: "รอราคา Pullback มาถึง DZ/SZ",
      },
      {
        label: "PA กลับตัวชัด (Rejection)",
        pass: r => !!r.smcChecklist?.step6_rejection,
        waitLabel: "รอ Rejection ที่โซน",
        hard: true,
      },
      {
        label: "ทิศตรงกับ Bias หลัก",
        pass: r =>
          (r.bias === "Bull" && r.actionPlan?.direction === "Buy") ||
          (r.bias === "Bear" && r.actionPlan?.direction === "Sell"),
        waitLabel: "ทิศยังสวนกับ Bias — ระวัง",
      },
      {
        label: "เป้าสั้น ขยันซอย (ไม่โลภ)",
        pass: r => r.recommendedSetup === "pullbackShort" && (r.setupScore ?? 0) >= 40,
        waitLabel: "กำหนดเป้าสั้นก่อน ห้ามถือยาว",
      },
    ],
  },
  m5Reversal: {
    label: "M5 Reversal", emoji: "🟢", color: "var(--j-mint)",
    checks: [
      {
        label: "Pa ที่ 1 เห็นชัด",
        pass: r =>
          r.nonSmcSetup?.paStatus === "Pa ที่ 1" ||
          r.nonSmcSetup?.paStatus === "Pa ที่ 2",
        waitLabel: "รอ Pa ที่ 1 ก่อน",
      },
      {
        label: "Pa ที่ 2 ยืนยันแล้ว",
        pass: r => r.nonSmcSetup?.paStatus === "Pa ที่ 2",
        waitLabel: "รอ Pa ที่ 2 ยืนยันทิศ",
        hard: true,
      },
      {
        label: "Buy=ยกโลว์ / Sell=กดไฮ",
        pass: r =>
          !!r.smcChecklist?.step7_ltfRetest ||
          (r.nonSmcSetup?.active && r.nonSmcSetup?.type === "m5Reversal"),
        waitLabel: "Buy: รอ Higher Low · Sell: รอ Lower High",
        hard: true,
      },
      {
        label: "Rejection ยืนยันแล้ว",
        pass: r => !!r.smcChecklist?.step6_rejection,
        waitLabel: "รอ Rejection ยืนยัน",
      },
      {
        label: "แผนชัด (ตาม/สวน Trend)",
        pass: r => !!(r.actionPlan?.entryZone && r.recommendedSetup === "m5Reversal"),
        waitLabel: "วางแผน: ตาม Trend = ถือยาว / สวน = รีบโดด",
      },
    ],
  },
};

const SETUP_ORDER: SetupKey[] = [
  "smcProMax",
  "sidewayRange",
  "breakoutRunTrend",
  "pullbackShort",
  "m5Reversal",
];

function getWaitLabel(item: CheckItem, result: any): string {
  if (typeof item.waitLabel === "function") return item.waitLabel(result);
  return item.waitLabel;
}

function calcSetupScore(key: SetupKey, result: any): number {
  return SETUPS[key].checks.filter(c => c.pass(result)).length;
}

// ── Score dots ────────────────────────────────────────────────────────────────
function ScoreDots({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 14, height: 14,
            borderRadius: "50%",
            border: "2px solid var(--j-ink)",
            background: i < score ? "var(--j-ink)" : "#e3d9c4",
            boxShadow: i < score ? "1px 1px 0 var(--j-ink)" : "none",
          }}
        />
      ))}
      <span style={{ fontFamily: "'VT323',monospace", fontSize: 20, marginLeft: 4 }}>
        {score}/{max}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AICoachPanel({
  dailyStatus,
  setLightbox,
}: {
  dailyStatus: DailyStatusData;
  setLightbox: (v: string | null) => void;
}) {
  const AI_COACH_CACHE_KEY = "yok_ai_coach_cache_v3_smc";
  const [htfImg, setHtfImg] = useState("");
  const [ltfImg, setLtfImg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SetupKey>("smcProMax");
  const [savingHistory, setSavingHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const canAnalyze = htfImg && ltfImg && !loading;

  // ── Load cache ──────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_COACH_CACHE_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        setHtfImg(d.htfImg || "");
        setLtfImg(d.ltfImg || "");
        if (d.result) {
          setResult(d.result);
          // auto-select recommended tab
          const rec = d.result.recommendedSetup as SetupKey;
          if (SETUP_ORDER.includes(rec)) setActiveTab(rec);
        }
      }
    } catch {}
    loadHistory();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(AI_COACH_CACHE_KEY, JSON.stringify({ htfImg, ltfImg, result }));
    } catch {}
  }, [htfImg, ltfImg, result]);

  // ── History ─────────────────────────────────────────────────────────────────
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const qs = user?.id ? `?userId=${encodeURIComponent(user.id)}` : "";
      const res = await fetch(`/api/get-ai-history${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Load failed");
      setHistory(data?.history || []);
    } catch (e) {
      console.error("AI history load error:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveHistory = async (aiResult: any, htfResized: string, ltfResized: string) => {
    try {
      setSavingHistory(true);
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch("/api/save-ai-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id || null,
          htfImage: htfResized,
          ltfImage: ltfResized,
          aiResult,
          market: "XAUUSD",
          timeframe: "HTF+LTF",
          version: "smc-promax-v4-5tab",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      await loadHistory();
    } catch (e: any) {
      setError(`บันทึก History ไม่สำเร็จ: ${e?.message}`);
    } finally {
      setSavingHistory(false);
    }
  };

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!canAnalyze) return;
    setLoading(true);
    setError("");
    try {
      const [htfResized, ltfResized] = await Promise.all([
        resizeImage(htfImg),
        resizeImage(ltfImg),
      ]);
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htfImage: htfResized,
          ltfImage: ltfResized,
          lossesToday: dailyStatus.todayLosses,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "API error");
      setResult(data);
      // auto-select recommended tab
      const rec = data.recommendedSetup as SetupKey;
      if (SETUP_ORDER.includes(rec)) setActiveTab(rec);
      await saveHistory(data, htfResized, ltfResized);
    } catch (e: any) {
      setError(e?.message || "Analyze failed");
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setHtfImg(""); setLtfImg(""); setResult(null); setError("");
    try { localStorage.removeItem(AI_COACH_CACHE_KEY); } catch {}
  };

  const restoreHistory = (row: any) => {
    setHtfImg(row.htf_image || "");
    setLtfImg(row.ltf_image || "");
    const r = row.ai_result || null;
    setResult(r);
    if (r?.recommendedSetup && SETUP_ORDER.includes(r.recommendedSetup)) {
      setActiveTab(r.recommendedSetup);
    }
    setShowHistory(false);
    try {
      localStorage.setItem(AI_COACH_CACHE_KEY, JSON.stringify({
        htfImg: row.htf_image || "",
        ltfImg: row.ltf_image || "",
        result: r,
      }));
    } catch {}
  };

  const deleteHistory = async (id: string) => {
    if (!confirm("ลบรายการนี้?")) return;
    const res = await fetch("/api/delete-ai-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setHistory(p => p.filter(x => x.id !== id));
  };

  // ── Upload box ───────────────────────────────────────────────────────────────
  const UploadBox = ({
    title, label, img, setImg,
  }: {
    title: string; label: string; img: string; setImg: (v: string) => void;
  }) => (
    <div style={{
      border: "2.5px solid var(--j-ink)", borderRadius: 10,
      overflow: "hidden", boxShadow: "3px 3px 0 var(--j-ink)",
    }}>
      <div style={{
        background: "var(--j-lav)", borderBottom: "2px solid var(--j-ink)",
        padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600 }}>{title}</span>
        {img && (
          <button
            onClick={() => { setImg(""); setResult(null); setError(""); }}
            style={{
              fontFamily: "'DM Mono',monospace", fontSize: 9,
              border: "1.5px solid var(--j-ink)", borderRadius: 5,
              padding: "2px 7px", cursor: "pointer", background: "var(--j-coral)",
            }}
          >✕</button>
        )}
      </div>
      {img ? (
        <img
          src={img}
          onClick={() => setLightbox(img)}
          style={{ width: "100%", maxHeight: 160, objectFit: "cover", cursor: "zoom-in", display: "block" }}
        />
      ) : (
        <label style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: 120, cursor: "pointer",
          background: "#fbf6ea", gap: 6,
        }}>
          <span style={{ fontSize: 26 }}>📸</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--j-soft)" }}>{label}</span>
          <input
            type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, setImg); }}
          />
        </label>
      )}
    </div>
  );

  // ── Verdict banner ──────────────────────────────────────────────────────────
  const renderVerdict = () => {
    if (!result) return null;
    const c = result.smcChecklist || {};
    const hardGateFail = result.hardGateFail && result.hardGateFail !== "null"
      ? result.hardGateFail : null;
    const hardGates = [c.step5_swept, c.step6_rejection, c.step7_ltfRetest, c.step8_mss];
    const allHardPass = hardGates.every(Boolean);
    const tradeOk = result.verdict === "เข้า" && allHardPass && !hardGateFail;
    const isWait = result.verdict === "รอ" || (!tradeOk && !hardGateFail);
    const bg = tradeOk ? "var(--j-mint)" : isWait ? "var(--j-butter)" : "var(--j-coral)";
    const emoji = tradeOk ? "🟢" : isWait ? "🟡" : "🔴";
    const label = tradeOk ? "READY" : isWait ? "WAIT" : "NO TRADE";

    return (
      <div style={{
        background: bg, border: "3px solid var(--j-ink)", borderRadius: 12,
        padding: "14px 16px", boxShadow: "4px 4px 0 var(--j-ink)",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--j-soft)", textTransform: "uppercase", marginBottom: 2 }}>
              VERDICT
            </div>
            <div style={{ fontFamily: "'VT323',monospace", fontSize: 40, lineHeight: 1 }}>
              {emoji} {label}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--j-soft)", marginBottom: 2 }}>
              {result.bias === "Bull" ? "▲ Bull" : result.bias === "Bear" ? "▼ Bear" : "→ Neutral"} · {result.phase || "-"}
            </div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700 }}>
              HTF: {result.htfZone || "-"}
            </div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, marginTop: 2 }}>
              {result.liquidityStatus?.swept ? "✓ $$$ Swept" : "✕ $$$ Not Swept"}
            </div>
          </div>
        </div>
        {result.verdictReason && (
          <div style={{
            fontFamily: "'DM Mono',monospace", fontSize: 11, lineHeight: 1.5,
            background: "rgba(255,255,255,0.35)", borderRadius: 7, padding: "7px 10px",
          }}>
            {result.verdictReason}
          </div>
        )}
        {dailyStatus.todayLosses >= 3 && (
          <div style={{
            background: "var(--j-coral)", border: "2px solid var(--j-ink)", borderRadius: 8,
            padding: "7px 10px", fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700,
          }}>
            🚫 วันนี้แพ้ครบ {dailyStatus.todayLosses} ไม้แล้ว — หยุดเทรด
          </div>
        )}
      </div>
    );
  };

  // ── 5-Tab Setup Panel ───────────────────────────────────────────────────────
  const renderSetupPanel = () => {
    if (!result) return null;
    const setup = SETUPS[activeTab];
    const score = calcSetupScore(activeTab, result);
    const isRecommended = result.recommendedSetup === activeTab;
    const passed = setup.checks.filter(c => c.pass(result));
    const failed = setup.checks.filter(c => !c.pass(result));
    const hardFailed = failed.filter(c => c.hard);
    const canEnter = score >= 4 && hardFailed.length === 0;
    const ap = result.actionPlan;

    return (
      <div style={{
        background: "var(--j-win)", border: "2.5px solid var(--j-ink)", borderRadius: 10,
        overflow: "hidden", boxShadow: "3px 3px 0 var(--j-ink)",
      }}>
        {/* Tab bar */}
        <div style={{
          display: "flex", gap: 0, borderBottom: "2.5px solid var(--j-ink)",
          overflowX: "auto",
        }}>
          {SETUP_ORDER.map(key => {
            const s = SETUPS[key];
            const sc = calcSetupScore(key, result);
            const isActive = activeTab === key;
            const isRec = result.recommendedSetup === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  flex: "0 0 auto",
                  padding: "9px 12px",
                  border: "none",
                  borderRight: "2px solid var(--j-ink)",
                  borderBottom: isActive ? `3px solid ${s.color}` : "none",
                  background: isActive ? s.color : isRec ? s.color + "55" : "#fbf6ea",
                  cursor: "pointer",
                  fontFamily: "'DM Mono',monospace",
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 400,
                  color: "var(--j-ink)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 3,
                  position: "relative",
                  minWidth: 64,
                }}
              >
                <span style={{ fontSize: 16 }}>{s.emoji}</span>
                <span style={{ whiteSpace: "nowrap" }}>
                  {sc}/{setup.checks.length}
                </span>
                {isRec && (
                  <span style={{
                    position: "absolute", top: 3, right: 3,
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#3f9b73", border: "1px solid var(--j-ink)",
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ padding: "14px 14px 12px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 16, fontWeight: 700 }}>
                {setup.emoji} {setup.label}
              </div>
              {isRecommended && (
                <div style={{
                  fontFamily: "'DM Mono',monospace", fontSize: 9,
                  color: "#3f9b73", fontWeight: 700, marginTop: 1,
                }}>
                  ★ AI แนะนำท่านี้
                </div>
              )}
            </div>
            <ScoreDots score={score} />
          </div>

          {/* Checklist */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
            {setup.checks.map((item, i) => {
              const ok = item.pass(result);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 9,
                    padding: "8px 10px",
                    border: "1.5px solid var(--j-ink)", borderRadius: 8,
                    background: ok ? "var(--j-mint)" : item.hard ? "#fde8e6" : "#fbf6ea",
                    boxShadow: ok ? "1.5px 1.5px 0 var(--j-ink)" : "none",
                  }}
                >
                  <div style={{
                    width: 20, height: 20, flexShrink: 0,
                    border: "2px solid var(--j-ink)", borderRadius: 4,
                    background: ok ? "var(--j-ink)" : "transparent",
                    color: ok ? "var(--j-win)" : "var(--j-ink)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'VT323',monospace", fontSize: 14,
                  }}>
                    {ok ? "✓" : item.hard ? "!" : "○"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "'DM Mono',monospace", fontSize: 10,
                      fontWeight: 700, color: ok ? "var(--j-ink)" : item.hard ? "#c0392b" : "var(--j-ink)",
                    }}>
                      {item.label}
                      {item.hard && !ok && (
                        <span style={{
                          marginLeft: 6, fontSize: 9,
                          background: "var(--j-coral)", border: "1px solid var(--j-ink)",
                          borderRadius: 4, padding: "1px 5px",
                        }}>HARD GATE</span>
                      )}
                    </div>
                    {!ok && (
                      <div style={{
                        fontFamily: "'DM Mono',monospace", fontSize: 9,
                        color: "var(--j-soft)", marginTop: 2,
                      }}>
                        → {getWaitLabel(item, result)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary line */}
          {failed.length === 0 ? (
            <div style={{
              background: "var(--j-mint)", border: "2px solid var(--j-ink)", borderRadius: 8,
              padding: "9px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11,
              fontWeight: 700, marginBottom: 12,
            }}>
              ✅ ครบทุกเงื่อนไข — พร้อมเข้า
            </div>
          ) : hardFailed.length > 0 ? (
            <div style={{
              background: "var(--j-coral)", border: "2px solid var(--j-ink)", borderRadius: 8,
              padding: "9px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11,
              fontWeight: 700, marginBottom: 12,
            }}>
              🚫 Hard Gate ยังไม่ผ่าน — ห้ามเข้า
            </div>
          ) : (
            <div style={{
              background: "var(--j-butter)", border: "2px solid var(--j-ink)", borderRadius: 8,
              padding: "9px 12px", fontFamily: "'DM Mono',monospace", fontSize: 11,
              fontWeight: 700, marginBottom: 12,
            }}>
              ⏳ รออีก {failed.length} เงื่อนไข
            </div>
          )}

          {/* Action Plan — แสดงเฉพาะเมื่อ score ≥ 4 */}
          {score >= 4 && ap && ap.direction !== "รอ" && (
            <div style={{
              background: "#fbf6ea", border: "2px solid var(--j-ink)", borderRadius: 9,
              overflow: "hidden",
            }}>
              <div style={{
                background: canEnter ? "var(--j-mint)" : "var(--j-butter)",
                borderBottom: "2px solid var(--j-ink)",
                padding: "7px 12px",
                fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 700,
              }}>
                📋 Action Plan
                <span style={{
                  marginLeft: 8, fontWeight: 400, fontSize: 10, color: "var(--j-soft)",
                }}>
                  {ap.direction === "Buy" ? "▲ Buy" : ap.direction === "Sell" ? "▼ Sell" : ap.direction}
                </span>
              </div>
              <div style={{
                padding: "10px 12px",
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}>
                {[
                  { label: "Entry", value: ap.entryZone, bg: "var(--j-sky)" },
                  { label: "🔴 SL", value: ap.sl, bg: "var(--j-coral)" },
                  { label: "🟢 TP1", value: ap.tp1, bg: "var(--j-mint)" },
                  { label: "🟢 TP2", value: ap.tp2, bg: "var(--j-mint)" },
                  { label: "📐 R:R", value: ap.rr, bg: "var(--j-lav)" },
                  { label: "Bias", value: ap.direction, bg: ap.direction === "Buy" ? "var(--j-mint)" : ap.direction === "Sell" ? "var(--j-coral)" : "var(--j-butter)" },
                ].map(({ label, value, bg }) => (
                  <div key={label} style={{
                    background: bg, border: "1.5px solid var(--j-ink)", borderRadius: 7,
                    padding: "7px 8px", boxShadow: "1.5px 1.5px 0 var(--j-ink)",
                  }}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 8, color: "var(--j-soft)", textTransform: "uppercase", marginBottom: 2 }}>
                      {label}
                    </div>
                    <div style={{ fontFamily: "'VT323',monospace", fontSize: 18, lineHeight: 1 }}>
                      {value || "-"}
                    </div>
                  </div>
                ))}
              </div>
              {ap.invalidation && (
                <div style={{
                  margin: "0 12px 10px",
                  background: "#fde8e6", border: "1.5px solid var(--j-ink)", borderRadius: 7,
                  padding: "6px 10px", fontFamily: "'DM Mono',monospace", fontSize: 9, color: "#c0392b",
                }}>
                  ✕ Invalidation: {ap.invalidation}
                </div>
              )}
            </div>
          )}

          {/* score < 4: show waitFor */}
          {score < 4 && result.waitFor?.conditions?.length > 0 && (
            <div style={{
              background: "var(--j-butter)", border: "2px solid var(--j-ink)", borderRadius: 8,
              padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5,
            }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>
                ⏸ รอสิ่งนี้ก่อน
              </div>
              {(result.waitFor.conditions as string[]).slice(0, 3).map((c: string, i: number) => (
                <div key={i} style={{
                  fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--j-ink)",
                  lineHeight: 1.5, display: "flex", gap: 7,
                }}>
                  <span style={{ color: "var(--j-soft)", flexShrink: 0 }}>{i + 1}.</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── History list ─────────────────────────────────────────────────────────────
  const renderHistory = () => (
    <div style={{
      background: "var(--j-win)", border: "2.5px solid var(--j-ink)", borderRadius: 10,
      overflow: "hidden", boxShadow: "3px 3px 0 var(--j-ink)",
    }}>
      <div style={{
        background: "var(--j-butter)", borderBottom: "2px solid var(--j-ink)",
        padding: "7px 12px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600 }}>
          📜 History ({history.length})
        </span>
        <button onClick={loadHistory} style={{
          fontFamily: "'DM Mono',monospace", fontSize: 9,
          border: "1.5px solid var(--j-ink)", borderRadius: 5, padding: "2px 8px",
          cursor: "pointer", background: "var(--j-win)",
        }}>↺</button>
      </div>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
        {historyLoading && (
          <div style={{ padding: 16, fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--j-soft)", textAlign: "center" }}>
            กำลังโหลด...
          </div>
        )}
        {!historyLoading && history.length === 0 && (
          <div style={{ padding: 16, fontFamily: "'DM Mono',monospace", fontSize: 11, color: "var(--j-soft)", textAlign: "center" }}>
            ยังไม่มีประวัติ
          </div>
        )}
        {history.map((row: any) => {
          const r = row.ai_result || {};
          const dt = row.created_at
            ? new Date(row.created_at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            : "";
          const vc = r.verdict === "เข้า" ? "var(--j-mint)" : r.verdict === "รอ" ? "var(--j-butter)" : "var(--j-coral)";
          const recSetup = SETUPS[r.recommendedSetup as SetupKey];
          return (
            <div
              key={row.id}
              style={{
                padding: "10px 12px",
                borderBottom: "1.5px dashed #e3d9c4",
                display: "grid", gridTemplateColumns: "50px 1fr auto",
                gap: 10, alignItems: "center",
              }}
            >
              {row.htf_image && (
                <img
                  src={row.htf_image}
                  onClick={() => setLightbox(row.htf_image)}
                  style={{
                    width: 50, height: 34, objectFit: "cover",
                    border: "1.5px solid var(--j-ink)", borderRadius: 5, cursor: "zoom-in",
                  }}
                />
              )}
              <div>
                <div style={{
                  fontFamily: "'DM Mono',monospace", fontSize: 9,
                  color: "var(--j-soft)", marginBottom: 3,
                }}>
                  {dt}
                </div>
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                  {recSetup ? `${recSetup.emoji} ${recSetup.label}` : r.recommendedSetup || "-"}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{
                    fontFamily: "'DM Mono',monospace", fontSize: 9,
                    background: vc, border: "1.5px solid var(--j-ink)",
                    borderRadius: 5, padding: "1px 6px",
                  }}>{r.verdict || "-"}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--j-soft)" }}>
                    {r.bias || "-"} · {r.phase || "-"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <button
                  onClick={() => restoreHistory(row)}
                  style={{
                    fontFamily: "'DM Mono',monospace", fontSize: 9,
                    border: "1.5px solid var(--j-ink)", borderRadius: 5,
                    padding: "3px 8px", cursor: "pointer", background: "var(--j-mint)",
                  }}
                >Restore</button>
                <button
                  onClick={() => deleteHistory(row.id)}
                  style={{
                    fontFamily: "'DM Mono',monospace", fontSize: 9,
                    border: "1.5px solid var(--j-ink)", borderRadius: 5,
                    padding: "3px 8px", cursor: "pointer", background: "var(--j-coral)",
                  }}
                >Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Upload */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <UploadBox title="📊 HTF — M15" label="อัปโหลด M15" img={htfImg} setImg={v => { setHtfImg(v); setResult(null); setError(""); }} />
        <UploadBox title="📈 LTF — M5/M1" label="อัปโหลด M5/M1" img={ltfImg} setImg={v => { setLtfImg(v); setResult(null); setError(""); }} />
      </div>

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={!canAnalyze}
        style={{
          width: "100%", padding: "14px",
          border: "2.5px solid var(--j-ink)", borderRadius: 10,
          cursor: canAnalyze ? "pointer" : "not-allowed",
          background: loading ? "#e3d9c4" : canAnalyze ? "var(--j-lav)" : "#e3d9c4",
          fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 16,
          boxShadow: canAnalyze ? "3px 3px 0 var(--j-ink)" : "none",
          opacity: (!htfImg || !ltfImg) ? 0.5 : 1,
          color: "var(--j-ink)",
        }}
      >
        {loading
          ? "⏳ AI กำลังวิเคราะห์..."
          : (!htfImg || !ltfImg)
          ? "📸 อัปโหลดรูปทั้ง 2 ใบก่อน"
          : "🧠 ANALYZE — SMC PRO MAX"}
      </button>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory(); }}
          style={{
            fontFamily: "'DM Mono',monospace", fontSize: 11,
            border: "2px solid var(--j-ink)", borderRadius: 7,
            padding: "6px 12px", cursor: "pointer",
            background: showHistory ? "var(--j-butter)" : "var(--j-win)",
            boxShadow: "2px 2px 0 var(--j-ink)", color: "var(--j-ink)",
          }}
        >
          📜 History {history.length ? `(${history.length})` : ""}
        </button>
        <button
          onClick={clearAll}
          style={{
            fontFamily: "'DM Mono',monospace", fontSize: 11,
            border: "2px dashed var(--j-ink)", borderRadius: 7,
            padding: "6px 12px", cursor: "pointer",
            background: "transparent", color: "var(--j-soft)",
          }}
        >
          🧹 Clear
        </button>
        {savingHistory && (
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--j-soft)", alignSelf: "center" }}>
            saving...
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "var(--j-coral)", border: "2px solid var(--j-ink)", borderRadius: 9,
          padding: "10px 14px", fontFamily: "'DM Mono',monospace", fontSize: 11,
        }}>
          ❌ {error}
        </div>
      )}

      {/* History panel */}
      {showHistory && renderHistory()}

      {/* Results */}
      {result && (
        <>
          {renderVerdict()}
          {renderSetupPanel()}
          {/* Reasons */}
          {Array.isArray(result.reasons) && result.reasons.length > 0 && (
            <div style={{
              background: "#fbf6ea", border: "1.5px dashed var(--j-ink)", borderRadius: 9,
              padding: "10px 12px",
            }}>
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--j-soft)", textTransform: "uppercase", marginBottom: 7 }}>
                AI Reasons
              </div>
              {(result.reasons as string[]).map((r: string, i: number) => (
                <div key={i} style={{
                  fontFamily: "'DM Mono',monospace", fontSize: 10, lineHeight: 1.5,
                  display: "flex", gap: 7, marginBottom: 4,
                }}>
                  <span style={{ color: "var(--j-soft)", flexShrink: 0 }}>•</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{
            fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--j-soft)",
            textAlign: "center", lineHeight: 1.6,
          }}>
            Hard Gate ไม่ผ่าน = ห้ามฝืน · AI เป็นตัวช่วยตัดสินใจ ไม่ใช่สัญญาณบังคับ
          </div>
        </>
      )}
    </div>
  );
}
