import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PROMPT = `
คุณคือ Yokimura AI Coach วิเคราะห์กราฟตามระบบของผู้ใช้เท่านั้น

มี 5 ท่า:
1. SMC Pro Max
2. Pullback
3. Sideway Range
4. Breakout / Run Trend
5. M1/M5 Reversal

ให้ดู HTF และ LTF แล้วตอบ JSON เท่านั้น:
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
  "reasons": ["เหตุผลสั้น 1", "เหตุผลสั้น 2", "เหตุผลสั้น 3"],
  "checklist": {
    "liquidity": false,
    "bosChoch": false,
    "obDzSz": false,
    "mss": false,
    "retest": false,
    "rejection": false,
    "volumeConfirm": false,
    "breakoutClose": false
  }
}

กฎสำคัญ:
- ถ้าไม่เห็นชัด ให้ false
- ไม่มี MSS ชัด = ไม่ให้เข้า SMC
- ไม่มี Retest ตามกฎ = ให้รอ
- Breakout ต้องปิดหลุดกรอบ ไม่ใช่แค่ไส้
- ถ้าแพ้วันนี้เยอะ ให้เข้มงวดขึ้น
- ห้ามรับประกันกำไร
`;

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0 } = await req.json();

    if (!htfImage || !ltfImage) {
      return NextResponse.json(
        { error: "ต้องมี HTF และ LTF image" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const toInlineImage = (dataUrl: string) => {
      const [meta, base64] = dataUrl.split(",");
      const mimeType = meta.match(/data:(.*);base64/)?.[1] || "image/png";
      return {
        inlineData: {
          mimeType,
          data: base64,
        },
      };
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: `${PROMPT}\n\nวันนี้แพ้แล้ว ${lossesToday} ไม้\n\nรูปที่ 1 = HTF\nรูปที่ 2 = LTF` },
            toInlineImage(htfImage),
            toInlineImage(ltfImage),
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const text = response.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gemini analyze failed" },
      { status: 500 }
    );
  }
}
