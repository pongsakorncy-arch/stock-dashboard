"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ตรวจสอบเซสชันปัจจุบัน หากพบว่าลงทะเบียน/ล็อกอินสำเร็จแล้วให้ย้ายหน้า
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // แนะนำให้ใช้ router.replace ของ Next.js แทน window.location เพื่อประสิทธิภาพที่ดีกว่า
        router.replace("/");
      } else {
        // หากไม่มี session หลังผ่านไปแป๊บหนึ่ง ให้ส่งกลับไปหน้า login
        const timeout = setTimeout(() => {
          router.replace("/login");
        }, 2000);
        return () => clearTimeout(timeout);
      }
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl animate-spin inline-block">⟳</p>
        <p className="text-zinc-400 text-sm mt-4">กำลังเข้าสู่ระบบ...</p>
      </div>
    </div>
  );
}
