import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const sym = req.nextUrl.searchParams.get("symbol");
  if (!sym) return NextResponse.json({ c:0, pc:0, o:0 }, { status: 400 });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 }, // cache 5 นาที
    });
    if (!r.ok) throw new Error(`yahoo ${r.status}`);
    const data = await r.json();

    const meta   = data?.chart?.result?.[0]?.meta;
    const quotes = data?.chart?.result?.[0]?.indicators?.quote?.[0];

    const c  = Number(meta?.regularMarketPrice   || 0);
    const pc = Number(meta?.chartPreviousClose    || meta?.previousClose || 0);
    // pre/after-hours price ถ้ามี
    const o  = Number(meta?.preMarketPrice || meta?.postMarketPrice || 0);

    return NextResponse.json({ c, pc, o });
  } catch (e) {
    console.error("yahoo-quote error:", e);
    return NextResponse.json({ c:0, pc:0, o:0 }, { status: 500 });
  }
}
