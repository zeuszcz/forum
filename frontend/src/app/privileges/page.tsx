import { Check, Crown, Sparkles, Star, Zap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Привилегии" };

interface Tier {
  id: string;
  name: string;
  tagline: string;
  price: string;
  duration: string;
  accent: "plasma" | "flame" | "cyan" | "ember";
  icon: typeof Crown;
  perks: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "vip",
    name: "VIP",
    tagline: "Базовый набор привилегий",
    price: "149₽",
    duration: "30 дней",
    accent: "cyan",
    icon: Star,
    perks: [
      "Резерв-слот на сервере",
      "Цветной ник в чате",
      "Доступ к /vip командам",
      "Знак VIP в табе",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Расширенные возможности",
    price: "299₽",
    duration: "30 дней",
    accent: "plasma",
    icon: Sparkles,
    highlight: true,
    perks: [
      "Всё из VIP",
      "Дополнительные команды (/glow, /trail)",
      "Кастомный префикс в чате",
      "Свечение никнейма на форуме",
      "Приоритетная поддержка",
    ],
  },
  {
    id: "legend",
    name: "Legend",
    tagline: "Максимальный статус",
    price: "599₽",
    duration: "30 дней",
    accent: "flame",
    icon: Crown,
    perks: [
      "Всё из Premium",
      "Анимированная аватарка-рамка",
      "Кастомный титул на форуме",
      "Доступ в закрытый раздел",
      "Эксклюзивные модели и скины",
    ],
  },
];

const ACCENT: Record<Tier["accent"], { border: string; bg: string; text: string; ring: string }> = {
  cyan: {
    border: "border-cyan/40",
    bg: "bg-cyan/5",
    text: "text-cyan",
    ring: "ring-cyan/30",
  },
  plasma: {
    border: "border-plasma/50",
    bg: "bg-plasma/10",
    text: "text-plasma",
    ring: "ring-plasma/40",
  },
  flame: {
    border: "border-flame/40",
    bg: "bg-flame/5",
    text: "text-flame",
    ring: "ring-flame/30",
  },
  ember: {
    border: "border-ember/40",
    bg: "bg-ember/5",
    text: "text-ember",
    ring: "ring-ember/30",
  },
};

export default function PrivilegesPage() {
  return (
    <div className="container max-w-6xl py-6 md:py-10">
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-plasma/30 bg-plasma/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-plasma">
          <Zap className="h-3 w-3" />
          В разработке
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-bone md:text-4xl">
          Привилегии
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-smoke">
          Поддержи сервер и получи доступ к расширенным возможностям на CS 1.6
          и на форуме. Платёжная система скоро откроется.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => {
          const c = ACCENT[tier.accent];
          const Icon = tier.icon;
          return (
            <div
              key={tier.id}
              className={`group relative flex flex-col rounded-xl border ${c.border} ${c.bg} p-5 transition-all hover:scale-[1.02] ${
                tier.highlight ? "md:scale-105 ring-2 " + c.ring : ""
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-plasma px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-bg">
                  популярный
                </div>
              )}
              <header className="mb-4 flex items-center gap-3">
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${c.border} ${c.bg}`}
                >
                  <Icon className={`h-5 w-5 ${c.text}`} />
                </div>
                <div>
                  <h2 className={`text-lg font-bold tracking-tight ${c.text}`}>
                    {tier.name}
                  </h2>
                  <p className="text-[11px] text-smoke">{tier.tagline}</p>
                </div>
              </header>

              <div className="mb-5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tracking-tight text-bone">
                    {tier.price}
                  </span>
                  <span className="text-xs text-smoke">/ {tier.duration}</span>
                </div>
              </div>

              <ul className="mb-5 flex-1 space-y-2">
                {tier.perks.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 text-xs text-ash"
                  >
                    <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${c.text}`} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                size="sm"
                disabled
                className="w-full opacity-60"
              >
                Скоро в продаже
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-card/50 p-4 text-center text-xs text-smoke">
        Уже есть привилегии? Активация — через раздел{" "}
        <Link
          href="/f/promo"
          className="font-semibold text-plasma transition-colors hover:text-plasma/80"
        >
          Промо и VIP
        </Link>{" "}
        или напиши в{" "}
        <Link
          href="/f/admin-applications"
          className="font-semibold text-cyan transition-colors hover:text-cyan/80"
        >
          Заявки в администрацию
        </Link>
        .
      </div>
    </div>
  );
}
