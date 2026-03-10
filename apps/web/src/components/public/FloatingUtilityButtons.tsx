import { ArrowUpIcon } from "lucide-react";
import { useEffect, useState } from "react";

import ThemeToggle from "./ThemeToggle";

type ThemeMode = "light" | "dark";

function resolveTheme(): ThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export default function FloatingUtilityButtons() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const syncScrollState = () => {
      setShowScrollTop(window.scrollY > 240);
    };

    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });

    return () => {
      window.removeEventListener("scroll", syncScrollState);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setTheme(resolveTheme());
    };

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const isDark = theme === "dark";
  const scrollTopClass = isDark
    ? "border-slate-700/80 bg-slate-900/92 text-sky-300 shadow-[0_12px_34px_rgba(15,23,42,0.16)] hover:border-sky-300/60 hover:text-white"
    : "border-slate-200/80 bg-white/86 text-slate-500 shadow-[0_12px_34px_rgba(15,23,42,0.08)] hover:border-sky-300/70 hover:bg-white hover:text-sky-700";

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      <button
        aria-label="맨 위로 이동"
        className={`pointer-events-auto inline-flex h-11 w-11 select-none items-center justify-center rounded-full border transition-all duration-300 hover:-translate-y-0.5 ${scrollTopClass} ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        }`}
        onClick={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        type="button"
      >
        <ArrowUpIcon className="h-4 w-4" />
      </button>
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
