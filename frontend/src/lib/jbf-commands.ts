/** Catalogue of jbf_uaio_modular admin-menu commands.
 *
 * Every entry below has been verified against the plugin's own usage
 * output (captured via infra/cs-log-poller/usage_dump.py + condump in
 * a player console). Commands whose flag signatures aren't yet verified
 * are intentionally omitted — once they're dumped, append them here.
 *
 * Flag conventions used by the plugin (universal across most commands):
 *   -n   ник игрока — exact match
 *   -g   группа     — All / T / CT / Color / Aim
 *   -c   форма для -g Color — w / b / p / o / gr / g / r
 *   -t   время действия (сек)
 *   -cn  оповещение в чате (1/0)
 *   -b   действие (1/0) — толгл вкл/выкл
 *   -i   value (число) — meaning depends on command (speed, gravity, hp…)
 *   -ty  тип — enum specific to each command
 */

export type JbfCategory = "clear" | "basic";
export type JbfKind = "toggle" | "setter" | "action" | "give" | "clear";

export interface JbfFlag {
  /** Flag name as the plugin expects it, e.g. "-n", "-g", "-b". */
  flag: string;
  /** Human-readable description shown in the card. */
  label: string;
  /** Value vocabulary or example, e.g. "All / T / CT / Color / Aim". */
  values?: string;
}

export interface JbfCommand {
  cmd: string;
  label: string;
  category: JbfCategory;
  kind: JbfKind;
  flags: JbfFlag[];
  /** Example invocation the plugin shows after the flag list. */
  example: string;
  /** Past-tense verb the plugin uses when announcing this action in logs. */
  verb?: string;
  notes?: string;
}

export const JBF_CATEGORY_LABEL: Record<JbfCategory, string> = {
  clear: "Очистка эффектов",
  basic: "Обычные",
};

export const JBF_CATEGORY_TONE: Record<JbfCategory, string> = {
  clear: "text-cyan border-cyan/40 bg-cyan/5",
  basic: "text-plasma border-plasma/40 bg-plasma/5",
};

// ─────────────────────────────────────────────────────────────────────
// Common flag fragments used across multiple commands. Keep ordering
// consistent so cards look uniform.
// ─────────────────────────────────────────────────────────────────────

const F_N: JbfFlag = { flag: "-n", label: "ник игрока" };
const F_G_FULL: JbfFlag = { flag: "-g", label: "группа", values: "All / T / CT / Color / Aim" };
const F_G_NOAIM: JbfFlag = { flag: "-g", label: "группа", values: "All / T / CT / Color" };
const F_C: JbfFlag = {
  flag: "-c",
  label: "форма (для -g Color)",
  values: "w / b / p / o / gr / g / r",
};
const F_T: JbfFlag = { flag: "-t", label: "время действия", values: "число (сек)" };
const F_CN: JbfFlag = { flag: "-cn", label: "оповещение в чате", values: "1 / 0" };
const F_B: JbfFlag = { flag: "-b", label: "действие", values: "1 / 0" };

// ─────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────

export const JBF_COMMANDS: JbfCommand[] = [
  // ── clear ──────────────────────────────────────────────────────────
  {
    cmd: "jbf_uaio_clear_basic",
    label: "Очистить основные эффекты",
    category: "clear",
    kind: "clear",
    flags: [F_N, F_G_FULL, F_C],
    example: "jbf_uaio_clear_basic -n Player",
  },
  {
    cmd: "jbf_uaio_clear_punitive",
    label: "Очистить наказательные эффекты",
    category: "clear",
    kind: "clear",
    flags: [F_N, F_G_FULL, F_C],
    example: "jbf_uaio_clear_punitive -n Player",
  },
  {
    cmd: "jbf_uaio_clear_other",
    label: "Очистить другие эффекты",
    category: "clear",
    kind: "clear",
    flags: [F_N, F_G_FULL, F_C],
    example: "jbf_uaio_clear_other -n Player",
  },

  // ── basic ──────────────────────────────────────────────────────────
  {
    cmd: "jbf_uaio_respawn",
    label: "Возродить",
    category: "basic",
    kind: "action",
    verb: "возродил",
    flags: [
      F_N,
      F_G_NOAIM,
      F_C,
      F_T,
      F_CN,
      {
        flag: "-ty",
        label: "тип",
        values: "0-3 = обычный / координаты / прицел / место смерти",
      },
      { flag: "-pc", label: "координаты", values: "x y z" },
    ],
    example: "jbf_uaio_respawn -n Player -t 5 -ty 3",
  },
  {
    cmd: "jbf_uaio_god",
    label: "Бессмертие",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_god -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_noclip",
    label: "Скрыть стены",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_noclip -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_speed",
    label: "Скорость",
    category: "basic",
    kind: "setter",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      { flag: "-i", label: "скорость", values: "число (250 = дефолт)" },
    ],
    example: "jbf_uaio_speed -n Player -i 350",
  },
  {
    cmd: "jbf_uaio_gravity",
    label: "Гравитация",
    category: "basic",
    kind: "setter",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      { flag: "-i", label: "гравитация", values: "число (100 = дефолт)" },
    ],
    example: "jbf_uaio_gravity -n Player -i 20",
  },
  {
    cmd: "jbf_uaio_invisibility",
    label: "Невидимость",
    category: "basic",
    kind: "setter",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      { flag: "-i", label: "невидимость", values: "0-255 (0 = полностью невидим)" },
    ],
    example: "jbf_uaio_invisibility -n Player -i 90",
  },
  {
    cmd: "jbf_uaio_antidamage",
    label: "Антиурон",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-cru", label: "раздавить", values: "1 / 0" },
      { flag: "-bul", label: "выстрел", values: "1 / 0" },
      { flag: "-bur", label: "поджог", values: "1 / 0" },
      { flag: "-fre", label: "переохлаждение", values: "1 / 0" },
      { flag: "-fal", label: "падение", values: "1 / 0" },
      { flag: "-bla", label: "взрыв", values: "1 / 0" },
      { flag: "-sho", label: "электричество", values: "1 / 0" },
      { flag: "-son", label: "звуковая волна", values: "1 / 0" },
      { flag: "-ene", label: "лазер", values: "1 / 0" },
      { flag: "-dro", label: "утопление", values: "1 / 0" },
      { flag: "-poi", label: "отравление", values: "1 / 0" },
      { flag: "-rad", label: "радиация", values: "1 / 0" },
      { flag: "-aci", label: "химические вещества", values: "1 / 0" },
      { flag: "-gre", label: "взрыв гранаты", values: "1 / 0" },
    ],
    example: "jbf_uaio_antidamage -n Player -fal 1 -gre 1",
    notes: "Без -b можно включать только отдельные виды урона через флаги-фильтры.",
  },
  {
    cmd: "jbf_uaio_teleport",
    label: "Телепорт",
    category: "basic",
    kind: "action",
    verb: "телепортировал",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_CN,
      { flag: "-pc", label: "координаты", values: "x y z" },
      { flag: "-tys", label: "тип установки", values: "0-1 = по месту / по прицелу" },
      { flag: "-ty", label: "тип", values: "0-2 = координаты / прицел / замена" },
    ],
    example: "jbf_uaio_teleport -n Player -ty 2",
  },
  {
    cmd: "jbf_uaio_infinity_ammo",
    label: "Беск. патроны",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_infinity_ammo -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_infinity_he",
    label: "Беск. осколочные",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_infinity_he -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_infinity_flash",
    label: "Беск. слеповые",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_infinity_flash -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_infinity_smoke",
    label: "Беск. дымовые",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_infinity_smoke -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_glow",
    label: "Свечение",
    category: "basic",
    kind: "setter",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      {
        flag: "-v",
        label: "готовый цвет",
        values: "w / b / p / o / g / r (белый/синий/фиолетовый/оранжевый/зелёный/красный)",
      },
      { flag: "-i", label: "кастомный цвет", values: "R G B" },
      { flag: "-d", label: "плотность", values: "число" },
    ],
    example: "jbf_uaio_glow -n Player -i 255 0 128",
  },
  {
    cmd: "jbf_uaio_hide_from_radar",
    label: "Скрыть с радаров",
    category: "basic",
    kind: "toggle",
    verb: "скрыл",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_hide_from_radar -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_bhop",
    label: "Распрыжка",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-v", label: "ускорение", values: "число" },
    ],
    example: "jbf_uaio_bhop -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_double_jump",
    label: "Несколько прыжков",
    category: "basic",
    kind: "setter",
    verb: "выдал",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      { flag: "-v", label: "количество прыжков", values: "число" },
      { flag: "-i", label: "интервал", values: "число" },
      { flag: "-pj", label: "сила прыжка", values: "число" },
      { flag: "-ic", label: "информация в чате", values: "1 / 0" },
    ],
    example: "jbf_uaio_double_jump -n Player -v 15",
  },
  {
    cmd: "jbf_uaio_silent_steps",
    label: "Бесшумные шаги",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_silent_steps -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_parachute",
    label: "Парашют",
    category: "basic",
    kind: "toggle",
    verb: "выдал",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-v", label: "притяжение", values: "число" },
      { flag: "-vs", label: "ускорение стрейфами", values: "число" },
      { flag: "-s", label: "скин", values: "-1 / 0 = без скина / логотип FF" },
    ],
    example: "jbf_uaio_parachute -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_microphone",
    label: "Микрофон",
    category: "basic",
    kind: "toggle",
    verb: "выдал",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-ty", label: "тип", values: "0-1 = на раунд / на карту" },
      { flag: "-m", label: "меню", values: "0-2 = живые / мёртвые / все" },
    ],
    example: "jbf_uaio_microphone -n Player -b 1 -ty 1",
  },
  {
    cmd: "jbf_uaio_reload_logotip",
    label: "Обновить логотип",
    category: "basic",
    kind: "action",
    verb: "обновил",
    flags: [F_N, F_G_FULL, F_C, F_CN],
    example: "jbf_uaio_reload_logotip -n Player",
  },
  {
    cmd: "jbf_uaio_reload_ammo",
    label: "Обновить патроны",
    category: "basic",
    kind: "action",
    verb: "обновил",
    flags: [F_N, F_G_FULL, F_C, F_CN],
    example: "jbf_uaio_reload_ammo -n Player",
  },
  {
    cmd: "jbf_uaio_antirecoil",
    label: "Антиотдача (оружие)",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_antirecoil -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_edit_form",
    label: "Сменить форму",
    category: "basic",
    kind: "setter",
    verb: "сменил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_CN,
      { flag: "-f", label: "форма", values: "w / b / p / o / gr / g / r / s / ct / z" },
    ],
    example: "jbf_uaio_edit_form -n Player -f w",
  },
  {
    cmd: "jbf_uaio_kill",
    label: "Убить",
    category: "basic",
    kind: "action",
    verb: "убил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_CN,
      { flag: "-sk", label: "бесшумное убийство", values: "1 / 0" },
    ],
    example: "jbf_uaio_kill -n Player",
  },
  {
    cmd: "jbf_uaio_freeze",
    label: "Заморозить",
    category: "basic",
    kind: "toggle",
    verb: "заморозил",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_freeze -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_bury",
    label: "Закопать",
    category: "basic",
    kind: "toggle",
    verb: "закопал",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_bury -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_dealing_damage",
    label: "Нанесение урона",
    category: "basic",
    kind: "toggle",
    verb: "нанёс",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-d", label: "урон", values: "число" },
      { flag: "-i", label: "интервал", values: "число" },
      { flag: "-ty", label: "тип", values: "0-1 = поджог / отравление" },
      { flag: "-k", label: "убивать", values: "1 / 0" },
    ],
    example: "jbf_uaio_dealing_damage -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_distortion_screen",
    label: "Искажение экрана",
    category: "basic",
    kind: "toggle",
    verb: "исказил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-v", label: "значение", values: "Y X Z" },
      { flag: "-ty", label: "тип", values: "0-1 = фиксированный / плавный" },
    ],
    example: "jbf_uaio_distortion_screen -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_screen_color",
    label: "Цвет экрана",
    category: "basic",
    kind: "setter",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-v", label: "цвет", values: "R G B" },
      { flag: "-cl", label: "прозрачность", values: "число" },
      { flag: "-m", label: "меню", values: "0-2 = живые / мёртвые / все" },
    ],
    example: "jbf_uaio_screen_color -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_drugs",
    label: "Наркотики",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-i", label: "FOV", values: "число" },
      { flag: "-m", label: "меню", values: "0-2 = живые / мёртвые / все" },
    ],
    example: "jbf_uaio_drugs -n Player -i 180",
  },
  {
    cmd: "jbf_uaio_slide",
    label: "Скольжение",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-p", label: "сила", values: "число" },
    ],
    example: "jbf_uaio_slide -n Player -p 10",
  },
  {
    cmd: "jbf_uaio_earthquake",
    label: "Землетрясение",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-i", label: "значение", values: "число" },
    ],
    example: "jbf_uaio_earthquake -n Player -i 16",
  },
  {
    cmd: "jbf_uaio_disarm",
    label: "Обезоружить",
    category: "basic",
    kind: "action",
    verb: "обезоружил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_CN,
      { flag: "-s1", label: "основной слот", values: "1 / 0" },
      { flag: "-s2", label: "пистолеты", values: "1 / 0" },
      { flag: "-s3", label: "кулаки", values: "1 / 0" },
      { flag: "-s4", label: "гранаты", values: "1 / 0" },
    ],
    example: "jbf_uaio_disarm -n Player -s1 1",
  },
  {
    cmd: "jbf_uaio_block_chat",
    label: "Заблокировать чат",
    category: "basic",
    kind: "toggle",
    verb: "заблокировал",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-ty", label: "тип", values: "0-1 = на раунд / на карту" },
      { flag: "-m", label: "меню", values: "0-2 = живые / мёртвые / все" },
      { flag: "-tych", label: "тип чата", values: "0-2 = все / общий / командный" },
      { flag: "-prohi_ph", label: "запрещающая фраза", values: "текст" },
    ],
    example: "jbf_uaio_block_chat -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_health",
    label: "Установить здоровье",
    category: "basic",
    kind: "setter",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_CN,
      { flag: "-i", label: "здоровье", values: "+число / -число / число" },
    ],
    example: "jbf_uaio_health -n Player -i 150",
  },
  {
    cmd: "jbf_uaio_give_weapon",
    label: "Выдать оружие",
    category: "basic",
    kind: "give",
    verb: "выдал",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_CN,
      {
        flag: "-ty",
        label: "тип",
        values: "0-2 = без патронов / с патронами / полная обойма",
      },
      { flag: "-am", label: "патроны в магазине", values: "число" },
      { flag: "-bpam", label: "патроны в запасе", values: "число" },
      { flag: "-cg", label: "количество гранат", values: "число" },
      { flag: "-h", label: "каска", values: "1 / 0" },
      { flag: "-ar", label: "бронежилет", values: "число" },
      { flag: "-wv", label: "оружие (категория и слот)", values: "число" },
      { flag: "-wn", label: "оружие (название)", values: "текст" },
    ],
    example: "jbf_uaio_give_weapon -n Player",
  },
  {
    cmd: "jbf_uaio_camera_view",
    label: "Вид камеры",
    category: "basic",
    kind: "toggle",
    verb: "установил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      { flag: "-p", label: "координаты", values: "X Y Z" },
      { flag: "-ty", label: "тип", values: "0-2 = координаты / игрок / граната" },
      { flag: "-wp", label: "игрок", values: "0 = себя / ник" },
      { flag: "-d", label: "дальность", values: "число" },
      { flag: "-v", label: "вид", values: "0-3 = сзади / спереди / слева / справа" },
      { flag: "-mm", label: "движение мышкой", values: "1 / 0" },
      { flag: "-va", label: "угол обзора", values: "число" },
    ],
    example: "jbf_uaio_camera_view -n Player -b 1 -ty 1",
  },
  {
    cmd: "jbf_uaio_wallhack",
    label: "WallHack",
    category: "basic",
    kind: "toggle",
    verb: "включил",
    flags: [
      F_N,
      F_G_FULL,
      F_C,
      F_T,
      F_CN,
      F_B,
      {
        flag: "-ty",
        label: "тип",
        values: "0-4 = все / заключённые / охрана / своя команда / чужая команда",
      },
      { flag: "-d", label: "минимальная дистанция", values: "число" },
      { flag: "-m", label: "меню", values: "0-2 = живые / мёртвые / все" },
    ],
    example: "jbf_uaio_wallhack -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_paint",
    label: "Выдать paint",
    category: "basic",
    kind: "give",
    verb: "выдал",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_paint -n Player -b 1",
  },
  {
    cmd: "jbf_uaio_portal_gun",
    label: "Выдать Portal Gun",
    category: "basic",
    kind: "give",
    verb: "выдал",
    flags: [F_N, F_G_FULL, F_C, F_T, F_CN, F_B],
    example: "jbf_uaio_portal_gun -n Player -b 1",
  },
];

export function groupJbfCommands(): Record<JbfCategory, JbfCommand[]> {
  const out: Record<JbfCategory, JbfCommand[]> = { clear: [], basic: [] };
  for (const c of JBF_COMMANDS) {
    out[c.category].push(c);
  }
  return out;
}
