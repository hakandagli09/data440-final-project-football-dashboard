"use client";

/**
 * Theme context — manages the active color theme (`dark` | `light`) for
 * the whole app.
 *
 * The actual color swap is driven by CSS variables defined in
 * `src/app/globals.css`, keyed off the `data-theme` attribute on
 * `<html>`. This module just owns the React state and writes that
 * attribute when the user toggles.
 *
 * The initial value is read from `localStorage` (key `aa-theme`) at
 * mount; an inline script in `app/layout.tsx` sets the attribute
 * synchronously *before* React hydrates so there is no flash of the
 * wrong theme on first paint.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** Allowed theme values. `dark` is the historical default. */
export type Theme = "dark" | "light";

/** Shape of the value exposed via `useTheme()`. */
interface ThemeContextValue {
  /** Currently active theme. */
  readonly theme: Theme;
  /** Flip between dark and light. */
  readonly toggleTheme: () => void;
  /** Set theme explicitly. */
  readonly setTheme: (next: Theme) => void;
}

/** localStorage key used for persistence across reloads. */
const STORAGE_KEY = "aa-theme";

/** React context — null when used outside the provider. */
const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Props for `ThemeProvider`. */
interface ThemeProviderProps {
  readonly children: ReactNode;
}

/**
 * ThemeProvider — wraps the app, reads the persisted theme on mount,
 * and writes the `data-theme` attribute on `<html>` whenever it
 * changes.
 *
 * This component must be a client component because it touches
 * `localStorage` and `document`.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  // Default to dark so SSR markup matches the inline script's default.
  // The actual stored value is read in the effect below post-mount.
  const [theme, setThemeState] = useState<Theme>("dark");

  // On mount, sync state with whatever the inline script already wrote.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const next: Theme = stored === "light" || stored === "dark" ? stored : "dark";
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  /** Apply a new theme: persist + update the DOM attribute. */
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  /** Convenience: flip dark <-> light. */
  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme — consume the theme context. Throws if called outside a
 * `<ThemeProvider>` so misuse fails loudly during development.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}

/**
 * The exact script string injected into `<head>` by `app/layout.tsx`.
 * It runs before React hydrates and applies the persisted theme to the
 * `<html>` element so there is no flash of dark when light is active
 * (or vice versa). Keep this in sync with the keys above.
 */
export const themeInitScript = `(() => {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = (stored === 'light' || stored === 'dark') ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`;
