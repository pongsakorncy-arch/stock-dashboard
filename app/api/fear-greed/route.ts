import { NextResponse } from "next/server";

export const runtime = "edge";

// CNN Stock-Market Fear & Greed Index (server-side proxy — CNN ต้องมี User-Agent)
export async function GET() {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          Accept: "application/json",
        },
        // cache 10 นาที (ลดการยิงซ้ำ + กัน rate limit)
        next: { revalidate: 600 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ value: 50, label: "Neutral", ok: false });
    }

    const data = await res.json();
    const score = Math.round(Number(data?.fear_and_greed?.score ?? 50));
    const ratingRaw: string = data?.fear_and_greed?.rating ?? "neutral";
    const label = ratingRaw
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return NextResponse.json({
      value: isNaN(score) ? 50 : score,
      label: label || "Neutral",
      ok: true,
    });
  } catch {
    return NextResponse.json({ value: 50, label: "Neutral", ok: false });
  }
}
