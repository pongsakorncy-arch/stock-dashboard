"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "ocean" | "gold";

const THEMES = {
  dark: {
    label: "Dark", icon: "🌑",
    colors: { base:"#0a0a0c", card:"#111113", card2:"#18181b", header:"#0d0d0f", border:"#27272a", text:"#ffffff", sub:"#71717a", accent:"#f0aa4f" }
  },
  ocean: {
    label: "Ocean", icon: "🌊",
    colors: { base:"#020b18", card:"#041424", card2:"#06213a", header:"#031020", border:"#0e3a5c", text:"#e0f2fe", sub:"#4a90b8", accent:"#38bdf8" }
  },
  gold: {
    label: "Gold", icon: "🌕",
    colors: { base:"#0c0a00", card:"#1a1500", card2:"#211b00", header:"#110e00", border:"#3d3000", text:"#fef9ee", sub:"#a08040", accent:"#f59e0b" }
  },
};

function applyTheme(t: Theme) {
  const c = THEMES[t].colors;
  const r = document.documentElement.style;
  r.setProperty("--bg-base",   c.base);
  r.setProperty("--bg-card",   c.card);
  r.setProperty("--bg-card2",  c.card2);
  r.setProperty("--bg-header", c.header);
  r.setProperty("--border",    c.border);
  r.setProperty("--text",      c.text);
  r.setProperty("--text-sub",  c.sub);
  r.setProperty("--accent",    c.accent);
  document.documentElement.setAttribute("data-theme", t);

  // Force update all elements with theme-aware classes
  document.body.style.backgroundColor = c.base;
  document.body.style.color = c.text;
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem("tyo_theme") as Theme) || "dark";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const handleSelect = (t: Theme) => {
    setTheme(t);
    setOpen(false);
    localStorage.setItem("tyo_theme", t);
    applyTheme(t);
  };

  const current = THEMES[theme];

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors border border-zinc-700">
        <span>{current.icon}</span>
        <span className="text-zinc-400 hidden sm:block">{current.label}</span>
        <span className="text-zinc-600 text-[10px]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className="absolute right-0 top-10 z-50 rounded-xl shadow-2xl p-2 min-w-[160px] border"
            style={{ background: THEMES[theme].colors.card2, borderColor: THEMES[theme].colors.border }}>
            {(Object.entries(THEMES) as [Theme, typeof THEMES[Theme]][]).map(([id, t]) => (
              <button key={id} onClick={() => handleSelect(id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={{
                  background: theme === id ? THEMES[theme].colors.border : "transparent",
                  color: theme === id ? THEMES[theme].colors.text : THEMES[theme].colors.sub,
                }}>
                <span className="text-base">{t.icon}</span>
                <span className="font-medium">{t.label}</span>
                {/* Color dots */}
                <div className="ml-auto flex gap-1">
                  {[t.colors.base, t.colors.accent, t.colors.card2].map((c,i) => (
                    <span key={i} className="w-2.5 h-2.5 rounded-full border border-white/10"
                      style={{ background: c }}/>
                  ))}
                </div>
                {theme === id && <span className="text-[10px]" style={{color: t.colors.accent}}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
