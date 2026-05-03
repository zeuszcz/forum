"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      router.push(next || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Ошибка входа");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div className="space-y-2">
        <label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-smoke">
          Email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-smoke">
          Пароль
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" variant="gradient" size="lg" disabled={loading} className="w-full">
        {loading ? "Входим…" : "Войти"}
      </Button>
      {error && <p className="text-xs text-ember">{error}</p>}
    </form>
  );
}
