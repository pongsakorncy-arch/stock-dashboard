import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

function imageBlock(dataUrl: string) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mediaType = meta?.match(/data:(.*);base64/)?.[1] || "image/png";
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 || "" } };
}

const SYSTEM = `คุณคือ Yokimura AI Coach วิเคราะห์ XAUUSD ตามระบบ SMC Pro Max อย่างเคร่งครัด

=== วัฏจักรพฤติกรรมราคา ===
Trend → รับต้าน DZ/SZ → Pullback → Sideway → Trend (วนซ้ำ)

=== HTF (M15) — Step 1-2 ===
Step 1: หาแนวรับ/ต้านสำคัญจาก M15 → Mark เส้นแนวนอน
Step 2: หา DZ/SZ M15 ที่ใกล้ที่สุด → กำหนด TP1 (โซนไฮเดิม) TP2 (ปลายลูกศร)

=== LTF (M5/M1) — Step 3 ===
Step 3: ระบุ Phase ปัจจุบัน → Trend / Pullback / Sideway / รับต้าน
(วัฏจักรตลาด → พฤติกรรมราคา)

=== SMC Pro Max Setup — ต้องผ่านครบ 11 ขั้น ===
1. กราฟเกิด BOS หรือ ChoCh แล้ว
2. หา Order Block (OB)
3. หา DZ (ขาขึ้น) หรือ SZ (ขาลง)
4. หา Liquidity Zone ($$$ ที่รายย่อยซุ่มอยู่)
5. $$$ ถูก Sweep แล้ว ← HARD GATE: ยังไม่ Sweep = ห้ามเข้าเด็ดขาด
6. เกิด Rejection แล้ว (ดูใน HTF ได้)
7. LTF Retest: Buy=ต้องยกโลว (Higher Low), Sell=ต้องกดไฮ (Lower High) ← CRITICAL ⭐
8. MSS ผ่าน=ถือ / MSS ไม่ผ่าน=โดดทันที ← HARD GATE
9. วัดระยะสวิง HTF → TP1 โซนไฮเดิม, TP2 ปลายลูกศร
10. รอ M15 Retest ก่อน (ป้องกัน 500 จุด / กันหน้าทุน)
11. ตั้ง SL โดดทันที ไม่มีข้อแม้

กฎเหล็ก (ห้ามละเมิด):
- $$$ ไม่ Sweep = ไม่เข้า
- ไม่เกิด Rejection = ไม่เข้า
- LTF Retest ไม่ตรงเงื่อนไข = ไม่เข้า
- MSS ไม่ผ่าน = โดดทันที ห้ามถือต่อ
- OB ถูกทะลุ = เปลี่ยน Setup ทันที

=== กรณีไม่มี SMC Setup (4 ท่า) ===
ท่า 1 - sidewayRange: SW กรอบบน=Sell / กรอบล่าง=Buy รอ Rejection ก่อนเสมอ
ท่า 2 - breakoutRunTrend: หลุดกรอบ SW รันเทรนด์ (ห้ามรันทด) รอ Retest กรอบที่หลุด
ท่า 3 - pullbackShort: สวนเทรนด์เก็บสั้น ขยันซอย (ใช้เฉพาะ Pullback Phase)
ท่า 4 - m5Reversal: ใช้ได้ทุกเงื่อนไข
  → Buy: รอ Pa Buy ที่ 2 ยกโลว (Higher Low ยืนยัน)
  → Sell: รอ Pa Sell ที่ 2 กดไฮ (Lower High ยืนยัน)
  → ตามเทรนด์: ถือยาวจนกว่ากราฟจะกลับตัว
  → สวนเทรนด์: เกิด Rejection รีบโดด

ตอบ JSON เท่านั้น ห้ามรับประกันกำไร ห้ามเพิ่มข้อความนอก JSON`;

export async function POST(req: NextRequest) {
  try {
    const { htfImage, ltfImage, lossesToday = 0 } = await req.json();

    if (!htfImage || !ltfImage)
      return NextResponse.json({ error: "Missing images" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

    const strictMode = lossesToday >= 2;
    const lossNote = strictMode
      ? `⚠️ แพ้แล้ว ${lossesToday} ไม้ — โหมดเข้มงวด: ต้องผ่านทุก checklist ครบ 100% ถึงจะเข้าได้`
      : `แพ้ ${lossesToday} ไม้`;

    const prompt = `${lossNote}
HTF Image = M15 (โครงสร้าง + DZ/SZ + BOS/ChoCh)
LTF Image = M5/M1 (Phase ปัจจุบัน + จุดพิจารณาเข้า)

วิเคราะห์ตามระบบ SMC Pro Max แล้วตอบ JSON นี้เท่านั้น:
{
  "bias": "Bull|Bear|Neutral",
  "phase": "Trend|Pullback|Sideway|รับต้าน",
  "htfZone": "DZ หรือ SZ M15 ที่ใกล้ที่สุด (ระบุราคา)",
  "liquidityStatus": {
    "swept": true,
    "location": "บริเวณ $$$",
    "note": "อธิบายสั้น"
  },
  "setupGroup": "SMC|NonSMC|รอ",
  "recommendedSetup": "smcProMax|sidewayRange|breakoutRunTrend|pullbackShort|m5Reversal|รอ",
  "setupScore": 0,
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
  "hardGateFail": "ระบุ Hard Gate ที่ยังไม่ผ่าน หรือ null ถ้าผ่านหมด",
  "nonSmcSetup": {
    "active": false,
    "type": "sidewayRange|breakoutRunTrend|pullbackShort|m5Reversal",
    "condition": "เงื่อนไขที่เห็น",
    "paStatus": "Pa ที่ 1|Pa ที่ 2|ยังไม่ถึง"
  },
  "verdict": "เข้า|รอ|ไม่เข้า",
  "verdictReason": "เหตุผลหลัก",
  "actionPlan": {
    "direction": "Buy|Sell|รอ",
    "entryZone": "ราคา",
    "sl": "ราคา",
    "tp1": "ราคา (โซนไฮเดิม)",
    "tp2": "ราคา (ปลายลูกศร)",
    "rr": "1:X",
    "invalidation": "ถ้า...=ยกเลิก Setup",
    "next3Candles": ["n1", "n2", "n3"]
  },
  "waitFor": {
    "conditions": ["c1", "c2"],
    "keyLevel": "ระดับราคาที่ต้องจับตา"
  },
  "reasons": ["r1", "r2", "r3"]
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
        max_tokens: 1800,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "text", text: "HTF (M15):" },
            imageBlock(htfImage),
            { type: "text", text: "LTF (M5/M1):" },
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
    return NextResponse.json({ error: "Parse failed", raw: text.slice(0, 200) }, { status: 500 });

  } catch (err: any) {
    return NextResponse.json({ error: "Route crashed", message: err?.message }, { status: 500 });
  }
}
