"""
Extract Weaver aggregates from the Weaver Aggregates card deck.

Cards are printed four across, so a whole-page text dump interleaves four cards
line by line. Each column is cropped separately with pdftotext -x/-W instead,
which keeps a card's text together. A column may hold two cards stacked, so the
text is then split on the all-caps card name.

Usage:  python3 scripts/extract_aggregates.py <deck.pdf> <out.json>
"""
import re, json, sys, subprocess

COLUMNS = 4
NAME_RE = re.compile(r"^([A-Z][A-Z '’-]{2,28})$")
DUR_RE = re.compile(r'Default Duration:\s*(.+?)\s*$')
RNG_RE = re.compile(r'Default Range:\s*(.+?)\s*$')


def page_size(pdf):
    out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    m = re.search(r'Page size:\s*([\d.]+) x ([\d.]+)', out)
    n = re.search(r'Pages:\s*(\d+)', out)
    return int(float(m.group(1))), int(float(m.group(2))), int(n.group(1))


def column_text(pdf, page, x, w, h):
    r = subprocess.run(['pdftotext', '-layout', '-f', str(page), '-l', str(page),
                        '-x', str(x), '-y', '0', '-W', str(w), '-H', str(h), pdf, '-'],
                       capture_output=True, text=True)
    return [l.rstrip() for l in r.stdout.split('\n')]


def parse_column(lines):
    """A column holds one or two cards; each starts at its all-caps name."""
    starts = [i for i, l in enumerate(lines) if NAME_RE.match(l.strip())
              and l.strip() not in {'QUALITIES', 'ABSENCES'}]
    cards = []
    for n, s in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        cards.append(parse_card(lines[s:end]))
    return [c for c in cards if c]


def parse_card(lines):
    name = lines[0].strip()
    desc, duration, rng = [], '', ''
    qualities, absences = [], []
    section = 'desc'

    for l in lines[1:]:
        s = l.strip()
        if not s:
            continue
        if s == 'QUALITIES':
            section = 'q'; continue
        if s == 'ABSENCES':
            section = 'a'; continue
        m = DUR_RE.search(s)
        if m:
            duration = m.group(1); continue
        m = RNG_RE.search(s)
        if m:
            rng = m.group(1); continue
        if 'Monte Cook Games' in s or 'intentionally blank' in s:
            continue
        if section == 'desc':
            desc.append(s)
        elif section == 'q':
            qualities.append(s)
        else:
            absences.append(s)

    if not (qualities or absences):
        return None
    return {
        'name': name.title().replace('’S ', '’s '),
        'description': ' '.join(desc).strip(),
        'default_duration': duration,
        'default_range': rng,
        'qualities': qualities,
        'absences': absences,
    }


def extract(pdf):
    w, h, pages = page_size(pdf)
    colw = w // COLUMNS
    cards = []
    for page in range(1, pages + 1):
        for c in range(COLUMNS):
            cards.extend(parse_column(column_text(pdf, page, c * colw, colw, h)))
    # A card printed across a column boundary can appear twice; keep the fuller.
    best = {}
    for c in cards:
        prev = best.get(c['name'])
        if not prev or len(c['qualities']) + len(c['absences']) > len(prev['qualities']) + len(prev['absences']):
            best[c['name']] = c
    return sorted(best.values(), key=lambda c: c['name'])


if __name__ == '__main__':
    data = extract(sys.argv[1])
    json.dump(data, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    print(f'{len(data)} aggregates -> {sys.argv[2]}')
    for c in data:
        miss = [k for k in ('description', 'default_duration', 'default_range') if not c[k]]
        print(f"  {c['name'][:22]:<24} {len(c['qualities'])}q {len(c['absences'])}a"
              f"  {c['default_range'] or '?':<8} {c['default_duration'] or '?':<12}"
              + (f" MISSING: {','.join(miss)}" if miss else ''))
