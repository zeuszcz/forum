/*  jbf_forum_spectator.sma v0.7.0 — endless·war
 *
 *  v0.6 fixed click-to-follow by writing pev_iuser1 / pev_iuser2
 *       directly (cs16-client does not register `spec_player`).
 *
 *  v0.7 adds **free-roam piloting** of the headless spectator:
 *       a new RCON concmd `forum_spec_teleport <x> <y> [z]` warps the
 *       spec's view to the given world coords and parks them in
 *       spec_mode 3 (free-roam) with no observed target. The frontend
 *       /live page wires this to shift+click on the radar — operator
 *       clicks a corner of the map and the camera snaps there.
 *
 *       Why pev_origin not setpos: setpos is a developer cvar that's
 *       gated on `sv_cheats 1` server-side, which the production jail
 *       server obviously refuses. Setting pev_origin via fakemeta
 *       writes the engine field directly with no console roundtrip.
 *
 *       The Z coordinate is optional. If omitted we keep the spec's
 *       current Z (smooth XY-pan) which is good enough for top-down
 *       use. A future improvement is a downward traceline to find the
 *       floor and snap the camera 200 u above it.
 */

#include <amxmodx>
#include <amxmisc>
#include <cstrike>
#include <fakemeta>
#include <engine>
#include <fun>

#define PLUGIN_NAME    "JBF Forum Spectator"
#define PLUGIN_VERSION "0.7.0"
#define PLUGIN_AUTHOR  "endless-war"

#define OBS_NONE     0
#define OBS_IN_EYE   1
#define OBS_CHASE_FREE 2
#define OBS_ROAMING  3
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

    register_concmd("forum_spec_follow",   "cmd_follow",   ADMIN_RCON,
        "<target_userid> | <0> for autodirector");
    register_concmd("forum_spec_release",  "cmd_release",  ADMIN_RCON,
        "release follow → autodirector");
    register_concmd("forum_spec_teleport", "cmd_teleport", ADMIN_RCON,
        "<x> <y> [z] — warp spec to world coords (free-roam mode)");
    register_concmd("forum_spec_freeroam", "cmd_freeroam", ADMIN_RCON,
        "switch spec to free-roam mode (no target, manual position)");

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

    set_pev(spec_id, pev_iuser1, OBS_CHASE);
    set_pev(spec_id, pev_iuser2, target_id);
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
//  Free-roam piloting — teleport spec to a world position
// ------------------------------------------------------------------

public cmd_teleport(id, level, cid)
{
    if (!cmd_access(id, level, cid, 3)) return PLUGIN_HANDLED;

    new ax[16], ay[16], az[16];
    read_argv(1, ax, charsmax(ax));
    read_argv(2, ay, charsmax(ay));
    read_argv(3, az, charsmax(az));

    new spec_id = find_forum_spec();
    if (spec_id <= 0) {
        log_amx("forum_spec_teleport: spectator not connected");
        return PLUGIN_HANDLED;
    }

    new Float:fx = str_to_float(ax);
    new Float:fy = str_to_float(ay);
    new Float:fz;

    if (az[0] != 0) {
        fz = str_to_float(az);
    } else {
        // Keep current Z so the camera doesn't suddenly bob up or down
        // when the operator clicks a 2D radar that has no altitude.
        new Float:cur_origin[3];
        pev(spec_id, pev_origin, cur_origin);
        fz = cur_origin[2];
    }

    new Float:origin[3];
    origin[0] = fx;
    origin[1] = fy;
    origin[2] = fz;

    // Free-roam mode + no target so the engine stops chasing.
    set_pev(spec_id, pev_iuser1, OBS_ROAMING);
    set_pev(spec_id, pev_iuser2, 0);
    set_pev(spec_id, pev_origin, origin);
    // Also set the eye-position field so client interpolation snaps
    // cleanly to the new spot instead of slow-panning the old delta.
    set_pev(spec_id, pev_view_ofs, Float:{0.0, 0.0, 0.0});

    engclient_cmd(spec_id, "spec_autodirector", "0");
    engclient_cmd(spec_id, "spec_mode", "3");

    log_amx("forum_spec_teleport: warped to (%.0f, %.0f, %.0f)", fx, fy, fz);
    return PLUGIN_HANDLED;
}

public cmd_freeroam(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    new spec_id = find_forum_spec();
    if (spec_id <= 0) return PLUGIN_HANDLED;

    set_pev(spec_id, pev_iuser1, OBS_ROAMING);
    set_pev(spec_id, pev_iuser2, 0);
    engclient_cmd(spec_id, "spec_autodirector", "0");
    engclient_cmd(spec_id, "spec_mode", "3");
    log_amx("forum_spec_freeroam: switched to free-roam");
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
