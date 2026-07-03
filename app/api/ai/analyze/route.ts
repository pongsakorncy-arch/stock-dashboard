import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function imagePart(dataUrl: string) {
  return {
    type: "image_url",
    image_url: {
      url: dataUrl,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0 } = await req.json();

    if (!htfImage || !ltfImage) {
      return NextResponse.json({ error: "Missing HTF or LTF image" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENROUTER_API_KEY in Vercel" }, { status: 500 });
    }

    const prompt = `
คุณคือ Yokimura AI Coach วิเคราะห์กราฟ XAUUSD ตามระบบของผู้ใช้เท่านั้น

มี 5 ท่า:
1. SMC Pro Max
2. Pullback
3. Sideway Range
4. Breakout / Run Trend
5. M1/M5 Reversal

กฎ:
- ถ้าไม่เห็นชัด ให้ false
- ไม่มี MSS ชัด = ไม่ให้เข้า SMC
- ไม่มี Retest ตามกฎ = ให้รอ
- Breakout ต้องปิดหลุดกรอบ ไม่ใช่แค่ไส้
- ถ้าแพ้วันนี้เยอะ ให้เข้มงวดขึ้น
- วันนี้แพ้แล้ว ${lossesToday} ไม้
- ห้ามรับประกันกำไร

ตอบ JSON เท่านั้น:
{
  "bias": "Bull | Bear | Neutral",
  "cycle": "Trend | Pullback | Sideway | Unknown",
  "recommendedSetup": "SMC Pro Max | Pullback | Sideway Range | Breakout / Run Trend | M1/M5 Reversal",
  "scores": {
    "smcProMax": 0,
    "pullback": 0,
    "sidewayRange": 0,
    "breakoutRunTrend": 0,
    "m1m5Reversal": 0
  },
  "verdict": "เข้า | รอ | ไม่เข้า",
  "reasons": ["", "", ""],
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
  }
}
`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://adminamericano.vercel.app",
        "X-OpenRouter-Title": "Yokimura Trading Journal",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              imagePart(htfImage),
              imagePart(ltfImage),
            ],
          },
        ],
        temperature: 0.2,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          error: "OpenRouter API error",
          status: res.status,
          detail: data,
        },
        { status: 500 }
      );
    }

    const text = data?.choices?.[0]?.message?.content || "{}";
    const clean = text.replace(/```json|```/g, "").trim();

    return NextResponse.json(JSON.parse(clean));
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Route crashed",
        message: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
