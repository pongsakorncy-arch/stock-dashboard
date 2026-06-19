"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const loginWithGitHub = async () => {
    setLoading(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: "https://stock-dashboard-dun-xi.vercel.app/auth/callback",
      },
    });
  };

  return (
    <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center"
      style={{ fontFamily: "'Inter','Noto Sans Thai',sans-serif" }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-black font-black text-2xl mx-auto mb-4">T</div>
          <h1 className="text-2xl font-black text-white tracking-tight">TRUSH YOUR OWN</h1>
          <p className="text-zinc-500 text-sm mt-1">Stock Portfolio & Trading Journal</p>
        </div>
        <div className="bg-[#111113] border border-zinc-800 rounded-2xl p-8 space-y-4">
          <p className="text-center text-sm text-zinc-400 mb-6">เข้าสู่ระบบเพื่อใช้งาน</p>
          <button onClick={loginWithGitHub} disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-black font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50">
            {loading ? <span className="animate-spin">⟳</span> : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            )}
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วย GitHub"}
          </button>
          <p className="text-center text-xs text-zinc-600 mt-4">ข้อมูลของคุณจะแยกต่างหากจากผู้ใช้คนอื่น</p>
        </div>
        <p className="text-center text-xs text-zinc-700 mt-6">TRUSH YOUR OWN · ไม่ใช่คำแนะนำการลงทุน</p>
      </div>
    </main>
  );
}
