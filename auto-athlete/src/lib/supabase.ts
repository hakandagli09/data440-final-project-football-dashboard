/**
 * Supabase Client — singleton database connection for Auto Athlete.
 *
 * This module initializes and exports a single Supabase client instance used
 * throughout the app for all database and auth operations. Importing this
 * module from multiple files returns the same client — no redundant connections.
 *
 * Supabase provides the PostgreSQL database and (future) auth layer for
 * storing GPS session data uploaded from StatSports Apex.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * The project URL for the Supabase instance.
 * The `NEXT_PUBLIC_` prefix is a Next.js convention that exposes this env var
 * to both server and client bundles. The `!` (non-null assertion) tells
 * TypeScript the value will be defined at runtime — if it isn't,
 * `createClient` will throw immediately on startup.
 */
const supabaseUrl: string = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * The public anonymous key for the Supabase project.
 * This is the *anon* key (safe to expose in the browser) — it only grants
 * access permitted by Supabase Row Level Security (RLS) policies.
 * It is NOT the secret service-role key used for admin operations.
 */
const supabaseAnonKey: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Singleton Supabase client.
 * Because ES modules are cached after first evaluation, every `import { supabase }`
 * across the app receives the same instance — no duplicate connections.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
