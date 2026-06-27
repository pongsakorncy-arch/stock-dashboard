import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase(req: Request) {
  // ดึง token จาก Authorization header ที่ client ส่งมา
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// GET /api/alerts — ดึง alerts ของ user
export async function GET(req: Request) {
  const supabase = getSupabase(req);
  const { data, error } = await supabase
    .from("price_alerts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/alerts — สร้าง alert ใหม่
export async function POST(req: Request) {
  const supabase = getSupabase(req);
  const body = await req.json();
  const { ticker, price, condition, label } = body;
  if (!ticker || !price || !condition) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("price_alerts").insert({
    user_id: user.id, ticker, price: Number(price), condition, label: label || "",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/alerts?id=xxx — ลบ alert
export async function DELETE(req: Request) {
  const supabase = getSupabase(req);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase.from("price_alerts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
