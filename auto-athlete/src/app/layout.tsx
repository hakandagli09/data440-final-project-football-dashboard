/**
 * Root Layout — global HTML shell for Auto Athlete.
 *
 * This is the outermost Next.js 14 App Router layout. It:
 * 1. Loads three Google Fonts via `next/font/google` and injects them as CSS variables
 * 2. Applies the dark theme globally (`className="dark"` on <html>)
 * 3. Sets the default body font and background color
 *
 * Every page in the app inherits this layout.
 */

import type { Metadata } from "next";
import { Bebas_Neue, Barlow, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Bebas Neue — display / heading typeface.
 * A condensed all-caps sans-serif used for section titles and large numbers.
 * `display: "swap"` uses the FOUT (Flash of Unstyled Text) strategy:
 * render with a fallback font immediately, then swap when the web font loads.
 * This avoids invisible text during font download.
 */
const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

/**
 * Barlow — body / UI typeface.
 * A neutral sans-serif loaded at multiple weights for body text, labels, and
 * UI controls. Serves as the default font-family via `font-body` in Tailwind.
 */
const barlow = Barlow({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow",
  display: "swap",
});

/**
 * JetBrains Mono — monospaced / data typeface.
 * Used for numeric readouts, timestamps, and code-like labels throughout the
 * dashboard. Its tabular figures ensure columns of numbers align cleanly.
 */
const jetbrains = JetBrains_Mono({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

/**
 * Page metadata exported for Next.js to inject into the <head>.
 * Supplies the HTML <title> and <meta name="description"> for SEO.
 */
export const metadata: Metadata = {
  title: "Auto Athlete — Performance Dashboard",
  description:
    "GPS-powered strength & conditioning analytics for college football",
};

/** Props for the root layout component. */
interface RootLayoutProps {
  /** The page or nested layout rendered inside <body>. */
  readonly children: React.ReactNode;
}

/**
 * RootLayout — the outermost server component wrapping every page.
 *
 * - `lang="en"` sets the document language for accessibility and SEO.
 * - `className="dark"` activates Tailwind's dark-mode variant on all descendants.
 * - The three font CSS-variable classes (e.g. `bebas.variable`) inject
 *   `--font-bebas`, `--font-barlow`, and `--font-jetbrains` onto <body>,
 *   which Tailwind's `font-display`, `font-body`, and `font-mono` utilities consume.
 * - `antialiased` enables subpixel font rendering for sharper text.
 * - `bg-aa-bg` sets the near-black background (#07080a).
 * - `text-aa-text` sets the default foreground color (#e8eaed).
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${bebas.variable} ${barlow.variable} ${jetbrains.variable} font-body antialiased bg-aa-bg text-aa-text`}
      >
        {children}
      </body>
    </html>
  );
}
