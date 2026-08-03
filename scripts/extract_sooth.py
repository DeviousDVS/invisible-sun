"""
Extract the Sooth Deck.

Unlike the other decks these cards carry almost no text: a name, a value, and
either the two suns the card shifts or — on a royalty card — its rank. The name
is set along a curved path, so pdftotext breaks it into fragments and can order
them wrongly ("W" before "hi spering Lover"). The fragments are therefore read
from their word boxes and reassembled left to right, with a space inserted only
where there is a real gap between them.

Families are not printed on the card; they are carried by the icon art. But The
Gate (p6013) says the deck is 60 cards in four families of 15, each family
holding a set of royalty cards, and the sheets print the families in unbroken
runs — every run of 15 contains exactly one card of each of the six ranks, and
the Companion of each run is its family's animal (Raven, Swan, Rat, Cat), which
The Gate lists against Secrets, Visions, Mysteries and Notions in that order.
That is what fixes the families here, and the script asserts it rather than
assuming it.

Usage:  python3 scripts/extract_sooth.py <deck.pdf> <out.json>
"""
import re, json, sys, subprocess

WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" '
                     r'yMax="[\d.]+"[^>]*>([^<]*)</word>')

# Two cards across, two down. The bands are the name, the value and the
# suns-or-rank line, for the top card and then the bottom one.
COLUMNS = [(0, 400), (400, 800)]
BANDS = [(20, 120), (120, 220), (220, 300)]     # top card
BANDS_LOWER = [(300, 400), (400, 500), (500, 580)]

# A gap wider than this between two fragments is a word break rather than the
# curve splitting one word.
GAP = 1.5

RANKS = {'Apprentice', 'Companion', 'Defender', 'Adept', 'Sovereign', 'Nemesis'}
SUNS = {'Silver', 'Green', 'Blue', 'Indigo', 'Grey', 'Pale', 'Red', 'Gold', 'Invisible'}

# The Gate, p6013: each family's animal, in the order the families are listed.
FAMILY_BY_ANIMAL = {'Raven': 'secrets', 'Swan': 'visions',
                    'Rat': 'mysteries', 'Cat': 'notions'}


def words(pdf, page):
    xml = subprocess.run(['pdftotext', '-bbox', '-f', str(page), '-l', str(page), pdf, '-'],
                         capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), d) for a, b, c, d in WORD_RE.findall(xml)]


def read_band(ws, lo, hi, y0, y1):
    """Reassemble one line of a card from its fragments, left to right."""
    frags = sorted((w for w in ws if lo <= w[0] < hi and y0 <= w[1] < y1),
                   key=lambda w: w[0])
    out, prev_end = '', None
    for x0, _, x1, text in frags:
        if prev_end is not None and x0 - prev_end > GAP:
            out += ' '
        out += text
        prev_end = x1
    return re.sub(r'\s+', ' ', out).strip()


def extract(pdf):
    pages = int(re.search(r'Pages:\s*(\d+)',
                subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))

    cards = []
    for page in range(1, pages + 1):
        ws = [w for w in words(pdf, page) if w[1] < 580]
        if not ws:
            continue
        # Cards read across the sheet before down it.
        for bands in (BANDS, BANDS_LOWER):
            for lo, hi in COLUMNS:
                name, value, last = (read_band(ws, lo, hi, *b) for b in bands)
                if not name or not value.isdigit():
                    continue
                card = {'name': name, 'value': int(value),
                        'rank': '', 'enhancedSun': '', 'diminishedSun': ''}
                parts = last.split()
                if len(parts) == 1 and parts[0] in RANKS:
                    card['rank'] = parts[0]
                elif parts and all(p in SUNS for p in parts):
                    # The card shifts one sun up and another down. The upper is
                    # printed first.
                    card['enhancedSun'] = parts[0]
                    card['diminishedSun'] = parts[1] if len(parts) > 1 else ''
                elif last:
                    card['unparsed'] = last
                cards.append(card)
    return cards


def assign_families(cards):
    """Families run in unbroken blocks of 15; the Companion names each block."""
    if len(cards) % 15:
        raise SystemExit(f'expected a multiple of 15 cards, got {len(cards)}')
    for i in range(0, len(cards), 15):
        block = cards[i:i + 15]
        ranks = [c['rank'] for c in block if c['rank']]
        if sorted(ranks) != sorted(RANKS):
            raise SystemExit(f'block at {i} has ranks {ranks}, expected all six')
        companion = next(c['name'] for c in block if c['rank'] == 'Companion')
        family = FAMILY_BY_ANIMAL.get(companion)
        if not family:
            raise SystemExit(f'block at {i} has Companion {companion!r}, not a family animal')
        for c in block:
            c['family'] = family
    return cards


if __name__ == '__main__':
    data = assign_families(extract(sys.argv[1]))
    json.dump(data, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)

    print(f'{len(data)} sooth cards -> {sys.argv[2]}')
    fams = {}
    for c in data:
        fams[c['family']] = fams.get(c['family'], 0) + 1
    print('  families:', fams)
    print('  royalty:', sum(1 for c in data if c['rank']),
          ' with suns:', sum(1 for c in data if c['enhancedSun']))
    odd = [c['name'] for c in data if 'unparsed' in c]
    if odd:
        print('  unparsed last line on:', odd)
    for c in data[:4]:
        print(f"   {c['name']:<28} {c['value']}  {c['family']:<10} "
              f"{c['rank'] or c['enhancedSun'] + '/' + c['diminishedSun']}")
