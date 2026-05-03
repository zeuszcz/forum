import Link from "next/link";
import { ArrowRight, MessageSquare, Shield, Users, Activity, Award, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

const STATS = [
  { label: "Сообщений", value: "—", hint: "Phase 1" },
  { label: "Игроков", value: "—", hint: "Phase 1" },
  { label: "Онлайн", value: "—", hint: "Phase 2" },
];

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Обсуждения",
    body: "Тематические разделы, тредовые обсуждения, цитирование, реакции, markdown.",
  },
  {
    icon: Shield,
    title: "Бан-апелляции",
    body: "Структурированные формы вместо хаотичных тредов. Workflow от подачи до вердикта куратора.",
  },
  {
    icon: Activity,
    title: "Live-сервер",
    body: "Виджет онлайна, текущая карта, привязка форум↔in-game whisper. (Phase 3)",
  },
  {
    icon: Users,
    title: "Профили",
    body: "Steam OpenID, бейджи ролей, медали, репутация, статистика на сервере.",
  },
  {
    icon: Award,
    title: "Достижения",
    body: "Авто-выдача медалей за активность, top-листы недели, признание сообщества.",
  },
  {
    icon: Zap,
    title: "Real-time",
    body: "Live-обновление тредов, presence, push-уведомления — без F5.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* --- Hero --- */}
      <section className="hero-bg relative overflow-hidden">
        <div className="container py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-void/60 px-4 py-1.5 text-xs uppercase tracking-widest text-ash backdrop-blur-sm">
              <span className="dot-live animate-pulse-slow" />
              Phase 0 — scaffold
            </div>

            <h1 className="font-sans text-5xl font-extrabold leading-[1.05] tracking-tight text-bone md:text-7xl">
              Сообщество{" "}
              <span className="text-plasma-gradient animate-gradient-drift">endless·war</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-ash md:text-xl">
              Форум CS 1.6 jail-сервера. Без воды, без лишнего. Сделано премиум — то, чего не было ни у кого.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" variant="gradient" asChild>
                <Link href="/register">
                  Начать <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/forums">Открыть форум</Link>
              </Button>
            </div>

            <div className="mt-16 grid grid-cols-3 divide-x divide-border border-y border-border">
              {STATS.map((s) => (
                <div key={s.label} className="px-4 py-6 text-center">
                  <div className="font-mono text-2xl font-bold text-plasma">{s.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-widest text-smoke">{s.label}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-smoke/60">
                    {s.hint}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --- Features --- */}
      <section className="border-t border-border/60">
        <div className="container py-20">
          <div className="mb-12 text-center">
            <h2 className="font-sans text-3xl font-bold tracking-tight text-bone md:text-4xl">
              Что внутри
            </h2>
            <p className="mt-3 text-ash">
              Roadmap по фазам в{" "}
              <Link href="/roadmap" className="link-plasma">
                /roadmap
              </Link>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card-premium group p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-slate text-plasma transition-colors duration-150 ease-premium group-hover:border-plasma/50 group-hover:text-plasma-bright">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold tracking-tight text-bone">{f.title}</h3>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-ash">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- Status strip --- */}
      <section className="border-t border-border/60 bg-void">
        <div className="container py-12">
          <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:text-left">
            <div>
              <div className="text-xs uppercase tracking-widest text-smoke">
                Статус разработки
              </div>
              <div className="mt-1 font-mono text-sm text-bone">
                v0.0.1 · Phase 0 (scaffold) · следующий milestone — Phase 1 MVP
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://github.com/zeuszcz/forum"
                target="_blank"
                rel="noopener noreferrer"
              >
                Repo на GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
