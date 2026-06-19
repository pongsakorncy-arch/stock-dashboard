import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { image, mediaType } = await req.json();
    if (!image) return NextResponse.json({}, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    const prompt = `คุณเป็น Trading Journal AI สำหรับระบบ SMC (Smart Money Concepts) เทรด XAUUSD

วิเคราะห์รูปนี้ซึ่งอาจเป็น:
1. Screenshot chart TradingView (มี entry/exit markers, S/R lines)
2. Order history จาก broker (มี open/close price, P/L, lot size)

ดึงข้อมูลต่อไปนี้ให้ครบที่สุดเท่าที่มองเห็นในรูป แล้วตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:

{
  "date": "YYYY-MM-DD หรือ null",
  "time": "HH:MM หรือ null",
  "symbol": "ชื่อ symbol เช่น XAUUSD หรือ null",
  "direction": "LONG หรือ SHORT หรือ null",
  "session": "Tokyo หรือ London หรือ New York หรือ Overlap หรือ null",
  "entryPrice": ตัวเลขราคา entry หรือ 0,
  "slPrice": ตัวเลขราคา stop loss หรือ 0,
  "tpPrice": ตัวเลขราคา take profit หรือ 0,
  "exitPrice": ตัวเลขราคาที่ออก หรือ 0,
  "lotSize": ตัวเลข lot size หรือ 0.01,
  "pl": ตัวเลข P/L เป็น USD (ติดลบถ้าขาดทุน) หรือ 0,
  "rr": ตัวเลข Risk:Reward ที่ได้จริง หรือ 0,
  "result": "WIN หรือ LOSS หรือ BE" (ดูจาก P/L),
  "smcConcept": ["OB","FVG","BOS","CHoCH","Liquidity","MSB","W-Pattern","M-Pattern","Other"] เลือกที่เห็นในชาร์ต,
  "htfBias": "Bullish หรือ Bearish หรือ Neutral",
  "entryModel": "เช่น W2, M2, BOS+OB, CHoCH+FVG หรือ string ว่าง",
  "notes": "สังเกตพิเศษจากรูป เช่น pattern ที่เห็น, context ตลาด"
}

หากข้อมูลไหนไม่มีในรูป ให้ใส่ null หรือ 0 ตามประเภท อย่าแต่งข้อมูลขึ้นมาเอง`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: image },
            },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Claude API error:", err);
      return NextResponse.json({ error: "Claude API failed" }, { status: 500 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("analyze-trade error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
