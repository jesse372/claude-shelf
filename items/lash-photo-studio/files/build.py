#!/usr/bin/env python3
"""Inline the favicon/home-screen icon snippet into the page. Run by wrangler on every deploy."""
from pathlib import Path
root = Path(__file__).parent
page = (root / "src/page.html").read_text()
icons = (root / "head-snippet.html").read_text().strip()
(root / "build").mkdir(exist_ok=True); (root / "build/index.html").write_text(page.replace("<!--ICONS-->", icons))
print("built build/index.html")
