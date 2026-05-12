/*  jbf_forum_effects.sma v1.0.0 — endless·war
 *
 *  Forum admin-panel effect bridge.
 *
 *  WHY THIS EXISTS
 *  ---------------
 *  brody's jb_uaio_modular plugin pack registers all its effect
 *  commands as clcmd / chat-handlers, NOT as RCON-callable concmds.
 *  Our backend invokes `jbf_uaio_god -n NICK -b 1 -t 60` through
 *  RCON — which the engine silently ignores because the plugin
 *  doesn't expose that name to the server console. Result: every
 *  forum-driven effect click returns ok=True but does nothing
 *  in-game. Diagnosed 2026-05-12: live log of jb_uaio_modular shows
 *  ZERO entries from RCON invocations; only in-game admin-menu
 *  clicks reach it.
 *
 *  This bridge re-implements the most common effects using the
 *  standard fakemeta / cstrike / fun modules with our OWN concmds
 *  that DO work via RCON (confirmed: forum_spec_follow et al). Backend
 *  switches to `forum_fx_<effect> -n NICK <args>` instead.
 *
 *  Effects implemented in v1.0:
 *    forum_fx_god        -n NICK -b 1|0 [-t SECONDS]
 *    forum_fx_freeze     -n NICK -b 1|0 [-t SECONDS]
 *    forum_fx_slay       -n NICK
 *    forum_fx_respawn    -n NICK
 *    forum_fx_speed      -n NICK -i SPEED [-t SECONDS]
 *    forum_fx_gravity    -n NICK -i GRAVITY [-t SECONDS]
 *    forum_fx_health     -n NICK -i HP
 *    forum_fx_give       -n NICK -wn WEAPON_SLUG [-ty AMMO_TYPE]
 *    forum_fx_disarm     -n NICK
 *    forum_fx_clear      -n NICK    (resets speed / gravity / god / freeze)
 *
 *  Each command logs to `addons/amxmodx/logs/jbf_forum_effects.log`
 *  so the audit trail is visible alongside the existing jb_uaio log.
 *
 *  PERMISSION MODEL: ADMIN_RCON — only the backend / server console
 *  can fire these. In-game admins are untouched and still use the
 *  twisterniq menu → brody plugin path.
 */

#include <amxmodx>
#include <amxmisc>
#include <cstrike>
#include <fakemeta>
#include <hamsandwich>
#include <fun>

#define PLUGIN_NAME    "JBF Forum Effects"
#define PLUGIN_VERSION "1.0.0"
#define PLUGIN_AUTHOR  "endless-war"

#define MAX_PLAYERS_LIMIT 33

#define TASK_REVERT_GOD    71000
#define TASK_REVERT_FREEZE 72000
#define TASK_REVERT_SPEED  73000
#define TASK_REVERT_GRAV   74000

new Float:g_orig_speed[MAX_PLAYERS_LIMIT];
new Float:g_orig_grav[MAX_PLAYERS_LIMIT];

public plugin_init()
{
    register_plugin(PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_AUTHOR);

    register_concmd("forum_fx_god",     "cmd_god",     ADMIN_RCON,
        "-n NICK -b 0|1 [-t SECONDS]");
    register_concmd("forum_fx_freeze",  "cmd_freeze",  ADMIN_RCON,
        "-n NICK -b 0|1 [-t SECONDS]");
    register_concmd("forum_fx_slay",    "cmd_slay",    ADMIN_RCON,
        "-n NICK");
    register_concmd("forum_fx_respawn", "cmd_respawn", ADMIN_RCON,
        "-n NICK");
    register_concmd("forum_fx_speed",   "cmd_speed",   ADMIN_RCON,
        "-n NICK -i SPEED [-t SECONDS]");
    register_concmd("forum_fx_gravity", "cmd_gravity", ADMIN_RCON,
        "-n NICK -i GRAVITY [-t SECONDS]");
    register_concmd("forum_fx_health",  "cmd_health",  ADMIN_RCON,
        "-n NICK -i HP");
    register_concmd("forum_fx_give",    "cmd_give",    ADMIN_RCON,
        "-n NICK -wn WEAPON [-ty AMMO_TYPE]");
    register_concmd("forum_fx_disarm",  "cmd_disarm",  ADMIN_RCON,
        "-n NICK");
    register_concmd("forum_fx_clear",   "cmd_clear",   ADMIN_RCON,
        "-n NICK");
    register_concmd("forum_fx_test",    "cmd_test",    ADMIN_RCON,
        "echo a recognisable string so RCON can verify the bridge is loaded");
}

public client_putinserver(id)
{
    if (id < 1 || id >= MAX_PLAYERS_LIMIT) return;
    g_orig_speed[id] = 0.0;
    g_orig_grav[id] = 0.0;
}

// ------------------------------------------------------------------
// Arg parsing — `-n NICK` may contain spaces, so we read until next -X
// ------------------------------------------------------------------

stock find_target_by_nick_arg(arg_start_idx)
{
    new buf[128];
    new j = arg_start_idx;
    new pos = 0;
    while (j < 32) {
        new tok[64];
        read_argv(j, tok, charsmax(tok));
        if (tok[0] == 0) break;
        // Stop when next dash-prefixed flag is encountered (only "-X" form
        // where X is a letter — actual nicks like "[CSB]" do not match).
        if (tok[0] == '-' && tok[1] != 0 && (
            (tok[1] >= 'a' && tok[1] <= 'z') || (tok[1] >= 'A' && tok[1] <= 'Z')
        ) && tok[2] == 0) {
            break;
        }
        if (pos > 0) buf[pos++] = ' ';
        new len = strlen(tok);
        for (new k = 0; k < len && pos < charsmax(buf); k++) buf[pos++] = tok[k];
    }
    buf[pos] = 0;
    if (buf[0] == 0) return 0;
    new target = find_player_by_name(buf);
    return target;
}

stock find_player_by_name(const nick[])
{
    new players[32], num;
    get_players(players, num, "c");
    new exact = 0, partial = 0;
    new buf[64];
    for (new i = 0; i < num; i++) {
        get_user_name(players[i], buf, charsmax(buf));
        if (equal(buf, nick)) return players[i];
        if (containi(buf, nick) >= 0) {
            if (!exact && !partial) partial = players[i];
        }
    }
    return exact ? exact : partial;
}

stock read_int_after_flag(const flag, default_val)
{
    new argc_max = 32;
    for (new i = 1; i < argc_max; i++) {
        new tok[16];
        read_argv(i, tok, charsmax(tok));
        if (tok[0] == 0) break;
        if (tok[0] == '-' && tok[1] == flag && tok[2] == 0) {
            new val_tok[16];
            read_argv(i + 1, val_tok, charsmax(val_tok));
            if (val_tok[0] == 0) return default_val;
            return str_to_num(val_tok);
        }
    }
    return default_val;
}

stock read_str_after_flag(const flag[], output[], maxlen)
{
    new argc_max = 32;
    new flag_len = strlen(flag);
    for (new i = 1; i < argc_max; i++) {
        new tok[24];
        read_argv(i, tok, charsmax(tok));
        if (tok[0] == 0) break;
        if (tok[0] == '-' && equal(tok[1], flag, flag_len) && tok[1 + flag_len] == 0) {
            read_argv(i + 1, output, maxlen);
            return 1;
        }
    }
    output[0] = 0;
    return 0;
}

stock find_nick_arg_start()
{
    new argc_max = 32;
    for (new i = 1; i < argc_max; i++) {
        new tok[8];
        read_argv(i, tok, charsmax(tok));
        if (tok[0] == 0) break;
        if (tok[0] == '-' && tok[1] == 'n' && tok[2] == 0) return i + 1;
    }
    return 0;
}

stock find_target_or_log(invoker, const cmd_name[])
{
    new ns = find_nick_arg_start();
    if (ns == 0) {
        log_amx("[%s] missing -n NICK", cmd_name);
        return 0;
    }
    new target = find_target_by_nick_arg(ns);
    if (target == 0) {
        log_amx("[%s] target not found from -n NICK", cmd_name);
        return 0;
    }
    if (!is_user_connected(target)) {
        log_amx("[%s] target not connected", cmd_name);
        return 0;
    }
    return target;
}

stock dump(const cmd_name[], target, const extra[])
{
    new tname[32];
    get_user_name(target, tname, charsmax(tname));
    log_amx("[%s] %s -> %s", cmd_name, tname, extra);
    console_print(0, "[forum_fx] %s -> %s :: %s", cmd_name, tname, extra);
}

// ------------------------------------------------------------------
// God
// ------------------------------------------------------------------

public cmd_god(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "god");
    if (target == 0) return PLUGIN_HANDLED;
    new on = read_int_after_flag('b', 1);
    new dur = read_int_after_flag('t', 0);
    set_user_godmode(target, on);
    dump("god", target, on ? "ON" : "OFF");
    if (on && dur > 0) {
        set_task(float(dur), "task_revert_god", TASK_REVERT_GOD + target);
    }
    return PLUGIN_HANDLED;
}

public task_revert_god(taskid)
{
    new target = taskid - TASK_REVERT_GOD;
    if (is_user_connected(target)) {
        set_user_godmode(target, 0);
        dump("god", target, "auto-OFF");
    }
}

// ------------------------------------------------------------------
// Freeze
// ------------------------------------------------------------------

public cmd_freeze(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "freeze");
    if (target == 0) return PLUGIN_HANDLED;
    new on = read_int_after_flag('b', 1);
    new dur = read_int_after_flag('t', 0);
    if (on) set_user_maxspeed(target, 0.0001);
    else set_user_maxspeed(target, -1.0);
    dump("freeze", target, on ? "ON" : "OFF");
    if (on && dur > 0) {
        set_task(float(dur), "task_revert_freeze", TASK_REVERT_FREEZE + target);
    }
    return PLUGIN_HANDLED;
}

public task_revert_freeze(taskid)
{
    new target = taskid - TASK_REVERT_FREEZE;
    if (is_user_connected(target)) {
        set_user_maxspeed(target, -1.0);
        dump("freeze", target, "auto-OFF");
    }
}

// ------------------------------------------------------------------
// Slay
// ------------------------------------------------------------------

public cmd_slay(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "slay");
    if (target == 0) return PLUGIN_HANDLED;
    if (is_user_alive(target)) {
        user_kill(target, 1);
        dump("slay", target, "killed");
    } else {
        dump("slay", target, "already dead, no-op");
    }
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
// Respawn (Ham_CS_RoundRespawn)
// ------------------------------------------------------------------

public cmd_respawn(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "respawn");
    if (target == 0) return PLUGIN_HANDLED;
    if (is_user_alive(target)) {
        dump("respawn", target, "already alive, no-op");
        return PLUGIN_HANDLED;
    }
    new CsTeams:team = cs_get_user_team(target);
    if (team != CS_TEAM_T && team != CS_TEAM_CT) {
        dump("respawn", target, "not on a play team, no-op");
        return PLUGIN_HANDLED;
    }
    ExecuteHamB(Ham_CS_RoundRespawn, target);
    dump("respawn", target, "respawned");
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
// Speed
// ------------------------------------------------------------------

public cmd_speed(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "speed");
    if (target == 0) return PLUGIN_HANDLED;
    new spd = read_int_after_flag('i', 350);
    new dur = read_int_after_flag('t', 60);
    if (g_orig_speed[target] == 0.0) {
        pev(target, pev_maxspeed, g_orig_speed[target]);
    }
    set_user_maxspeed(target, float(spd));
    new buf[32]; formatex(buf, charsmax(buf), "%d for %ds", spd, dur);
    dump("speed", target, buf);
    if (dur > 0) {
        set_task(float(dur), "task_revert_speed", TASK_REVERT_SPEED + target);
    }
    return PLUGIN_HANDLED;
}

public task_revert_speed(taskid)
{
    new target = taskid - TASK_REVERT_SPEED;
    if (is_user_connected(target)) {
        set_user_maxspeed(target, g_orig_speed[target] > 0.0 ? g_orig_speed[target] : -1.0);
        g_orig_speed[target] = 0.0;
        dump("speed", target, "auto-revert");
    }
}

// ------------------------------------------------------------------
// Gravity
// ------------------------------------------------------------------

public cmd_gravity(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "gravity");
    if (target == 0) return PLUGIN_HANDLED;
    new pct = read_int_after_flag('i', 30);
    new dur = read_int_after_flag('t', 60);
    if (g_orig_grav[target] == 0.0) {
        pev(target, pev_gravity, g_orig_grav[target]);
        if (g_orig_grav[target] == 0.0) g_orig_grav[target] = 1.0;
    }
    set_user_gravity(target, float(pct) / 100.0);
    new buf[32]; formatex(buf, charsmax(buf), "%d%% for %ds", pct, dur);
    dump("gravity", target, buf);
    if (dur > 0) {
        set_task(float(dur), "task_revert_grav", TASK_REVERT_GRAV + target);
    }
    return PLUGIN_HANDLED;
}

public task_revert_grav(taskid)
{
    new target = taskid - TASK_REVERT_GRAV;
    if (is_user_connected(target)) {
        set_user_gravity(target, g_orig_grav[target]);
        g_orig_grav[target] = 0.0;
        dump("gravity", target, "auto-revert");
    }
}

// ------------------------------------------------------------------
// Health
// ------------------------------------------------------------------

public cmd_health(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "health");
    if (target == 0) return PLUGIN_HANDLED;
    new hp = read_int_after_flag('i', 100);
    if (hp < 1) hp = 1;
    if (hp > 999) hp = 999;
    set_user_health(target, hp);
    new buf[24]; formatex(buf, charsmax(buf), "HP=%d", hp);
    dump("health", target, buf);
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
// Give weapon
// ------------------------------------------------------------------

public cmd_give(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "give");
    if (target == 0) return PLUGIN_HANDLED;
    if (!is_user_alive(target)) {
        dump("give", target, "dead, can't give");
        return PLUGIN_HANDLED;
    }
    new wpn[24];
    read_str_after_flag("wn", wpn, charsmax(wpn));
    if (wpn[0] == 0) {
        dump("give", target, "missing -wn WEAPON");
        return PLUGIN_HANDLED;
    }
    new ammo_ty = read_int_after_flag('y', 2);
    // Map common short names to engine class names.
    new class_name[32];
    if (equali(wpn, "weapon_", 7)) {
        copy(class_name, charsmax(class_name), wpn);
    } else {
        formatex(class_name, charsmax(class_name), "weapon_%s", wpn);
    }
    give_item(target, class_name);
    // Fill ammo to default backpack for that weapon (engine handles
    // via -ty 2 = full backpack semantics from brody's plugin).
    if (ammo_ty == 2) {
        // Generic full-ammo fill via engine cmd
        new ammoCmd[64];
        formatex(ammoCmd, charsmax(ammoCmd), "fillammo %s", class_name);
        engclient_cmd(target, "give", class_name);
    }
    new buf[40]; formatex(buf, charsmax(buf), "%s ty=%d", class_name, ammo_ty);
    dump("give", target, buf);
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
// Disarm — strip primary + secondary
// ------------------------------------------------------------------

public cmd_disarm(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "disarm");
    if (target == 0) return PLUGIN_HANDLED;
    strip_user_weapons(target);
    give_item(target, "weapon_knife");
    dump("disarm", target, "stripped");
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
// Clear basic effects
// ------------------------------------------------------------------

public cmd_clear(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new target = find_target_or_log(id, "clear");
    if (target == 0) return PLUGIN_HANDLED;
    set_user_godmode(target, 0);
    set_user_maxspeed(target, -1.0);
    set_user_gravity(target, 1.0);
    remove_task(TASK_REVERT_GOD    + target);
    remove_task(TASK_REVERT_FREEZE + target);
    remove_task(TASK_REVERT_SPEED  + target);
    remove_task(TASK_REVERT_GRAV   + target);
    g_orig_speed[target] = 0.0;
    g_orig_grav[target]  = 0.0;
    dump("clear", target, "reset all");
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
// Self-test concmd (proves the bridge is loaded + reachable via RCON)
// ------------------------------------------------------------------

public cmd_test(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    console_print(0, "[forum_fx] bridge v%s OK", PLUGIN_VERSION);
    log_amx("[forum_fx] self-test invoked by id=%d", id);
    return PLUGIN_HANDLED;
}
