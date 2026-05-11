import { Crosshair, Shield, Skull, Sparkles, Users, Zap } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Модели" };

interface ModelPack {
  id: string;
  name: string;
  faction: "ct" | "t" | "both";
  rarity: "common" | "rare" | "epic" | "legend";
  price: string;
  description: string;
}

const PACKS: ModelPack[] = [
  {
    id: "classic-ops",
    name: "Classic Ops",
    faction: "both",
    rarity: "common",
    price: "99₽",
    description:
      "Базовый набор отрядов: SAS, GSG-9, Phoenix, Guerilla. Чистая ретро-стилистика 1.6.",
  },
  {
    id: "urban-shadow",
    name: "Urban Shadow",
    faction: "ct",
    rarity: "rare",
    price: "199₽",
    description:
      "Спецназ в тёмной экипировке: бронежилеты, тактические очки, ночное снаряжение.",
  },
  {
    id: "desert-warriors",
    name: "Desert Warriors",
    faction: "t",
    rarity: "rare",
    price: "199₽",
    description:
      "Бойцы пустыни: керамическая броня, маскировка, тактические шарфы.",
  },
  {
    id: "ghost-protocol",
    name: "Ghost Protocol",
    faction: "ct",
    rarity: "epic",
    price: "349₽",
    description:
      "Стелс-операторы: композитные шлемы с HUD, плавные текстуры, эксклюзивные руки.",
  },
  {
    id: "crimson-cartel",
    name: "Crimson Cartel",
    faction: "t",
    rarity: "epic",
    price: "349₽",
    description:
      "Картельные бойцы: кожаные куртки, золотые цепи, контрастные ярко-красные акценты.",
  },
  {
    id: "phantom-legion",
    name: "Phantom Legion",
    faction: "both",
    rarity: "legend",
    price: "699₽",
    description:
      "Эксклюзивная коллекция Legend: 4 модели на обе стороны, светящиеся детали, уникальные анимации.",
  },
];

const RARITY: Record<
  ModelPack["rarity"],
  { label: string; border: string; bg: string; text: string }
> = {
  common: {
    label: "common",
    border: "border-border",
    bg: "bg-card/60",
    text: "text-ash",
  },
  rare: {
    label: "rare",
    border: "border-cyan/40",
    bg: "bg-cyan/5",
    text: "text-cyan",
  },
  epic: {
    label: "epic",
    border: "border-plasma/40",
    bg: "bg-plasma/5",
    text: "text-plasma",
  },
  legend: {
    label: "legend",
    border: "border-flame/40",
    bg: "bg-flame/5",
    text: "text-flame",
  },
};

const FACTION: Record<
  ModelPack["faction"],
  { label: string; icon: typeof Shield; tone: string }
> = {
  ct: { label: "Counter-Terrorists", icon: Shield, tone: "text-cyan" },
  t: { label: "Terrorists", icon: Skull, tone: "text-ember" },
  both: { label: "Обе стороны", icon: Users, tone: "text-plasma" },
};

export default function ModelsPage() {
  return (
    <div className="container max-w-6xl py-6 md:py-10">
      <header className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-cyan">
          <Zap className="h-3 w-3" />
          В разработке
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-bone md:text-4xl">
          Модели
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-smoke">
          Эксклюзивные модели бойцов для CT и T фракций. Внешний вид, который
          увидят и противники, и союзники. Платёжная система скоро откроется.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PACKS.map((pack) => {
          const r = RARITY[pack.rarity];
          const f = FACTION[pack.faction];
          const Icon = f.icon;
          return (
            <div
              key={pack.id}
              className={`group flex flex-col rounded-xl border ${r.border} ${r.bg} p-5 transition-all hover:scale-[1.02]`}
            >
              <header className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${r.border} ${r.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${f.tone}`} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-bone">
                      {pack.name}
                    </h2>
                    <p className={`text-[10px] uppercase tracking-wider ${f.tone}`}>
                      {f.label}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex h-5 items-center rounded-full border ${r.border} px-2 font-mono text-[10px] font-bold uppercase tracking-widest ${r.text}`}
                >
                  {r.label}
                </span>
              </header>

              <p className="mb-4 flex-1 text-xs leading-relaxed text-smoke">
                {pack.description}
              </p>

              <footer className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold tracking-tight text-bone">
                    {pack.price}
                  </span>
                </div>
                <Button variant="outline" size="sm" disabled className="opacity-60">
                  Скоро
                </Button>
              </footer>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-card/50 p-4 text-center text-xs text-smoke">
        <div className="mb-2 inline-flex items-center gap-1.5 text-ash">
          <Sparkles className="h-3.5 w-3.5 text-plasma" />
          <span className="font-semibold">Превью моделей</span>
        </div>
        <p className="leading-relaxed">
          Скриншоты и видео-демонстрации появятся ближе к запуску. Следи за
          новостями в разделе{" "}
          <Link
            href="/f/releases"
            className="font-semibold text-plasma transition-colors hover:text-plasma/80"
          >
            Релизы и обновления
          </Link>
          .
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-smoke">
        <span className="inline-flex items-center gap-1">
          <Crosshair className="h-3 w-3" />
          Загрузка ~80 KB / модель
        </span>
        <span className="inline-flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Совместимо со стандартным CS 1.6
        </span>
      </div>
    </div>
  );
}
