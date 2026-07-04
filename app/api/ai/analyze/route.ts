import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

function imageBlock(dataUrl: string) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mediaType = meta?.match(/data:(.*);base64/)?.[1] || "image/png";
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 || "" } };
}

const SYSTEM = `คุณคือ Yokimura AI Coach ผู้ช่วยตัดสินใจเทรด XAUUSD
ระบบที่ใช้: SMC Pro Max · Pullback · Sideway Range · Breakout · M5 Reversal
กฎเหล็ก: ไม่มี MSS = ห้ามเข้า SMC · Breakout ต้องปิดหลุดกรอบไม่ใช่แค่ Wick · ห้ามรับประกันกำไร
หน้าที่: ช่วยพี่คิด ไม่ใช่ตัดสินใจแทน`;

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0 } = await req.json();
    if (!htfImage || !ltfImage)
      return NextResponse.json({ error: "Missing HTF or LTF image" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

    const prompt = `วันนี้แพ้แล้ว ${lossesToday} ไม้${lossesToday >= 2 ? " — ต้องเข้มงวดกว่าปกติ" : ""}

ดูกราฟ HTF (M15) และ LTF (M5/M1) แล้วช่วยวิเคราะห์ตามระบบของผม

ตอบ JSON เท่านั้น โดย:
- zones ให้ระบุเป็นตัวเลขราคาจริงที่เห็นในกราฟ
- ถ้าอ่านราคาจากกราฟไม่ได้ชัด ให้ใส่ "" แทน
- reasons ต้องอ้างอิงสิ่งที่เห็นในกราฟจริง

{
  "bias": "Bull | Bear | Neutral",
  "cycle": "Trend | Pullback | Sideway | Unknown",
  "scores": {
    "smcProMax": 0,
    "pullback": 0,
    "sidewayRange": 0,
    "breakoutRunTrend": 0,
    "m5Reversal": 0
  },
  "recommendedSetup": "SMC Pro Max | Pullback | Sideway Range | Breakout / Run Trend | M5 Reversal",
  "verdict": "เข้า | รอ | ไม่เข้า",
  "verdictReason": "เหตุผลหลัก 1 ประโยค",
  "waitFor": {
    "liquidityZone": "ราคา $$$ ที่ยังไม่ถูก sweep เช่น SSL ที่ 3285.00",
    "interestZone": "โซนที่น่าสนใจ เช่น 3288.00 - 3292.00",
    "conditions": ["สิ่งที่ต้องรอก่อนเข้า เช่น รอ MSS บน M5", "รอ Retest กลับมาที่ OB", "ดู Volume ประกอบ"]
  },
  "actionPlan": {
    "entryZone": "เช่น 3290.00 - 3293.00",
    "sl": "เช่น 3284.50",
    "tp1": "เช่น 3305.00",
    "tp2": "เช่น 3318.00",
    "invalidation": "ถ้าราคาปิดหลุด ... = ยกเลิกแผนนี้",
    "next3Candles": ["สิ่งที่ต้องสังเกตใน 3 แท่งถัดไป", "เช่น ถ้า Volume โตขึ้นพร้อม bullish candle = momentum มา", "เช่น ถ้า Wick ยาวด้านบน = Rejection"]
  },
  "checklist": {
    "htfZone": false,
    "liquidity": false,
    "bosChoch": false,
    "obDzSz": false,
    "mss": false,
    "retest": false,
    "rejection": false,
    "volumeConfirm": false,
    "breakoutClose": false,
    "noFomo": true
  },
  "reasons": ["เหตุผล 1", "เหตุผล 2", "เหตุผล 3"]
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "text", text: "📊 HTF — M15 (หา Bias / Trend / DZ-SZ / Liquidity):" },
            imageBlock(htfImage),
            { type: "text", text: "📈 LTF — M5/M1 (หา MSS / Retest / Rejection / Volume / จุดเข้า):" },
            imageBlock(ltfImage),
          ],
        }],
      }),
    });

    const raw = await res.text();
    if (!res.ok)
      return NextResponse.json({ error: "Claude API error", status: res.status, detail: raw }, { status: 500 });

    if (!raw || raw.trim() === "")
      return NextResponse.json({ error: "Empty response from Claude" }, { status: 500 });

    let data: any;
    try { data = JSON.parse(raw); }
    catch { return NextResponse.json({ error: "Claude response not JSON", raw: raw.slice(0,200) }, { status: 500 }); }

    const textBlock = data?.content?.find((b: any) => b.type === "text");
    if (!textBlock?.text)
      return NextResponse.json({ error: "No text in Claude response", content: data?.content }, { status: 500 });

    const text = textBlock.text;
    // ลอง parse หลายวิธี
    let parsed: any;

    // วิธี 1: ลบ code fence แล้ว parse
    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = JSON.parse(cleaned);
      return NextResponse.json(parsed);
    } catch {}

    // วิธี 2: ดึง JSON object ออกจาก text ที่มีข้อความปนมา
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
        return NextResponse.json(parsed);
      }
    } catch {}

    return NextResponse.json({ error: "Could not parse Claude JSON", raw: text.slice(0,300) }, { status: 500 });
  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: err?.message }, { status: 500 });
  }
}
