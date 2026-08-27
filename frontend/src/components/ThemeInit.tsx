"use client";

import { useLayoutEffect } from "react";

// Re-applies an explicit theme choice from a previous visit before first paint.
// System preference alone is already handled by CSS (`prefers-color-scheme`),
// so this only matters when the user has overridden it via ThemeToggle.
export function ThemeInit() {
  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") {
        document.documentElement.dataset.theme = stored;
      }
    } catch {}
  }, []);

  return null;
}
