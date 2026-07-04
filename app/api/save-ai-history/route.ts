import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "ai-coach-images";

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function dataUrlToBuffer(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);

  if (!match) {
    throw new Error("Invalid image data URL");
  }

  const mimeType = match[1] || "image/jpeg";
  const buffer = Buffer.from(match[2], "base64");
  const ext = mimeType.includes("png") ? "png" : "jpg";

  return { buffer, mimeType, ext };
}

async function uploadImage(
  supabase: ReturnType<typeof adminClient>,
  dataUrl: string,
  side: "htf" | "ltf",
  userId?: string | null
) {
  const { buffer, mimeType, ext } = dataUrlToBuffer(dataUrl);
  const owner = userId || "no-user";
  const path = `${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${side}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      htfImage,
      ltfImage,
      aiResult,
      market = "XAUUSD",
      timeframe = "HTF+LTF",
      version = "claude-ui-v1",
    } = body;

    if (!htfImage || !ltfImage || !aiResult) {
      return NextResponse.json(
        { error: "Missing htfImage, ltfImage, or aiResult" },
        { status: 400 }
      );
    }

    const supabase = adminClient();

    const [htfUrl, ltfUrl] = await Promise.all([
      uploadImage(supabase, htfImage, "htf", userId),
      uploadImage(supabase, ltfImage, "ltf", userId),
    ]);

    const { data, error } = await supabase
      .from("ai_analyze_history")
      .insert({
        user_id: userId || null,

        htf_image_url: htfUrl,
        ltf_image_url: ltfUrl,

        result_json: aiResult,
        raw_json: aiResult,
        ai_result: aiResult,

        market,
        timeframe,
        version,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      row: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
