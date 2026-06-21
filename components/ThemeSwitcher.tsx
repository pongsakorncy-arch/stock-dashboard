"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "ocean" | "gold";

const THEMES: Record<Theme, {
  label: string; icon: string;
  body: string; text: string;
  card: string; card2: string; header: string;
  border: string; sub: string; accent: string;
}> = {
  dark: {
    label:"Dark", icon:"🌑",
    body:"#0a0a0c", text:"#ffffff", card:"#111113", card2:"#18181b",
    header:"#0d0d0f", border:"#27272a", sub:"#71717a", accent:"#f0aa4f",
  },
  ocean: {
    label:"Ocean", icon:"🌊",
    body:"#020b18", text:"#e0f2fe", card:"#041424", card2:"#06213a",
    header:"#031020", border:"#0e3a5c", sub:"#4a90b8", accent:"#38bdf8",
  },
  gold: {
    label:"Gold", icon:"🌕",
    body:"#0c0a00", text:"#fef9ee", card:"#1a1500", card2:"#211b00",
    header:"#110e00", border:"#3d3000", sub:"#a08040", accent:"#f59e0b",
  },
};

// Map Tailwind bg colors → theme key
const BG_MAP: Record<string, keyof typeof THEMES["dark"]> = {
  "rgb(10, 10, 12)":   "body",   // #0a0a0c
  "rgb(17, 17, 19)":   "card",   // #111113
  "rgb(24, 24, 27)":   "card2",  // #18181b
  "rgb(13, 13, 15)":   "header", // #0d0d0f
  "rgb(11, 11, 0)":    "body",
};

function applyTheme(t: Theme) {
  const theme = THEMES[t];
  document.body.style.backgroundColor = theme.body;
  document.body.style.color = theme.text;

  // Walk all elements and replace background colors
  const all = document.querySelectorAll("*");
  all.forEach(el => {
    const htmlEl = el as HTMLElement;
    const bg = window.getComputedStyle(htmlEl).backgroundColor;
    
    // Map computed colors to theme colors
    const colorMap: Record<string, string> = {
      "rgb(10, 10, 12)":  theme.body,
      "rgb(17, 17, 19)":  theme.card,
      "rgb(24, 24, 27)":  theme.card2,
      "rgb(13, 13, 15)":  theme.header,
      "rgb(9, 9, 11)":    theme.card,
      "rgb(39, 39, 42)":  theme.border,
    };

    if (colorMap[bg]) {
      htmlEl.style.backgroundColor = colorMap[bg];
      htmlEl.style.color = theme.text;
    }
    
    // Fix border colors
    const borderColor = window.getComputedStyle(htmlEl).borderColor;
    if (borderColor.includes("39, 39, 42") || borderColor.includes("63, 63, 70")) {
      htmlEl.style.borderColor = theme.border;
    }
  });
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem("tyo_theme") as Theme) || "dark";
    setTheme(saved);
    if (saved !== "dark") setTimeout(() => applyTheme(saved), 300);
  }, []);

  const handleSelect = (t: Theme) => {
    setTheme(t);
    setOpen(false);
    localStorage.setItem("tyo_theme", t);
    applyTheme(t);
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
