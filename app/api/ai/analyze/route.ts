import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PROMPT = `
คุณคือ Yokimura AI Coach วิเคราะห์กราฟตามระบบของผู้ใช้เท่านั้น
มี 5 ท่า: SMC Pro Max, Pullback, Sideway Range, Breakout / Run Trend, M1/M5 Reversal
ตอบ JSON เท่านั้น
`;

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
      return NextResponse.json({ error: "ต้องมี HTF และ LTF image" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
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
                  text: `${PROMPT}

วันนี้แพ้แล้ว ${lossesToday} ไม้

ให้ตอบ JSON:
{
  "bias":"Bull | Bear | Neutral",
  "cycle":"Trend | Pullback | Sideway | Unknown",
  "recommendedSetup":"SMC Pro Max | Pullback | Sideway Range | Breakout / Run Trend | M1/M5 Reversal",
  "scores":{"smcProMax":0,"pullback":0,"sidewayRange":0,"breakoutRunTrend":0,"m1m5Reversal":0},
  "verdict":"เข้า | รอ | ไม่เข้า",
  "reasons":["","",""],
  "checklist":{"htfZone":false,"liquidity":false,"bosChoch":false,"obDzSz":false,"mss":false,"retest":false,"rejection":false,"volumeConfirm":false,"breakoutClose":false,"noFomo":true}
}`,
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
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data },
        { status: 500 }
      );
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return NextResponse.json(JSON.parse(text));
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gemini analyze failed" },
      { status: 500 }
    );
  }
}
