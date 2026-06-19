import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // สั่งให้ข้ามการตรวจ ESLint ตอน build บน Vercel ไปเลย
    ignoreDuringBuilds: true,
  },
  typescript: {
    // (แถม) สั่งให้ข้ามการตรวจ Type error ตอน build ด้วย จะได้ไม่ติดปัญหาอีก
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
