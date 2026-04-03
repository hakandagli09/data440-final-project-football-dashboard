/**
 * Root Route (`/`) — Redirect to Dashboard
 *
 * This is a Next.js server component (no "use client" directive) whose sole
 * purpose is to redirect visitors from the root URL to `/dashboard`.
 * `redirect()` sends an HTTP 307 (Temporary Redirect) response and throws
 * internally, so the function never returns or renders any JSX.
 */

import { redirect } from "next/navigation";

/** Redirects the root route to the main dashboard page. Never renders. */
export default function Home(): never {
  redirect("/dashboard");
}
