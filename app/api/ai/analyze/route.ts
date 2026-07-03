import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function dataUrlToPart(dataUrl: string) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mimeType = meta?.match(/data:(.*);base64/)?.[1] || "image/png";

  return {
    inline_data: {
      mime_type: mimeType,
      data: base64 || "",
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0 } = await req.json();

    if (!htfImage || !ltfImage) {
      return NextResponse.json({ error: "Missing HTF or LTF image" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY in Vercel" }, { status: 500 });
    }

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `
คุณคือ Yokimura AI Coach
วิเคราะห์ HTF และ LTF ตามระบบ 5 ท่า:
1. SMC Pro Max
2. Pullback
3. Sideway Range
4. Breakout / Run Trend
5. M1/M5 Reversal

วันนี้แพ้แล้ว ${lossesToday} ไม้

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
                `,
              },
              dataUrlToPart(htfImage),
              dataUrlToPart(ltfImage),
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    const raw = await geminiRes.text();

    if (!geminiRes.ok) {
      return NextResponse.json(
        {
          error: "Gemini API error",
          status: geminiRes.status,
          detail: raw,
          keyPrefix: apiKey.slice(0, 6),
        },
        { status: 500 }
      );
    }

    return NextResponse.json(JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text
      ? JSON.parse(JSON.parse(raw).candidates[0].content.parts[0].text)
      : JSON.parse(raw)
    );
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
