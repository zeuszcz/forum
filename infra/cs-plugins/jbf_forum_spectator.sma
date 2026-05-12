/*  jbf_forum_spectator.sma v0.6.0 — endless·war
 *
 *  v0.3 added forum_spec_follow but used engclient_cmd(spec, "spec_player",
 *       "#<uid>") to switch the target. cs16-client (our headless
 *       spectator) does NOT register a `spec_player` console command —
 *       only spec_mode / spec_autodirector / _spec_find_next_player.
 *       So the command was silently ignored.
 *
 *  v0.6 switches to the ENGINE-LEVEL way: GoldSrc CS 1.6 stores the
 *       spectator's observer state in two pev fields on the player
 *       entity:
 *         pev_iuser1 = observer mode (4 = chase cam)
 *         pev_iuser2 = observed entity index
 *       Setting these two directly via fakemeta moves the spectator
 *       camera to the target with no dependency on what console
 *       commands the client exposes. spec_autodirector OFF is still
 *       relayed via engclient_cmd so it doesn't override us.
 */

#include <amxmodx>
#include <amxmisc>
#include <cstrike>
#include <fakemeta>
#include <engine>
#include <fun>

#define PLUGIN_NAME    "JBF Forum Spectator"
#define PLUGIN_VERSION "0.6.0"
#define PLUGIN_AUTHOR  "endless-war"

#define OBS_NONE     0
#define OBS_CHASE    4

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
    if (!is_forum_spec(id)) return;
    set_task(0.2, "force_spec", id);
}

public force_spec(id)
{
    if (!is_user_connected(id)) return;
    new CsTeams:team = cs_get_user_team(id);
    if (team == CS_TEAM_SPECTATOR) return;

    if (is_user_alive(id)) {
        user_kill(id, 1);
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
//  Click-to-follow — engine-level field set, no client command needed
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
        // Release → back to autodirector (engine picks targets)
        set_pev(spec_id, pev_iuser1, OBS_CHASE);
        set_pev(spec_id, pev_iuser2, 0);
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
    if (!is_user_alive(target_id)) {
        log_amx("forum_spec_follow: target userid=%d not alive — can't spectate", userid);
        return PLUGIN_HANDLED;
    }

    new tname[32];
    get_user_name(target_id, tname, charsmax(tname));

    // ENGINE-LEVEL observer-target swap. GoldSrc CS 1.6 stores the
    // spectator's current observed entity in pev_iuser2 and the mode
    // (1=in-eye, 2=chase, 4=director-chase, 3=free-roam) in pev_iuser1.
    // Setting these directly moves the camera even when the client
    // exposes no `spec_player` command (cs16-client doesn't).
    set_pev(spec_id, pev_iuser1, OBS_CHASE);
    set_pev(spec_id, pev_iuser2, target_id);

    // Disable autodirector so it doesn't steal the focus back next tick.
    engclient_cmd(spec_id, "spec_autodirector", "0");
    engclient_cmd(spec_id, "spec_mode", "4");

    log_amx("forum_spec_follow: locked onto userid=%d (%s) ent=%d",
        userid, tname, target_id);
    return PLUGIN_HANDLED;
}

public cmd_release(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new spec_id = find_forum_spec();
    if (spec_id <= 0) return PLUGIN_HANDLED;
    set_pev(spec_id, pev_iuser1, OBS_CHASE);
    set_pev(spec_id, pev_iuser2, 0);
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
