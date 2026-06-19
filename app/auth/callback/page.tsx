"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
      else router.replace("/login");
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-spin">⟳</div>
        <p className="text-zinc-400 text-sm">กำลังเข้าสู่ระบบ...</p>
      </div>
    </div>
  );
}
