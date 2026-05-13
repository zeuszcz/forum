"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Coins,
  Crosshair,
  Eye,
  EyeOff,
  Hammer,
  Lock,
  Megaphone,
  Newspaper,
  ScrollText,
  ShieldOff,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "overview", label: "Обзор", icon: <ScrollText className="h-3 w-3" /> },
  { id: "roles", label: "Роли", icon: <Users className="h-3 w-3" /> },
  { id: "ap", label: "Action Points", icon: <Zap className="h-3 w-3" /> },
  { id: "cells", label: "Камеры", icon: <Lock className="h-3 w-3" /> },
  { id: "tunnel", label: "Тоннели", icon: <Target className="h-3 w-3" /> },
  { id: "intel", label: "Intel", icon: <Newspaper className="h-3 w-3" /> },
  { id: "trust", label: "Доверие", icon: <Eye className="h-3 w-3" /> },
  { id: "alliances", label: "Альянсы", icon: <Megaphone className="h-3 w-3" /> },
  { id: "items", label: "Предметы", icon: <Hammer className="h-3 w-3" /> },
  { id: "market", label: "Чёрный рынок", icon: <Coins className="h-3 w-3" /> },
  { id: "arena", label: "Арена", icon: <Swords className="h-3 w-3" /> },
  { id: "minigames", label: "Мини-игры", icon: <Crosshair className="h-3 w-3" /> },
  { id: "reveals", label: "Раскрытия", icon: <EyeOff className="h-3 w-3" /> },
  { id: "victory", label: "Победа", icon: <Trophy className="h-3 w-3" /> },
  { id: "rewards", label: "Награды", icon: <Sparkles className="h-3 w-3" /> },
];

export default function PrisonBreakInfoPage() {
  const [active, setActive] = useState("overview");

  return (
    <div className="container py-6">
      <Link
        href="/event/prison-break"
        className="mb-4 inline-flex items-center gap-1 text-xs text-smoke hover:text-bone"
      >
        <ChevronLeft className="h-3 w-3" />
        назад на дашборд
      </Link>

      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-bone">
          <ShieldOff className="h-6 w-6 text-flame" />
          Тюремный Бунт — правила
        </h1>
        <p className="mt-1 text-sm text-smoke">
          Полное объяснение каждой механики игры. Читай — играешь умнее.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* TOC sidebar */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <nav className="space-y-0.5 rounded-lg border border-border bg-card p-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors",
                  active === s.id
                    ? "bg-flame/10 text-flame"
                    : "text-smoke hover:bg-card hover:text-bone",
                )}
              >
                {s.icon}
                <span>{s.label}</span>
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <article className="prose prose-invert max-w-none space-y-8 text-sm text-bone/90">
          <Section id="overview" title="Обзор">
            <p>
              <strong className="text-flame">«Тюремный Бунт»</strong> — это
              21-дневная многоэтапная игра внутри форума с фракционными
              интригами, неполной информацией, реальными ставками и
              интерактивными мини-играми.
            </p>
            <p>
              Каждый день у тебя есть{" "}
              <Badge>3 Action Points (AP)</Badge> для действий: копать
              тоннель, торговать на чёрном рынке, драться на арене, передавать
              intel, заключать альянсы, патрулировать или снитчить.
            </p>
            <p>
              За 21 день фракции борются:
            </p>
            <ul>
              <li>
                🔒 <strong>Заключённые</strong> — пытаются сбежать через
                тоннели.
              </li>
              <li>
                👮 <strong>Охрана</strong> — пытается не дать им сбежать.
              </li>
              <li>
                🕵 <strong>Шпионы</strong> — двойные агенты со своей secret
                agenda.
              </li>
              <li>
                💀 <strong>Начальник в бегах</strong> — анонимен до Day 17, у
                него собственный план.
              </li>
            </ul>
            <p>
              Если 50%+ заключённых сбегут к Day 21 — побеждают зеки. Если
              меньше 30% — побеждает охрана. Промежуточные исходы — ничья и
              баллы.
            </p>
          </Section>

          <Section id="roles" title="Роли и фракции">
            <p>
              Роль присваивается автоматически в Day 0 на основе{" "}
              <Badge>kармы аккаунта</Badge> и случайного распределения.
              Авторитеты — топ-5% по карме. Остальные роли — рандом.
            </p>
            <Table
              head={["Роль", "% игроков", "Цель", "Особое"]}
              rows={[
                [
                  "🔒 Заключённый",
                  "60%",
                  "Сбежать к Day 21",
                  "Базовые 3 AP/день",
                ],
                [
                  "👮 Охрана",
                  "25%",
                  "Не дать сбежать",
                  "+1 AP на патрулях",
                ],
                [
                  "👑 Авторитет",
                  "5%",
                  "Лидер блока",
                  "Может вербовать «доверенных»",
                ],
                [
                  "🕵 Шпион",
                  "7%",
                  "Свой secret agenda",
                  "Видит intel обеих сторон",
                ],
                [
                  "💀 Начальник в бегах",
                  "3% (1-2 чел.)",
                  "Дожить неразоблачённым",
                  "Видит всё, но если палится — теряет всё",
                ],
              ]}
            />
            <Note>
              Роль показывается <strong>только тебе</strong>. Снаружи все
              выглядят как «заключённый». Кто шпион, кто начальник — узнаёшь
              через intel, дедукцию или Reveal-сцены.
            </Note>
          </Section>

          <Section id="ap" title="Action Points (AP)">
            <p>
              AP — главный ресурс времени. <Badge>3 AP в день</Badge>{" "}
              обнуляются в 00:00 МСК. Daily login = +1 AP бонус (carry-over
              до 5).
            </p>
            <Table
              head={["Действие", "Цена", "Эффект"]}
              rows={[
                ["⛏ Копать тоннель", "2 AP", "+5 прогресса (roll 3-7)"],
                ["👮 Патрулировать", "1 AP", "Шанс заметить копателя"],
                ["🤝 Визит", "1 AP", "+5 trust с целью"],
                ["🔪 Атака (Арена)", "2 AP", "Вызов в 2D-арену"],
                ["📜 Передать intel", "1 AP", "Переслать кусок инфы"],
                ["🛠 Крафтить предмет", "1-3 AP", "По рецепту"],
                ["🚨 Снитчить", "2 AP", "Сдать игрока охране"],
                ["💰 Торговать", "0 AP", "Free order на рынке"],
                ["🛏 Отдых", "0 AP", "Бонус +1 trust с сокамерниками"],
              ]}
            />
          </Section>

          <Section id="cells" title="Камеры и блоки">
            <p>
              Все заключённые делятся на{" "}
              <Badge>камеры по 4 человека</Badge>. Камеры группируются в 3
              блока (A/B/C, по 6-8 камер). В каждом блоке свой Авторитет +
              1-2 Охранника на дежурстве.
            </p>
            <p>
              Камера = приватный чат-тред на форуме. Только сокамерники видят
              сообщения. Можно говорить про тоннель, договариваться о ресурсах,
              решать кого можно доверять.
            </p>
            <p>
              <strong>Tunnel — общий ресурс камеры</strong>. Все 4 сокамерника
              могут добавлять прогресс. Если 100% — побег открыт.
            </p>
          </Section>

          <Section id="tunnel" title="Тоннели — побег зеков">
            <p>
              Каждый раз когда ты копаешь (-2 AP):
            </p>
            <Code>
              progress += rand(3, 7){"\n"}
              если в инвентаре есть 🪤 Лом → +2 (тратится){"\n"}
              если все 4 сокамерника копали сегодня → +1{"\n"}
              если у тебя {">"}75 trust с 2+ сокамерниками → +3
            </Code>
            <p>
              <strong>Риск раскрытия</strong>: каждое копание имеет шанс
              быть замеченным охраной:
            </p>
            <Code>
              discovery = 0.05 × (1 + patrols_today){"\n"}
              − 0.02 × camera_disabled_in_cell{"\n"}
              − 0.01 × bribed_guards_count
            </Code>
            <p>
              При раскрытии: камера блокируется на 2 дня, охрана получает
              intel «копают в блоке X», trust сокамерников падает.
            </p>
          </Section>

          <Section id="intel" title="Intel — асимметричная информация">
            <p>
              Каждый день в <Badge>12:00 МСК</Badge> сервер дропает 3-5 кусков
              intel на каждого игрока. <strong>70% правда, 30% ложь</strong>{" "}
              (фабрикуется ботом или подбрасывается шпионами).
            </p>
            <p>Примеры:</p>
            <Quote>
              «Утечка в блоке C — кто-то копает.»
              <br />
              «Охранник Сергей вчера взял взятку.»
              <br />
              «Авторитет Виталий купил отвёртку.»
              <br />
              «В прачечной заначка из 5 шарашек.»
            </Quote>
            <p>
              Категории intel: позиция / личность / альянс / предмет /
              подкуп / движение. Каждый кусок — это claim который может
              быть правдой или ложью.
            </p>
            <p>
              <strong>Что можно делать с intel:</strong>
            </p>
            <ul>
              <li>Хранить и анализировать — что-то срабатывает позже.</li>
              <li>Переслать другому игроку (-1 AP) — он не знает источник.</li>
              <li>
                Если ты шпион/начальник — можешь сфабриковать свой intel и
                подбросить (-3 AP).
              </li>
            </ul>
          </Section>

          <Section id="trust" title="Trust между игроками">
            <p>
              У каждой пары игроков есть{" "}
              <Badge>trust score 0-100</Badge>, начинается с 50 (нейтрал).
              Виден только тебе и собеседнику.
            </p>
            <Table
              head={["Событие", "Δ trust"]}
              rows={[
                ["Прочитанное сообщение в чате камеры", "+1"],
                ["Взаимный визит (-1 AP)", "+5"],
                ["Переданный предмет", "+10"],
                ["Совместный успешный туннель-progress (>10% за день)", "+15"],
                ["Ложный intel (доказано)", "−10"],
                ["Публичное предательство", "−20"],
                ["Снитч-арест сокамерника", "−50"],
              ]}
            />
            <Note>
              При trust {">"} 75 с 2+ сокамерниками — бонусы к копанию (+3 за
              dig). При trust {"<"} 25 — потеря возможности заключать с этим
              игроком альянсы.
            </Note>
          </Section>

          <Section id="alliances" title="Альянсы — формальные пакты">
            <p>
              Пакты <strong>публичны</strong> и записаны в «Реестр Договоров»
              для всех. Виды:
            </p>
            <Table
              head={["Тип", "Условия"]}
              rows={[
                [
                  "Пакт о ненападении",
                  "Нельзя атаковать друг друга",
                ],
                [
                  "Пакт о тоннеле",
                  "Доли в успехе побега 50/50",
                ],
                [
                  "Обмен intel",
                  "Все получаемые intel автоматически дублируются",
                ],
                [
                  "Взаимная защита",
                  "Атака на одного = атака на обоих",
                ],
                ["Эксклюзивная торговля", "Фиксированные цены"],
                [
                  "Союз против X",
                  "Совместная атака на конкретное третье лицо",
                ],
              ]}
            />
            <p>
              <strong>Нарушение пакта</strong> = публичный позор:
            </p>
            <ul>
              <li>Trust со всеми игроками −10</li>
              <li>Trust с пострадавшим → 0</li>
              <li>Имя в «Списке предателей» permanent</li>
              <li>−20% AP на 3 дня (debuff)</li>
            </ul>
          </Section>

          <Section id="items" title="Предметы и крафт">
            <p>
              Три типа ресурсов: <Badge>🪙 валюта</Badge>{" "}
              <Badge>🔩 шарашка</Badge> <Badge>📜 макулатура</Badge>. Дроп в
              daily roll, торговле, кражах.
            </p>
            <Table
              head={["Предмет", "Рецепт", "Эффект"]}
              rows={[
                ["🪤 Лом", "3 🔩 + 1 AP", "+2 AP к тоннелю (одноразовый)"],
                [
                  "🗝 Поддельный ключ",
                  "2 🔩 + 2 📜 + 2 AP",
                  "Открыть 1 камеру",
                ],
                ["🚬 Шифр-записка", "1 📜 + 1 AP", "Анонимное сообщение"],
                ["📻 Радио", "3 🔩 + 1 AP", "Прочитать 1 chat охраны"],
                ["🔦 Отвёртка", "2 🔩 + 1 AP", "Отключить камеру на 24ч"],
                ["💉 Шприц", "5 🔩 + 3 AP", "Цель: −2 AP на 1 день"],
                ["📿 Молитвенник", "2 📜 + 1 AP", "Намёк на роль одного игрока"],
              ]}
            />
            <Note>
              Крафт — это{" "}
              <strong>мини-игра тапания по молотку</strong>. Идеальный ритм
              (клик через 1.0±0.1 сек) даёт «Мастерское» качество с бонус-эффектом.
              Безалаберные клики = «Кривой» предмет с half-effect.
            </Note>
          </Section>

          <Section id="market" title="Чёрный рынок — order book">
            <p>
              Open exchange с заявками и предложениями для каждого ресурса.
              Заявки исполняются автоматически при cross.
            </p>
            <p>
              <strong>Tax 5%</strong> от каждой сделки уходит в общий пот →
              распределяется победителям сезона. Это sink для валюты — против
              инфляции.
            </p>
            <p>
              <strong>Anti-collusion</strong>: одни и те же два игрока не могут
              торговать между собой больше 3 раз в 24ч.
            </p>
            <p>
              <strong>Кражи</strong> (-2 AP, требует Лом): рандомный шанс
              украсть 1-3 ресурса у выбранного игрока. 30% успеха, 50% попался
              охране, 20% пустой проход.
            </p>
          </Section>

          <Section id="arena" title="Арена — 2D fighter">
            <p>
              Когда ты нажимаешь «🔪 Атака» — открывается полноценный 2D
              файтер в стиле пиксельного Mortal Kombat. Real-time WS, оба
              игрока управляют своими бойцами.
            </p>
            <p>
              <strong>Управление:</strong>
            </p>
            <ul>
              <li>WASD — движение, прыжок, блок</li>
              <li>F — лёгкий удар (5 dmg)</li>
              <li>G — тяжёлый удар (12 dmg)</li>
              <li>H — спец-приём (зависит от твоей татуировки)</li>
              <li>ESC — сдаться</li>
            </ul>
            <p>
              <strong>HP 100, раунд 90 сек.</strong>
            </p>
            <p>
              <strong>12 уникальных спец-приёмов</strong> по татуировкам:
              нож в полёт, телепорт-рывок, газ-паралич, поджог DoT, ярость,
              стелс, цепь, жажда крови, яд, уклонение, рандом, прозрение.
            </p>
            <p>
              <strong>Спектатор-ставки</strong>: за 30 сек до начала матча
              открывается окно ставок 10-500 🪙 на одного из бойцов.
              Коэффициенты живые по объёму ставок.
            </p>
            <p>
              <strong>Последствия:</strong>
            </p>
            <ul>
              <li>Победитель забирает 15% валюты проигравшего (или 100 🪙)</li>
              <li>Проигравший: −15 trust со всеми сокамерниками</li>
              <li>3 поражения подряд → debuff «Слабак»: −1 AP на 3 дня</li>
            </ul>
          </Section>

          <Section id="minigames" title="Мини-игры">
            <p>Помимо Арены — 5 интерактивных мини-игр:</p>
            <Table
              head={["Игра", "Кто играет", "Описание"]}
              rows={[
                [
                  "🛠 Мастерская",
                  "Любой",
                  "Тапание по молотку с ритмом 1.0s; идеальный ритм = бонусное качество предмета",
                ],
                [
                  "🚪 Взлом замка",
                  "С поддельным ключом",
                  "5 цилиндров, нажимать SPACE в sweet spot, шум-меттер. Открыть камеру за 30с",
                ],
                [
                  "👮 Патруль",
                  "Охрана",
                  "Изометрическая карта блока, drag-drop путь через 5 нод, шанс заметить копателей",
                ],
                [
                  "🚨 Допрос",
                  "Охрана vs Зек",
                  "Branching dialogue с 5 вариантами реплик, стресс-метр 0-100. Сломался — выдал intel",
                ],
                [
                  "🎲 Раффлы / Daily Wheel",
                  "Любой",
                  "Ежедневная фортуна 60% валюта / 25% ресурс / 10% boost / 5% rare",
                ],
              ]}
            />
          </Section>

          <Section id="reveals" title="Reveal-фазы (драматургия)">
            <p>
              4 ключевые точки сезона — анимированные cinematic-события с
              push-уведомлениями всем игрокам.
            </p>
            <Table
              head={["День", "Reveal", "Что происходит"]}
              rows={[
                [
                  "Day 5, 20:00",
                  "👑 Авторитеты",
                  "Имена 4-5 Авторитетов становятся публичными. +50% AP им на день.",
                ],
                [
                  "Day 10, 20:00",
                  "🕵 Первый Шпион",
                  "1 случайный шпион автоматически палится. Тру 30 пунктов от его фракции.",
                ],
                [
                  "Day 17, 20:00",
                  "💀 Начальник в бегах",
                  "Если ещё не раскрылся сам — палится автоматически. Если выдержал — у него огромный бонус.",
                ],
                [
                  "Day 21, 22:00",
                  "🌋 Финальная Ночь",
                  "30-минутный real-time stream побегов на главной странице. Watch-party.",
                ],
              ]}
            />
          </Section>

          <Section id="victory" title="Условия победы">
            <ul>
              <li>
                <strong>Зеки побеждают</strong> если ≥50% из них сбежали к
                Day 21.
              </li>
              <li>
                <strong>Охрана побеждает</strong> если {"<"}30% сбежало.
              </li>
              <li>
                <strong>Шпионы побеждают индивидуально</strong> — если их
                personal agenda выполнен (независимо от исхода фракции).
              </li>
              <li>
                <strong>Начальник в бегах побеждает</strong> если дожил до
                Day 17 неразоблачённым.
              </li>
            </ul>
            <Note>
              Промежуточный исход (30-50% побегов) — ничья по фракциям, но
              индивидуальные MVP всё равно получают награды.
            </Note>
          </Section>

          <Section id="rewards" title="Награды">
            <Table
              head={["Категория", "Что"]}
              rows={[
                [
                  "Регистрация",
                  "100 🪙 + badge «Тюремщик 2026.Q3»",
                ],
                ["Дожил до конца", "+500 🪙"],
                [
                  "Победа фракции (все живые)",
                  "2000-5000 🪙 + 3-10 case_keys + фракционный badge + nick_color на 30 дней",
                ],
                [
                  "Top-3 MVP по фракции",
                  "+3000/1500/750 🪙 + permanent title «Легенда 2026.Q3»",
                ],
                [
                  "«Чемпион арены»",
                  "+2000 🪙 + permanent avatar frame «Кулак Чемпиона»",
                ],
                [
                  "«Двойной агент»",
                  "Лучший шпион: +3000 🪙 + secret title",
                ],
                [
                  "«Мастер дезинформации»",
                  "Больше всего successful fake intel'ов",
                ],
                [
                  "«Палач интриг»",
                  "Больше всего арестов через snitching",
                ],
                [
                  "«Тень начальника»",
                  "Начальник дожил неразоблачённым: +5000 🪙 + legendary title",
                ],
                [
                  "Спектатор-bets",
                  "Кто ставил правильно — ставка × коэффициент",
                ],
              ]}
            />
          </Section>

          {/* CTA */}
          <div className="mt-12 rounded-lg border border-flame/30 bg-flame/5 p-6 text-center">
            <h3 className="text-lg font-bold text-bone">Готов сесть?</h3>
            <p className="mt-2 text-sm text-smoke">
              Регистрация открывается перед каждым сезоном. Проверь дашборд.
            </p>
            <Link
              href="/event/prison-break"
              className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md border border-flame/40 bg-flame/15 px-5 text-sm font-semibold uppercase tracking-widest text-flame transition-colors hover:bg-flame/25"
            >
              <ShieldOff className="h-4 w-4" />
              на дашборд
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4 }}
      className="scroll-mt-6"
    >
      <h2 className="mb-3 border-b border-border pb-2 text-xl font-bold text-bone">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </motion.section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-cyan/40 bg-cyan/10 px-1.5 py-0.5 font-mono text-[11px] text-cyan">
      {children}
    </span>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-card/50">
            {head.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-[10px] uppercase tracking-widest text-smoke"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-card/30">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-void/60 p-3 font-mono text-[11px] leading-relaxed text-cyan">
      {children}
    </pre>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
      <strong className="text-amber-400">⚠ Заметка: </strong>
      {children}
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-cyan/40 bg-cyan/5 py-2 pl-4 text-xs italic text-smoke">
      {children}
    </blockquote>
  );
}
