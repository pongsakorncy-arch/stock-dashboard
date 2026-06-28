import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID   ?? "";
const ALERT_PCT = 1.0; // แจ้งเตือนเมื่อราคาห่างจากแนวรับ/ต้าน ≤ 1%

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function sendTelegram(msg: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: "HTML" }),
  });
}

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${process.env.NEXT_PUBLIC_FINNHUB_API_KEY}`,
      { cache: "no-store" }
    );
    const d = await res.json();
    return d.c > 0 ? Number(d.c) : null;
  } catch { return null; }
}

export async function GET() {
  const supabase = getSupabase();

  // ดึง S/R levels ทั้งหมดของทุก user
  const { data: srRows, error } = await supabase
    .from("sr_levels")
    .select("ticker, supports, resists");

  if (error || !srRows?.length) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  // รวม ticker unique → ดึงราคาครั้งเดียว
  const tickers = [...new Set(srRows.map((r: any) => r.ticker))];
  const prices: Record<string, number | null> = {};
  await Promise.all(tickers.map(async (t) => {
    prices[t] = await fetchPrice(t);
  }));

  const triggered: string[] = [];

  for (const row of srRows as any[]) {
    const price = prices[row.ticker];
    if (!price) continue;

    const supports: number[] = (row.supports || []).filter((v: number) => v > 0);
    const resists:  number[] = (row.resists  || []).filter((v: number) => v > 0);

    // เช็คแนวรับ
    for (const lv of supports) {
      const dist = Math.abs((price - lv) / lv) * 100;
      if (dist <= ALERT_PCT) {
        const msg =
          `🟢 <b>แนวรับใกล้แล้ว!</b>\n` +
          `<b>${row.ticker}</b>\n` +
          `ราคาปัจจุบัน: <b>$${price.toFixed(2)}</b>\n` +
          `แนวรับ: <b>$${lv.toFixed(2)}</b> (ห่าง ${dist.toFixed(2)}%)\n` +
          `⏰ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;
        await sendTelegram(msg);
        triggered.push(`${row.ticker} S@${lv}`);
      }
    }

    // เช็คแนวต้าน
    for (const lv of resists) {
      const dist = Math.abs((price - lv) / lv) * 100;
      if (dist <= ALERT_PCT) {
        const msg =
          `🔴 <b>แนวต้านใกล้แล้ว!</b>\n` +
          `<b>${row.ticker}</b>\n` +
          `ราคาปัจจุบัน: <b>$${price.toFixed(2)}</b>\n` +
          `แนวต้าน: <b>$${lv.toFixed(2)}</b> (ห่าง ${dist.toFixed(2)}%)\n` +
          `⏰ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;
        await sendTelegram(msg);
        triggered.push(`${row.ticker} R@${lv}`);
      }
    }
  }

  return NextResponse.json({ ok: true, checked: srRows.length, triggered });
}
