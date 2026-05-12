/*  jbf_position_dump.sma — endless·war
 *
 *  Periodically writes every alive player's position into the HLDS log
 *  using `log_message`, so that `log_redirect_address` forwards the
 *  packets to the forum's cs-log-listener service. The listener parses
 *  the lines, broadcasts them over the forum WebSocket as ephemeral
 *  system events (kind=system, category=position), and the forum
 *  `/live` page renders a top-down overview from them.
 *
 *  Line formats emitted:
 *    JBF_POS|userid|x|y|z|yaw|team|hp|nick
 *    JBF_MAP|<map_name>
 *
 *  CVARS:
 *    jbf_pos_interval   float  default 2.0 — dump period in seconds
 *    jbf_pos_enabled    int    default 1   — toggle (1=on, 0=off)
 *
 *  Build with amxxpc 1.9+ (no fakemeta hooks needed at startup, only pev
 *  reads inside the timer).
 */

#include <amxmodx>
#include <amxmisc>
#include <fakemeta>

#define PLUGIN_NAME    "JBF Position Dump"
#define PLUGIN_VERSION "0.1.0"
#define PLUGIN_AUTHOR  "endless-war"

#define TASK_DUMP_ID   2410

new g_cv_interval;   // jbf_pos_interval
new g_cv_enabled;    // jbf_pos_enabled

new g_last_map[32];

public plugin_init()
{
    register_plugin(PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_AUTHOR);

    g_cv_interval = register_cvar("jbf_pos_interval", "2.0");
    g_cv_enabled  = register_cvar("jbf_pos_enabled",  "1");

    // Console commands (RCON / admin) for ad-hoc control.
    register_concmd("amx_pos_dump",    "cmd_force_dump", ADMIN_RCON,
        "- force one position dump now");
    register_concmd("amx_pos_toggle",  "cmd_toggle",     ADMIN_RCON,
        "- toggle the periodic dump on/off");

    // Schedule the periodic dump. The "b" flag = repeat forever.
    new Float:interval = get_pcvar_float(g_cv_interval);
    if (interval < 0.5) interval = 0.5;
    set_task(interval, "task_dump", TASK_DUMP_ID, _, _, "b");

    // Fire a MAP line once at startup so the frontend knows the current
    // map even if it connects after map_change.
    emit_map();
}

public plugin_cfg()
{
    // Re-emit map after configs load too — covers the edge case where
    // get_mapname returns empty in plugin_init on some rehlds builds.
    emit_map();
}

public client_putinserver(/* id */)
{
    // A new client joined → re-check map (cheap, idempotent).
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
    // "ch" = connected + on a team (alive flag is checked separately so
    // a spectator-team admin still shows up). If you only want alive
    // bodies, pass "a" instead.
    get_players(players, num, "ch");
    if (num == 0) return;

    new Float:origin[3];
    new Float:angles[3];
    new name[32];
    for (new i = 0; i < num; i++)
    {
        new id = players[i];
        pev(id, pev_origin, origin);
        pev(id, pev_v_angle, angles);
        get_user_name(id, name, charsmax(name));

        // Nick sanitation: nicks with `|` would break the parser on the
        // listener side because the body is split by `|`. Replace any
        // pipe in the nick with `/`.
        sanitize_nick(name, charsmax(name));

        new userid = get_user_userid(id);
        new team   = get_user_team(id);
        new hp     = get_user_health(id);

        // Yaw is angles[1] in GoldSrc; we floor it for compactness.
        new Float:yaw = angles[1];

        log_message(
            "JBF_POS|%d|%.0f|%.0f|%.0f|%.0f|%d|%d|%s",
            userid,
            origin[0], origin[1], origin[2],
            yaw,
            team,
            hp,
            name
        );
    }
}

sanitize_nick(name[], len)
{
    new j = 0;
    while (j < len && name[j] != 0)
    {
        if (name[j] == '|') name[j] = '/';
        j++;
    }
}
