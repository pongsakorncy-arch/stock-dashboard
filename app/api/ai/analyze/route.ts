import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type AnyObj = Record<string, any>;

function imageBlock(dataUrl: string) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mediaType = meta?.match(/data:(.*);base64/)?.[1] || "image/png";
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: base64 || "",
    },
  };
}

function safeJsonParse(text: string): AnyObj | null {
  try {
    const cleaned = String(text || "").replace(/^```json\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned);
  } catch {}
  try {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return null;
}

function hasEvidence(v: any) {
  const s = String(v || "").trim().toUpperCase();
  if (!s) return false;
  if (s === "NOT_FOUND" || s === "UNKNOWN" || s === "N/A" || s === "NULL" || s === "-") return false;
  if (s.includes("NOT FOUND") || s.includes("ไม่พบ") || s.includes("ยังไม่")) return false;
  return true;
}

function extractNumbers(v: any): number[] {
  const text = String(v || "");
  const matches = text.match(/\d{3,5}(?:\.\d+)?/g) || [];
  return matches.map(Number).filter(n => Number.isFinite(n));
}

function isPriceSuspicious(v: any, currentPrice?: number) {
  const nums = extractNumbers(v);
  if (nums.length === 0) return false;
  if (!currentPrice) return nums.some(n => n > 0 && n < 3000);
  return nums.some(n => Math.abs(n - currentPrice) > 180);
}

function replaceBadPrice(v: any, currentPrice?: number, fallback = "UNKNOWN — ให้ยืนยันราคาจากกราฟเอง") {
  if (isPriceSuspicious(v, currentPrice)) return fallback;
  return v || fallback;
}

function defaultObj(parsed: AnyObj) {
  const c = parsed.smcChecklist || {};
  const ap = parsed.actionPlan || {};
  const ev = parsed.hardGateEvidence || {};

  return {
    bias: parsed.bias || "Neutral",
    phase: parsed.phase || "รับต้าน",
    htfZone: parsed.htfZone || "UNKNOWN",
    liquidityStatus: {
      swept: !!parsed.liquidityStatus?.swept,
      location: parsed.liquidityStatus?.location || "UNKNOWN",
      note: parsed.liquidityStatus?.note || "",
    },
    setupGroup: parsed.setupGroup || "รอ",
    recommendedSetup: parsed.recommendedSetup || "รอ",
    setupScore: Number(parsed.setupScore || 0),
    confidence: Number(parsed.confidence || 50),
    hardGateEvidence: {
      sweep: ev.sweep || "NOT_FOUND",
      rejection: ev.rejection || "NOT_FOUND",
      ltfRetest: ev.ltfRetest || "NOT_FOUND",
      mss: ev.mss || "NOT_FOUND",
      m15Retest: ev.m15Retest || "NOT_FOUND",
      slReady: ev.slReady || "NOT_FOUND",
      priceReadability: ev.priceReadability || "UNKNOWN",
    },
    smcChecklist: {
      step1_bos_choch: !!c.step1_bos_choch,
      step2_orderBlock: !!c.step2_orderBlock,
      step3_dz_sz: !!c.step3_dz_sz,
      step4_liquidityZone: !!c.step4_liquidityZone,
      step5_swept: !!c.step5_swept,
      step6_rejection: !!c.step6_rejection,
      step7_ltfRetest: !!c.step7_ltfRetest,
      step7_detail: c.step7_detail || "ยังไม่เกิด",
      step8_mss: !!c.step8_mss,
      step9_tp_set: !!c.step9_tp_set,
      step10_m15Retest: !!c.step10_m15Retest,
      step11_sl_ready: !!c.step11_sl_ready,
    },
    hardGateFail: parsed.hardGateFail ?? null,
    nonSmcSetup: {
      active: !!parsed.nonSmcSetup?.active,
      type: parsed.nonSmcSetup?.type || "m5Reversal",
      condition: parsed.nonSmcSetup?.condition || "ยังไม่ครบ",
      paStatus: parsed.nonSmcSetup?.paStatus || "ยังไม่ถึง",
    },
    verdict: parsed.verdict || "รอ",
    verdictReason: parsed.verdictReason || "รอให้เงื่อนไขชัดเจนก่อน",
    actionPlan: {
      direction: ap.direction || "รอ",
      entryZone: ap.entryZone || "UNKNOWN",
      sl: ap.sl || "UNKNOWN",
      tp1: ap.tp1 || "UNKNOWN",
      tp2: ap.tp2 || "UNKNOWN",
      rr: ap.rr || "UNKNOWN",
      invalidation: ap.invalidation || "ถ้าโครงสร้างไม่ยืนยัน ให้ยกเลิก Setup",
      next3Candles: Array.isArray(ap.next3Candles) ? ap.next3Candles.slice(0, 3) : [],
      entryLogic: ap.entryLogic || "รอ confirmation",
      slLogic: ap.slLogic || "วาง SL หลังจุด invalidation",
      tpLogic: ap.tpLogic || "ใช้ liquidity/zone ถัดไป",
    },
    waitFor: {
      conditions: Array.isArray(parsed.waitFor?.conditions) ? parsed.waitFor.conditions.slice(0, 5) : ["รอ Hard Gate ให้ครบ"],
      keyLevel: parsed.waitFor?.keyLevel || "UNKNOWN",
    },
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 3) : [],
    modelGuard: parsed.modelGuard || {},
  };
}

function validateAndOverride(parsedInput: AnyObj, lossesToday: number, currentPriceRaw: any) {
  const currentPrice = Number(currentPriceRaw || 0) || undefined;
  const parsed = defaultObj(parsedInput);
  const c = parsed.smcChecklist;
  const ev = parsed.hardGateEvidence;

  if (!hasEvidence(ev.sweep)) c.step5_swept = false;
  if (!hasEvidence(ev.rejection)) c.step6_rejection = false;
  if (!hasEvidence(ev.ltfRetest)) c.step7_ltfRetest = false;
  if (!hasEvidence(ev.mss)) c.step8_mss = false;
  if (!hasEvidence(ev.m15Retest)) c.step10_m15Retest = false;
  if (!hasEvidence(ev.slReady)) c.step11_sl_ready = false;

  parsed.liquidityStatus.swept = !!c.step5_swept;

  parsed.htfZone = replaceBadPrice(parsed.htfZone, currentPrice);
  parsed.liquidityStatus.location = replaceBadPrice(parsed.liquidityStatus.location, currentPrice);
  parsed.actionPlan.entryZone = replaceBadPrice(parsed.actionPlan.entryZone, currentPrice);
  parsed.actionPlan.sl = replaceBadPrice(parsed.actionPlan.sl, currentPrice);
  parsed.actionPlan.tp1 = replaceBadPrice(parsed.actionPlan.tp1, currentPrice);
  parsed.actionPlan.tp2 = replaceBadPrice(parsed.actionPlan.tp2, currentPrice);
  parsed.waitFor.keyLevel = replaceBadPrice(parsed.waitFor.keyLevel, currentPrice);

  const priceFields = [
    parsed.htfZone,
    parsed.liquidityStatus.location,
    parsed.actionPlan.entryZone,
    parsed.actionPlan.sl,
    parsed.actionPlan.tp1,
    parsed.actionPlan.tp2,
    parsed.waitFor.keyLevel,
  ];
  const badPriceDetected = priceFields.some(v => String(v || "").includes("UNKNOWN"));

  if (badPriceDetected) {
    parsed.confidence = Math.min(parsed.confidence, 55);
    parsed.reasons.unshift("AI อ่านตัวเลขราคาไม่มั่นใจ จึงซ่อนราคาและให้ยืนยันจากกราฟเอง");
  }

  const hardPassed =
    c.step5_swept &&
    c.step6_rejection &&
    c.step7_ltfRetest &&
    c.step8_mss &&
    c.step10_m15Retest &&
    c.step11_sl_ready;

  const hardMissing: string[] = [];
  if (!c.step5_swept) hardMissing.push("Liquidity Sweep");
  if (!c.step6_rejection) hardMissing.push("Rejection");
  if (!c.step7_ltfRetest) hardMissing.push("LTF Retest");
  if (!c.step8_mss) hardMissing.push("MSS");
  if (!c.step10_m15Retest) hardMissing.push("M15 Retest");
  if (!c.step11_sl_ready) hardMissing.push("SL Ready");

  const score = Number(parsed.setupScore || 0);
  const nonSmcActive = parsed.setupGroup === "NonSMC" && parsed.nonSmcSetup?.active === true;

  if (lossesToday >= 3) {
    parsed.verdict = "ไม่เข้า";
    parsed.actionPlan.direction = "รอ";
    parsed.hardGateFail = `🚫 Daily Lock: แพ้ครบ ${lossesToday} ไม้แล้ว วันนี้หยุดเทรด`;
  } else if (parsed.setupGroup === "SMC") {
    if (!hardPassed || score < 80 || parsed.confidence < 60) {
      parsed.verdict = score >= 45 ? "รอ" : "ไม่เข้า";
      parsed.actionPlan.direction = "รอ";
      parsed.hardGateFail =
        hardMissing.length > 0
          ? `Hard Gate ยังไม่ผ่าน: ${hardMissing.join(", ")}`
          : score < 80
          ? "Setup Score ต่ำกว่า 80"
          : "AI Confidence ต่ำกว่า 60";
    } else {
      parsed.verdict = "เข้า";
      parsed.hardGateFail = null;
    }
  } else if (!nonSmcActive && parsed.verdict === "เข้า") {
    parsed.verdict = "รอ";
    parsed.actionPlan.direction = "รอ";
    parsed.hardGateFail = "ไม่มี Non-SMC setup ที่ active ครบเงื่อนไข";
  }

  if (badPriceDetected && parsed.verdict === "เข้า") {
    parsed.verdict = "รอ";
    parsed.actionPlan.direction = "รอ";
    parsed.hardGateFail = "ตัวเลขราคาไม่มั่นใจ ต้องยืนยันราคาจากกราฟก่อน";
  }

  parsed.reasons = Array.from(new Set(parsed.reasons.filter(Boolean).map((x: any) => String(x).slice(0, 120)))).slice(0, 3);

  if (hardMissing.length > 0) {
    parsed.waitFor.conditions = [
      ...hardMissing.map(x => `รอ ${x} ให้ชัดเจน`),
      ...(parsed.waitFor.conditions || []),
    ].slice(0, 5);
  }

  return parsed;
}

const SYSTEM = `คุณคือ Yokimura AI Coach สำหรับ XAUUSD

หน้าที่: อ่านภาพ HTF=M15 และ LTF=M5/M1 เพื่อช่วยเช็ก SMC Pro Max
สำคัญ: ใช้ Sonnet แบบระมัดระวัง ห้ามเดา ถ้าไม่เห็นหลักฐานให้ตอบ false และ evidence="NOT_FOUND"

กฎหลัก:
1) READY/เข้า ได้เฉพาะเมื่อ SMC Hard Gate ครบ: sweep + rejection + LTF retest + MSS + M15 retest + SL ready
2) ถ้าหาหลักฐานของ Hard Gate ไม่เจอ ให้ตั้ง checklist ข้อนั้นเป็น false
3) ห้ามสร้างราคาเอง ถ้าอ่านราคาไม่ชัดให้ตอบ UNKNOWN
4) ถ้ามี currentPrice ให้ทุกโซนที่เป็นตัวเลขต้องอยู่ใกล้ currentPrice ห้ามหลุดไกล
5) SMC ยังไม่ครบให้ verdict="รอ" หรือ "ไม่เข้า" เท่านั้น
6) เหตุผลต้องสั้น ไม่เกิน 3 ข้อ
7) ตอบ JSON เท่านั้น`;

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0, currentPrice = "" } = await req.json();

    if (!htfImage || !ltfImage) {
      return NextResponse.json({ error: "Missing images" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const strictMode = Number(lossesToday) >= 2;
    const priceNote = currentPrice
      ? `CurrentPrice=${currentPrice}. ใช้เป็นฐานเช็กเลขราคา ถ้าอ่านเลขจากภาพแล้วต่างจาก CurrentPrice มาก ให้ตอบ UNKNOWN แทนเลขนั้น`
      : `ไม่มี CurrentPrice: ห้ามมั่นใจเรื่องเลขราคา ถ้าไม่ชัดให้ตอบ UNKNOWN`;

    const prompt = `${strictMode ? `โหมดเข้มงวด: วันนี้แพ้แล้ว ${lossesToday} ไม้` : `วันนี้แพ้ ${lossesToday} ไม้`}
${priceNote}

วิเคราะห์เป็น 3 ชั้น:
A) HTF: bias, phase, zone, liquidity
B) LTF: retest, MSS, rejection, Pa status
C) Hard Gate Evidence: ต้องมีหลักฐาน ไม่งั้น false

ตอบ JSON ตาม schema นี้เท่านั้น:
{
  "bias": "Bull|Bear|Neutral",
  "phase": "Trend|Pullback|Sideway|รับต้าน",
  "htfZone": "ราคา/โซน หรือ UNKNOWN",
  "liquidityStatus": {
    "swept": false,
    "location": "บริเวณ liquidity หรือ UNKNOWN",
    "note": "สั้น"
  },
  "setupGroup": "SMC|NonSMC|รอ",
  "recommendedSetup": "smcProMax|sidewayRange|breakoutRunTrend|pullbackShort|m5Reversal|รอ",
  "setupScore": 0,
  "confidence": 0,
  "hardGateEvidence": {
    "sweep": "หลักฐาน sweep หรือ NOT_FOUND",
    "rejection": "หลักฐาน rejection หรือ NOT_FOUND",
    "ltfRetest": "หลักฐาน Higher Low/Lower High หรือ NOT_FOUND",
    "mss": "หลักฐาน break swing หรือ NOT_FOUND",
    "m15Retest": "หลักฐาน M15 retest หรือ NOT_FOUND",
    "slReady": "จุด invalidation/SL logic หรือ NOT_FOUND",
    "priceReadability": "CLEAR|UNCLEAR"
  },
  "smcChecklist": {
    "step1_bos_choch": false,
    "step2_orderBlock": false,
    "step3_dz_sz": false,
    "step4_liquidityZone": false,
    "step5_swept": false,
    "step6_rejection": false,
    "step7_ltfRetest": false,
    "step7_detail": "Higher Low|Lower High|ยังไม่เกิด",
    "step8_mss": false,
    "step9_tp_set": false,
    "step10_m15Retest": false,
    "step11_sl_ready": false
  },
  "hardGateFail": "ข้อความ หรือ null",
  "nonSmcSetup": {
    "active": false,
    "type": "sidewayRange|breakoutRunTrend|pullbackShort|m5Reversal",
    "condition": "เงื่อนไขที่เห็น",
    "paStatus": "Pa ที่ 1|Pa ที่ 2|ยังไม่ถึง"
  },
  "verdict": "เข้า|รอ|ไม่เข้า",
  "verdictReason": "สั้น",
  "actionPlan": {
    "direction": "Buy|Sell|รอ",
    "entryZone": "ราคา หรือ UNKNOWN",
    "sl": "ราคา หรือ UNKNOWN",
    "tp1": "ราคา หรือ UNKNOWN",
    "tp2": "ราคา หรือ UNKNOWN",
    "rr": "1:X หรือ UNKNOWN",
    "invalidation": "ถ้า...=ยกเลิก Setup",
    "next3Candles": ["สิ่งที่ต้องเห็น 1", "สิ่งที่ต้องเห็น 2", "สิ่งที่ต้องเห็น 3"],
    "entryLogic": "เช่น retest SZ + Lower High",
    "slLogic": "เช่น เหนือ Lower High",
    "tpLogic": "เช่น liquidity low ถัดไป"
  },
  "waitFor": {
    "conditions": ["รออะไร 1", "รออะไร 2"],
    "keyLevel": "ราคา หรือ UNKNOWN"
  },
  "reasons": ["เหตุผล 1", "เหตุผล 2", "เหตุผล 3"],
  "modelGuard": {
    "usedCurrentPrice": ${currentPrice ? "true" : "false"},
    "avoidedPriceGuess": true
  }
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2200,
        temperature: 0,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "text", text: "HTF (M15):" },
              imageBlock(htfImage),
              { type: "text", text: "LTF (M5/M1):" },
              imageBlock(ltfImage),
            ],
          },
        ],
      }),
    });

    const raw = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: "Claude API error", status: res.status, raw: raw.slice(0, 500) },
        { status: 500 },
      );
    }

    const data = JSON.parse(raw);
    const text = data?.content?.find((b: any) => b.type === "text")?.text || "{}";
    const parsed = safeJsonParse(text);

    if (!parsed) {
      return NextResponse.json({ error: "Parse failed", raw: text.slice(0, 500) }, { status: 500 });
    }

    const guarded = validateAndOverride(parsed, Number(lossesToday || 0), currentPrice);
    return NextResponse.json(guarded);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Route crashed", message: err?.message || String(err) },
      { status: 500 },
    );
  }
}
