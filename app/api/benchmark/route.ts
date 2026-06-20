import { NextRequest, NextResponse } from "next/server";

async function getReturn(symbol: string, period: string): Promise<number> {
  const rangeMap: Record<string, string> = {
    "1D":"1d","1M":"1mo","3M":"3mo","6M":"6mo","YTD":"ytd","1Y":"1y",
  };
  const intervalMap: Record<string, string> = {
    "1D":"5m","1M":"1d","3M":"1d","6M":"1d","YTD":"1d","1Y":"1wk",
  };

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${rangeMap[period]||"1y"}&interval=${intervalMap[period]||"1d"}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 3600 }, // cache 1 ชั่วโมง
  });

  if (!res.ok) return 0;
  const data = await res.json();
  const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
  if (closes.length < 2) return 0;

  const first = closes.find(v => v != null) || 0;
  const last  = [...closes].reverse().find(v => v != null) || 0;
  if (!first || !last) return 0;

  return Math.round(((last - first) / first) * 10000) / 100;
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "1Y";
  try {
    const [sp500, nasdaq, dji] = await Promise.all([
      getReturn("^GSPC", period),
      getReturn("^IXIC", period),
      getReturn("^DJI",  period),
    ]);
    return NextResponse.json({ sp500, nasdaq, dji, period });
  } catch {
    return NextResponse.json({ sp500: 0, nasdaq: 0, dji: 0, period });
  }
}
