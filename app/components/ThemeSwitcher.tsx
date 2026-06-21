"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "ocean" | "gold";

const THEMES: { id: Theme; label: string; icon: string; colors: string[] }[] = [
  { id: "dark",  label: "Dark",  icon: "🌑", colors: ["#0a0a0c","#f0aa4f","#27272a"] },
  { id: "ocean", label: "Ocean", icon: "🌊", colors: ["#020b18","#38bdf8","#0e3a5c"] },
  { id: "gold",  label: "Gold",  icon: "🌕", colors: ["#0c0a00","#f59e0b","#3d3000"] },
];

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("tyo_theme") as Theme || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved === "dark" ? "" : saved);
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    setOpen(false);
    localStorage.setItem("tyo_theme", t);
    document.documentElement.setAttribute("data-theme", t === "dark" ? "" : t);
  };

  const current = THEMES.find(t => t.id === theme)!;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors">
        <span>{current.icon}</span>
        <span className="text-zinc-400 hidden sm:block">{current.label}</span>
        <span className="text-zinc-600">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="absolute right-0 top-9 z-50 bg-[#18181b] border border-zinc-700 rounded-xl shadow-2xl p-2 min-w-[140px]">
            {THEMES.map(t => (
              <button key={t.id} onClick={() => applyTheme(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  theme === t.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}>
                <span>{t.icon}</span>
                <span className="font-medium">{t.label}</span>
                {/* Color preview */}
                <div className="ml-auto flex gap-1">
                  {t.colors.map((c,i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-full border border-zinc-600"
                      style={{ background: c }}/>
                  ))}
                </div>
                {theme === t.id && <span className="text-yellow-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
