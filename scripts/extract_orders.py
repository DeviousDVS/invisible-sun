"""
Extract the five magical orders from The Key.

Shape per order: prose and a few named fields, then a run of degree entries.
Each degree is headed "Nth-Degree <Order>: <Title>", carries the requirement to
attain it, and grants a set of named abilities written as "Label: text".

Apostates have no degrees — they take starting abilities and afterwards buy
Apostate Abilities at 1 Crux each — so they are handled separately.

Usage:  python3 scripts/extract_orders.py <The-Key.txt> <out.json>
"""
import re, json, sys, os

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

# A new section of the book, set as a full-caps heading on its own line. Used to
# find where a chapter's body stops rather than guessing at a line count.
SECTION_RE = re.compile(r'^[A-Z][A-Z ,\'’&()-]{6,48}$')

# Marginal notes and cross-references are set in a narrow column beside the body
# and land between paragraphs when the page is flattened to text. Carrying no
# label of their own, they read as more of the ability above them — which is how
# Extra Spells came to end "Don't let someone else tell you where to record your
# important information!"
#
# The column width is the signal: body lines here run 45-55 characters, marginal
# ones 20-28. A single short line is just the tail of a paragraph, so what marks
# a note is a *run* of them, standing alone between blank lines and starting no
# label of its own.
NARROW = 32
SIDEBAR_MIN_LINES = 2

# Most marginal blocks are page references, sheet-field labels, or the vertical
# lettering of a character-tome diagram broken into fragments ("EN KNOWL E IDD").
# A few, though, carry rules — that a Goetic may have only one summoned entity at
# a time is a sidebar, not an ability. Anything still this long once clean() has
# stripped the page references is prose worth keeping.
SIDEBAR_KEEP = 80


# Sidebars that survive extraction cleanly but are not worth carrying into the
# system. Reviewed by hand, one entry per note, matched on a distinctive opening
# phrase — the categories below are real but not reliably patternable, and a
# heuristic loose enough to catch them all also catches rules.
#
# A *drop* list rather than a keep list on purpose: a note that changes wording,
# or a new one, survives and gets reviewed, instead of vanishing unnoticed.
SIDEBAR_DROP = [
    # Advice about the boxed set's physical components, which a VTT does not have.
    ('Apostate', 'True to your nature, the Apostate character tome'),
    ('Goetic', 'The Goetic character tome has space to list'),
    ('Vance', 'Vances should record their Vancian spells on a Grimoire sheet'),
    ('Weaver', 'Weaver aggregates can be found in The Way'),
    # Bare pointers to another book, carrying no rule of their own.
    ('Maker', 'More information on the Order of Makers'),
    ('Vance', 'More information on the Order of the Vance'),
    ('Vance', 'Vances learn existing Vancian spells like any spell'),
    # Bookkeeping the incantation ledger now does (VislaeModel incantations.log).
    ('Vance', 'Players may wish to keep track of which incantations'),
    # The Vance's mind-diagram sheets, plus a "VANCE SPELLCASTING 1. 2. 3."
    # tail — the numbered steps are set inside the diagram and do not extract.
    ('Vance', 'Vances have two special'),
    # The running text the VANCIAN MAGIC box restates; the box is kept.
    ('Vance', 'The Vance chooses a spell they have stored in their mind. If the Vance'),
    # A spell set into the margin as an example. Already in the spells pack as
    # packs/_source/spells/orrod_s_impossible_flood_*.json.
    ('Vance', 'ORROD’S IMPOSSIBLE FLOOD'),
]


# Order descriptions, already divided into paragraphs, from a hand-prepared
# dataset. An order's opening pages are the worst case for this extractor —
# character sheets, marginal notes and a "who should play this order" box all
# set around the prose — so what it recovers reads as one run-on block with the
# furniture still in it. These are cleaner, and they give the Apostate a
# description at all, which the book's layout never yielded.
DESCRIPTIONS = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            '..', 'source', 'isdata_2026.json')


def apply_descriptions(orders, path=DESCRIPTIONS):
    """
    Replace each order's description with the prepared paragraphs.

    Joined with newlines because that is what build_compendia's cleanHtml
    splits on to make <p> elements — a single block would render as one
    unbroken wall of text.
    """
    if not os.path.exists(path):
        print(f'  note: {path} absent — keeping the extracted descriptions')
        return orders

    with open(path, encoding='utf-8') as fh:
        prepared = {v['name']: v['description']
                    for v in json.load(fh).get('Orders', {}).values()}

    for order in orders:
        paragraphs = prepared.pop(order['name'], None)
        if paragraphs:
            order['description'] = '\n'.join(p.strip() for p in paragraphs)
        else:
            print(f'  warning: no prepared description for {order["name"]}')
    for name in prepared:
        print(f'  warning: prepared description for {name!r} matches no order')
    return orders


def prune_sidebars(orders):
    """Apply SIDEBAR_DROP, reporting any entry that matched nothing."""
    matched = set()
    for order in orders:
        kept = []
        for note in order.get('sidebars', []):
            hit = next((i for i, (name, snippet) in enumerate(SIDEBAR_DROP)
                        if name == order['name'] and note.startswith(snippet)), None)
            if hit is None:
                kept.append(note)
            else:
                matched.add(hit)
        order['sidebars'] = kept

    for i, (name, snippet) in enumerate(SIDEBAR_DROP):
        if i not in matched:
            print(f'  warning: no {name} sidebar opens {snippet!r} — kept whatever replaced it')
    return orders


def is_furniture(block):
    """
    A block of character-sheet field labels rather than prose.

    The Key sets duplicate-for-personal-use character sheets between the degree
    entries. Their fields — "Possessions Kept in My House", "Heart Relationships"
    — carry no label and no sentence-ending punctuation, which is what separates
    them from body text. So does the vertical lettering the sheets are titled
    with, which flattens to fragments like "EN KNOWL E IDD".
    """
    lines = [l.strip() for l in block if l.strip()]
    return bool(lines) and not any(re.search(r'[.!?]', l) for l in lines)


def trim_trailing_labels(block):
    """
    Drop a sheet's first field label when it is set flush against the paragraph
    above it, with no blank line to separate them — which is how "House" came to
    end both the Vance's and the Maker's 5th-degree Authority and
    Responsibilities.

    A paragraph of body text ends in punctuation, so an unpunctuated short line
    at the very end is not part of it. The length test matters: an ability cut
    off by a page break also ends unpunctuated, but mid-sentence and long.
    """
    out = list(block)
    while out:
        s = out[-1].strip()
        if not s:
            out.pop()
        elif len(s) <= 30 and not re.search(r'[.!?:,;]', s):
            out.pop()
        else:
            break
    return out


def is_box(block):
    """
    A boxed sidebar, which announces itself with a full-caps heading.

    Boxes are set at column width rather than in the margin, so width alone does
    not find them: "FAVORING THE RIGHT OR LEFT HAND" sits on the Goetic 1st
    degree page and was read as 740 further characters of the Spell ability.

    A box is one blank-delimited block. Running it on to the next ability label
    instead would be wrong — an ability interrupted by a page break resumes
    after the box, and Vance 2nd-degree Vancian Spells lost the rest of its
    sentence that way.
    """
    lines = [l.strip() for l in block if l.strip()]
    return bool(lines) and lines[0] not in NOISE_EXACT and bool(SECTION_RE.match(lines[0]))


def drop_sidebars(lines):
    """
    Split marginal notes out from body text, by their column width.

    Returns (body, notes) — the notes are returned rather than discarded so a
    rule set in the margin is not lost along with the page furniture.
    """
    out, notes, block = [], [], []
    # A heading sometimes stands alone in its block, its body following as the
    # next one — "GAMEMASTERING SUMMONED ENTITIES AND FAMILIARS" does, and its
    # two paragraphs of GM guidance were read as Goetic 6th-degree Authority and
    # Responsibilities. Only a heading with no body of its own claims the block
    # after it, so a box that is already complete cannot swallow the ability it
    # interrupted.
    carry = [False]

    def flush():
        short = [l for l in block if l.strip()]
        marginal = (len(short) >= SIDEBAR_MIN_LINES
                    and all(len(l.strip()) <= NARROW for l in short)
                    and not LABEL_RE.match(short[0].strip()))
        boxed, was_carrying = is_box(block), carry[0]
        carry[0] = boxed and len(short) == 1
        if marginal or boxed or was_carrying:
            text = clean(block)
            if len(text) >= SIDEBAR_KEEP:
                notes.append(text)
        elif is_furniture(block):
            pass  # a character sheet's field labels: nothing to keep
        else:
            out.extend(trim_trailing_labels(block))

    for l in lines:
        if l.strip():
            block.append(l)
        else:
            flush()
            out.append(l)
            block = []
    flush()
    return out, notes


def join_wrapped_refs(lines):
    """
    Rejoin a cross-reference that wrapped across two lines.

    NOISE_RE drops a reference set on one line, but the marginal column is only
    20-28 characters wide, so most of them wrap: "Invocation of Knowledge," then
    "page 36". Neither half matches on its own — the first carries no page
    number, the second is not all digits — so the pair survived into the note it
    was set beside, and the Goetic's "Nightside" sidebar opened with the page
    reference for an ability three chapters away.
    """
    out = []
    for raw in lines:
        s = raw.strip()
        if re.fullmatch(r'page\s+\d+', s) and out and out[-1].strip().endswith(','):
            out[-1] = f'{out[-1].strip()} {s}'
        else:
            out.append(raw)
    return out


def clean(lines):
    out = []
    for raw in join_wrapped_refs(lines):
        s = raw.strip()
        if not s or s in NOISE_EXACT or NOISE_RE.match(s):
            continue
        if 'darrynvansomeren' in s or s.startswith('Darryn van Someren'):
            continue
        # The footer of a duplicate-for-personal-use character sheet page.
        if 'Monte Cook Games' in s or 'Permission granted to duplicate' in s:
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
        # A colon introduces a list, so what follows one is an item of it rather
        # than the next ability. The Maker's signature object offers "one of the
        # following properties:" and the book sets the first without the ✦✦ its
        # siblings carry, which read as a 1st-degree Extra Armor ability.
        #
        # Only within an ability: a degree's requirement ends "we learn the
        # following:" and what follows *is* the first ability, not a list item.
        if accept and not known and current is not None:
            prev = next((x.strip() for x in reversed(buf) if x.strip()), '')
            if prev.endswith(':'):
                buf.append('✦✦ ' + l.strip())
                continue
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


def last_degree_end(lines, start):
    """
    Where an order's final degree stops.

    block_end allows a generous run of unlabelled lines, because an ability's
    own text can be long. Past a blank line, though, that generosity reaches
    into the next chapter: the Order of Goetica's opening prose begins eleven
    lines after the Weaver's last ability and was read as part of it. The last
    ability ends with its own paragraph, so stop at the end of the block the
    final label sits in.
    """
    end, i = block_end(lines, start), start
    last = start
    while i < min(end, len(lines)):
        if LABEL_RE.match(lines[i].strip()):
            last = i
        i += 1
    while last < len(lines) and lines[last].strip():
        last += 1
    return min(last, end)


def parse_degrees(lines, order_name):
    """Each degree heading starts a block; abilities are the labels within it."""
    marks = []
    for i, l in enumerate(lines):
        m = DEGREE_RE.match(l.strip())
        if not m:
            continue
        num, who, title = m.group(1), m.group(2), m.group(3).strip()
        # Titles wrap to the next line when the heading is long. Six degrees do
        # this — four Weaver, two Goetic — and the line the title was taken from
        # has to be skipped as well, or it is read a second time as the opening
        # of the requirement ("Master of the Spindle A Weaver can attain...").
        body_at = i + 1
        if not title:
            for j in range(i + 1, i + 3):
                nxt = lines[j].strip() if j < len(lines) else ''
                if nxt and not nxt.isdigit() and len(nxt) < 44 and not LABEL_RE.match(nxt):
                    title = nxt
                    body_at = j + 1
                    break
        marks.append((i, int(num), title, body_at))

    degrees, notes = [], []
    for n, (start, num, title, body_at) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else last_degree_end(lines, start)
        # Marginal notes fall between the degrees as well as inside them, and
        # carry no label of their own, so whichever ability precedes one takes
        # it into its own text — Goetic 1st-degree "Spell" ran to 1,464
        # characters for a one-sentence ability.
        body, found = drop_sidebars(lines[body_at:end])
        notes.extend(found)
        requirement, abilities = split_labelled(body)
        degrees.append({
            'degree': num,
            'title': title,
            # Advancing to a degree costs Crux equal to it (The Key, p205).
            # The 1st is where a character starts, so it is not bought.
            'crux_cost': 0 if num == 1 else num,
            'requirement': requirement,
            'abilities': [{'name': k, 'description': v} for k, v in abilities.items()],
        })
    return degrees, notes


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

        # NOTE: this region does not go through drop_sidebars, so notes set
        # beside an order's opening pages are read as more of whichever field
        # they interrupted. Fixing it relocates real rules — the three-objects-
        # of-power limit is currently buried in the Maker's description — but it
        # also splits two boxes mid-sentence, so it needs its own pass.
        description, fields = split_labelled(text[prose_from:start], known=ORDER_FIELDS)
        degrees, sidebars = parse_degrees(text[start:end], name)

        orders.append({
            'name': name.title(),
            'description': description,
            'other_names': fields.get('Other Names', ''),
            'philosophy': fields.get('Philosophy and Outlook', ''),
            'relationships': fields.get('Relationships', ''),
            'path_to_joy': fields.get('Path to Joy', ''),
            'path_to_despair': fields.get('Path to Despair', ''),
            'degrees': degrees,
            'sidebars': sidebars,
        })

    orders.append(parse_apostate(text))
    return apply_descriptions(prune_sidebars(orders))


def parse_apostate(text):
    """
    Apostates have no degrees: a fixed set of starting abilities, then further
    Apostate Abilities bought at 1 Crux each (The Key, p5535).
    """
    start = next((i for i, l in enumerate(text) if l.strip() == 'Beginning Apostates'), None)
    if start is None:
        return {'name': 'Apostate', 'degrees': [], 'starting_abilities': [], 'abilities': []}

    # The section ends where the next one is headed, not after a fixed count.
    # A count overshoots into "GAMEMASTERING ORDERS" and everything after it,
    # and since that prose carries no label the last ability swallows the lot —
    # Guided Hand ran to 5,145 characters, most of it about Hearts.
    end = next((i for i in range(start + 1, min(start + 400, len(text)))
                if SECTION_RE.match(text[i].strip())), min(start + 220, len(text)))
    body, sidebars = drop_sidebars(text[start + 1:end])
    split = next((i for i, l in enumerate(body) if l.strip() == 'Apostate Abilities'), len(body))

    # "Apostate Abilities: We gain two selections..." closes the starting list
    # as a rubric over the whole of it, not as another ability — and it is
    # deliberately not an ability label (see NOT_AN_ABILITY), so left in place
    # it reads as more of the preceding ability's text. It wraps over several
    # lines, so everything from it to the section heading is the rubric.
    rubric_at = next((i for i, l in enumerate(body[:split])
                      if l.strip().startswith('Apostate Abilities:')), split)
    starting_note = clean(body[rubric_at:split]).split(':', 1)[-1].strip()

    _, starting = split_labelled(body[:rubric_at])
    # The purchasable list opens with how it is paid for, which is a note on the
    # group rather than part of any one ability.
    note, later = split_labelled(body[split + 1:])

    return {
        'name': 'Apostate',
        'description': 'Apostates reject the orders. They have no degrees and no order to advance within.',
        'other_names': '', 'philosophy': '', 'relationships': '',
        'path_to_joy': '', 'path_to_despair': '',
        'degrees': [],
        'sidebars': sidebars,
        'starting_note': starting_note,
        'abilities_note': note,
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
