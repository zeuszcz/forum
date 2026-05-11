# cs-log-listener

Tiny Python daemon that bridges a CS 1.6 (HLDS) server's
`logaddress_add`/`logaddress` UDP stream into the forum chat as `kind=system`
messages, with categories that the chat UI color-codes (rebel / freekill /
mass / lr / freeday / round / killfeed / join / leave).

## What it parses

- Player kills (CT↔T, weapon, headshot flag) — for **rebel** detection, mass
  freekill (3+/5+ T-kills by a single CT per round), and loud-weapon
  killfeed (knife, awp, scout, deagle, m3, xm1014, grenade)
- Round start (resets the mass tally) and team score updates
- Chat messages — keyword flag for `freeday` / `lr` / `bunt`
- Connect / disconnect (60 s cooldown so leavers don't spam)

Per-category cooldowns prevent a streak from drowning chat:

| Category   | Cooldown |
|------------|---------:|
| rebel      |      5 s |
| killfeed   |      8 s |
| mass       |     30 s |
| round      |      5 s |
| lr/freeday |      5 s |
| join/leave |     60 s |

## Install (on the forum VPS)

```sh
sudo mkdir -p /opt/cs-log-listener
sudo cp listener.py /opt/cs-log-listener/
sudo cp cs-log-listener.service /etc/systemd/system/
sudo tee /opt/cs-log-listener/listener.env >/dev/null <<EOF
CS_LOG_PORT=27500
FORUM_API=http://127.0.0.1:8030
SHOUTBOX_SYSTEM_TOKEN=<value from /home/i48ptgvnis/forum/.env>
EOF
sudo chmod 600 /opt/cs-log-listener/listener.env
sudo systemctl daemon-reload
sudo systemctl enable --now cs-log-listener
sudo journalctl -fu cs-log-listener
```

## CS server side (server.cfg)

```
log on
mp_logmessages 1
mp_logdetail 3
logaddress_add 170.168.72.200 27500
```

After editing, **restart the server** for `log on` to take effect.
Verify via RCON: `logaddress_list` should show `170.168.72.200:27500`.

If `logaddress_add` does nothing (very old HLDS), try the legacy single-
target form: `logaddress 170.168.72.200 27500`.
