/** Reference catalogue of jbf_uaio_modular admin-menu commands.
 *
 * The plugin's compiled .amxx files use the AMX-X protector — strings
 * inside are scrambled, and the commands themselves do not print usage
 * hints when invoked from the server console (no player context). So this
 * table is hand-built from three sources:
 *   1. User-provided cmd → Russian label mapping
 *   2. Observed log lines from cstrike/addons/amxmodx/logs/jb_uaio_modular/
 *      (verb + how the target is announced)
 *   3. jbf_uaio naming convention (hit_/spike_/radius_/grenade_/button_)
 *
 * `params` is a human-readable hint, not an authoritative signature —
 * if an admin discovers a richer arg set, fix the entry here.
 */

export type JbfCategory =
  | "clear"
  | "basic"
  | "hit"
  | "spike"
  | "radius"
  | "grenade"
  | "button"
  | "kill"
  | "kurator";

export type JbfKind = "toggle" | "setter" | "action" | "give" | "clear";

export interface JbfFlag {
  /** Flag name as the plugin expects it, e.g. "-n", "-g", "-b". */
  flag: string;
  /** Human-readable description of what the flag controls. */
  label: string;
  /** Value vocabulary or example, e.g. "All / T / CT / Color / Aim". */
  values?: string;
}

export interface JbfCommand {
  cmd: string;
  label: string;
  category: JbfCategory;
  kind: JbfKind;
  /** Authoritative parameter list parsed from the plugin's own usage hint
   *  (printed when the command is invoked from a player's console with no
   *  args). Populated by infra/cs-log-poller/parse_usage_dump.py from a
   *  condump produced via `exec cfg/uaio_usage_dump.cfg`. */
  flags?: JbfFlag[];
  /** Example invocation the plugin shows after the flag list. */
  example?: string;
  /** Legacy convention-based hint, shown if `flags` isn't populated yet. */
  params?: string;
  /** Past-tense verb the plugin uses when announcing this action in logs. */
  verb?: string;
  notes?: string;
  /** True once flags have been verified against real plugin output. */
  verified?: boolean;
}

export const JBF_CATEGORY_LABEL: Record<JbfCategory, string> = {
  clear: "Очистка эффектов",
  basic: "Обычные",
  hit: "Удар (по жертве)",
  spike: "Шипы (триггер area)",
  radius: "Радиус (вокруг точки)",
  grenade: "Граната (на взрыве)",
  button: "Кнопка (server-button)",
  kill: "Убийство (на фраг)",
  kurator: "Куратор (выдача меню)",
};

export const JBF_CATEGORY_TONE: Record<JbfCategory, string> = {
  clear: "text-cyan border-cyan/40 bg-cyan/5",
  basic: "text-plasma border-plasma/40 bg-plasma/5",
  hit: "text-flame border-flame/40 bg-flame/5",
  spike: "text-ember border-ember/40 bg-ember/5",
  radius: "text-iridescent border-plasma/30 bg-plasma/5",
  grenade: "text-flame border-flame/30 bg-flame/5",
  button: "text-cyan border-cyan/30 bg-cyan/5",
  kill: "text-ember border-ember/40 bg-ember/5",
  kurator: "text-iridescent border-plasma/50 bg-plasma/10",
};

// ─────────────────────────────────────────────────────────────────────
// Очистка
// ─────────────────────────────────────────────────────────────────────

const CLEAR: JbfCommand[] = [
  {
    cmd: "jbf_uaio_clear_basic",
    label: "Удалить все основные эффекты",
    category: "clear",
    kind: "clear",
    params: "[player]",
    notes: "Без аргумента — снимает с себя.",
  },
  {
    cmd: "jbf_uaio_clear_punitive",
    label: "Удалить все наказательные эффекты",
    category: "clear",
    kind: "clear",
    params: "[player]",
    notes: "Заморозка / закопка / искажение / землетрясение и т. п.",
  },
  {
    cmd: "jbf_uaio_clear_other",
    label: "Удалить все другие эффекты",
    category: "clear",
    kind: "clear",
    params: "[player]",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Basic (Обычные)
// ─────────────────────────────────────────────────────────────────────

const BASIC: JbfCommand[] = [
  { cmd: "jbf_uaio_respawn", label: "Возродить", category: "basic", kind: "action", params: "<player>", verb: "возродил" },
  {
    cmd: "jbf_uaio_god",
    label: "Бессмертие",
    category: "basic",
    kind: "toggle",
    verified: true,
    verb: "включил",
    flags: [
      { flag: "-n", label: "ник игрока" },
      { flag: "-g", label: "группа", values: "All / T / CT / Color / Aim" },
      { flag: "-c", label: "форма (для -g Color)", values: "w / b / p / o / gr / g / r" },
      { flag: "-t", label: "время действия (сек.)", values: "число" },
      { flag: "-cn", label: "оповещение в чате", values: "0 / 1" },
      { flag: "-b", label: "действие", values: "0 / 1" },
    ],
    example: "jbf_uaio_god -n Player -b 1",
  },
  { cmd: "jbf_uaio_noclip", label: "Скрытые стены (noclip)", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  {
    cmd: "jbf_uaio_speed",
    label: "Скорость",
    category: "basic",
    kind: "setter",
    params: "<player> <unit> (250 = default)",
    verb: "установил",
    notes: "В логах: «установил 250 юнит. скорости».",
  },
  {
    cmd: "jbf_uaio_gravity",
    label: "Гравитация",
    category: "basic",
    kind: "setter",
    params: "<player> <%> (100 = default)",
    verb: "установил",
  },
  {
    cmd: "jbf_uaio_invisibility",
    label: "Невидимость",
    category: "basic",
    kind: "setter",
    params: "<player> <0..255 alpha>",
    verb: "установил",
    notes: "0 = полностью невидим, 255 = виден.",
  },
  { cmd: "jbf_uaio_antidamage", label: "Антиурон", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  {
    cmd: "jbf_uaio_teleport",
    label: "Телепорт",
    category: "basic",
    kind: "action",
    params: "<player>",
    verb: "телепортировал",
    notes: "Без таргета — телепорт себя на прицел.",
  },
  { cmd: "jbf_uaio_infinity_ammo", label: "Беск. патроны", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_infinity_bpammo", label: "Беск. патроны в запасе", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_infinity_he", label: "Беск. осколочные гранаты", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_infinity_flash", label: "Беск. слеповые гранаты", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_infinity_smoke", label: "Беск. дымовые гранаты", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  {
    cmd: "jbf_uaio_glow",
    label: "Свечение",
    category: "basic",
    kind: "setter",
    params: "<player> [r g b a]",
    verb: "установил",
    notes: "Без RGBA — выключает свечение (0).",
  },
  { cmd: "jbf_uaio_hide_from_radar", label: "Скрыть с радаров", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "скрыл" },
  { cmd: "jbf_uaio_bhop", label: "Распрыжка (bhop)", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  {
    cmd: "jbf_uaio_double_jump",
    label: "Несколько прыжков",
    category: "basic",
    kind: "setter",
    params: "<player> <count>",
    verb: "выдал",
    notes: "0 шт = снять, >0 = разрешить N доп. прыжков в воздухе.",
  },
  { cmd: "jbf_uaio_silent_steps", label: "Бесшумные шаги", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_parachute", label: "Парашют", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "выдал" },
  { cmd: "jbf_uaio_microphone", label: "Микрофон", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "выдал" },
  { cmd: "jbf_uaio_reload_logotip", label: "Обновить логотип", category: "basic", kind: "action", params: "<player>", verb: "обновил" },
  { cmd: "jbf_uaio_reload_ammo", label: "Обновить патроны", category: "basic", kind: "action", params: "<player>", verb: "обновил" },
  {
    cmd: "jbf_uaio_antirecoil",
    label: "Антиотдача (оружие)",
    category: "basic",
    kind: "toggle",
    params: "<player> [0|1]",
    verb: "включил",
  },
  {
    cmd: "jbf_uaio_edit_form",
    label: "Сменить форму",
    category: "basic",
    kind: "setter",
    params: "<player> <team_color | model_slug>",
    verb: "установил",
    notes: "В логах: «установил форму белой команды».",
  },
  { cmd: "jbf_uaio_kill", label: "Убить", category: "basic", kind: "action", params: "<player>", verb: "убил" },
  { cmd: "jbf_uaio_freeze", label: "Заморозить", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "заморозил" },
  { cmd: "jbf_uaio_bury", label: "Закопать", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "закопал" },
  {
    cmd: "jbf_uaio_dealing_damage",
    label: "Нанесение урона",
    category: "basic",
    kind: "setter",
    params: "<player> <hp>",
    verb: "нанёс",
    notes: "Снимает указанное количество HP без триггера death.",
  },
  {
    cmd: "jbf_uaio_distortion_screen",
    label: "Искажение экрана",
    category: "basic",
    kind: "toggle",
    params: "<player> [0|1]",
    verb: "исказил",
  },
  {
    cmd: "jbf_uaio_screen_color",
    label: "Цвет экрана",
    category: "basic",
    kind: "setter",
    params: "<player> <r g b a>",
    verb: "установил",
    notes: "Накладывает цветной фильтр (как при попадании пули).",
  },
  {
    cmd: "jbf_uaio_drugs",
    label: "Наркотики (вертит экран)",
    category: "basic",
    kind: "toggle",
    params: "<player> [0|1]",
    verb: "включил",
  },
  { cmd: "jbf_uaio_slide", label: "Скольжение", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_earthquake", label: "Землетрясение", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  { cmd: "jbf_uaio_disarm", label: "Обезоружить", category: "basic", kind: "action", params: "<player>", verb: "обезоружил" },
  { cmd: "jbf_uaio_block_chat", label: "Заблокировать чат", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "заблокировал" },
  {
    cmd: "jbf_uaio_health",
    label: "Установить здоровье",
    category: "basic",
    kind: "setter",
    params: "<player> <hp>",
    verb: "установил",
    notes: "В логах: «установил 10000 hp».",
  },
  {
    cmd: "jbf_uaio_give_weapon",
    label: "Выдать оружие",
    category: "basic",
    kind: "give",
    params: "<player> <weapon_id|name> [full_mag=1]",
    verb: "выдал",
    notes: "Пример из лога: «выдал SG-550 с полной обоймой».",
  },
  {
    cmd: "jbf_uaio_camera_view",
    label: "Вид камеры",
    category: "basic",
    kind: "setter",
    params: "<player> <0=стандартный | 1=третье лицо>",
    verb: "установил",
  },
  { cmd: "jbf_uaio_wallhack", label: "WallHack (видеть сквозь стены)", category: "basic", kind: "toggle", params: "<player> [0|1]", verb: "включил" },
  {
    cmd: "jbf_uaio_paint",
    label: "Paint (рисование декалями)",
    category: "basic",
    kind: "give",
    params: "<player>",
    verb: "выдал",
  },
  {
    cmd: "jbf_uaio_portal_gun",
    label: "Portal Gun",
    category: "basic",
    kind: "give",
    params: "<player>",
    verb: "выдал",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Hit (применяется когда админ бьёт жертву)
// Параметры идентичны их basic-аналогам — оставляю явный hit-список
// для категоризации в UI.
// ─────────────────────────────────────────────────────────────────────

const HIT: JbfCommand[] = [
  { cmd: "jbf_uaio_hit_reload_ammo", label: "Обновить патроны", category: "hit", kind: "action", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_god", label: "Бессмертие", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_noclip", label: "Скрытые стены", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_speed", label: "Скорость", category: "hit", kind: "setter", params: "<admin> <min | max>", notes: "Пример: «установил скорость удара (0.4 | 1.1)»." },
  { cmd: "jbf_uaio_hit_gravity", label: "Гравитация", category: "hit", kind: "setter", params: "<admin> <%>" },
  { cmd: "jbf_uaio_hit_invisibility", label: "Невидимость", category: "hit", kind: "setter", params: "<admin> <0..255>" },
  { cmd: "jbf_uaio_hit_antidamage", label: "Антиурон", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_teleport", label: "Телепорт", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_infinity_ammo", label: "Беск. патроны", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_infinity_bpammo", label: "Беск. патроны в запасе", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_infinity_he", label: "Беск. осколочные", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_infinity_flash", label: "Беск. слеповые", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_infinity_smoke", label: "Беск. дымовые", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_glow", label: "Свечение", category: "hit", kind: "setter", params: "<admin> [r g b a]" },
  { cmd: "jbf_uaio_hit_hide_from_radar", label: "Скрыть с радаров", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_bhop", label: "Распрыжка", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_double_jump", label: "Несколько прыжков", category: "hit", kind: "setter", params: "<admin> <count>" },
  { cmd: "jbf_uaio_hit_silent_steps", label: "Бесшумные шаги", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_parachute", label: "Парашют", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_microphone", label: "Микрофон", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_reload_logotip", label: "Обновить логотип", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_antirecoil", label: "Антиотдача", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_repulsion", label: "Отталкивание", category: "hit", kind: "setter", params: "<admin> <force>", notes: "Импульс от точки попадания." },
  { cmd: "jbf_uaio_hit_kill", label: "Убить", category: "hit", kind: "toggle", params: "<admin> [0|1]", notes: "Жертва умирает от первого попадания." },
  { cmd: "jbf_uaio_hit_freeze", label: "Заморозить", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_bury", label: "Закопать", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_dealing_damage", label: "Нанесение урона", category: "hit", kind: "setter", params: "<admin> <hp>" },
  { cmd: "jbf_uaio_hit_distortion_screen", label: "Искажение экрана", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_screen_color", label: "Цвет экрана", category: "hit", kind: "setter", params: "<admin> <r g b a>" },
  { cmd: "jbf_uaio_hit_drugs", label: "Наркотики", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_slide", label: "Скольжение", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_earthquake", label: "Землетрясение", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_disarm", label: "Обезоружить", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_health", label: "Установить здоровье", category: "hit", kind: "setter", params: "<admin> <hp>" },
  { cmd: "jbf_uaio_hit_give_weapon", label: "Выдать оружие", category: "hit", kind: "give", params: "<admin> <weapon_id>" },
  { cmd: "jbf_uaio_hit_camera_view", label: "Вид камеры", category: "hit", kind: "setter", params: "<admin> <0|1>" },
  { cmd: "jbf_uaio_hit_wallhack", label: "WallHack", category: "hit", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_hit_edit_form", label: "Сменить форму", category: "hit", kind: "setter", params: "<admin> <team|model>" },
];

// ─────────────────────────────────────────────────────────────────────
// Spike (триггер на чем-то — обычно area_trigger в jail-картах)
// ─────────────────────────────────────────────────────────────────────

const SPIKE: JbfCommand[] = [
  { cmd: "jbf_uaio_spike_god", label: "Бессмертие", category: "spike", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_spike_noclip", label: "Скрытые стены", category: "spike", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_spike_speed", label: "Скорость", category: "spike", kind: "setter", params: "<admin> <unit>" },
  { cmd: "jbf_uaio_spike_gravity", label: "Гравитация", category: "spike", kind: "setter", params: "<admin> <%>" },
  { cmd: "jbf_uaio_spike_invisibility", label: "Невидимость", category: "spike", kind: "setter", params: "<admin> <0..255>" },
  { cmd: "jbf_uaio_spike_repulsion", label: "Отталкивание", category: "spike", kind: "setter", params: "<admin> <force>" },
  { cmd: "jbf_uaio_spike_freeze", label: "Заморозить", category: "spike", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_spike_edit_form", label: "Сменить форму", category: "spike", kind: "setter", params: "<admin> <team|model>" },
];

// ─────────────────────────────────────────────────────────────────────
// Radius (всё что в радиусе вокруг админа / точки)
// ─────────────────────────────────────────────────────────────────────

const RADIUS: JbfCommand[] = [
  { cmd: "jbf_uaio_radius_god", label: "Бессмертие", category: "radius", kind: "setter", params: "<admin> <radius>" },
  { cmd: "jbf_uaio_radius_noclip", label: "Скрытые стены", category: "radius", kind: "setter", params: "<admin> <radius>" },
  { cmd: "jbf_uaio_radius_speed", label: "Скорость", category: "radius", kind: "setter", params: "<admin> <radius> <unit>" },
  { cmd: "jbf_uaio_radius_gravity", label: "Гравитация", category: "radius", kind: "setter", params: "<admin> <radius> <%>" },
  { cmd: "jbf_uaio_radius_invisibility", label: "Невидимость", category: "radius", kind: "setter", params: "<admin> <radius> <0..255>" },
  { cmd: "jbf_uaio_radius_repulsion", label: "Отталкивание", category: "radius", kind: "setter", params: "<admin> <radius> <force>" },
  { cmd: "jbf_uaio_radius_dealing_damage", label: "Нанесение урона", category: "radius", kind: "setter", params: "<admin> <radius> <hp>" },
  { cmd: "jbf_uaio_radius_health", label: "Установить здоровье", category: "radius", kind: "setter", params: "<admin> <radius> <hp>" },
  { cmd: "jbf_uaio_radius_edit_form", label: "Сменить форму", category: "radius", kind: "setter", params: "<admin> <radius> <team|model>" },
];

// ─────────────────────────────────────────────────────────────────────
// Grenade (на взрыве гранаты админа)
// ─────────────────────────────────────────────────────────────────────

const GRENADE: JbfCommand[] = [
  { cmd: "jbf_uaio_grenade_speed", label: "Скорость", category: "grenade", kind: "setter", params: "<admin> <unit>" },
  { cmd: "jbf_uaio_grenade_teleport", label: "Телепорт", category: "grenade", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_grenade_dealing_damage", label: "Нанесение урона", category: "grenade", kind: "setter", params: "<admin> <hp>" },
  { cmd: "jbf_uaio_grenade_disarm", label: "Обезоружить", category: "grenade", kind: "toggle", params: "<admin> [0|1]" },
];

// ─────────────────────────────────────────────────────────────────────
// Button (на server-button у карты)
// ─────────────────────────────────────────────────────────────────────

const BUTTON: JbfCommand[] = [
  { cmd: "jbf_uaio_button_longjump", label: "Длинный прыжок", category: "button", kind: "toggle", params: "<admin> [0|1]" },
  { cmd: "jbf_uaio_button_speed", label: "Скорость", category: "button", kind: "setter", params: "<admin> <unit>" },
  { cmd: "jbf_uaio_button_teleport", label: "Телепорт", category: "button", kind: "toggle", params: "<admin> [0|1]" },
];

// ─────────────────────────────────────────────────────────────────────
// Kill (на любое убийство админом)
// ─────────────────────────────────────────────────────────────────────

const KILL: JbfCommand[] = [
  {
    cmd: "jbf_uaio_kill_vampirizm",
    label: "Вампиризм",
    category: "kill",
    kind: "setter",
    params: "<admin> <hp_per_kill>",
    notes: "На фраг забирает HP жертвы / даёт админу.",
  },
];

// ─────────────────────────────────────────────────────────────────────
// Куратор (выдать кому-то всё меню)
// ─────────────────────────────────────────────────────────────────────

const KURATOR: JbfCommand[] = [
  {
    cmd: "jbf_uaio_kurator_uaio",
    label: "Выдать глобальное меню",
    category: "kurator",
    kind: "give",
    params: "<player> <minutes | 0=карта>",
    notes:
      "Получивший автоматически открывает меню как куратор. 0 — действует на текущую карту.",
  },
];

export const JBF_COMMANDS: JbfCommand[] = [
  ...CLEAR,
  ...BASIC,
  ...HIT,
  ...SPIKE,
  ...RADIUS,
  ...GRENADE,
  ...BUTTON,
  ...KILL,
  ...KURATOR,
];

export function groupJbfCommands(): Record<JbfCategory, JbfCommand[]> {
  const out = {} as Record<JbfCategory, JbfCommand[]>;
  for (const c of JBF_COMMANDS) {
    (out[c.category] ||= []).push(c);
  }
  return out;
}
