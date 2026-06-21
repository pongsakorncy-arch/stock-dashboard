"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "ocean" | "gold";

const THEMES: Record<Theme, { label: string; icon: string; css: string }> = {
  dark: {
    label: "Dark", icon: "🌑",
    css: `
      body, [data-theme] { background-color: #0a0a0c !important; color: #ffffff !important; }
      .theme-base  { background-color: #0a0a0c !important; }
      .theme-card  { background-color: #111113 !important; }
      .theme-card2 { background-color: #18181b !important; }
      .theme-border { border-color: #27272a !important; }
    `
  },
  ocean: {
    label: "Ocean", icon: "🌊",
    css: `
      body, [data-theme] { background-color: #020b18 !important; color: #e0f2fe !important; }
      header, .sticky { background-color: #031020 !important; border-color: #0e3a5c !important; }
      div.bg-\\[\\#0a0a0c\\], div.bg-\\[\\#111113\\], div.bg-\\[\\#18181b\\], div.bg-\\[\\#0d0d0f\\] { background-color: inherit !important; }
      [class*="bg-[#0a0a0c]"] { background-color: #020b18 !important; }
      [class*="bg-[#111113]"] { background-color: #041424 !important; }
      [class*="bg-[#18181b]"] { background-color: #06213a !important; }
      [class*="bg-[#0d0d0f]"] { background-color: #031020 !important; }
      [class*="bg-[#111113]"], [class*="bg-[#18181b]"], [class*="bg-[#0d0d0f]"], [class*="bg-[#0a0a0c]"] { color: #e0f2fe !important; }
      [class*="border-zinc-800"] { border-color: #0e3a5c !important; }
      [class*="text-zinc-500"], [class*="text-zinc-400"], [class*="text-zinc-600"] { color: #4a90b8 !important; }
    `
  },
  gold: {
    label: "Gold", icon: "🌕",
    css: `
      body, [data-theme] { background-color: #0c0a00 !important; color: #fef9ee !important; }
      [class*="bg-[#0a0a0c]"] { background-color: #0c0a00 !important; }
      [class*="bg-[#111113]"] { background-color: #1a1500 !important; }
      [class*="bg-[#18181b]"] { background-color: #211b00 !important; }
      [class*="bg-[#0d0d0f]"] { background-color: #110e00 !important; }
      [class*="bg-[#111113]"], [class*="bg-[#18181b]"], [class*="bg-[#0d0d0f]"], [class*="bg-[#0a0a0c]"] { color: #fef9ee !important; }
      [class*="border-zinc-800"] { border-color: #3d3000 !important; }
      [class*="text-zinc-500"], [class*="text-zinc-400"], [class*="text-zinc-600"] { color: #a08040 !important; }
    `
  },
};

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem("tyo_theme") as Theme) || "dark";
    setTheme(saved);
    injectStyle(saved);
  }, []);

  const injectStyle = (t: Theme) => {
    let el = document.getElementById("theme-override");
    if (!el) {
      el = document.createElement("style");
      el.id = "theme-override";
      document.head.appendChild(el);
    }
    el.innerHTML = THEMES[t].css;
  };

  const handleSelect = (t: Theme) => {
    setTheme(t);
    setOpen(false);
    localStorage.setItem("tyo_theme", t);
    injectStyle(t);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors border border-zinc-700">
        <span>{THEMES[theme].icon}</span>
        <span className="text-zinc-400 hidden sm:block">{THEMES[theme].label}</span>
        <span className="text-zinc-600 text-[10px]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="absolute right-0 top-10 z-50 bg-[#18181b] border border-zinc-700 rounded-xl shadow-2xl p-2 min-w-[150px]">
            {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([id, t]) => (
              <button key={id} onClick={() => handleSelect(id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  theme === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}>
                <span>{t.icon}</span>
                <span className="font-medium">{t.label}</span>
                {theme === id && <span className="ml-auto text-yellow-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
