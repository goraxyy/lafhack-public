/**
 * Browser Supabase client, kept re-exported here for the client components
 * that already import from this path.
 *
 * It deliberately does NOT re-export the server client. Every consumer of this
 * module is a `"use client"` component, and a barrel that also pointed at
 * lib/supabase/server.ts pulled `next/headers` into the client bundle -- which
 * only ever built because that file was marked `'use server'`, so Next
 * replaced it with an action stub. Server code imports `@/lib/supabase/server`
 * directly.
 */
export { createClient } from './supabase/client';
