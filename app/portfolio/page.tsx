"use client";

import NextDynamic from "next/dynamic";

const PortfolioPage = NextDynamic(() => import("./PortfolioClient"), { ssr: false });

export default function Page() {
  return <PortfolioPage />;
}
