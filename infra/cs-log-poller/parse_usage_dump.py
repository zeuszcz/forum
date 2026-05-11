"""Parse a condump from CS 1.6 client console into structured JbfCommand
flag data.

Input: cstrike/uaio_usage_dump.txt produced by:
    con_maxsize 65536
    exec uaio_usage_dump.cfg
    condump uaio_usage_dump.txt

Output (stdout): a JSON array `[{cmd, label, flags, example}, ...]` ready
to patch into frontend/src/lib/jbf-commands.ts. Run:

    python parse_usage_dump.py /path/to/uaio_usage_dump.txt > flags.json

Each command block in the dump looks like:

    ===JBF_CMD <slug>===
    ] <slug>
    ===================================================
    Команда "<slug>" для эффекта: <Human label>

    Параметры:
    -n ник игрока
    -g группа (All/T/CT/Color/Aim)
    -b действие (1/0)

    Пример использования: <slug> -n Player -b 1
    ===================================================

The parser is forgiving — different command blocks may have a slightly
different layout (some have extra notes, some none); we extract what
we can and skip blocks that look broken.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

_RE_CMD_DELIM = re.compile(r"^===JBF_CMD\s+(?P<slug>\S+)===\s*$")
_RE_LABEL = re.compile(
    r'^Команда\s+"(?P<cmd>[^"]+)"\s+для\s+эффекта:\s*(?P<label>.+?)\s*$'
)
_RE_FLAG = re.compile(
    r"^(?P<flag>-[a-zA-Z]+)\s+(?P<label>.+?)\s*$"
)
_RE_EXAMPLE = re.compile(
    r"^Пример\s+использования:\s*(?P<example>.+?)\s*$"
)


def _parse_flag_line(line: str) -> dict[str, str] | None:
    m = _RE_FLAG.match(line)
    if not m:
        return None
    flag = m["flag"]
    rest = m["label"].strip()
    # Split out a values vocabulary in parentheses: "группа (All/T/CT)"
    # We greedy-match the LAST parenthesised expression to be robust against
    # nested ones like "(для -g Color)".
    values = None
    bracket_match = re.search(r"\(([^()]+)\)\s*$", rest)
    if bracket_match:
        values = bracket_match.group(1).strip()
        rest = rest[: bracket_match.start()].strip()
    out: dict[str, str] = {"flag": flag, "label": rest}
    if values:
        out["values"] = values
    return out


def parse_dump(text: str) -> list[dict]:
    # Split by delimiter markers — each chunk is one command's full output.
    chunks: list[tuple[str, list[str]]] = []
    current_slug: str | None = None
    current_lines: list[str] = []
    for raw_line in text.splitlines():
        # Echoes in the console show as "] echo ..." OR plain text on their
        # own line, depending on the rehlds version. Match the actual echoed
        # content, not the prompt prefix.
        line = raw_line.strip()
        m = _RE_CMD_DELIM.match(line)
        if not m:
            # Some builds prefix the line with "] " (console prompt).
            stripped = line.lstrip("] ").strip()
            m = _RE_CMD_DELIM.match(stripped)
        if m:
            if current_slug is not None:
                chunks.append((current_slug, current_lines))
            current_slug = m["slug"]
            current_lines = []
            continue
        if current_slug is None:
            continue
        current_lines.append(raw_line)
    if current_slug is not None:
        chunks.append((current_slug, current_lines))

    out: list[dict] = []
    for slug, lines in chunks:
        entry: dict = {"cmd": slug}
        in_params = False
        for line in lines:
            stripped = line.strip()
            if not stripped or set(stripped) <= {"="}:
                in_params = False
                continue
            if m := _RE_LABEL.match(stripped):
                entry["label"] = m["label"]
                continue
            if stripped.lower().startswith("параметры:"):
                in_params = True
                entry["flags"] = []
                continue
            if m := _RE_EXAMPLE.match(stripped):
                entry["example"] = m["example"]
                in_params = False
                continue
            if in_params:
                flag = _parse_flag_line(stripped)
                if flag:
                    entry.setdefault("flags", []).append(flag)
        if "label" in entry or "flags" in entry:
            out.append(entry)
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: parse_usage_dump.py <dump.txt>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8", errors="replace")
    parsed = parse_dump(text)
    print(json.dumps(parsed, ensure_ascii=False, indent=2))
    print(f"// {len(parsed)} commands parsed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
