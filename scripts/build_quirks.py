"""
Write module/helpers/quirks.mjs from source/data/quirks.json.

The list is static book data with no mechanics, so it ships as a module rather
than being fetched at runtime; this keeps source/data as the one place it is
edited.

Usage:  python3 scripts/build_quirks.py
"""
import json, pathlib

quirks = json.load(open('source/data/quirks.json', encoding='utf-8'))
body = ",\n".join("  " + json.dumps(q, ensure_ascii=False) for q in quirks)
header = pathlib.Path('module/helpers/quirks.mjs').read_text(encoding='utf-8').split('export const')[0]
pathlib.Path('module/helpers/quirks.mjs').write_text(
    f"{header}export const QUIRKS = [\n{body}\n];\n", encoding='utf-8')
print(f"{len(quirks)} quirks -> module/helpers/quirks.mjs")
