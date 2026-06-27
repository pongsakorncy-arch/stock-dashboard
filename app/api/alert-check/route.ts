import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINNHUB = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// ── Supabase (service role เพื่อ bypass RLS ฝั่ง cron) ───────────────────────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── ดึงราคาจาก Finnhub ────────────────────────────────────────────────────────
async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB}`,
      { next: { revalidate: 0 } }
    );
    const d = await res.json();
    return d.c > 0 ? Number(d.c) : null;
  } catch {
    return null;
  }
}

// ── ส่ง Telegram ──────────────────────────────────────────────────────────────
async function sendTelegram(msg: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: "HTML",
    }),
  });
}

// ── Cron handler ──────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // ป้องกันคนอื่นเรียก: เช็ค ?secret=CRON_SECRET ใน URL
  // (Vercel free tier ไม่ส่ง Authorization header ให้ cron อัตโนมัติ)
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // ดึง alerts ที่ยังไม่ triggered ทั้งหมด (ทุก user)
  const { data: alerts, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("triggered", false);

  if (error || !alerts?.length) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  // รวม ticker unique ไม่ดึงซ้ำ
  const tickers = [...new Set(alerts.map((a: any) => a.ticker))];
  const prices: Record<string, number | null> = {};
  await Promise.all(tickers.map(async (t) => {
    prices[t] = await fetchPrice(t);
  }));

  const triggered: string[] = [];

  for (const alert of alerts as any[]) {
    const price = prices[alert.ticker];
    if (price === null) continue;

    const hit =
      (alert.condition === "above" && price >= alert.price) ||
      (alert.condition === "below" && price <= alert.price);

    if (!hit) continue;

    // mark triggered
    await supabase
      .from("price_alerts")
      .update({ triggered: true })
      .eq("id", alert.id);

    // ส่ง Telegram
    const arrow = alert.condition === "above" ? "📈" : "📉";
    const label = alert.label ? ` (${alert.label})` : "";
    const msg =
      `${arrow} <b>Price Alert!</b>\n` +
      `<b>${alert.ticker}</b>${label}\n` +
      `ราคาปัจจุบัน: <b>$${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</b>\n` +
      `เงื่อนไข: ${alert.condition === "above" ? "ขึ้นถึง" : "ลงถึง"} $${Number(alert.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}\n` +
      `⏰ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;

    await sendTelegram(msg);
    triggered.push(alert.ticker);
  }

  return NextResponse.json({ ok: true, checked: alerts.length, triggered });
}
