"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function RegisterForm() {
  const router = useRouter();
  const { register, loading } = useAuth();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await register(nickname, email, password);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Ошибка регистрации");
    }
  }

  const nicknameValid = /^[A-Za-z0-9_\-\.]{3,32}$/.test(nickname);

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div className="space-y-2">
        <label htmlFor="nickname" className="text-xs font-semibold uppercase tracking-widest text-smoke">
          Никнейм
        </label>
        <Input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          minLength={3}
          maxLength={32}
        />
        <p className="text-[11px] text-smoke">
          3–32 символа · буквы (латиница), цифры, _ - .
        </p>
      </div>
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
          autoComplete="new-password"
          minLength={8}
        />
        <p className="text-[11px] text-smoke">от 8 символов</p>
      </div>
      <Button
        type="submit"
        variant="gradient"
        size="lg"
        disabled={loading || !nicknameValid || password.length < 8}
        className="w-full"
      >
        {loading ? "Создаём…" : "Создать аккаунт"}
      </Button>
      {error && <p className="text-xs text-ember">{error}</p>}
    </form>
  );
}
