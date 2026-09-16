"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "veil-theme";
const THEME_COLOR: Record<Theme, string> = {
  dark: "#121012",
  light: "#ffffff",
};

/**
 * Dark by default. The `.light` class lives on <html>; the no-FOUC script in
 * the layout applies it before paint, so this hook just mirrors + toggles it.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("light") ? "light" : "dark",
    );
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      const root = document.documentElement;
      root.classList.toggle("light", next === "light");
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable — non-fatal */
      }
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", THEME_COLOR[next]);
      return next;
    });
  }, []);

  return { theme, toggle };
}
