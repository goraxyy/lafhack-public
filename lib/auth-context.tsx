"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { UserRole } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  /** 'admin' unlocks the admin nav link. Server routes re-check it anyway. */
  role: UserRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  async function applySession(nextUser: User | null) {
    setUser(nextUser);
    setRole(nextUser ? await fetchRole(nextUser.id) : null);
    setLoading(false);
  }

  useEffect(() => {
    // Only run on client side
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function refresh() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await applySession(session?.user ?? null);
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

async function fetchRole(userId: string): Promise<UserRole> {
  const supabase = createClient();
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: UserRole }>();

  return data?.role === 'admin' ? 'admin' : 'user';
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
