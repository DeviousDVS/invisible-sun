"""
Extract the Sooth card write-ups from The Gate.

The cards themselves carry only a name, a value and their suns; everything that
makes a card usable at the table — its meanings, what it says as a divination,
and what it hands the GM as narrative, Joy and Despair — is written up in The
Gate, one card to a page.

Those pages are set in two columns around a circular illustration, so the text
wraps and the column edges move line by line. A page dump therefore interleaves
the columns. Instead each line is split on the wide gaps within it: the first
run of words belongs to the left column, the last to the right, and anything
between them is a label printed over the art. Reading the left column down and
then the right recovers the true order — the right column opens mid-sentence,
continuing the Divination the left column ran out of room for.

Usage:  python3 scripts/extract_sooth_entries.py <The-Gate.pdf> <sooth.json> <out.json>
"""
import re, json, sys, subprocess

WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" '
                     r'yMax="[\d.]+"[^>]*>([^<]*)</word>')

# Words further apart than this are in different columns rather than the same
# sentence. Ordinary word spacing on these pages is under 5pt.
COLUMN_GAP = 18
# Lines whose baselines are closer than this are one line: a label and its
# value are set a half point apart.
LINE_TOL = 2
# Left of this is the left column; the art and the right column are beyond it.
LEFT_EDGE = 300
# The illustration sits in the middle of the page, under both columns' inner
# edges. Stray letters here belong to the name arced over the art.
ART_BAND = (300, 540)

LABELS = ['Value', 'Meanings', 'Divination', 'Game Narrative', 'Joy', 'Despair']
LABEL_START_RE = re.compile(rf'^({"|".join(LABELS)}):')

SUNS = {'Silver', 'Green', 'Blue', 'Indigo', 'Grey', 'Pale', 'Red', 'Gold', 'Invisible'}

# A plain card's mechanical effect is its sun shift, which the card itself
# states. A royalty card's is set by its rank rather than written on its page
# (The Gate, p6110), so it is filled in from there.
RANK_EFFECTS = {
    'Sovereign': '+1 to all actions, +2 if heart is linked to family',
    'Nemesis': '\u22121 to all actions, \u22122 if heart is linked to family',
    'Defender': '+2 to all actions if heart is linked to family',
    'Apprentice': '\u22121 to all actions if heart is linked to family',
    'Companion': 'Duplicates the effects of the previously played card. If played '
                 'first in a session on the Silver Sun, immediately play another '
                 'card on the next sun.',
    'Adept': 'Play another card on the next sun.',
}
FOOTER_RE = re.compile(r'^(\d{1,3}|Darryn van Someren.*|The Sooth Deck|The Gate)$')


def page_lines(pdf, page):
    """Group a page's words into lines, each a list of (xMin, xMax, text)."""
    xml = subprocess.run(['pdftotext', '-bbox', '-f', str(page), '-l', str(page), pdf, '-'],
                         capture_output=True, text=True).stdout
    words = [(float(a), float(b), float(c), d) for a, b, c, d in WORD_RE.findall(xml)]

    lines = []
    for x0, y, x1, text in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0] - y) <= LINE_TOL:
            lines[-1][1].append((x0, x1, text))
        else:
            lines.append((y, [(x0, x1, text)]))
    return [(y, sorted(ws)) for y, ws in lines]


def split_runs(words):
    """
    Break a line wherever a gap is too wide to be word spacing.

    On most lines the columns are far apart, but where the left column's text
    runs long the two can end up a single space apart and merge into one run.
    A label never appears mid-sentence, so one found inside a run marks where
    the right column really began.
    """
    runs = [[words[0]]]
    for w in words[1:]:
        if w[0] - runs[-1][-1][1] > COLUMN_GAP:
            runs.append([w])
        else:
            runs[-1].append(w)

    split = []
    for r in runs:
        cut = next((i for i in range(1, len(r))
                    if LABEL_START_RE.match(' '.join(w[2] for w in r[i:]))), None)
        split.extend([r[:cut], r[cut:]] if cut else [r])
    return [(r[0][0], r[-1][1], ' '.join(w[2] for w in r)) for r in split]


def is_art(x, text, name, value, rank, suns):
    """A label printed over the illustration: the card's own name, or its stats."""
    flat = re.sub(r'\s+', '', text).lower()
    if flat == re.sub(r'\s+', '', name).lower():
        return True
    if flat == str(value):
        return True
    # A royalty card names its rank under the art.
    if rank and flat == rank.lower():
        return True
    if bool(text.split()) and all(w in suns for w in text.split()):
        return True
    # The card's name is set letter by letter in a wide arc over the art, so it
    # breaks into fragments spread across the middle of the page — "A s s a s s
    # in" arrives as "A s s" and "in". Any fragment of the name found in that
    # band is part of the arc rather than body text.
    if ART_BAND[0] <= x < ART_BAND[1]:
        return bool(flat) and flat in re.sub(r'\s+', '', name).lower()
    return False


def read_page(pdf, page, card):
    name, value, rank = card['name'], card['value'], card.get('rank', '')
    left, right, quote = [], [], ''

    for y, words in page_lines(pdf, page):
        runs = split_runs(words)
        runs = [r for r in runs if not FOOTER_RE.match(r[2].strip())
                and not is_art(r[0], r[2], name, value, rank, SUNS)]
        if not runs:
            continue
        # The closing aside is set across the foot of the page, below both
        # columns and clear of them.
        if y > 580 and len(runs) == 1:
            quote = runs[0][2]
            continue
        if len(runs) == 1:
            (left if runs[0][0] < LEFT_EDGE else right).append(runs[0][2])
        else:
            left.append(runs[0][2])
            right.append(runs[-1][2])

    return '\n'.join(left + right), quote


def parse_entry(text):
    """
    Split the assembled page into its labelled blocks.

    The meanings are a comma-separated list that the page sets on its own line,
    and the flavour prose starts on the next with no label of its own. Line
    breaks are therefore what separates them: the list continues onto another
    line only while it is still hanging on a comma.
    """
    # The family line is the only one with bullets: "Secrets • Ravens • Books".
    fam = re.search(r'([A-Z][a-z]+(?:\s*•\s*[A-Za-z]+){2,})', text)
    family_line = fam.group(1).strip() if fam else ''
    if family_line:
        text = text.replace(family_line, ' ')

    marks = [(m.start(), m.group(1)) for m in re.finditer(
        rf'\b({"|".join(LABELS)}):', text)]
    out, lead = {}, text[:marks[0][0]].strip() if marks else text.strip()
    for i, (pos, label) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out[label] = text[pos + len(label) + 1:end].strip()

    prose = ''
    if 'Meanings' in out:
        lines = out['Meanings'].split('\n')
        taken = [lines[0].strip()]
        while len(taken) < len(lines) and taken[-1].endswith(','):
            taken.append(lines[len(taken)].strip())
        out['Meanings'] = ' '.join(taken)
        prose = ' '.join(lines[len(taken):])
    return out, family_line, prose, lead


def clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def main(gate, sooth_path, out_path):
    cards = json.load(open(sooth_path, encoding='utf-8'))
    by_name = {c['name'].upper(): c for c in cards}

    # One card to a page, and every one of them names its Meanings.
    pages = []
    for p in range(1, 200):
        t = subprocess.run(['pdftotext', '-layout', '-f', str(p), '-l', str(p), gate, '-'],
                           capture_output=True, text=True).stdout
        if 'Meanings:' in t:
            pages.append((p, t))

    print(f'{len(pages)} card pages in {gate.split("/")[-1]}')
    entries, problems = [], []
    for page, dump in pages:
        title = next((l.strip() for l in dump.split('\n')
                      if l.strip().upper() == l.strip() and l.strip() in by_name), None)
        if not title:
            problems.append((page, 'no card name on page'))
            continue
        card = by_name[title]
        text, quote = read_page(gate, page, card)
        fields, family_line, prose, lead = parse_entry(text)

        entry = dict(card)
        entry['meanings'] = clean(fields.get('Meanings'))
        entry['divination'] = clean(fields.get('Divination'))
        entry['gameNarrative'] = clean(fields.get('Game Narrative'))
        entry['joy'] = clean(fields.get('Joy'))
        entry['despair'] = clean(fields.get('Despair'))
        entry['description'] = clean(prose)
        entry['quote'] = clean(quote)
        entry['familyLine'] = clean(family_line)
        entry['effectText'] = RANK_EFFECTS.get(card.get('rank', ''), '')
        entry['page'] = page

        # The write-up repeats the value and the family, so they check the
        # card-deck extraction rather than merely restating it.
        stated = clean(fields.get('Value'))
        if stated and not stated.startswith(str(card['value'])):
            problems.append((title, f'value {stated!r} != card {card["value"]}'))
        if family_line and not family_line.lower().startswith(card['family']):
            problems.append((title, f'family {family_line!r} != card {card["family"]}'))
        entries.append(entry)

    entries.sort(key=lambda e: e['page'])
    json.dump(entries, open(out_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    print(f'{len(entries)} entries -> {out_path}')
    royal = sum(1 for e in entries if e['effectText'])
    print(f'  {royal} royalty cards given their rank effect')
    for f in ('meanings', 'divination', 'gameNarrative', 'joy', 'despair', 'description', 'quote'):
        missing = [e['name'] for e in entries if not e[f]]
        print(f'  {f:<14} {len(entries) - len(missing):>3} present'
              + (f'   missing: {missing[:4]}' if missing else ''))
    if problems:
        print(f'  {len(problems)} PROBLEMS:')
        for p in problems[:10]:
            print('   ', p)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
