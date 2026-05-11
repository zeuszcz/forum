"""FTP poller for jb_uaio_modular admin-menu log file.

Connects to the CS host's FTP every POLL_INTERVAL_S seconds, watches the
current month's jb_uaio_MM-YYYY.log file under
    /addons/amxmodx/logs/jb_uaio_modular/
and POSTs any new lines to the forum's /shoutbox/system endpoint as
kind=system messages with category=admin_action.

State (per-file byte offset) lives in STATE_PATH so a restart picks up
where we left off without re-posting history. On the very first run we
seed the offset to the current file size — admin doesn't want years of
back-log dumped at once.

Pure stdlib (ftplib + urllib + json) — no extra deps to install.
"""
from __future__ import annotations

import ftplib
import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

FTP_HOST = os.environ["JB_FTP_HOST"]
FTP_USER = os.environ["JB_FTP_USER"]
FTP_PASS = os.environ["JB_FTP_PASS"]
LOG_DIR = os.environ.get(
    "JB_LOG_DIR", "/addons/amxmodx/logs/jb_uaio_modular"
)
FORUM_API = os.environ.get("FORUM_API", "http://127.0.0.1:8030").rstrip("/")
TOKEN = os.environ["SHOUTBOX_SYSTEM_TOKEN"]
STATE_PATH = Path(os.environ.get("JB_STATE_PATH", "/var/lib/cs-log-poller/state.json"))
POLL_INTERVAL_S = float(os.environ.get("POLL_INTERVAL_S", "8"))
# Max new lines to forward in a single poll — protects against a sudden
# 100k-line backfill flooding the chat schema.
MAX_LINES_PER_POLL = int(os.environ.get("MAX_LINES_PER_POLL", "200"))

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("jb-ftp-poller")

# Strip HLDS log timestamp prefix.
_RE_TS = re.compile(r"^L \d{2}/\d{2}/\d{4} - \d{2}:\d{2}:\d{2}:\s*(.*)$")
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

_VERB_EMOJI: dict[str, str] = {
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
}


def _load_state() -> dict[str, int]:
    if not STATE_PATH.exists():
        return {}
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        log.warning("state load failed: %s", e)
        return {}


def _save_state(state: dict[str, int]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    tmp.replace(STATE_PATH)


def _current_log_name() -> str:
    now = datetime.now(UTC)
    return f"jb_uaio_{now.month:02d}-{now.year}.log"


def _connect() -> ftplib.FTP:
    ftp = ftplib.FTP(FTP_HOST, timeout=10)
    ftp.login(FTP_USER, FTP_PASS)
    ftp.cwd(LOG_DIR)
    return ftp


def _format_event(line: str) -> str | None:
    """Match a single jb_uaio_modular event line and return a body string
    ready to POST. Returns None if the line isn't a recognised admin event
    (silent skip)."""
    m_ts = _RE_TS.match(line)
    if not m_ts:
        return None
    event = m_ts.group(1).rstrip()
    m = _RE_JBF_FILE.match(event)
    if not m:
        return None

    admin = m["admin"].strip()
    verb = m["verb"].strip()
    rest = m["rest"].strip()
    target_label = "себе"
    action = rest

    if om := _RE_JBF_REST_OTHER.match(rest):
        action = om["action"].strip()
        target_label = om["target"].strip()
    elif sm := _RE_JBF_REST_SELF.match(rest):
        action = (sm["action"] or "").strip()
        target_label = sm["self"]

    emoji = _VERB_EMOJI.get(verb.lower(), "⚙️")
    parts = [f"{emoji} **{admin}** {verb}"]
    if action:
        parts.append(action)
    parts.append(f"→ **{target_label}**")
    return " ".join(parts)[:480]


def _post(body: str) -> None:
    payload = json.dumps(
        {"body": body, "tag": "JB-UAIO", "category": "admin_action"},
        ensure_ascii=False,
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
        with urllib.request.urlopen(req, timeout=4) as resp:
            log.info("posted %s (%d)", body[:80], resp.status)
    except urllib.error.HTTPError as e:
        log.warning("HTTP %d: %s", e.code, e.read()[:200])
    except Exception as e:  # noqa: BLE001
        log.warning("post failed: %s", e)


def _poll(state: dict[str, int]) -> None:
    name = _current_log_name()
    ftp = _connect()
    try:
        try:
            size = ftp.size(name)
        except ftplib.error_perm:
            log.debug("no current log file yet: %s", name)
            return
        if size is None:
            return
        offset = state.get(name, -1)
        if offset < 0:
            # First time we see this file — start at the END so we don't
            # backfill years of history into chat.
            log.info("first poll of %s (size=%d), seeding tail offset", name, size)
            state[name] = size
            _save_state(state)
            return
        if size == offset:
            return
        if size < offset:
            # File got rotated / truncated. Reset.
            log.info("%s shrank from %d → %d, resetting", name, offset, size)
            offset = 0

        # Fetch only the delta.
        buf = bytearray()
        try:
            ftp.retrbinary(f"RETR {name}", buf.extend, blocksize=8192, rest=offset)
        except ftplib.error_perm as e:
            log.warning("RETR failed: %s", e)
            return

        text = buf.decode("utf-8", errors="replace")
        lines = text.splitlines()
        if len(lines) > MAX_LINES_PER_POLL:
            log.warning(
                "%d new lines exceed MAX_LINES_PER_POLL=%d, dropping older",
                len(lines),
                MAX_LINES_PER_POLL,
            )
            lines = lines[-MAX_LINES_PER_POLL:]

        posted = 0
        for raw in lines:
            body = _format_event(raw)
            if not body:
                continue
            _post(body)
            posted += 1
        state[name] = size
        _save_state(state)
        log.info("delta %d→%d bytes, %d events posted", offset, size, posted)
    finally:
        try:
            ftp.quit()
        except Exception:  # noqa: BLE001
            try:
                ftp.close()
            except Exception:  # noqa: BLE001
                pass


def main() -> int:
    log.info(
        "starting jb-ftp-poller host=%s dir=%s interval=%.1fs",
        FTP_HOST,
        LOG_DIR,
        POLL_INTERVAL_S,
    )
    state = _load_state()
    while True:
        try:
            _poll(state)
        except KeyboardInterrupt:
            return 0
        except Exception as e:  # noqa: BLE001
            log.warning("poll cycle failed: %s", e)
        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    sys.exit(main())
