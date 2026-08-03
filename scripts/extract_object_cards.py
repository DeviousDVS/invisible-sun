"""
Extract objects of power and ephemera from the printed card decks.

These share the spell cards' layout and are read with the same column-finding
code; see extract_spell_cards for why the grid has to be measured per page.
They differ in carrying a Form — the physical thing the magic lives in — and in
labelling their depletion "Object Depletion". Objects of power also cite the
book they are described in, which is kept as a reference.

Some cards head the name with a category banner (ARTIFACT, RELIC). That is the
kind of object, not part of its name, so it is split off.

Usage:  python3 scripts/extract_object_cards.py <out.json> <deck.pdf> [deck.pdf ...]
"""
import re, json, sys

from extract_spell_cards import (column_text, find_columns, page_size,
                                 join_name, NAME_RE, NOISE_RE, LEVEL_RE)

# An object that produces an ongoing effect tracks that effect separately from
# the object itself, so it prints two depletions, and labels the effect's colour
# "Effect" rather than "Color".
FIELD_RE = re.compile(r'^(Object Depletion|Effect Depletion|Depletion'
                      r'|Level|Form|Color|Colour|Effect)\s*:\s*(.*)$')

# Labels holding a single word. Whatever follows one is the card's closing
# italic note, not more of the label.
SINGLE_LINE = {'color', 'colour', 'effect'}

# Banners printed above a name to say what kind of object it is.
BANNERS = {'ARTIFACT', 'RELIC', 'KINDLED', 'INSTALLATION', 'CONFLUX',
           'CHARM', 'CYPHER', 'ODDITY'}

# A Form that breaks mid-phrase: it ends on a comma or a joining word, so
# whatever follows belongs to it however it is capitalised.
INCOMPLETE_RE = re.compile(r'(,|\b(?:of|and|or|with|in|on|for|the|a|an))$', re.I)

# The trailing citation: a book title, then "<topic>, page <n>".
BOOKS = {'THE PATH', 'THE WAY', 'THE KEY', 'THE GATE', 'BOOK M'}
PAGE_RE = re.compile(r'^(.*),\s*page\s*(\d+)$')


def format_reference(parts):
    """The book title is set in caps above the page line; read it back as prose."""
    if not parts:
        return ''
    parts = list(parts)
    if parts[0] in BOOKS:
        return f'{parts.pop(0).title()}, ' + ' '.join(parts).strip()
    return ' '.join(parts).strip()


def split_cards(lines):
    """As in the spell decks, but a name may be preceded by a category banner."""
    runs, i = [], 0
    while i < len(lines):
        s = lines[i].strip()
        if NAME_RE.match(s) and not NOISE_RE.match(s):
            start, parts = i, []
            while i < len(lines) and NAME_RE.match(lines[i].strip()) \
                    and not NOISE_RE.match(lines[i].strip()):
                parts.append(lines[i].strip())
                i += 1
            runs.append((start, parts, i))
        else:
            i += 1

    cards = []
    for n, (start, parts, body_at) in enumerate(runs):
        end = len(lines)
        if n + 1 < len(runs):
            nxt_start, nxt_parts, _ = runs[n + 1]
            # A card closes with "THE PATH / Noösphere, page 14". The book title
            # is all-caps, so it opens the next card's name run and takes the
            # page line with it. Both belong to this card, so the slice is
            # extended over them.
            k = 0
            while k < len(nxt_parts) and nxt_parts[k] in BOOKS:
                k += 1
            end = nxt_start + k
            if k and end < len(lines) and PAGE_RE.match(lines[end].strip()):
                end += 1
        card = parse_card(parts, lines[body_at:end])
        if card:
            cards.append(card)
    return cards


def parse_card(name_parts, lines):
    kind = ''
    while name_parts and name_parts[0] in BANNERS:
        kind = name_parts.pop(0)
    # The citation's book title is all-caps too, so it joins the name run of
    # whichever card follows it.
    while name_parts and name_parts[0] in BOOKS:
        name_parts.pop(0)
    if not name_parts:
        return None
    name = join_name(name_parts)

    # A Form runs to several lines and the description follows it with no
    # marker between them, so the two can only be told apart by layout: the
    # card sets every label and the first line of the description flush left,
    # and indents everything that continues one of them.
    body = [l for l in lines if l.strip() and not NOISE_RE.match(l.strip())]
    labelled = [l for l in body if FIELD_RE.match(l.strip())]
    if not labelled:
        return None
    base = min(len(l) - len(l.lstrip()) for l in labelled)

    desc, fields, ref, current = [], {}, [], None
    for l in body:
        s = l.strip()
        m = FIELD_RE.match(s)
        if m:
            current = m.group(1).lower()
            value = m.group(2).strip()
            if current in SINGLE_LINE:
                # These hold one word. A wide gap after it means the citation
                # got set on the same line.
                parts = re.split(r'\s{3,}', value, maxsplit=1)
                value = parts[0]
                if len(parts) > 1:
                    ref.append(parts[1])
            fields[current] = value
            continue
        if s in BOOKS or PAGE_RE.match(s):
            ref.append(s)
            current = 'ref'
            continue
        if len(l) - len(l.lstrip()) <= base:
            current = None       # flush left: a new block, not a continuation
        elif current in SINGLE_LINE:
            current = 'note'
            fields.setdefault('note', '')
        elif current == 'form' and s[:1].isupper() and not INCOMPLETE_RE.search(fields['form']):
            # One card in the Book M deck indents the first line of its
            # description, so indentation alone would fold it into the Form.
            # A capital starts the description unless the Form is plainly
            # unfinished — "Icon of Diamelu," wraps onto "Goddess of Thieves".
            current = None
        if current == 'ref':
            ref.append(s)
        elif current:
            fields[current] = (fields[current] + ' ' + s).strip()
        else:
            desc.append(s)

    if 'level' not in fields or 'form' not in fields:
        return None

    level, dice = fields['level'], ''
    m = LEVEL_RE.match(level)
    if m:
        level, dice = m.group(1), (m.group(2) or '').strip()

    return {
        'name': name.title().replace('’S ', '’s ').replace("'S ", "'s "),
        'kind': kind.title(),
        'level': level,
        'dice': dice,
        'form': fields.get('form', ''),
        'description': ' '.join(desc).strip(),
        'depletion': fields.get('object depletion') or fields.get('depletion', ''),
        'effectDepletion': fields.get('effect depletion', ''),
        'color': (fields.get('color') or fields.get('colour')
                  or fields.get('effect', '')).title(),
        'reference': format_reference(ref),
        # Many cards close with an italic aside — a rules clarification or a
        # hook. It is card text, so it is kept rather than discarded.
        'note': fields.get('note', '').strip(),
    }


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
            c['deck'] = re.sub(r'-Self Print.*|\.pdf$', '', deck)
            prev = best.get(c['name'].upper())
            if not prev or len(c['description']) > len(prev['description']):
                best[c['name'].upper()] = c

    data = sorted(best.values(), key=lambda c: c['name'])
    json.dump(data, open(out, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(data)} unique objects -> {out}')
    for f in ('form', 'description', 'color', 'level'):
        miss = [c['name'] for c in data if not c[f]]
        if miss:
            print(f'  missing {f}: {len(miss)}  e.g. {miss[:5]}')
    kinds = {}
    for c in data:
        kinds[c['kind']] = kinds.get(c['kind'], 0) + 1
    print('  kinds:', kinds)
    print('  interleaved:', sum(1 for c in data if re.search(r'   ', c['description'])))
