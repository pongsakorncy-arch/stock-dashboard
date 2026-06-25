import { NextResponse } from "next/server";

// ใช้ nodejs runtime (เผื่อ edge IP โดน CNN บล็อก)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CNN_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";

export async function GET() {
  try {
    const res = await fetch(CNN_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://edition.cnn.com/markets/fear-and-greed",
        Origin: "https://edition.cnn.com",
      },
      cache: "no-store",
    });

    const status = res.status;
    let bodyText = "";
    try { bodyText = await res.text(); } catch {}

    if (!res.ok) {
      return NextResponse.json({
        value: 50, label: "Neutral", ok: false,
        debug: { stage: "http", status, sample: bodyText.slice(0, 150) },
      });
    }

    let data: any = null;
    try { data = JSON.parse(bodyText); }
    catch {
      return NextResponse.json({
        value: 50, label: "Neutral", ok: false,
        debug: { stage: "parse", status, sample: bodyText.slice(0, 150) },
      });
    }

    // current snapshot อยู่ที่ fear_and_greed; เผื่อ fallback ไป historical ตัวล่าสุด
    const fg = data?.fear_and_greed;
    const hist = data?.fear_and_greed_historical?.data;
    const last = Array.isArray(hist) && hist.length ? hist[hist.length - 1] : null;

    const rawScore = fg?.score ?? last?.y ?? 50;
    const score = Math.round(Number(rawScore));
    const ratingRaw: string = fg?.rating ?? last?.rating ?? "neutral";
    const label = String(ratingRaw)
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return NextResponse.json({
      value: isNaN(score) ? 50 : score,
      label: label || "Neutral",
      ok: true,
    });
  } catch (e: any) {
    return NextResponse.json({
      value: 50, label: "Neutral", ok: false,
      debug: { stage: "fetch", error: String(e?.message || e) },
    });
  }
}
