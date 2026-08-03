"""
Extract the five magical orders from The Key.

Shape per order: prose and a few named fields, then a run of degree entries.
Each degree is headed "Nth-Degree <Order>: <Title>", carries the requirement to
attain it, and grants a set of named abilities written as "Label: text".

Apostates have no degrees — they take starting abilities and afterwards buy
Apostate Abilities at 1 Crux each — so they are handled separately.

Usage:  python3 scripts/extract_orders.py <The-Key.txt> <out.json>
"""
import re, json, sys

# Order chapters, in the sequence The Key prints them.
CHAPTERS = ["VANCE", "MAKER", "WEAVER", "GOETIC", "APOSTATE"]

ORDER_FIELDS = ["Other Names", "Philosophy and Outlook", "Relationships",
                "Path to Joy", "Path to Despair"]

DEGREE_RE = re.compile(r'^([1-9])(?:st|nd|rd|th)-Degree(?:\s+(\w+))?:?\s*(.*)$')
LABEL_RE = re.compile(r"^([A-Z][A-Za-z'’ -]{2,38}):\s*(.*)$")

# Keys belonging to a spell or item stat block set into a sidebar, and the
# section heading the Apostate parser splits on. None is an order ability.
NOT_AN_ABILITY = {"Name", "Level", "Color", "Depletion", "Cost", "Range",
                  "Duration", "Form", "Apostate Abilities"}
SMALL_WORDS = {"a", "an", "and", "the", "of", "with", "to", "in", "for", "or"}


def is_ability_label(label):
    """Distinguish an ability name from a sentence that happens to hold a colon."""
    if label in NOT_AN_ABILITY:
        return False
    # "Vancian spells like any spell" is prose; "Authority and Responsibilities"
    # is a name — small joining words may be lowercase, nothing else.
    words = label.split()
    return not any(w[0].islower() and w.lower() not in SMALL_WORDS for w in words[1:])

# Running heads, page furniture and cross-references set into the body text.
NOISE_EXACT = {"The Key", "Order", "THE WAY", "THE PATH", "THE GATE", "THE KEY",
               "Vance", "Maker", "Weaver", "Goetic", "Apostate"}
NOISE_RE = re.compile(r'^(.{0,44},\s*page\s+\d+|\d+|[\d\s✦•]+)$')


def clean(lines):
    out = []
    for raw in lines:
        s = raw.strip()
        if not s or s in NOISE_EXACT or NOISE_RE.match(s):
            continue
        if 'darrynvansomeren' in s or s.startswith('Darryn van Someren'):
            continue
        out.append(s)
    text = ' '.join(out)
    text = text.replace('✦✦', '\n• ').replace('✦', '\n• ')
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def split_labelled(lines, known=None):
    """Split lines into {label: text}, plus whatever preceded the first label."""
    intro, fields, current, buf = [], {}, None, []
    for l in lines:
        m = LABEL_RE.match(l.strip())
        # Order-level parsing accepts only its known fields. Degree parsing has
        # no fixed vocabulary, so a label has to look like an ability name
        # rather than a sentence that happens to contain a colon.
        accept = False
        if m:
            label = m.group(1)
            accept = (label in known) if known else (
                len(label.split()) <= 5 and is_ability_label(label))
        if accept:
            if current:
                fields[current] = clean(buf)
            else:
                intro = buf
            current, buf = m.group(1), [m.group(2)]
        else:
            buf.append(l)
    if current:
        fields[current] = clean(buf)
    else:
        intro = buf
    return clean(intro), fields


def block_end(lines, start, gap=18):
    """
    Where a degree's abilities stop.

    A degree grants a dense run of "Label: text" entries. The chapter's closing
    prose has none, so the block ends once no label has appeared for `gap`
    lines — which bounds the final degree of an order without needing to know
    where the next chapter begins.
    """
    last = start
    for i in range(start, len(lines)):
        if LABEL_RE.match(lines[i].strip()):
            last = i
        elif i - last > gap:
            return last + gap
    return len(lines)


def parse_degrees(lines, order_name):
    """Each degree heading starts a block; abilities are the labels within it."""
    marks = []
    for i, l in enumerate(lines):
        m = DEGREE_RE.match(l.strip())
        if not m:
            continue
        num, who, title = m.group(1), m.group(2), m.group(3).strip()
        # Titles wrap to the next line when the heading is long.
        if not title:
            for j in range(i + 1, i + 3):
                nxt = lines[j].strip() if j < len(lines) else ''
                if nxt and not nxt.isdigit() and len(nxt) < 44 and not LABEL_RE.match(nxt):
                    title = nxt
                    break
        marks.append((i, int(num), title))

    degrees = []
    for n, (start, num, title) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else block_end(lines, start)
        requirement, abilities = split_labelled(lines[start + 1:end])
        degrees.append({
            'degree': num,
            'title': title,
            # Advancing to a degree costs Crux equal to it (The Key, p205).
            # The 1st is where a character starts, so it is not bought.
            'crux_cost': 0 if num == 1 else num,
            'requirement': requirement,
            'abilities': [{'name': k, 'description': v} for k, v in abilities.items()],
        })
    return degrees


def extract(path):
    """
    Chapters are found from the degree headings rather than from the chapter
    titles. The Key sets some sidebar titles vertically, one letter per line, so
    "CONJURED HOUSE" leaves a bare "GOETIC" in the middle of the Weaver chapter
    and a title-based scan puts the boundary in the wrong place. Degree runs are
    unambiguous: a new order begins wherever the degree number returns to 1.
    """
    text = open(path, encoding='utf-8', errors='replace').read().split('\n')

    heads = []
    for i, l in enumerate(text):
        m = DEGREE_RE.match(l.strip())
        if m:
            heads.append((i, int(m.group(1)), m.group(2)))

    # Split into runs, each run one order's ladder.
    runs, current = [], []
    for h in heads:
        if h[1] == 1 and current:
            runs.append(current)
            current = []
        current.append(h)
    if current:
        runs.append(current)

    orders = []
    for n, run in enumerate(runs):
        # The order word is absent from some headings ("5th-Degree: Master of
        # the Warp"), so take it from whichever heading in the run carries it.
        name = next((h[2] for h in run if h[2]), None)
        if not name:
            continue

        start = run[0][0]
        end = runs[n + 1][0][0] if n + 1 < len(runs) else len(text)
        # An order's prose sits between the previous order's last degree block
        # and this order's first heading.
        if n:
            prev_last = runs[n - 1][-1][0]
            prose_from = prev_last + block_end(text[prev_last:], 0)
        else:
            prose_from = max(0, start - 230)
        prose_from = min(prose_from, start)

        description, fields = split_labelled(text[prose_from:start], known=ORDER_FIELDS)

        orders.append({
            'name': name.title(),
            'description': description,
            'other_names': fields.get('Other Names', ''),
            'philosophy': fields.get('Philosophy and Outlook', ''),
            'relationships': fields.get('Relationships', ''),
            'path_to_joy': fields.get('Path to Joy', ''),
            'path_to_despair': fields.get('Path to Despair', ''),
            'degrees': parse_degrees(text[start:end], name),
        })

    orders.append(parse_apostate(text))
    return orders


def parse_apostate(text):
    """
    Apostates have no degrees: a fixed set of starting abilities, then further
    Apostate Abilities bought at 1 Crux each (The Key, p5535).
    """
    start = next((i for i, l in enumerate(text) if l.strip() == 'Beginning Apostates'), None)
    if start is None:
        return {'name': 'Apostate', 'degrees': [], 'starting_abilities': [], 'abilities': []}

    end = min(start + 220, len(text))
    body = text[start + 1:end]
    split = next((i for i, l in enumerate(body) if l.strip() == 'Apostate Abilities'), len(body))

    _, starting = split_labelled(body[:split])
    _, later = split_labelled(body[split + 1:])

    return {
        'name': 'Apostate',
        'description': 'Apostates reject the orders. They have no degrees and no order to advance within.',
        'other_names': '', 'philosophy': '', 'relationships': '',
        'path_to_joy': '', 'path_to_despair': '',
        'degrees': [],
        'starting_abilities': [{'name': k, 'description': v} for k, v in starting.items()],
        # Bought for 1 Crux each rather than by degree.
        'abilities': [{'name': k, 'description': v, 'crux_cost': 1} for k, v in later.items()],
    }


if __name__ == '__main__':
    data = extract(sys.argv[1])
    json.dump(data, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
    print(f'{len(data)} orders -> {sys.argv[2]}')
    for o in data:
        degs = o['degrees']
        ab = sum(len(d['abilities']) for d in degs)
        miss = [k for k in ('description', 'philosophy', 'path_to_joy') if not o[k]]
        print(f"  {o['name']:<10} {len(degs)} degrees, {ab:>3} abilities"
              + (f"   MISSING: {','.join(miss)}" if miss else ''))
        for d in degs:
            print(f"      {d['degree']}. {d['title'][:34]:<36} {len(d['abilities'])} abilities"
                  + ('' if d['requirement'] else '   (no requirement text)'))
        if o.get('starting_abilities') is not None:
            print(f"      starting: {len(o['starting_abilities'])}  purchasable: {len(o['abilities'])}")
