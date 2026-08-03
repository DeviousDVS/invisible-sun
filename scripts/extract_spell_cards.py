"""
Extract spells from the printed card decks.

The decks carry two things the books do not state per spell: the bonus dice a
spell grants ("Level: 2 (+1 die)") and its Depletion. Both are printed on the
card face, so the decks are the authority for them.

Cards are laid out several across, so a whole-page dump interleaves them line by
line. Each column is cropped separately with pdftotext -x/-W, which keeps a
card's text together, and the column is then split on the all-caps card names.
A name may wrap over two or three lines.

The decks do not share a layout — the main Spell Deck is four across but the
Vance deck is three — and cropping on the wrong grid slices cards in half, which
shows up as two cards' text interleaved in one description. The grid is
therefore measured per page; see find_columns.

Usage:  python3 scripts/extract_spell_cards.py <out.json> <deck.pdf> [deck.pdf ...]
"""
import re, json, sys, subprocess

# Two anchors closer together than this belong to the same card.
MIN_PITCH = 60
# Slack added to each side of a measured column.
PAD = 4
# A name line is all-caps. Digits appear in none of them, but the trailing
# card-count furniture ("1 OF 4") does, so they are excluded.
NAME_RE = re.compile(r"^[A-Z][A-Z '’\-,!]{2,30}$")
FIELD_RE = re.compile(r'^(Level|Depletion|Color|Colour|Facets?|Cost|Range|Duration|Form)'
                      r'\s*:\s*(.*)$', re.I)
# "2 (+1 die)" / "5 (+2 dice)" — the level, then the bonus dice it grants. The
# parenthetical can be a whole clause, and long ones wrap onto the next line.
LEVEL_RE = re.compile(r'^\s*(\d+)\s*(?:\((.*)\))?\s*$')

NOISE_RE = re.compile(r'^(TM and ©|Permission granted|This page left|\d+\s*OF\s*\d+$)', re.I)

# Fields whose value can run onto the next line. Color and Facet are always a
# single word, so a line following one of them starts the card's flavour note
# rather than continuing the field.
CONTINUABLE = {'level', 'depletion'}

# The copyright line runs the full width of the sheet rather than sitting in a
# card, so a column crop catches whatever fragment of it falls in that column
# and hangs it off the last card. It is cropped away by height instead.
FOOTER_WORDS = {'©2019', '©2018', 'trademarks', 'Permission', 'duplicate'}


def page_size(pdf):
    out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    w, h = re.search(r'Page size:\s*([\d.]+) x ([\d.]+)', out).groups()
    pages = int(re.search(r'Pages:\s*(\d+)', out).group(1))
    return int(float(w)), int(float(h)), pages


# Some cards set a word vertically down their edge, one letter per line. Those
# letters land far to the right of the card's own text and would otherwise be
# read as part of it. A stray is short and stands well clear of the text.
STRAY_RE = re.compile(r'\S {6,}\S{1,2}$')


def column_text(pdf, page, x, w, h):
    r = subprocess.run(['pdftotext', '-layout', '-f', str(page), '-l', str(page),
                        '-x', str(x), '-y', '0', '-W', str(w), '-H', str(h), pdf, '-'],
                       capture_output=True, text=True)
    lines = []
    for l in r.stdout.split('\n'):
        l = l.rstrip()
        while STRAY_RE.search(l):
            l = re.sub(r' {6,}\S{1,2}$', '', l)
        lines.append(l)
    return lines


def split_cards(lines):
    """
    A column holds up to two cards. Each begins with its name, which may wrap
    over several lines, so a run of consecutive all-caps lines is one name.
    """
    runs, i = [], 0
    while i < len(lines):
        if NAME_RE.match(lines[i].strip()) and not NOISE_RE.match(lines[i].strip()):
            start, parts = i, []
            while i < len(lines) and NAME_RE.match(lines[i].strip()) \
                    and not NOISE_RE.match(lines[i].strip()):
                parts.append(lines[i].strip())
                i += 1
            runs.append((start, ' '.join(parts), i))
        else:
            i += 1

    cards = []
    for n, (start, name, body_at) in enumerate(runs):
        end = runs[n + 1][0] if n + 1 < len(runs) else len(lines)
        card = parse_card(name, lines[body_at:end])
        if card:
            cards.append(card)
    return cards


def parse_card(name, lines):
    """
    A card reads: name, Level, the description, then the remaining labels.

    Both the description and a label's value can run to several lines, and they
    are told apart by position — Level always leads, so an unlabelled line after
    it starts the description, and once a second label appears everything
    unlabelled after it continues that label rather than the description.
    """
    desc, fields, current = [], {}, None
    for l in lines:
        s = l.strip()
        if not s or NOISE_RE.match(s):
            continue
        m = FIELD_RE.match(s)
        if m:
            current = m.group(1).lower().rstrip('s') if m.group(1).lower().startswith('facet') \
                else m.group(1).lower()
            fields[current] = m.group(2).strip()
            continue
        if current == 'level' and fields['level'].count('(') == fields['level'].count(')'):
            # Level is complete, so this is the description starting.
            current = None
        elif current and current not in CONTINUABLE:
            # Past the single-word labels: the rest of the card is its note.
            current = 'note'
            fields.setdefault('note', '')
        if current:
            fields[current] = (fields[current] + ' ' + s).strip()
        else:
            desc.append(s)

    # A card without a Level is the deck's title card or a rules card.
    if 'level' not in fields:
        return None
    # Some decks mix in objects of power, which are the same size and carry a
    # Level too. Only an object states the physical Form it takes.
    if 'form' in fields:
        return None

    level, dice = fields['level'], ''
    m = LEVEL_RE.match(level)
    if m:
        level, dice = m.group(1), (m.group(2) or '').strip()

    return {
        'name': name.title().replace('’S ', '’s ').replace("'S ", "'s "),
        'level': level,
        'dice': dice,
        'description': ' '.join(desc).strip(),
        'depletion': fields.get('depletion', ''),
        'color': (fields.get('color') or fields.get('colour', '')).title(),
        'facets': fields.get('facet', ''),
        # Many cards close with an italic aside — a rules clarification or a
        # hook. It is card text, so it is kept rather than discarded.
        'note': fields.get('note', '').strip(),
    }


WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="[\d.]+"[^>]*>([^<]*)</word>')
# The labelled lines every card carries, always at its left text margin. The
# colon is required and the case is not folded: without both, the word "level"
# in a description counts as an anchor and invents a column.
ANCHOR_RE = re.compile(r'^(Level|Form|Type|Depletion|Color|Colour):$')


def find_columns(pdf, page, width, height):
    """
    Measure the card columns on one page.

    Projecting word boxes onto the x axis and looking for empty bands almost
    works, but card names are centred and a long one reaches the card edge,
    closing the gutter beside it. The labelled lines are steadier: every card
    prints "Level:" at its left text margin, so their x positions give the grid
    pitch. The cards are then tiled from the middle of the page, which puts the
    label inset at 31pt on every deck checked — the decks share a card template
    and differ only in how many fit across a sheet.

    Returns (crops, height): a list of (x, width) column crops and the height to
    read down to, which stops above the copyright line. Crops are [] if the page
    holds no cards.
    """
    xml = subprocess.run(['pdftotext', '-bbox', '-f', str(page), '-l', str(page), pdf, '-'],
                         capture_output=True, text=True).stdout
    words = [(float(m.group(1)), float(m.group(2)), m.group(3)) for m in WORD_RE.finditer(xml)]
    if not words:
        return [], height

    # Several of the footer's words also occur in ordinary card text — Corpus
    # Replica's description uses "duplicate" — so a single hit is not enough.
    # The real footer puts all of its words on one baseline.
    lines = {}
    for _, y, t in words:
        if t.strip() in FOOTER_WORDS:
            lines.setdefault(round(y), 0)
            lines[round(y)] += 1
    footer = [y for y, n in lines.items() if n >= 2]
    usable = min(footer) - 1 if footer else height

    anchors = sorted(x for x, _, t in words if ANCHOR_RE.match(t.strip()))
    if not anchors:
        return [], usable

    lefts = []
    for x in anchors:
        if not lefts or x - lefts[-1] > MIN_PITCH:
            lefts.append(x)

    # A sheet holding a single column needs no grid: take the whole page.
    if len(lefts) == 1:
        return [(0, width)], usable

    pitch = min(b - a for a, b in zip(lefts, lefts[1:]))
    origin = (width - len(lefts) * pitch) / 2
    return [(int(max(0, origin + i * pitch - PAD)), int(pitch + 2 * PAD))
            for i in range(len(lefts))], usable


def extract(pdf):
    w, h, pages = page_size(pdf)
    cards, counts, fronts = [], set(), 0
    for page in range(1, pages + 1):
        cols, usable = find_columns(pdf, page, w, h)
        if not cols:
            continue
        fronts += 1
        counts.add(len(cols))
        for x, cw in cols:
            cards.extend(split_cards(column_text(pdf, page, x, cw, usable)))
    print(f'    {fronts} front pages, {sorted(counts)} columns per page')
    return cards


if __name__ == '__main__':
    out, pdfs = sys.argv[1], sys.argv[2:]
    best = {}
    for pdf in pdfs:
        found = extract(pdf)
        deck = pdf.split('/')[-1]
        print(f'  {len(found):>4} cards  {deck}')
        for c in found:
            # The Vance decks are Vancian spells; the rest are cast by anyone.
            c['spellType'] = 'vance' if 'Vance' in deck else 'general'
            c['deck'] = re.sub(r'-Self Print.*|\.pdf$', '', deck)
            # A card can be cut by a column boundary and appear twice; the
            # fuller copy wins.
            prev = best.get(c['name'].upper())
            if not prev or len(c['description']) > len(prev['description']):
                best[c['name'].upper()] = c

    data = sorted(best.values(), key=lambda c: c['name'])
    json.dump(data, open(out, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(data)} unique spells -> {out}')
    for f in ('level', 'description', 'color'):
        miss = [c['name'] for c in data if not c[f]]
        if miss:
            print(f'  missing {f}: {len(miss)}  e.g. {miss[:5]}')
