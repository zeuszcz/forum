/*  jbf_position_dump.sma — endless·war
 *
 *  Streams in-game state to the forum's cs-log-listener via `log_message`
 *  so the forum's /live page can render a live top-down view, attribute
 *  kills, drive a round-timer overlay, etc.
 *
 *  Line formats emitted:
 *    JBF_MAP|<map_name>
 *    JBF_POS|userid|x|y|z|yaw|team|hp|money|weapon|kills|deaths|flags|nick
 *      (every jbf_pos_interval seconds, one line per connected player)
 *    JBF_KILL|killer_userid|kx|ky|victim_userid|vx|vy|weapon|hs|killer_nick|victim_nick
 *      (one per DeathMsg event)
 *    JBF_ROUND|start|<roundtime_seconds>
 *    JBF_ROUND|end
 *
 *  CVARS:
 *    jbf_pos_interval   float  default 2.0 — dump period in seconds
 *    jbf_pos_enabled    int    default 1   — toggle (1=on, 0=off)
 *
 *  Modules required:  amxmodx, fakemeta, cstrike  (cstrike for money cvar).
 */

#include <amxmodx>
#include <amxmisc>
#include <fakemeta>
#include <cstrike>

#define PLUGIN_NAME    "JBF Position Dump"
#define PLUGIN_VERSION "0.2.0"
#define PLUGIN_AUTHOR  "endless-war"

#define TASK_DUMP_ID   2410

new g_cv_interval;
new g_cv_enabled;

new g_last_map[32];

public plugin_init()
{
    register_plugin(PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_AUTHOR);

    g_cv_interval = register_cvar("jbf_pos_interval", "2.0");
    g_cv_enabled  = register_cvar("jbf_pos_enabled",  "1");

    register_concmd("amx_pos_dump",   "cmd_force_dump", ADMIN_RCON,
        "- force one position dump now");
    register_concmd("amx_pos_toggle", "cmd_toggle",     ADMIN_RCON,
        "- toggle the periodic dump on/off");

    new Float:interval = get_pcvar_float(g_cv_interval);
    if (interval < 0.5) interval = 0.5;
    set_task(interval, "task_dump", TASK_DUMP_ID, _, _, "b");

    // Death + round event hooks — fire JBF_KILL and JBF_ROUND lines.
    // DeathMsg fires once per kill, with the killer / victim ids and the
    // weapon string already in read_data slots.
    register_event("DeathMsg",  "event_death",       "a");
    register_logevent("event_round_start", 2, "1=Round_Start");
    register_logevent("event_round_end",   2, "1=Round_End");

    emit_map();
}

public plugin_cfg()
{
    emit_map();
}

public client_putinserver(/* id */)
{
    emit_map();
}

emit_map()
{
    static map_name[32];
    get_mapname(map_name, charsmax(map_name));
    if (map_name[0] == 0) return;
    if (equal(map_name, g_last_map)) return;
    copy(g_last_map, charsmax(g_last_map), map_name);
    log_message("JBF_MAP|%s", map_name);
}

public task_dump()
{
    if (get_pcvar_num(g_cv_enabled) == 0) return;
    dump_positions();
}

public cmd_force_dump(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    dump_positions();
    console_print(id, "[JBF] position dump triggered");
    return PLUGIN_HANDLED;
}

public cmd_toggle(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new on = get_pcvar_num(g_cv_enabled) == 0 ? 1 : 0;
    set_pcvar_num(g_cv_enabled, on);
    console_print(id, "[JBF] position dump: %s", on ? "ON" : "OFF");
    return PLUGIN_HANDLED;
}

dump_positions()
{
    new players[32], num;
    get_players(players, num, "ch");
    if (num == 0) return;

    new Float:origin[3];
    new Float:angles[3];
    new name[32];
    new wpn_name[32];
    new clip;
    new ammo;
    for (new i = 0; i < num; i++)
    {
        new id = players[i];
        pev(id, pev_origin, origin);
        pev(id, pev_v_angle, angles);
        get_user_name(id, name, charsmax(name));
        sanitize_field(name, charsmax(name));

        new userid = get_user_userid(id);
        new team   = get_user_team(id);
        new hp     = get_user_health(id);
        new money  = cs_get_user_money(id);
        new wpn    = get_user_weapon(id, clip, ammo);
        new kills  = get_user_frags(id);
        new deaths = get_user_deaths(id);
        new flags  = get_user_flags(id);

        // get_weaponname returns "weapon_ak47" style. We trim the prefix
        // here so the frontend doesn't have to.
        if (wpn > 0) {
            get_weaponname(wpn, wpn_name, charsmax(wpn_name));
            // strip leading "weapon_" if present
            if (equali(wpn_name, "weapon_", 7))
                copy(wpn_name, charsmax(wpn_name), wpn_name[7]);
        } else {
            wpn_name[0] = 0;
        }
        sanitize_field(wpn_name, charsmax(wpn_name));

        new Float:yaw = angles[1];

        log_message(
            "JBF_POS|%d|%.0f|%.0f|%.0f|%.0f|%d|%d|%d|%s|%d|%d|%d|%s",
            userid,
            origin[0], origin[1], origin[2],
            yaw,
            team,
            hp,
            money,
            wpn_name,
            kills,
            deaths,
            flags,
            name
        );
    }
}

public event_death()
{
    new killer = read_data(1);
    new victim = read_data(2);
    new hs     = read_data(3);
    static wpn[32];
    read_data(4, wpn, charsmax(wpn));
    sanitize_field(wpn, charsmax(wpn));

    if (victim == 0) return;

    new Float:k_origin[3], Float:v_origin[3];
    new k_name[32], v_name[32];

    if (killer == 0 || killer == victim)
    {
        // World kill or suicide — no killer position. Emit with killer_id=0
        // and (0,0) origin so frontend can still tag the death.
        k_origin[0] = 0.0;
        k_origin[1] = 0.0;
        copy(k_name, charsmax(k_name), "");
    }
    else
    {
        pev(killer, pev_origin, k_origin);
        get_user_name(killer, k_name, charsmax(k_name));
        sanitize_field(k_name, charsmax(k_name));
    }

    pev(victim, pev_origin, v_origin);
    get_user_name(victim, v_name, charsmax(v_name));
    sanitize_field(v_name, charsmax(v_name));

    log_message(
        "JBF_KILL|%d|%.0f|%.0f|%d|%.0f|%.0f|%s|%d|%s|%s",
        killer ? get_user_userid(killer) : 0,
        k_origin[0], k_origin[1],
        get_user_userid(victim),
        v_origin[0], v_origin[1],
        wpn, hs,
        k_name, v_name
    );
}

public event_round_start()
{
    new Float:rt = get_cvar_float("mp_roundtime");
    // CS 1.6 stores mp_roundtime in minutes; convert to seconds. Clamp at
    // 600 just in case of a misconfigured server (e.g. 99 min cvar).
    new Float:rs = rt * 60.0;
    if (rs <= 0.0) rs = 180.0;
    if (rs > 600.0) rs = 600.0;
    log_message("JBF_ROUND|start|%.1f", rs);
}

public event_round_end()
{
    log_message("JBF_ROUND|end");
}

sanitize_field(buf[], len)
{
    new j = 0;
    while (j < len && buf[j] != 0)
    {
        if (buf[j] == '|') buf[j] = '/';
        j++;
    }
}
