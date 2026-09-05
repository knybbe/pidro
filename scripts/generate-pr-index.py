#!/usr/bin/env python3
"""Generate a static HTML index of open PR previews for GitHub Pages."""
from __future__ import annotations

import html
import json
import pathlib
import subprocess
import sys


def run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True)


def main() -> int:
    out_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/pr-index")
    out_dir.mkdir(parents=True, exist_ok=True)

    raw = run(
        [
            "gh",
            "pr",
            "list",
            "--repo",
            "knybbe/pidro",
            "--state",
            "open",
            "--json",
            "number,title,url",
            "--limit",
            "100",
        ]
    )
    pulls = json.loads(raw)
    pulls.sort(key=lambda p: p["number"], reverse=True)

    items: list[str] = []
    for p in pulls:
        n = p["number"]
        title = html.escape(p["title"])
        preview = f"https://knybbe.github.io/pidro/{n}/"
        pr_url = html.escape(p["url"])
        items.append(
            f'<li><a class="preview" href="{preview}">#{n}</a> '
            f'<span class="title">{title}</span> '
            f'<a class="gh" href="{pr_url}">GitHub</a></li>'
        )

    body = (
        "\n          ".join(items)
        if items
        else '<li class="empty">No active PR previews right now.</li>'
    )

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pidro PR previews</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{
      margin: 0; font-family: system-ui, sans-serif;
      background: #0c1410; color: #e8f0ea;
      line-height: 1.5; padding: 2rem 1.25rem;
    }}
    main {{ max-width: 42rem; margin: 0 auto; }}
    h1 {{ color: #8fd6a8; font-size: 1.5rem; margin: 0 0 0.5rem; }}
    p {{ color: #a8b5ac; margin: 0 0 1.5rem; }}
    a {{ color: #8fd6a8; }}
    ul {{ list-style: none; padding: 0; margin: 0; }}
    li {{
      background: #122018; border: 1px solid #1a5c3a;
      border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 0.65rem;
      display: flex; flex-wrap: wrap; gap: 0.5rem 0.85rem; align-items: baseline;
    }}
    .preview {{ font-weight: 700; text-decoration: none; }}
    .title {{ flex: 1 1 12rem; color: #e8f0ea; }}
    .gh {{ font-size: 0.9rem; color: #9bb7a6; }}
    .empty {{ color: #a8b5ac; border-style: dashed; }}
    .prod {{ margin-top: 1.5rem; font-size: 0.95rem; }}
  </style>
</head>
<body>
  <main>
    <h1>Pidro PR previews</h1>
    <p>Open pull requests with GitHub Pages preview deployments.</p>
    <ul>
          {body}
    </ul>
    <p class="prod">Production: <a href="https://knybbe.github.io/pidro/">https://knybbe.github.io/pidro/</a></p>
  </main>
</body>
</html>
"""
    (out_dir / "index.html").write_text(page)
    print(f"Indexed {len(pulls)} open PR(s) -> {out_dir / 'index.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
