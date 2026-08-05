"""
Extract forte entries (and their abilities) from Invisible Sun sourcebooks.

The books interleave sidebars, page numbers and cross-references into the body
text, so headings alone are not a safe anchor. Abilities are found by their
"Level:" line instead, walking back to the nearest ALL-CAPS line for the name.
Output matches the shape of source/data/fortes.json.
"""
import re, json, sys, unicodedata

FIELD_RE = re.compile(
    r'^(Background|Appearance|Character Arcs|Path to Joy|Path to Despair|'
    r'Forte Abilities|Special|Notes):\s*(.*)$')
# The colon is optional because the book drops it once: "Pale: Cheat Death"
# is headed "Level 5 (no cost)". Requiring it skipped that ability entirely and
# — worse — left its Color line to be read as the previous ability's, so Grey:
# The Illusion came out Pale.
LEVEL_RE = re.compile(r'^Level:?\s+(.+?)\s*$')
COLOR_RE = re.compile(r'^Color:\s*(.+?)\s*$')
DEPL_RE  = re.compile(r'^Depletion:\s*(.+?)\s*$')
CAPS_RE  = re.compile(r'^[A-Z][A-Z0-9 \'’\-–—/&,\.!\?ÖÄÜÉ]{2,50}$')

# Recurring furniture that looks like a heading but is not.
NOISE = {
    'THE PATH','THE KEY','THE WAY','THE GATE','BOOK M','THE NIGHTSIDE',
    'THE THRESHOLD','FORTE','FORTES','PAGE','TERATOLOGY','THE ACTUALITY',
    'SHADOW','SATYRINE','APPENDIX','INDEX','CREDITS','TABLE OF CONTENTS',
}
NOISE_SUB = re.compile(r'(see Spell Deck|, page \d+|^\d+$|^Forte$|^Book M$)')


SMALL = {'a','an','the','and','but','or','nor','for','of','in','on','at','to','from',
         'by','with','as','into','upon','over','under','du','de','la','le','than','that'}


def titlecase(s):
    """Only re-case names the book set in caps; The Key already title-cases them,
    and blanket .title() would turn 'Skill du Jour' into 'Skill Du Jour'."""
    if not s.isupper():
        return s
    words = s.split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        out.append(lw if (0 < i < len(words) - 1 and lw in SMALL) else lw.capitalize())
    return ' '.join(out)


def clean(lines):
    """Join body lines, dropping page numbers and cross-reference furniture."""
    out = []
    for l in lines:
        s = l.strip()
        if not s or s.isdigit():
            continue
        if s.upper() in NOISE:
            continue
        if re.fullmatch(r'[\d\s✦•]+', s):
            continue
        if re.fullmatch(r'.{0,40}, page \d+', s):      # "The War, page 65"
            continue
        if re.fullmatch(r'.{0,45}see Spell Deck', s):
            continue
        if 'darrynvansomeren' in s or s.startswith('Darryn van Someren'):
            continue
        out.append(s)
    text = ' '.join(out)
    text = text.replace('✦✦', '\n• ').replace('✦', '\n• ')
    text = re.sub(r'[ \t]{2,}', ' ', text)
    return text.strip()


def parse_abilities(lines):
    """Every 'Level:' line marks an ability; the name is the ALL-CAPS line above."""
    marks = [i for i, l in enumerate(lines) if LEVEL_RE.match(l.strip())]

    def plausible(s):
        """Looks like an ability name rather than prose or furniture."""
        if not s or s.isdigit() or len(s) > 52:
            return False
        if s.upper() in NOISE or NOISE_SUB.search(s):
            return False
        if FIELD_RE.match(s) or s.endswith((':', '.', ',', ';')):
            return False
        # Allowing an internal colon lets the ability keys themselves look like
        # names; "Color: Green" sitting above the next ability would otherwise
        # be absorbed into its name and stop counting as that ability's colour.
        if re.match(r'^(Color|Depletion|Cost|Range|Duration)\s*:|^Level:?\s', s):
            return False
        # Some names carry an internal colon ("Silver: Creation"), so a colon
        # is only disqualifying at the end of the line (handled above).
        return bool(re.match(r"^[A-Za-z][A-Za-z0-9 '’\-–—/&,\.!\?:ÖÄÜÉéö]*$", s))

    def find_name(i):
        """Nearest plausible line above a Level: marker.

        The Key sets ability names in title case ("Feed Upon the Power"); Book M
        and The Nightside set them in caps ("BATTLEMAGIC ARMORSUIT"). Long names
        wrap onto two lines in both.
        """
        for j in range(i - 1, max(-1, i - 6), -1):
            s = lines[j].strip()
            if not s or s.isdigit() or NOISE_SUB.search(s):
                continue
            if not plausible(s):
                break
            prev = lines[j - 1].strip() if j > 0 else ''
            # Join a wrapped first half only when both halves share a case style.
            if prev and plausible(prev) and (prev.isupper() == s.isupper()) and len(prev) < 30:
                # ...but not when the previous line is the tail of a description
                if not prev[0].islower():
                    return j - 1, f'{prev} {s}'
            return j, s
        return None, None

    found = [(i, *find_name(i)) for i in marks]
    found = [(i, j, nm) for i, j, nm in found if nm]

    abilities = []
    for n, (i, name_idx, name) in enumerate(found):
        # Content runs to the *name line* of the next ability, so the trailing
        # Color:/Depletion: lines stay with the ability they belong to.
        end = found[n + 1][1] if n + 1 < len(found) else len(lines)
        body, color, depletion = [], '', ''
        for l in lines[i + 1:max(i + 1, end)]:
            s = l.strip()
            m = COLOR_RE.match(s)
            if m:
                color = m.group(1); continue
            m = DEPL_RE.match(s)
            if m:
                depletion = m.group(1); continue
            body.append(l)

        abilities.append({
            'name': titlecase(name),
            'level': LEVEL_RE.match(lines[i].strip()).group(1),
            'description': clean(body),
            'color': color,
            'depletion': depletion,
        })
    return abilities


def parse_forte(lines, name):
    """Split one forte's lines into its named fields plus the ability list.

    Entries are self-terminating: a second "Background:" means the next forte
    has begun. Relying on the span to the next located heading is not enough —
    The Key prints each forte name twice (entry and progression diagram), and a
    partial name list leaves other fortes sitting inside the span.
    """
    bg = [i for i, l in enumerate(lines) if l.strip().startswith('Background:')]
    if len(bg) > 1:
        lines = lines[:bg[1]]

    fields, current, buf = {}, 'description', []
    for idx, l in enumerate(lines):
        m = FIELD_RE.match(l.strip())
        if m:
            # Keep the first occurrence of a field; a repeat is a stray header.
            if current not in fields:
                fields[current] = buf
            current = m.group(1).lower().replace(' ', '_')
            buf = [m.group(2)]
        else:
            buf.append(l)
    if current not in fields:
        fields[current] = buf

    ability_lines = fields.get('forte_abilities', [])
    return {
        'name': titlecase(name),
        'description': clean(fields.get('description', [])),
        'background': clean(fields.get('background', [])),
        'appearance': clean(fields.get('appearance', [])),
        'character_arcs': clean(fields.get('character_arcs', [])),
        'path_to_joy': clean(fields.get('path_to_joy', [])),
        'path_to_despair': clean(fields.get('path_to_despair', [])),
        'abilities': parse_abilities(ability_lines),
    }


def extract(path, forte_names):
    text = open(path, encoding='utf-8', errors='replace').read().split('\n')
    def norm(s):
        # NFKD leaves a combining diaeresis behind on "Noösphere"; drop marks so
        # the ASCII name in the wanted list still matches the book's spelling.
        d = unicodedata.normalize('NFKD', s.upper().replace('’', "'"))
        d = ''.join(c for c in d if not unicodedata.combining(c)).strip()
        # The Threshold heads its entry "HONES THOUGHTS (FORTE)".
        return re.sub(r'\s*\((FORTE|FORTE ABILITY)\)\s*$', '', d).strip()
    wanted = {norm(n): n for n in forte_names}

    # Locate each forte heading. Headings wrap across lines when they are long
    # ("CELEBRATES THE" / "SMALL THINGS"), so try joining up to three lines.
    starts, spans = {}, {}
    for i, l in enumerate(text):
        for n in (1, 2, 3):
            joined = ' '.join(x.strip() for x in text[i:i + n] if x.strip())
            k = norm(joined)
            if k in wanted:
                starts.setdefault(k, []).append(i)
                spans[(k, i)] = n
                break
    def raw_at(i, k):
        return ' '.join(x.strip() for x in text[i:i + spans[(k, i)]] if x.strip())

    located = {}
    for k, idxs in starts.items():
        # Body headings are set in caps; contents-page entries are title case,
        # and sit close enough to the first entry that a "Background: nearby"
        # test alone picks the wrong one. Require caps, then nearby Background:.
        caps = [i for i in idxs if raw_at(i, k).isupper()]
        pool = caps or idxs
        best = pool[0]
        for i in pool:
            if any(l.strip().startswith('Background:') for l in text[i:i + 80]):
                best = i
                break
        located[k] = best

    order = sorted(located.items(), key=lambda kv: kv[1])
    out = []
    for n, (k, start) in enumerate(order):
        end = order[n + 1][1] if n + 1 < len(order) else min(start + 900, len(text))
        skip = spans.get((k, start), 1)      # step over a wrapped heading
        out.append(parse_forte(text[start + skip:end], wanted[k]))
    return out


if __name__ == '__main__':
    src, names_file, dest = sys.argv[1], sys.argv[2], sys.argv[3]
    names = [l.strip() for l in open(names_file) if l.strip()]
    data = extract(src, names)
    json.dump(data, open(dest, 'w'), indent=1, ensure_ascii=False)
    print(f'{len(data)} fortes -> {dest}')
    for f in data:
        miss = [k for k in ('description', 'background', 'appearance') if not f[k]]
        print(f"  {f['name'][:34]:<36} {len(f['abilities']):>3} abilities"
              + (f"   MISSING: {','.join(miss)}" if miss else ''))
