# jb-ftp-poller

FTP poller that tails the `jb_uaio_modular` admin-menu log file on the CS
host and forwards new lines to the forum chat as `kind=system` messages
with `category=admin_action`.

## Why FTP?

The `jb_uaio_modular` plugin writes to its own AMXX log file via
`log_to_file()` — not `log_amx()`. That means the events never reach
`mp_logmessages` and never hit our `logaddress_add` UDP target. The only
way to read them without modifying the plugin is to slurp the file directly
from the CS host. MyArena exposes that file via FTP.

## What it does

- Connects every `POLL_INTERVAL_S` seconds (default 8 s)
- `cd /addons/amxmodx/logs/jb_uaio_modular`
- `SIZE jb_uaio_MM-YYYY.log` against the current month's file
- If file grew, `RETR` with `REST <offset>` to fetch only the delta
- Parses every recognised `Админ <name> <STEAM> <IP> <verb>(а) <rest>` line
- `POST /shoutbox/system` with the formatted body + JB-UAIO tag
- Persists per-file offset to `/var/lib/cs-log-poller/state.json`

On first run for a given file the offset is seeded to the current size so
years of history don't get back-filled into chat. To force a backfill,
edit `state.json` and set the offset to 0 (or delete the file).

## Install

```sh
sudo mkdir -p /opt/cs-log-poller
sudo cp poller.py /opt/cs-log-poller/
sudo cp jb-ftp-poller.service /etc/systemd/system/
sudo tee /opt/cs-log-poller/poller.env >/dev/null <<EOF
JB_FTP_HOST=<host>
JB_FTP_USER=<user>
JB_FTP_PASS=<pass>
JB_LOG_DIR=/addons/amxmodx/logs/jb_uaio_modular
FORUM_API=http://127.0.0.1:8030
SHOUTBOX_SYSTEM_TOKEN=<from /home/i48ptgvnis/forum/.env>
POLL_INTERVAL_S=8
MAX_LINES_PER_POLL=200
EOF
sudo chmod 600 /opt/cs-log-poller/poller.env
sudo chown root:i48ptgvnis /opt/cs-log-poller/poller.env
sudo chmod 640 /opt/cs-log-poller/poller.env
sudo systemctl daemon-reload
sudo systemctl enable --now jb-ftp-poller
sudo journalctl -fu jb-ftp-poller
```
