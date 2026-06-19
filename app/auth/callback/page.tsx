"use client";

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function AuthCallback() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        window.location.replace("/");
      }
    });

    // Also check immediately
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace("/");
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl animate-spin inline-block">⟳</p>
        <p className="text-zinc-400 text-sm mt-4">กำลังเข้าสู่ระบบ...</p>
      </div>
    </div>
  );
}
