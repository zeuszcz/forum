/*  jbf_forum_spectator.sma v0.2.0 — endless·war
 *
 *  Force the forum's headless spectator client onto SPECTATOR team and
 *  close any VGUI team-select menu it has open.
 *
 *  v0.1 set the team via cs_set_user_team but the team-select menu
 *  stayed open (the menu doesn't auto-dismiss on a server-side team
 *  change). v0.2 also fires `menuselect 6` and `chooseteam` cancel
 *  through engclient_cmd so the menu actually goes away and the
 *  spectator camera takes over.
 */

#include <amxmodx>
#include <cstrike>
#include <fakemeta>
#include <engine>

#define PLUGIN_NAME    "JBF Forum Spectator"
#define PLUGIN_VERSION "0.2.0"
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
}

public client_putinserver(id)
{
    if (!is_forum_spec(id)) return;

    // Three nudges: catches the join (1.5s), the team-menu race (4s),
    // and round_start re-prompt (10s).
    set_task(1.5,  "force_spec", id);
    set_task(4.0,  "force_spec", id);
    set_task(10.0, "force_spec", id);
}

public force_spec(id)
{
    if (!is_user_connected(id)) return;

    // Set the server-side team so admin commands / scoreboard see SPEC.
    cs_set_user_team(id, CS_TEAM_SPECTATOR, CS_DONTCHANGE);

    // Engine-level client command. Hits the input queue exactly as if
    // the player pressed `menuselect 6` themselves — closes any VGUI
    // menu that's open.
    engclient_cmd(id, "menuselect", "6");
    // Backstop: jointeam 6 forces team again in case menuselect was
    // applied to a different VGUI menu (rare in jail mode).
    engclient_cmd(id, "jointeam", "6");
    // Lock the spectator camera to in-eye / chase / free-roam director.
    // Mode 4 = autodirector; engine picks the most-interesting target.
    engclient_cmd(id, "spec_mode", "4");
    engclient_cmd(id, "spec_autodirector", "1");

    new name[32];
    get_user_name(id, name, charsmax(name));
    log_amx("forum_spectator forced to SPEC: %s", name);
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
