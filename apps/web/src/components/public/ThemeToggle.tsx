import { MoonStarIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "traceoflight-theme";

type ThemeMode = "light" | "dark";

function resolveTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }

  const currentTheme = document.documentElement.dataset.theme;
  return currentTheme === "dark" ? "dark" : "light";
}

function applyTheme(nextTheme: ThemeMode) {
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  localStorage.setItem(STORAGE_KEY, nextTheme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(resolveTheme());
  }, []);

  const isDark = theme === "dark";
  const trackClass = isDark
    ? "border-slate-700/80 bg-slate-900/92 shadow-[0_12px_34px_rgba(15,23,42,0.16)] hover:border-sky-300/60"
    : "border-slate-200/80 bg-white/86 shadow-[0_12px_34px_rgba(15,23,42,0.08)] hover:border-sky-300/70 hover:bg-white";
  const railIconClass = isDark ? "text-sky-300/85" : "text-slate-400/85";

  return (
    <button
      aria-checked={isDark}
      aria-label="다크 모드 전환"
      className={`group relative inline-flex h-11 w-[5.25rem] cursor-pointer items-center rounded-full border p-1 transition-all duration-300 hover:-translate-y-0.5 ${trackClass}`}
      onClick={() => {
        const nextTheme: ThemeMode = isDark ? "light" : "dark";
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      role="switch"
      type="button"
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2.5">
        <SunIcon className={`h-4 w-4 ${railIconClass}`} />
        <MoonStarIcon className={`h-4 w-4 ${railIconClass}`} />
      </span>
      <span
        className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.22)] transition-all duration-300 ${
          isDark
            ? "translate-x-10"
            : "translate-x-0"
        }`}
      >
        {isDark ? (
          <MoonStarIcon className="h-4 w-4" />
        ) : (
          <SunIcon className="h-4 w-4" />
        )}
      </span>
      <span className="sr-only">{isDark ? "다크 모드" : "라이트 모드"}</span>
    </button>
  );
}
