"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "light") root.classList.add("light");
  else root.classList.remove("light");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");

  // โหลดค่าที่เคยเลือกไว้ตอน mount
  useEffect(() => {
    let saved: Theme = "dark";
    try {
      const s = localStorage.getItem("yok_theme");
      if (s === "light" || s === "dark") saved = s;
    } catch { /* ignore */ }
    applyTheme(saved);
    setThemeState(saved);
  }, []);

  const setTheme = (t: Theme) => {
    applyTheme(t);
    try { localStorage.setItem("yok_theme", t); } catch { /* ignore */ }
    setThemeState(t);
  };

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  return { theme, toggle, setTheme };
}
