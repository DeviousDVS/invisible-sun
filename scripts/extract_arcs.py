"""
Extract character arcs from The Key.

An arc is an ALL-CAPS heading, a paragraph of description, then the labelled
beats: Cost, Opening, one or more Steps, Climax, Resolution. Steps repeat, so
they collect into a list; every other label appears once.

Usage:  python3 scripts/extract_arcs.py <The-Key.txt> <out.json>
"""
import re, json, sys

HEAD_RE = re.compile(r"^[A-Z][A-Z0-9 ,'’()\-]{3,44}$")
LABEL_RE = re.compile(r"^(Cost|Opening|Opening\(s\)|Step|Step\(s\)|Step\(s\) and Climax|"
                      r"Climax|Resolution|Special):\s*(.*)$")

# Chapter furniture and neighbouring section titles that match the heading shape.
NOT_AN_ARC = {"CHARACTER ARC MODELS", "GAMEMASTERING CHARACTER ARCS",
              "THE GATE", "THE PATH", "THE WAY", "THE KEY",
              # A rules section, not an arc: its "Cost" is the definition of
              # what a cost is, not one an arc charges.
              "BEGINNING A NEW ARC"}
NOISE_RE = re.compile(r'^(.{0,44},\s*page\s+\d+|\d+|[\d\s✦•]+)$')

# Three arcs share a page spread with a neighbour, and the extraction emits both
# headings before either body. Position cannot resolve them: for Recover from a
# Wound the first heading takes the first body, but for Learn and Uncover a
# Secret the second does. These two pairs are therefore swapped explicitly,
# decided by reading the bodies — "Realizing There's More... become a master" is
# Master a Skill, and "Seeker" is Uncover a Secret.
SWAPPED_PAIRS = {("MASTER A SKILL", "LEARN"), ("UNDO A WRONG", "UNCOVER A SECRET")}


def clean(lines):
    out = []
    for raw in lines:
        s = raw.strip()
        if not s or NOISE_RE.match(s) or s in NOT_AN_ARC:
            continue
        if 'darrynvansomeren' in s or s.startswith('Darryn van Someren'):
            continue
        out.append(s)
    text = ' '.join(out)
    text = text.replace('✦✦', '\n• ').replace('✦', '\n• ')
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def parse_arc(lines, name):
    description, fields, steps = [], {}, []
    current, buf = None, []

    def flush():
        if current is None:
            return
        text = clean(buf)
        # Steps repeat within an arc, so they accumulate rather than overwrite.
        if current.startswith('Step') and 'Climax' not in current:
            steps.append(text)
        else:
            fields[current] = text

    for l in lines:
        m = LABEL_RE.match(l.strip())
        if m:
            if current is None:
                description.extend(buf)
            else:
                flush()
            current, buf = m.group(1), [m.group(2)]
        else:
            buf.append(l)
    if current is None:
        description.extend(buf)
    else:
        flush()

    # One arc runs its final step and climax together under a single label.
    combined = fields.pop('Step(s) and Climax', None)
    if combined and not fields.get('Climax'):
        fields['Climax'] = combined

    desc = clean(description)
    # An arc's description follows the previous arc's resolution with no marker
    # between them, so the tail of that resolution and any heading set between
    # the two come through attached. Drop a leading part-sentence and any
    # all-caps heading left in the run-on.
    desc = re.sub(r'\b[A-Z][A-Z \'’]{4,40}\b', ' ', desc)
    if desc and desc[0].islower():
        cut = re.search(r'[.!?]\s+(?=[A-Z])', desc)
        if cut:
            desc = desc[cut.end():]
    desc = re.sub(r'\s{2,}', ' ', desc).strip()

    return {
        'name': name,
        'description': desc,
        'cost': fields.get('Cost', ''),
        'opening': fields.get('Opening') or fields.get('Opening(s)', ''),
        'steps': steps,
        'climax': fields.get('Climax', ''),
        'resolution': fields.get('Resolution', ''),
        'special': fields.get('Special', ''),
    }


def extract(path):
    text = open(path, encoding='utf-8', errors='replace').read().split('\n')

    # The arcs run from the first Cost: to the last Resolution:.
    costs = [i for i, l in enumerate(text) if l.strip().startswith('Cost: ')]
    ends = [i for i, l in enumerate(text) if l.strip().startswith('Resolution: ')]
    lo, hi = min(costs) - 60, max(ends) + 12

    # An arc heading is an all-caps line that has a Cost: before the next heading.
    heads = []
    for i in range(lo, min(hi, len(text))):
        s = text[i].strip()
        if HEAD_RE.match(s) and s not in NOT_AN_ARC:
            heads.append((i, s))

    # Every arc has exactly one Cost:, so those mark the arcs. Resolution: would
    # be tidier to slice on, but Train a Creature has none — its entry runs off a
    # page break mid-step — and one missing delimiter merges two arcs.
    costs = [i for i in range(lo, min(hi, len(text)))
             if text[i].strip().startswith('Cost: ')
             # The rules section explains what a cost is; that line is not an
             # arc's cost, and leaving it in shifts every name by one.
             and not text[i].strip().startswith('Cost: This is a cost')]
    bodies = []
    for n, c in enumerate(costs):
        # The description sits above the Cost:, so walk back to wherever the
        # previous arc stopped: its last label, or a heading.
        start = c
        while start > lo:
            t = text[start - 1].strip()
            if LABEL_RE.match(t):
                break
            start -= 1
        end = costs[n + 1] if n + 1 < len(costs) else hi
        # Trim the next arc's description off the tail.
        stop = end
        while stop > c:
            t = text[stop - 1].strip()
            if LABEL_RE.match(t):
                break
            stop -= 1
        while stop < end and not LABEL_RE.match(text[stop].strip()) \
                and not HEAD_RE.match(text[stop].strip()):
            stop += 1
        bodies.append((start, max(stop, c + 1)))

    # Pair each body with a heading, in order, swapping the known displaced pairs.
    names = [name for _, name in heads]
    for a, b in SWAPPED_PAIRS:
        if a in names and b in names:
            i, j = names.index(a), names.index(b)
            if abs(i - j) == 1:
                names[i], names[j] = names[j], names[i]

    return [parse_arc(text[s0:s1], nm) for nm, (s0, s1) in zip(names, bodies)]


if __name__ == '__main__':
    data = extract(sys.argv[1])
    json.dump(data, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    print(f'{len(data)} arcs -> {sys.argv[2]}')
    for a in data:
        miss = [k for k in ('description', 'cost', 'opening', 'climax', 'resolution') if not a[k]]
        print(f"  {a['name'][:32]:<34} {len(a['steps'])} steps"
              + (f"   MISSING: {','.join(miss)}" if miss else ''))
