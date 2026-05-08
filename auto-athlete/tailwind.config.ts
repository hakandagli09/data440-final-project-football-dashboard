import type { Config } from "tailwindcss";

/**
 * Tailwind config — token bindings live in CSS variables (see
 * `src/app/globals.css`). Each `aa-*` color references a space-separated
 * RGB triple defined per theme (`:root` for dark, `[data-theme="light"]`
 * for light, `@media print` to force light during printing).
 *
 * The `rgb(var(--token) / <alpha-value>)` syntax preserves Tailwind's
 * alpha-modifier classes (e.g. `bg-aa-success/15`) — without this exact
 * shape the alpha modifier silently breaks.
 *
 * Two pre-blended muted variants (`aa-accent-muted`, `aa-warm-muted`)
 * stay as raw `var()` references because they bake their own alpha and
 * don't need to participate in the modifier system.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  // We theme via the `data-theme` attribute on <html>; Tailwind's
  // `dark:` variant remains class-based for any legacy usage but is not
  // the primary mechanism — the CSS-variable swap drives all colors.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Surface scale
        "aa-bg": "rgb(var(--aa-bg) / <alpha-value>)",
        "aa-surface": "rgb(var(--aa-surface) / <alpha-value>)",
        "aa-elevated": "rgb(var(--aa-elevated) / <alpha-value>)",
        "aa-border": "rgb(var(--aa-border) / <alpha-value>)",
        "aa-border-bright": "rgb(var(--aa-border-bright) / <alpha-value>)",
        // Text scale
        "aa-text": "rgb(var(--aa-text) / <alpha-value>)",
        "aa-text-secondary": "rgb(var(--aa-text-secondary) / <alpha-value>)",
        "aa-text-dim": "rgb(var(--aa-text-dim) / <alpha-value>)",
        // Accents
        "aa-accent": "rgb(var(--aa-accent) / <alpha-value>)",
        "aa-warm": "rgb(var(--aa-warm) / <alpha-value>)",
        // Pre-blended translucent variants (no alpha modifier support)
        "aa-accent-muted": "var(--aa-accent-muted)",
        "aa-warm-muted": "var(--aa-warm-muted)",
        // Semantic status
        "aa-success": "rgb(var(--aa-success) / <alpha-value>)",
        "aa-warning": "rgb(var(--aa-warning) / <alpha-value>)",
        "aa-danger": "rgb(var(--aa-danger) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-bebas)", "sans-serif"],
        body: ["var(--font-barlow)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        // Both grid and glow patterns now follow the active theme via
        // CSS variables, so they desaturate cleanly in light/print modes.
        "grid-pattern":
          "linear-gradient(to right, rgb(var(--aa-border) / 0.03) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--aa-border) / 0.03) 1px, transparent 1px)",
        "glow-accent":
          "radial-gradient(ellipse at 50% 0%, rgb(var(--aa-accent) / 0.03) 0%, transparent 60%)",
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-up": "slide-up 0.5s ease-out forwards",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
        "slide-in-right": "slide-in-right 0.24s cubic-bezier(0.23, 1, 0.32, 1) forwards",
        "count-up": "count-up 1s ease-out forwards",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
