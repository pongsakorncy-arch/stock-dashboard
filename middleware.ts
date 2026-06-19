import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();

  const isLoginPage = req.nextUrl.pathname === "/login";
  const isCallback  = req.nextUrl.pathname.startsWith("/auth/callback");

  // ถ้าไม่ได้ login และไม่ได้อยู่ที่หน้า login → redirect ไป login
  if (!session && !isLoginPage && !isCallback) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ถ้า login แล้ว แต่อยู่ที่หน้า login → redirect ไปหน้าแรก
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
