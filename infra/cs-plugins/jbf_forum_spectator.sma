/*  jbf_forum_spectator.sma v0.5.0 — endless·war
 *
 *  v0.4 hooked Round_Start + ResetHUD, but the spectator still
 *  respawned with HP 100 because cs_set_user_team only flips the
 *  internal field. The visible player stays alive in their old
 *  team until they die. Need to user_kill first if alive.
 *
 *  v0.5: in force_spec, silent-kill the spec if they're currently
 *        alive on a team, THEN set team SPECTATOR. Engine moves
 *        them into the spec free-roam camera on the next think.
 */

#include <amxmodx>
#include <amxmisc>
#include <cstrike>
#include <fakemeta>
#include <engine>
#include <fun>

#define PLUGIN_NAME    "JBF Forum Spectator"
#define PLUGIN_VERSION "0.5.0"
#define PLUGIN_AUTHOR  "endless-war"

new g_cv_steamid;
new g_cv_nick;
new g_cv_ip;

public plugin_init()
{
    register_plugin(PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_AUTHOR);

    g_cv_steamid = register_cvar("jbf_forum_spec_steamid", "STEAM_10:0:1414420787");
    g_cv_nick    = register_cvar("jbf_forum_spec_nick",    "[Xash3D]forum_spectator");
    g_cv_ip      = register_cvar("jbf_forum_spec_ip",      "170.168.72.200");

    register_concmd("forum_spec_follow",  "cmd_follow",  ADMIN_RCON,
        "<target_userid> | <0> for autodirector");
    register_concmd("forum_spec_release", "cmd_release", ADMIN_RCON,
        "release follow → autodirector");

    register_logevent("event_round_start", 2, "1=Round_Start");
    register_event("ResetHUD", "event_reset_hud", "b");
    // SpawnPlayer-like: HLTV "Begin/End" is unreliable. CurWeapon
    // fires immediately after a player gains a weapon — perfect
    // signal that the engine respawned us. ('be' = both, alive).
    register_event("CurWeapon", "event_curweapon", "be", "1=1");
}

// ------------------------------------------------------------------
//  Force-spec triggers
// ------------------------------------------------------------------

public client_putinserver(id)
{
    if (!is_forum_spec(id)) return;
    set_task(1.5,  "force_spec", id);
    set_task(4.0,  "force_spec", id);
    set_task(10.0, "force_spec", id);
}

public event_round_start()
{
    new spec_id = find_forum_spec();
    if (spec_id <= 0) return;
    // Server respawns everyone on round_start; we slap our spec back
    // to SPECTATOR at +0.4s (post-respawn) and again at +1.2s (post
    // any other plugin's force-team).
    set_task(0.4, "force_spec", spec_id);
    set_task(1.2, "force_spec", spec_id);
}

public event_reset_hud(id)
{
    if (!is_forum_spec(id)) return;
    set_task(0.4, "force_spec", id);
}

public event_curweapon(id)
{
    // The spec just got a weapon → engine respawned them.
    if (!is_forum_spec(id)) return;
    set_task(0.2, "force_spec", id);
}

public force_spec(id)
{
    if (!is_user_connected(id)) return;
    new CsTeams:team = cs_get_user_team(id);
    if (team == CS_TEAM_SPECTATOR) return;

    // The critical fix: if they're walking around alive in a team,
    // killing them releases the model + weapons so the engine can
    // then accept the spec-team flip on the next think.
    if (is_user_alive(id)) {
        user_kill(id, 1); // 1 = silent (no death message, no score)
    }

    cs_set_user_team(id, CS_TEAM_SPECTATOR, CS_DONTCHANGE);
    engclient_cmd(id, "menuselect", "6");
    engclient_cmd(id, "jointeam", "6");
    engclient_cmd(id, "spec_mode", "4");
    engclient_cmd(id, "spec_autodirector", "1");

    new name[32];
    get_user_name(id, name, charsmax(name));
    log_amx("forum_spectator forced to SPEC: %s", name);
}

// ------------------------------------------------------------------
//  Click-to-follow
// ------------------------------------------------------------------

public cmd_follow(id, level, cid)
{
    if (!cmd_access(id, level, cid, 2)) return PLUGIN_HANDLED;

    new arg[8];
    read_argv(1, arg, charsmax(arg));
    new userid = str_to_num(arg);

    new spec_id = find_forum_spec();
    if (spec_id <= 0) {
        log_amx("forum_spec_follow: spectator not connected");
        return PLUGIN_HANDLED;
    }

    if (userid <= 0) {
        engclient_cmd(spec_id, "spec_autodirector", "1");
        engclient_cmd(spec_id, "spec_mode", "4");
        log_amx("forum_spec_follow: released to autodirector");
        return PLUGIN_HANDLED;
    }

    new target_id = find_player("k", userid);
    if (target_id <= 0 || !is_user_connected(target_id)) {
        log_amx("forum_spec_follow: target userid=%d not found", userid);
        return PLUGIN_HANDLED;
    }

    new tname[32];
    get_user_name(target_id, tname, charsmax(tname));

    engclient_cmd(spec_id, "spec_autodirector", "0");
    engclient_cmd(spec_id, "spec_mode", "4");
    new uid_arg[12];
    formatex(uid_arg, charsmax(uid_arg), "#%d", userid);
    engclient_cmd(spec_id, "spec_player", uid_arg);

    log_amx("forum_spec_follow: locked onto userid=%d (%s)", userid, tname);
    return PLUGIN_HANDLED;
}

public cmd_release(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new spec_id = find_forum_spec();
    if (spec_id <= 0) return PLUGIN_HANDLED;
    engclient_cmd(spec_id, "spec_autodirector", "1");
    engclient_cmd(spec_id, "spec_mode", "4");
    log_amx("forum_spec_follow: released to autodirector");
    return PLUGIN_HANDLED;
}

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

find_forum_spec()
{
    new players[32], num;
    get_players(players, num, "c");
    for (new i = 0; i < num; i++) {
        if (is_forum_spec(players[i])) return players[i];
    }
    return 0;
}

is_forum_spec(id)
{
    new buf[64], cvar_buf[64];

    get_pcvar_string(g_cv_steamid, cvar_buf, charsmax(cvar_buf));
    get_user_authid(id, buf, charsmax(buf));
    if (cvar_buf[0] && equal(buf, cvar_buf)) return 1;

    get_pcvar_string(g_cv_nick, cvar_buf, charsmax(cvar_buf));
    get_user_name(id, buf, charsmax(buf));
    if (cvar_buf[0] && equal(buf, cvar_buf)) return 1;

    get_pcvar_string(g_cv_ip, cvar_buf, charsmax(cvar_buf));
    get_user_ip(id, buf, charsmax(buf), 1);
    if (cvar_buf[0] && equal(buf, cvar_buf)) return 1;

    return 0;
}
