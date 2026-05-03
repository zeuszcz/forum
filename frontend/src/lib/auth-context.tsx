"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { AuthResponse, UserPublic } from "@/lib/types";

interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserPublic>;
  register: (nickname: string, email: string, password: string) => Promise<UserPublic>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: UserPublic | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<UserPublic | null>(initialUser);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api<UserPublic>("/auth/me");
      setUser(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    if (!initialUser) return;
    // Heartbeat so the user appears as online
    const tick = () => api("/users/heartbeat", { method: "POST" }).catch(() => {});
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [initialUser]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const r = await api<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(r.user);
      return r.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (nickname: string, email: string, password: string) => {
    setLoading(true);
    try {
      const r = await api<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ nickname, email, password }),
      });
      setUser(r.user);
      return r.user;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
