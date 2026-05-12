/*  jbf_forum_proxy.sma v1.0.0 — endless·war
 *
 *  Forum admin-panel effect proxy.
 *
 *  PROBLEM
 *  -------
 *  brody's jb_uaio_modular plugin pack works via RCON for MOST targets
 *  (the forum-driven jbf_uaio_X -n NICK commands take effect) but
 *  SOME targets — empirically, players holding certain admin flags —
 *  get nothing. Most likely cause: the uaio plugin's target-resolver
 *  uses cmd_target() or find_player() with the default access check
 *  that honours ADMIN_IMMUNITY ("a" flag), so an immune target is
 *  silently rejected.
 *
 *  STRATEGY
 *  --------
 *  Thin proxy. The backend wraps every effect command with this
 *  proxy:
 *
 *      forum_fx_run jbf_uaio_god -n NICK -b 1 -t 60
 *
 *  The proxy:
 *    1. Parses out the target nick from `-n NICK ...`.
 *    2. Resolves the target player entity.
 *    3. Snapshots their current AMX flags via get_user_flags().
 *    4. Sets their flags to 0 (no immunity, no nothing).
 *    5. Fires the original command via server_cmd + server_exec.
 *    6. Schedules a 1.0 s task to restore the original flags.
 *
 *  The 1-second window is wide enough for the uaio plugin's
 *  command handler + any nested set_task() effect-apply chains to
 *  pass the access check. Restoring flags is per-player keyed and
 *  idempotent — a second proxy call on the same target before the
 *  task fires will overwrite the saved snapshot, which is correct
 *  (the most-recent pre-strip state is what we want to restore).
 *
 *  SECURITY
 *  --------
 *  ADMIN_RCON. The backend's cs_rcon password is required to invoke
 *  this — same gate as the original commands. No new attack surface.
 *
 *  AUDIT
 *  -----
 *  Every invocation logs: actor, target nick, target original flags,
 *  forwarded command. Visible in addons/amxmodx/logs/L<MMDD>.log.
 */

#include <amxmodx>
#include <amxmisc>

#define PLUGIN_NAME    "JBF Forum Effects Proxy"
#define PLUGIN_VERSION "1.0.0"
#define PLUGIN_AUTHOR  "endless-war"

#define MAX_PLAYERS_PLUS 33

#define TASK_RESTORE_BASE 88000

new g_saved_flags[MAX_PLAYERS_PLUS];

public plugin_init()
{
    register_plugin(PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_AUTHOR);

    register_concmd("forum_fx_run", "cmd_run", ADMIN_RCON,
        "<full original jbf_uaio command incl args>");
    register_concmd("forum_fx_test", "cmd_test", ADMIN_RCON,
        "echo a recognisable string so RCON can verify the proxy is loaded");
}

public client_putinserver(id)
{
    if (id < 1 || id >= MAX_PLAYERS_PLUS) return;
    g_saved_flags[id] = 0;
}

public client_disconnected(id)
{
    if (id < 1 || id >= MAX_PLAYERS_PLUS) return;
    g_saved_flags[id] = 0;
    remove_task(TASK_RESTORE_BASE + id);
}

// ------------------------------------------------------------------

public cmd_run(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;

    new full[256];
    read_args(full, charsmax(full));
    remove_quotes(full);
    // Strip trailing whitespace — RCON tends to leave a \n at the end
    // which then leaks into nick parsing further down.
    new flen = strlen(full) - 1;
    while (flen >= 0 && (full[flen] == ' ' || full[flen] == '\t' || full[flen] == '\n' || full[flen] == '\r')) {
        full[flen] = 0;
        flen--;
    }
    if (full[0] == 0) {
        console_print(id, "[forum_fx] missing inner command");
        return PLUGIN_HANDLED;
    }

    new target_nick[64];
    if (!extract_target_nick(full, target_nick, charsmax(target_nick))) {
        // No -n NICK in the wrapped cmd — just forward without flag strip.
        // Some uaio variants take a userid token instead; let the inner
        // plugin do its own resolution.
        log_amx("[forum_fx] no -n NICK in '%s', forwarding raw", full);
        server_cmd("%s", full);
        server_exec();
        return PLUGIN_HANDLED;
    }

    new target = find_player_by_name(target_nick);
    if (target <= 0 || !is_user_connected(target)) {
        log_amx("[forum_fx] target nick '%s' not found, forwarding raw",
            target_nick);
        server_cmd("%s", full);
        server_exec();
        return PLUGIN_HANDLED;
    }

    new flags = get_user_flags(target);
    if (flags != 0) {
        // Snapshot + strip. Cancel any pending restore from a prior call
        // so we don't double-restore stale flags.
        g_saved_flags[target] = flags;
        remove_task(TASK_RESTORE_BASE + target);
        set_user_flags(target, 0);
        log_amx("[forum_fx] strip flags target='%s' orig=%d cmd='%s'",
            target_nick, flags, full);
    } else {
        log_amx("[forum_fx] no flags to strip target='%s' cmd='%s'",
            target_nick, full);
    }

    // Forward the original command.
    server_cmd("%s", full);
    server_exec();

    if (flags != 0) {
        set_task(1.0, "task_restore_flags", TASK_RESTORE_BASE + target);
    }
    return PLUGIN_HANDLED;
}

public task_restore_flags(taskid)
{
    new target = taskid - TASK_RESTORE_BASE;
    if (target < 1 || target >= MAX_PLAYERS_PLUS) return;
    if (!is_user_connected(target)) {
        g_saved_flags[target] = 0;
        return;
    }
    new orig = g_saved_flags[target];
    g_saved_flags[target] = 0;
    if (orig != 0) {
        set_user_flags(target, orig);
        log_amx("[forum_fx] restored flags target=%d back to %d",
            target, orig);
    }
}

// ------------------------------------------------------------------
//  Parse out the value following "-n " from the full command.
//
//  Nick may contain spaces; we read until the next "-X " token where
//  X is an ASCII letter (so square brackets, dots, Cyrillic in nicks
//  do not terminate the scan).
// ------------------------------------------------------------------

stock extract_target_nick(const src[], out[], maxlen)
{
    out[0] = 0;
    new src_len = strlen(src);
    new i = 0;
    // Find " -n " or "-n " at the very start.
    new found = -1;
    while (i < src_len - 2) {
        if (src[i] == '-' && src[i+1] == 'n' && src[i+2] == ' ' &&
            (i == 0 || src[i-1] == ' ')) {
            found = i + 3;
            break;
        }
        i++;
    }
    if (found < 0) return 0;

    // Scan from `found` to next " -X " boundary.
    new j = found;
    new end = src_len;
    while (j < src_len - 2) {
        if (src[j] == ' ' && src[j+1] == '-' && src[j+2] != 0 &&
            ((src[j+2] >= 'a' && src[j+2] <= 'z') ||
             (src[j+2] >= 'A' && src[j+2] <= 'Z')) &&
            (j + 3 >= src_len || src[j+3] == ' ')) {
            end = j;
            break;
        }
        j++;
    }
    new len = end - found;
    if (len <= 0) return 0;
    if (len > maxlen) len = maxlen;
    copy(out, len, src[found]);
    // Trim trailing whitespace (spaces, tabs, CR, LF — RCON tends to
    // leave a \n on the last token).
    new k = strlen(out) - 1;
    while (k >= 0 && (out[k] == ' ' || out[k] == '\t' || out[k] == '\n' || out[k] == '\r')) {
        out[k] = 0;
        k--;
    }
    return out[0] != 0;
}

// ------------------------------------------------------------------
//  Player lookup — exact match first, then partial (case-insensitive).
// ------------------------------------------------------------------

stock find_player_by_name(const nick[])
{
    new players[32], num;
    get_players(players, num, "c");
    new exact_match = 0;
    new partial_match = 0;
    new buf[64];
    for (new i = 0; i < num; i++) {
        get_user_name(players[i], buf, charsmax(buf));
        if (equal(buf, nick)) {
            exact_match = players[i];
            break;
        }
        if (!partial_match && containi(buf, nick) >= 0) {
            partial_match = players[i];
        }
    }
    return exact_match ? exact_match : partial_match;
}

// ------------------------------------------------------------------
//  Self-test.
// ------------------------------------------------------------------

public cmd_test(id, level, cid)
{
    if (!cmd_access(id, level, cid, 1)) return PLUGIN_HANDLED;
    console_print(0, "[forum_fx] proxy v%s OK", PLUGIN_VERSION);
    log_amx("[forum_fx] self-test invoked by id=%d", id);
    return PLUGIN_HANDLED;
}
