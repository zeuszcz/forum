"""HLDS log_redirect_address -> POST /api/shoutbox/system bridge.

Listens UDP for CS 1.6 HL log packets, parses them, filters down to
jail-interesting events, and posts each to the forum chat as a kind=system
message with the appropriate category tag.

Per-round state (for mass-kill detection) lives in memory; we reset it on
World triggered "Round_Start". Crash-safe enough for a small jail.
"""
from __future__ import annotations

import json
import logging
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict

LOG_PORT = int(os.environ.get("CS_LOG_PORT", "27500"))
LISTEN_ADDR = os.environ.get("CS_LOG_BIND", "0.0.0.0")
FORUM_API = os.environ.get("FORUM_API", "http://127.0.0.1:8030").rstrip("/")
TOKEN = os.environ.get("SHOUTBOX_SYSTEM_TOKEN", "")

# Anti-spam: minimum seconds between two posts of the same category.
# Admin-action has no cooldown — every action is an audit row we want.
COOLDOWNS = {
    "rebel": 5,
    "killfeed": 8,
    "freekill": 5,
    "mass": 30,
    "round": 5,
    "join": 60,
    "leave": 60,
    "lr": 5,
    "freeday": 5,
    "bunt": 5,
    "admin_action": 0,
    "default": 8,
}
ECHO_ALL = os.environ.get("CS_ECHO_ALL", "0") == "1"

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("cs-listener")

_RE_TS = re.compile(r"^L \d{2}/\d{2}/\d{4} - \d{2}:\d{2}:\d{2}:\s*(.*)$")
_RE_KILL = re.compile(
    r'^"(?P<a_name>.+?)<\d+><[^>]*><(?P<a_team>[A-Z]+)>"'
    r"\s+killed\s+"
    r'"(?P<b_name>.+?)<\d+><[^>]*><(?P<b_team>[A-Z]+)>"'
    r'\s+with\s+"(?P<weapon>[^"]+)"(?P<hs>\s+\(headshot\))?'
)
_RE_CONNECT = re.compile(
    r'^"(?P<name>.+?)<\d+><[^>]*><\s*>"\s+connected,\s+address'
)
_RE_DISCONNECT = re.compile(
    r'^"(?P<name>.+?)<\d+><[^>]*><[A-Z]*>"\s+disconnected'
)
_RE_ROUND_START = re.compile(r'^World triggered "Round_Start"')
_RE_ROUND_END = re.compile(r'^World triggered "Round_End"')
_RE_TEAM_SCORED = re.compile(
    r'^Team "(?P<team>CT|TERRORIST)" scored "(?P<score>\d+)" with'
)
_RE_SAY = re.compile(
    r'^"(?P<name>.+?)<\d+><[^>]*><(?P<team>[A-Z]+)>"\s+say(?:_team)?\s+"(?P<msg>.+)"$'
)

# Chat keywords that flag jail flavour. Captures the announcement (not the
# actual rules system) — good enough for chat fan service.
_RE_FREEDAY = re.compile(r"\b(freeday|фридей|фрайдей|фрі)\b", re.IGNORECASE)
_RE_LR = re.compile(r"\b(lr|last\s*request|лр|ласт)\b", re.IGNORECASE)
_RE_BUNT = re.compile(r"\b(бунт|bunt|rebel|rebels|восстание)\b", re.IGNORECASE)

# --- jbf_uaio_modular admin actions -------------------------------------------
# The plugin writes structured lines to its own AMXX log file under
#   cstrike/addons/amxmodx/logs/jb_uaio_modular/jb_uaio_MM-YYYY.log
# Format (real samples from prod):
#   Админ <admin_name> <STEAM_0:0:X> <IP:PORT> возродил(а) <target> <STEAM_..> <IP:PORT>
#   Админ <admin_name> <STEAM_..> <IP:PORT> выдал(а) микрофон <target> <STEAM_..> <IP:PORT>
#   Админ <admin_name> <STEAM_..> <IP:PORT> включил(а) скрытые стены себе
#   Админ <admin_name> <STEAM_..> <IP:PORT> установил(а) 10000 hp <target> <STEAM_..> <IP:PORT>
#   Админ <admin_name> <STEAM_..> <IP:PORT> отключил(а) искажение экрана у <target> <STEAM_..> <IP:PORT>
#   Админ <admin_name> <STEAM_..> <IP:PORT> убил(а) себя
#
# Admin nicknames may contain spaces ("задоджил аборт") and unicode; the regex
# is greedy through anything-but-< up to the first STEAM_ block.
_STEAM_RE = r"STEAM_\d+:\d+:\d+"
_IP_RE = r"[\d.]+:\d+"
_RE_JBF_FILE = re.compile(
    rf"^Админ\s+(?P<admin>[^<]+?)\s+<(?P<admin_steam>{_STEAM_RE})>"
    rf"\s+<(?P<admin_ip>{_IP_RE})>\s+"
    r"(?P<verb>\S+?)\(а\)\s+(?P<rest>.+)$"
)
_RE_JBF_REST_OTHER = re.compile(
    rf"^(?P<action>.+?)\s+(?P<target>[^<]+?)\s+<(?P<target_steam>{_STEAM_RE})>"
    rf"\s+<(?P<target_ip>{_IP_RE})>\s*$"
)
_RE_JBF_REST_SELF = re.compile(
    r"^(?:(?P<action>.+?)\s+)?(?P<self>себе|себя|у\s+себя)\s*$"
)

# Legacy hooks kept (sister-plugin path, if/when someone wires AMX log_amx):
_RE_JBF_LOG_AMX = re.compile(
    r"\[(?:JBF[-_]?UAIO|JBF[-_]?MENU|ADMIN[-_]?MENU)\]\s+(?P<rest>.+)$",
    re.IGNORECASE,
)
_RE_JBF_KV = re.compile(r'(\w+)="([^"]*)"')
_RE_JBF_RU_SAY = re.compile(
    r"^\*\s+Вы\s+"
    r"(?P<verb>включили|выключили|выдали|установили|обновили|скрыли(?:\s+с\s+радаров)?|телепортировали|"
    r"исправили|сменили)\s+"
    r"(?P<rest>.+?)\s*$"
)

LOUD_WEAPONS: dict[str, tuple[str, str]] = {
    "knife": ("🔪", "NINJA"),
    "awp": ("🎯", "AWP"),
    "scout": ("🎯", "SCOUT"),
    "deagle": ("🦅", "DEAGLE"),
    "m3": ("💥", "M3"),
    "xm1014": ("💥", "XM1014"),
    "grenade": ("💣", "GRENADE"),
    "hegrenade": ("💣", "HE"),
}

# Per-round state
_kills_by_ct: dict[str, list[str]] = defaultdict(list)
_last_sent: dict[str, float] = {}


def _within_cooldown(category: str) -> bool:
    cd = COOLDOWNS.get(category, COOLDOWNS["default"])
    now = time.monotonic()
    last = _last_sent.get(category, 0.0)
    if now - last < cd:
        return True
    _last_sent[category] = now
    return False


def _post(body: str, tag: str, category: str) -> None:
    if _within_cooldown(category):
        log.debug("cooldown skip %s: %s", category, body)
        return
    if not TOKEN:
        log.warning("SHOUTBOX_SYSTEM_TOKEN unset — would post [%s] %s", tag, body)
        return
    payload = json.dumps(
        {"body": body[:480], "tag": tag, "category": category}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{FORUM_API}/shoutbox/system",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Shoutbox-Token": TOKEN,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            log.info("posted [%s] %s (%d)", category, body[:80], resp.status)
    except urllib.error.HTTPError as e:
        log.warning(
            "HTTP %d for [%s] %s: %s",
            e.code,
            category,
            body[:60],
            e.read()[:200],
        )
    except Exception as e:  # noqa: BLE001
        log.warning("post failed: %s", e)


def _handle_kill(m: "re.Match[str]") -> None:
    a_name = m["a_name"]
    a_team = m["a_team"]
    b_name = m["b_name"]
    b_team = m["b_team"]
    weapon = m["weapon"].lower()
    hs = bool(m["hs"])

    # Mass-kill bookkeeping
    if a_team == "CT" and b_team == "TERRORIST":
        _kills_by_ct[a_name].append(b_name)
        n = len(_kills_by_ct[a_name])
        if n == 3:
            _post(
                f"🍴 РАЗДАЧА от **{a_name}** — 3 T за раунд",
                tag="MASS",
                category="mass",
            )
        elif n == 5:
            _post(
                f"💀 **{a_name}** уложил всю команду T — раздача 100%",
                tag="MASS",
                category="mass",
            )

    # Rebel = T killing CT
    if a_team == "TERRORIST" and b_team == "CT":
        emoji, _ = LOUD_WEAPONS.get(weapon, ("🚨", "REB"))
        suffix = " HS" if hs else ""
        _post(
            f"{emoji} БУНТ: **{a_name}** снёс CT **{b_name}** ({weapon}{suffix})",
            tag="REBEL",
            category="rebel",
        )
        return

    # Loud-weapon killfeed
    if weapon in LOUD_WEAPONS:
        emoji, wtag = LOUD_WEAPONS[weapon]
        suffix = " HS" if hs else ""
        _post(
            f"{emoji} {wtag}: **{a_name}** → **{b_name}**{suffix}",
            tag=wtag,
            category="killfeed",
        )
        return

    if hs and ECHO_ALL:
        _post(
            f"🎯 HS: **{a_name}** → **{b_name}** ({weapon})",
            tag="HS",
            category="killfeed",
        )


def _handle_team_scored(team: str, score: str) -> None:
    label = "T" if team == "TERRORIST" else "CT"
    _post(
        f"🏆 Раунд: **{label}** = {score}",
        tag="ROUND",
        category="round",
    )


def _handle_say(name: str, team: str, msg: str) -> None:
    # jbf_uaio AMX feedback line that occasionally lands in log via amx_chat
    if m := _RE_JBF_RU_SAY.match(msg):
        verb = m["verb"].strip()
        rest = m["rest"].strip()
        body = f"⚙️ **{name}** {verb} {rest}"[:480]
        _post(body, tag="JBF-UAIO", category="admin_action")
        return

    if _RE_FREEDAY.search(msg):
        _post(
            f"🆓 **{name}** говорит про freeday: «{msg[:60]}»",
            tag="FREEDAY",
            category="freeday",
        )
        return
    if _RE_LR.search(msg):
        _post(
            f"🎲 **{name}** просит LR: «{msg[:60]}»",
            tag="LR",
            category="lr",
        )
        return
    if _RE_BUNT.search(msg):
        _post(
            f"🚨 **{name}** ({team}) кричит про бунт: «{msg[:60]}»",
            tag="BUNT",
            category="bunt",
        )


def _handle_admin_log_amx(rest: str) -> None:
    """`[JBF-UAIO] admin="X" action="Y" feature="Z" scope="basic" target="self"`
    style line produced by an accompanying log_amx call. Free-form kv parser
    so the plugin author can add fields without breaking us."""
    kv = dict(_RE_JBF_KV.findall(rest))
    admin = kv.get("admin", "?")
    action = kv.get("action", "?")
    feature = kv.get("feature", "?")
    scope = kv.get("scope", "basic")
    target = kv.get("target", "self")
    value = kv.get("value")
    pieces = [f"⚙️ **{admin}** {action} **{feature}**"]
    if value:
        pieces.append(f"= {value}")
    if scope and scope != "basic":
        pieces.append(f"({scope})")
    if target and target != "self":
        pieces.append(f"→ {target}")
    _post(" ".join(pieces)[:480], tag="JBF-UAIO", category="admin_action")


def _verb_emoji(verb: str) -> str:
    """Map Russian past-tense verbs (already stripped of (а)) from
    jb_uaio_modular to a one-glyph icon for the admin panel."""
    v = verb.lower()
    return {
        "возродил": "💚",
        "выдал": "🎁",
        "включил": "⚡",
        "выключил": "⚫",
        "отключил": "⚫",
        "установил": "⚙️",
        "телепортировал": "📍",
        "убил": "💀",
        "заморозил": "🧊",
        "разморозил": "💧",
        "закопал": "⛏",
        "раскопал": "🪦",
        "исказил": "📺",
        "сменил": "🔄",
        "обновил": "♻️",
        "скрыл": "👻",
        "выдала": "🎁",
    }.get(v, "⚙️")


def _handle_jbf_modular(m: "re.Match[str]") -> None:
    """Parse a line from cstrike/addons/amxmodx/logs/jb_uaio_modular/*.log
    that has reached us — either via UDP (sister-plugin echo) or via the
    FTP poller posting raw lines back through this listener.

    Format: `Админ <admin> <STEAM> <IP> <verb>(а) <rest>` where <rest> is
    either `<action> <target_nick> <STEAM> <IP>` or `<action> себе/себя`."""
    admin = m["admin"].strip()
    admin_steam = m["admin_steam"]
    verb = m["verb"].strip()
    rest = m["rest"].strip()

    target_label = "себе"
    target_nick: str | None = None
    target_steam: str | None = None
    action = rest

    if om := _RE_JBF_REST_OTHER.match(rest):
        action = om["action"].strip()
        target_nick = om["target"].strip()
        target_steam = om["target_steam"]
        target_label = target_nick
    elif sm := _RE_JBF_REST_SELF.match(rest):
        action = (sm["action"] or "").strip()
        target_label = sm["self"]

    emoji = _verb_emoji(verb)
    body_parts = [f"{emoji} **{admin}** {verb}"]
    if action:
        body_parts.append(action)
    body_parts.append(f"→ **{target_label}**")
    _post(" ".join(body_parts)[:480], tag="JB-UAIO", category="admin_action")
    # `admin_steam` / `target_steam` are unused for now — would feed structured
    # meta if the schema gains an `extra` field. Kept in the locals so future
    # work is one-line away.
    _ = admin_steam, target_steam


def _parse_event(line: str) -> None:
    log.debug("event: %s", line)

    if m := _RE_KILL.match(line):
        _handle_kill(m)
        return
    if _RE_ROUND_START.match(line):
        _kills_by_ct.clear()
        return
    if _RE_ROUND_END.match(line):
        return
    if m := _RE_TEAM_SCORED.match(line):
        _handle_team_scored(m["team"], m["score"])
        return
    # jb_uaio_modular file format (Админ-prefixed) — most specific.
    if m := _RE_JBF_FILE.match(line):
        _handle_jbf_modular(m)
        return
    # Admin-menu log_amx envelope (alternative path).
    if m := _RE_JBF_LOG_AMX.search(line):
        _handle_admin_log_amx(m["rest"])
        return
    if m := _RE_SAY.match(line):
        _handle_say(m["name"], m["team"], m["msg"])
        return
    if m := _RE_CONNECT.match(line):
        _post(
            f"🚪 **{m['name']}** зашёл на сервер",
            tag="JOIN",
            category="join",
        )
        return
    if m := _RE_DISCONNECT.match(line):
        _post(
            f"🚪 **{m['name']}** вышел",
            tag="LEAVE",
            category="leave",
        )
        return


def main() -> int:
    log.info(
        "starting cs-log-listener bind=%s:%d forum=%s token=%s",
        LISTEN_ADDR,
        LOG_PORT,
        FORUM_API,
        "set" if TOKEN else "MISSING",
    )
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((LISTEN_ADDR, LOG_PORT))

    while True:
        try:
            data, addr = sock.recvfrom(4096)
        except KeyboardInterrupt:
            return 0
        except OSError as e:
            log.warning("recv error: %s", e)
            continue
        body = data
        if body[:4] == b"\xff\xff\xff\xff":
            body = body[4:]
        if body.startswith(b"log "):
            body = body[4:]
        text = body.decode("utf-8", errors="replace").rstrip("\r\n\x00 ")
        m = _RE_TS.match(text)
        if not m:
            log.debug("no-ts %r from %s", text[:120], addr)
            continue
        event = m.group(1).rstrip()
        try:
            _parse_event(event)
        except Exception as e:  # noqa: BLE001
            log.exception("parse failed for %r: %s", event[:120], e)


if __name__ == "__main__":
    sys.exit(main())
