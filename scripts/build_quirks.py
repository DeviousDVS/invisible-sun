"""
Write module/helpers/quirks.local.mjs from source/data/quirks.json.

The quirks are book text, so the file that ships (quirks.mjs) is an empty stub
and the real list goes beside it in quirks.local.mjs, which is gitignored. The
system loads that at init when it is there and carries on without it when it is
not, the same way the compendia and the card art behave.

It used to write quirks.mjs itself. That put fifty lines of Monte Cook Games'
text into a file the release archive shipped, which is exactly what this
project promises not to do.

Usage:  python3 scripts/build_quirks.py
"""
import json, pathlib

OUT = pathlib.Path('module/helpers/quirks.local.mjs')

quirks = json.load(open('source/data/quirks.json', encoding='utf-8'))
body = ",\n".join("  " + json.dumps(q, ensure_ascii=False) for q in quirks)
OUT.write_text(
    "/* GENERATED — do not edit, and do not commit.\n"
    " *\n"
    " * Written from source/data/quirks.json by scripts/build_quirks.py.\n"
    " * This is Monte Cook Games' text and is gitignored on purpose.\n"
    " */\n"
    f"export const QUIRKS = [\n{body}\n];\n", encoding='utf-8')
print(f"{len(quirks)} quirks -> {OUT}")
