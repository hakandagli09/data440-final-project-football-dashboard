import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Core palette — ESPN meets Bloomberg Terminal
        "aa-bg": "#07080a",
        "aa-surface": "#0f1117",
        "aa-elevated": "#181b25",
        "aa-border": "#1e2231",
        "aa-border-bright": "#2a2f42",
        "aa-text": "#e8eaed",
        "aa-text-secondary": "#8b8fa3",
        "aa-text-dim": "#555a6e",
        // Accent — electric cyan for that sports-tech edge
        "aa-accent": "#00f0ff",
        "aa-accent-muted": "#00f0ff20",
        // Warm accent — highlight plays, alerts
        "aa-warm": "#ff6b35",
        "aa-warm-muted": "#ff6b3520",
        // Semantic
        "aa-success": "#00e676",
        "aa-warning": "#ffab00",
        "aa-danger": "#ff1744",
      },
      fontFamily: {
        display: ["var(--font-bebas)", "sans-serif"],
        body: ["var(--font-barlow)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, #1e223108 1px, transparent 1px), linear-gradient(to bottom, #1e223108 1px, transparent 1px)",
        "glow-accent":
          "radial-gradient(ellipse at 50% 0%, #00f0ff08 0%, transparent 60%)",
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
