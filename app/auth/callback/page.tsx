"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  useEffect(() => {
    const handleCallback = async () => {
      // Get code from URL hash or query params
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const queryParams = new URLSearchParams(window.location.search);
      
      const code = queryParams.get("code");
      const accessToken = hashParams.get("access_token");
      
      if (code) {
        // Exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          window.location.href = "/";
          return;
        }
      }
      
      if (accessToken) {
        // Already have token in hash
        const { data, error } = await supabase.auth.getSession();
        if (data.session && !error) {
          window.location.href = "/";
          return;
        }
      }
      
      // Fallback - check session
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        window.location.href = "/";
      } else {
        window.location.href = "/login";
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin inline-block">⟳</div>
        <p className="text-zinc-400 text-sm mt-4">กำลังเข้าสู่ระบบ...</p>
      </div>
    </div>
  );
}
