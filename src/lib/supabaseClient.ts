import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Resilient client: uses Vite env if available, otherwise safe public fallbacks
const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL as string) || "https://yxyngiirdiksakmodhuu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4eW5naWlyZGlrc2FrbW9kaHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzU0ODgsImV4cCI6MjA3ODExMTQ4OH0.EotRH0kKJCPSaAAAb9qGZB6wgXywpePlI0j_7idIhAI";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error("Supabase config missing. Check environment variables.");
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
