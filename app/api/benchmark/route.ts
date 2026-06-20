import { NextRequest, NextResponse } from "next/server";

async function getReturn(symbol: string, period: string): Promise<number> {
  const rangeMap: Record<string, string> = {
    "1D":"1d","1M":"1mo","3M":"3mo","6M":"6mo","YTD":"ytd","1Y":"1y",
  };
  const intervalMap: Record<string, string> = {
    "1D":"5m","1M":"1d","3M":"1d","6M":"1d","YTD":"1d","1Y":"1wk",
  };

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${rangeMap[period]||"1y"}&interval=${intervalMap[period]||"1d"}&includePrePost=false`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com",
      },
    });

    if (!res.ok) return 0;
    const data = await res.json();
    const closes: (number|null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    const valid = closes.filter((v): v is number => v != null && !isNaN(v));
    if (valid.length < 2) return 0;

    const first = valid[0];
    const last  = valid[valid.length - 1];
    return Math.round(((last - first) / first) * 10000) / 100;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") || "1Y";
  try {
    const [sp500, nasdaq, dji] = await Promise.all([
      getReturn("%5EGSPC", period),
      getReturn("%5EIXIC", period),
      getReturn("%5EDJI",  period),
    ]);
    return NextResponse.json({ sp500, nasdaq, dji, period });
  } catch {
    return NextResponse.json({ sp500: 0, nasdaq: 0, dji: 0, period });
  }
}
