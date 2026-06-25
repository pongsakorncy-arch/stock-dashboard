"use client";

import { useTheme } from "@/hooks/useTheme";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
      aria-label="สลับธีม"
      className="px-2.5 py-2 bg-[var(--fill)] hover:bg-[var(--fill-strong)] text-[var(--tx-3)] hover:text-[var(--tx)] text-sm rounded-lg transition-colors flex items-center justify-center w-9"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
