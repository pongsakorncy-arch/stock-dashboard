import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

function imageBlock(dataUrl: string) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mediaType = meta?.match(/data:(.*);base64/)?.[1] || "image/png";
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 || "" } };
}

const SYSTEM = `Yokimura AI Coach วิเคราะห์ XAUUSD ตามระบบ:
Trend→SMC(BOS+sweep$$$+MSS) / SW→Range/Breakout / Pullback→DZ/SZ
กฎ: ไม่มีMSS=ไม่เข้า, $$$ไม่sweep=รอ, ทะลุOB=เปลี่ยนSetup
ตอบJSON เท่านั้น ห้ามรับประกันกำไร`;

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0 } = await req.json();
    if (!htfImage || !ltfImage)
      return NextResponse.json({ error: "Missing images" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

    const prompt = `แพ้${lossesToday}ไม้${lossesToday>=2?" เข้มงวดขึ้น":""}
HTF=M15 LTF=M5/M1 ตอบJSON:
{"bias":"Bull|Bear|Neutral","cycle":"Trend|Pullback|Sideway","scores":{"smcProMax":0,"pullback":0,"sidewayRange":0,"breakoutRunTrend":0,"m5Reversal":0},"recommendedSetup":"ท่า","verdict":"เข้า|รอ|ไม่เข้า","verdictReason":"เหตุผล","waitFor":{"liquidityZone":"$$$ที่ยังไม่sweep","interestZone":"DZ/SZ","conditions":["c1","c2","c3"]},"actionPlan":{"entryZone":"ราคา","sl":"ราคา","tp1":"ราคา","tp2":"ราคา","invalidation":"ถ้า...=ยกเลิก","next3Candles":["n1","n2","n3"]},"checklist":{"htfZone":false,"liquidity":false,"bosChoch":false,"obDzSz":false,"mss":false,"retest":false,"rejection":false,"volumeConfirm":false,"breakoutClose":false,"noFomo":true},"reasons":["r1","r2","r3"]}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "text", text: "HTF:" },
            imageBlock(htfImage),
            { type: "text", text: "LTF:" },
            imageBlock(ltfImage),
          ],
        }],
      }),
    });

    const raw = await res.text();
    if (!res.ok)
      return NextResponse.json({ error: "Claude API error", status: res.status }, { status: 500 });

    const data = JSON.parse(raw);
    const text = data?.content?.find((b: any) => b.type === "text")?.text || "{}";

    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      return NextResponse.json(JSON.parse(cleaned));
    } catch {}

    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return NextResponse.json(JSON.parse(match[0]));
    } catch {}

    return NextResponse.json({ error: "Parse failed", raw: text.slice(0,200) }, { status: 500 });

  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: err?.message }, { status: 500 });
  }
}
