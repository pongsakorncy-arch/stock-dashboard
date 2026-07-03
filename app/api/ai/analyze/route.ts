import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Bias = "Bull" | "Bear" | "Neutral";
type Cycle = "Trend" | "Pullback" | "Sideway" | "Unknown";

function score10(v: number) {
  return Math.max(0, Math.min(10, Math.round(v * 10) / 10));
}

export async function POST(req: NextRequest) {
  try {
    const {
      direction = "BUY",
      bias = "Neutral",
      cycle = "Unknown",
      lossesToday = 0,
      checklist = {},
      plan = {},
    } = await req.json();

    const biasMatch =
      bias === "Neutral" ? 0.5 :
      direction === "BUY" && bias === "Bull" ? 1 :
      direction === "SELL" && bias === "Bear" ? 1 : 0;

    const c = {
      htfZone: !!checklist.htfZone,
      liquidity: !!checklist.liquidity,
      bosChoch: !!checklist.bosChoch,
      obDzSz: !!checklist.obDzSz,
      mss: !!checklist.mss,
      retest: !!checklist.retest,
      rejection: !!checklist.rejection,
      volumeConfirm: !!checklist.volumeConfirm,
      breakoutClose: !!checklist.breakoutClose,
      noFomo: checklist.noFomo !== false,
      rrGood: !!checklist.rrGood,
      nearRange: !!checklist.nearRange,
      pa2: !!checklist.pa2,
      dirConfirm: !!checklist.dirConfirm,
    };

    const penalty = lossesToday >= 3 ? 1.2 : lossesToday >= 2 ? 0.7 : 0;

    const smcProMax = score10(
      biasMatch * 1.2 +
      (cycle === "Trend" || cycle === "Pullback" ? 1 : 0) +
      (c.htfZone ? 1 : 0) +
      (c.bosChoch ? 1 : 0) +
      (c.obDzSz ? 1 : 0) +
      (c.liquidity ? 1.2 : 0) +
      (c.mss ? 1.4 : 0) +
      (c.retest ? 1.2 : 0) +
      (c.rejection ? 0.8 : 0) +
      (c.volumeConfirm ? 0.7 : 0) +
      (c.rrGood ? 0.5 : 0) -
      penalty
    );

    const pullback = score10(
      biasMatch * 1.3 +
      (cycle === "Pullback" ? 2 : 0) +
      (c.htfZone ? 1.4 : 0) +
      (c.obDzSz ? 1 : 0) +
      (c.rejection ? 1 : 0) +
      (c.mss ? 1 : 0) +
      (c.retest ? 1 : 0) +
      (c.volumeConfirm ? 0.7 : 0) +
      (c.rrGood ? 0.6 : 0) -
      penalty
    );

    const sidewayRange = score10(
      (cycle === "Sideway" ? 2.5 : 0) +
      (c.nearRange ? 2 : 0) +
      (c.rejection ? 1.2 : 0) +
      (c.pa2 ? 1 : 0) +
      (c.rrGood ? 1 : 0) +
      (c.noFomo ? 0.6 : -1) -
      penalty
    );

    const breakoutRunTrend = score10(
      (cycle === "Sideway" ? 1 : 0) +
      (c.breakoutClose ? 3 : 0) +
      (c.retest ? 1.5 : 0) +
      (c.volumeConfirm ? 1.5 : 0) +
      (c.noFomo ? 1 : -1.5) +
      (c.rrGood ? 0.8 : 0) -
      penalty
    );

    const m1m5Reversal = score10(
      (c.pa2 ? 1.7 : 0) +
      (c.dirConfirm ? 1.5 : 0) +
      (c.mss ? 1.5 : 0) +
      (c.rejection ? 1.2 : 0) +
      (c.volumeConfirm ? 1 : 0) +
      (c.liquidity ? 1 : 0) +
      (c.noFomo ? 0.8 : -1.2) -
      penalty
    );

    const scores = {
      smcProMax,
      pullback,
      sidewayRange,
      breakoutRunTrend,
      m1m5Reversal,
    };

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const bestKey = entries[0][0];
    const bestScore = entries[0][1];

    const setupNameMap: Record<string, string> = {
      smcProMax: "SMC Pro Max",
      pullback: "Pullback",
      sidewayRange: "Sideway Range",
      breakoutRunTrend: "Breakout / Run Trend",
      m1m5Reversal: "M1/M5 Reversal",
    };

    let verdict: "เข้า" | "รอ" | "ไม่เข้า" = "ไม่เข้า";

    if (lossesToday >= 3) verdict = "ไม่เข้า";
    else if (bestScore >= 8.5 && c.noFomo) verdict = "เข้า";
    else if (bestScore >= 6.5) verdict = "รอ";
    else verdict = "ไม่เข้า";

    const reasons: string[] = [];

    if (lossesToday >= 3) reasons.push("วันนี้แพ้ 3 ไม้ขึ้นไป ระบบให้หยุดก่อน");
    if (!c.liquidity && bestKey === "smcProMax") reasons.push("SMC ยังขาด Liquidity $$$");
    if (!c.mss && ["smcProMax", "pullback", "m1m5Reversal"].includes(bestKey)) reasons.push("ยังไม่มี MSS ชัด");
    if (!c.retest && ["smcProMax", "pullback", "breakoutRunTrend"].includes(bestKey)) reasons.push("ยังไม่มี Retest ตามกฎ");
    if (!c.volumeConfirm) reasons.push("Volume ยังไม่ช่วยยืนยัน");
    if (!c.rrGood) reasons.push("RR ยังไม่ผ่านเกณฑ์");

    if (reasons.length === 0) {
      reasons.push("เงื่อนไขหลักครบ เล่นตามแผนได้");
    }

    const waitFor = [
      !c.liquidity ? `รอเคลียร์ $$$ ที่ ${plan.liquidityTarget || "High/Low สำคัญก่อน"}` : "",
      !c.htfZone ? `รอราคาเข้าโซน ${plan.interestZone || "Demand/Supply ที่วางไว้"}` : "",
      !c.mss ? "รอ MSS บน LTF" : "",
      !c.retest ? "รอ Retest หลัง MSS" : "",
      !c.volumeConfirm ? "รอ Volume Confirm" : "",
    ].filter(Boolean);

    const response = {
      bias,
      cycle,
      recommendedSetup: setupNameMap[bestKey],
      scores,
      verdict,
      confidence: Math.round(bestScore * 10),
      reasons: reasons.slice(0, 3),
      checklist: c,
      actionPlan: {
        liquidityTarget: plan.liquidityTarget || "",
        interestZone: plan.interestZone || "",
        entryZone: plan.entryZone || "",
        stopLoss: plan.stopLoss || "",
        takeProfit1: plan.takeProfit1 || "",
        takeProfit2: plan.takeProfit2 || "",
        invalidation: plan.invalidation || "",
        waitFor,
        next3Candles: [
          "ถ้าปิดผ่าน MSS พร้อมแรง ให้เตรียมหา Retest",
          "ถ้าหลุดโซนสำคัญ ให้ยกเลิก Setup",
          "ถ้า Volume ไม่มา อย่าไล่ราคา",
        ],
      },
      coach:
        verdict === "เข้า"
          ? "Setup ผ่าน เล่นตามแผนได้ แต่อย่าเพิ่มความเสี่ยง"
          : verdict === "รอ"
          ? "ยังไม่ต้องรีบ รอเงื่อนไขที่ขาดให้ครบก่อน"
          : "ไม่เข้า Setup ยังไม่คุ้ม หรือความเสี่ยงวันนี้สูงเกินไป",
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Rule Engine crashed",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
