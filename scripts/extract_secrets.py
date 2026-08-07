"""
Extract secrets — character, house and changery — from the Invisible Sun books.

Secrets are bought with Acumen, one point per level, and unlike spells they cost
no Sorcery to use: "They are simply additions to the list of things the character
can do" (The Way, p84). Three kinds exist. Character secrets apply to the vislae,
house secrets to their house (where they are called augments), and changery
secrets require a bodily change of level 9 or higher to have been made first.

Every entry is set the same way — the name in caps, then "Level: n", then the
description — which makes them far easier to read out of a flattened page than
orders or fortes were.

TWO SOURCES FOR THE SAME SECRETS
--------------------------------
The Van Hauten Collection is a compilation: "a complete listing of every minor
magic, long-form magic, and secret offered in the Black Cube, Book M, and the
Nightside". Its pages carry no marginal notes and no sidebars, so its text comes
out clean where the original books' does not.

That makes it the better source, but only if the claim is true, so this script
does not take it on faith. Each original book's own secrets section is parsed as
well, and the two are compared: a secret in a source book that the compilation
omits is reported. The comparison is also what supplies provenance, since the
compilation does not say which book each secret came from.

Checking rather than trusting turned up the reverse as well. The edition here is
a later one than its foreword describes — it is headed "7th Edition" — and it
already carries Create Logoshom and Mirror Conjuration from The Threshold and
Secret Names of God from the Enchiridion of the Path, none of which existed when
the passage quoted above was written. So the books it predates are parsed too,
both for the secrets it really is missing and to attribute the ones it is not.

Usage:  python3 scripts/extract_secrets.py
"""
import json, os, re, sys, unicodedata

BOOKS = 'source/books'
DEST = 'source/data/secrets.json'
MAP = 'source/data/book-map.json'

# NAME in caps, then the level. The level line carries the bonus dice a secret
# grants when it grants any, and the books decline the noun: one is "(+1 die)",
# more than one is "(+2 dice)". Matching only the plural did not fail loudly —
# the level line simply stopped being a level line, so every secret granting a
# single die was passed over and its text swallowed by the entry above it.
NAME_RE = re.compile(r"^[A-Z][A-Z0-9 ’'\-–—/&,\.\?!]{2,45}$")
LEVEL_RE = re.compile(r'^Level:\s*(\d+)\s*(?:\(\+(\d+)\s*di(?:e|ce)\))?\s*$')
# A qualifier printed under the name: "(EXPERIMENTAL EFFECT)", "(CHARACTER
# SECRET)". It sits between the name and the level.
QUALIFIER_RE = re.compile(r'^\([A-Z][A-Z ]{2,40}\)$')
# Changery secrets name the bodily change they require, which can wrap.
CHANGE_RE = re.compile(r'^Change required:\s*(.*)$')

# A section heading, and the kind of secret it introduces.
SECTIONS = {
    'CHARACTER SECRETS': 'character',
    'HOUSE SECRETS': 'house',
    'CHANGERY SECRETS': 'changery',
}

# Where the compiled listing lives, and which books it claims to cover.
COMPILATION = 'The Van Hauten Collection'
COVERED = ['The Way', 'Book M', 'The Nightside']

# Books that print a secret or two in place rather than in a secrets chapter.
# Each is named outright, because these sit loose in a chapter with no section
# heading to bound them and no way to tell one from the prose around it.
LOOSE = {
    'The Threshold': ['CREATE LOGOSHOM', 'MIRROR CONJURATION'],
    'The Wellspring': ['CHARACTER SECRET: MAZEFLESH'],
    'Enchiridion of the Path': ['SECRET NAMES OF GOD', 'DEATHFORM', 'PERICHORESIS',
                                'VIEW DEMON SYMBOL', 'BEAR DEMON SYMBOL'],
    'Teratology': ['TERRE’S SECRET'],
}

# Furniture that survives into the body of an entry in the original books. The
# compilation has none of this, which is the point of preferring it.
NOISE_EXACT = {'THE KEY', 'THE WAY', 'THE PATH', 'THE GATE', 'BOOK M',
               'THE NIGHTSIDE', 'THE THRESHOLD', 'TERATOLOGY'}
XREF_RE = re.compile(r'^.{0,48},\s*page \d+\.?$')
DECK_RE = re.compile(r'^.{0,48}see (the )?\w[\w ]*Deck$', re.I)
WATERMARK_RE = re.compile(r'darrynvansomeren|^Darryn van Someren')

# Two or more capitalised words in a row. These books set every heading this
# way and a description never contains one, so the first such run marks where
# the entry stopped and page furniture began — a sidebar, the credits page, or
# the next chapter. Borrowed from scripts/strip_forte_diagrams.py, which had to
# solve the same problem for forte abilities.
HEADING_RUN = re.compile(r'(?<![A-Za-z])([A-Z][A-Z\'’&-]{2,}(?:\s+[A-Z][A-Z\'’&-]{1,})+)')
ALLOWED_CAPS = {'GM', 'NPC', 'PC', 'PCS', 'NPCS'}

# The widest a line of a marginal note runs. Body columns in these books set
# 40-50 characters to the line; the margin column sets barely half that. The
# same measure identifies the sidebars in scripts/extract_orders.py.
NARROW = 32

SMALL = {'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'of', 'in', 'on',
         'at', 'to', 'from', 'by', 'with', 'as', 'into', 'upon', 'over',
         'under', 'than', 'that', 'thy'}


def titlecase(s):
    """Re-case a name the book set in caps, leaving small words down."""
    words = s.split()
    out = []
    for i, w in enumerate(words):
        lw = w.lower()
        # An initialism or a possessive stays as printed: GM, Terre's.
        out.append(lw if (0 < i < len(words) - 1 and lw in SMALL) else lw.capitalize())
    return ' '.join(out)


def norm(s):
    d = unicodedata.normalize('NFKD', (s or '').lower().replace('’', "'"))
    return re.sub(r'[^a-z0-9]', '', ''.join(c for c in d if not unicodedata.combining(c)))


def running_heads(lines):
    """
    The book and chapter titles printed at the top of every page.

    They flatten into the middle of whichever entry spans the page break, and
    they are worth removing rather than tolerating: the compilation's chapter
    head is the single word "Secrets", which lands inside twelve descriptions
    and reads as part of the sentence.

    Rather than list them per book, note that a running head is by definition
    the first line of a page and the same on every page of its chapter. Any
    page-opening line that recurs is one; a line of body text that happens to
    begin a page is not repeated.

    A head can also wrap. The compilation's is "The Van Hauten Collection:" over
    "Magical Praxis", and dropping only the line that opens the page left the
    second half in seventeen descriptions. So a line is taken as part of the
    head when it recurs *and* follows the same head line every time.
    """
    firsts, pairs = {}, {}
    for i, line in enumerate(lines):
        if '\f' not in line or not line.strip():
            continue
        firsts[line.strip()] = firsts.get(line.strip(), 0) + 1
        after = next((lines[j].strip() for j in range(i + 1, min(i + 3, len(lines)))
                      if lines[j].strip()), None)
        if after:
            pairs[(line.strip(), after)] = pairs.get((line.strip(), after), 0) + 1

    heads = {s for s, n in firsts.items() if n >= 3}
    heads |= {b for (a, b), n in pairs.items() if n >= 3 and a in heads}
    return heads


def load(title, book_map):
    path = book_map[title]['file']
    lines = open(path, encoding='utf-8', errors='replace').read().split('\n')
    printed = {int(k): v for k, v in
               book_map[title]['printed_page_by_pdf_page'].items()}
    # Which printed page each line falls on.
    page_of, pdf_page = {}, 1
    for i, line in enumerate(lines):
        page_of[i] = printed.get(pdf_page)
        if '\f' in line:
            pdf_page += 1
    return lines, page_of, running_heads(lines)


def is_furniture(s, heads):
    return (not s or s.isdigit() or s.upper() in NOISE_EXACT or s in heads
            or bool(WATERMARK_RE.search(s)) or bool(XREF_RE.match(s))
            or bool(DECK_RE.match(s)))


def clean(body, heads=frozenset()):
    """
    Join an entry's lines, dropping page numbers, running heads and notes.

    The compilation is almost free of marginal notes, but not entirely.
    Experimental Spell is followed by a loose note about the Experimental Die,
    "You weigh twice as much as normal, suffering 3 vex to your Movement pool",
    which reads as a plausible last sentence of the secret and is nothing of
    the kind.

    A blank line does not distinguish it: the compilation breaks paragraphs
    that way too, and Create Logoshom's second paragraph is as real as its
    first. What does distinguish it is the measure. A note is set in a narrow
    margin column, so every line of it is short, where a paragraph of body text
    fills the column and only its last line falls short. So the body is read in
    blank-separated blocks, and a block whose every line is narrow is a note.
    """
    blocks, current = [], []
    for l in body:
        if l.strip():
            current.append(l.strip())
        elif current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)

    out = []
    for n, block in enumerate(blocks):
        kept = [s for s in block if not is_furniture(s, heads)]
        if not kept:
            continue
        # A block that opens with a heading is not the entry any more. This has
        # to be tested before the narrow-column rule below, not after: the
        # compilation's credits page is a column of short lines under the word
        # CREDITS, so dropping it as a margin note removed the very heading
        # that marks where the last entry ended, and the copyright paragraph
        # underneath was left looking like prose.
        if n and kept[0].isupper() and len(kept[0]) > 2:
            break
        # The first block is the entry's opening and is never a note; after
        # that, an all-narrow block is the margin.
        if n and len(kept) >= 2 and all(len(s) <= NARROW for s in kept):
            continue
        out += kept
    text = ' '.join(out)

    # Stop at the first heading. An entry that is the last in its section runs
    # on into whatever follows — a sidebar, the next chapter, the credits page —
    # and the caps are what give that away.
    for m in HEADING_RUN.finditer(text):
        if all(w in ALLOWED_CAPS for w in m.group(1).split()):
            continue
        text = text[:m.start()]
        break

    text = text.replace('✦✦', '\n• ').replace('✦', '\n• ')
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def repair_hyphens(text, reference):
    """
    Restore a hyphen the compilation's page lost at a line break.

    Its text layer drops the hyphen from a word broken across lines, so
    "non-stressful" arrives as "nonstressful" and "one-hour" as "onehour". The
    original book breaks its lines elsewhere and spells the word out, which is
    what makes the repair checkable rather than a guess: a run-together word is
    only split when the book has exactly those two words next to each other.
    """
    ref = re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)+", reference)
    joined = {re.sub('-', '', w).lower(): w for w in ref}
    if not joined:
        return text

    def fix(m):
        return joined.get(m.group(0).lower(), m.group(0))

    return re.sub(r'\b[A-Za-z]{6,}\b', fix, text)


def name_above(lines, level_idx):
    """
    The name belonging to a level line, and the line it starts on.

    Taking the line directly above is wrong often enough to matter. A name can
    carry a qualifier — "INFUSE WITH BLOOD" over "(EXPERIMENTAL EFFECT)" — and a
    long one wraps, as "INVEST WITH" over "A SOUL". In both cases the line above
    the level is not the name, so the entry goes unrecognised and its text is
    swallowed by the description before it: eighteen entries were lost this way,
    each one silently lengthening its predecessor.
    """
    i = level_idx - 1
    while i > 0 and (not lines[i].strip() or QUALIFIER_RE.match(lines[i].strip())):
        i -= 1
    # The qualifier is not always on its own line: "DEATH TOUCH (EXPERIMENTAL
    # EFFECT)" sets both on one, and the parentheses alone stopped the line
    # counting as a name.
    name = re.sub(r'\s*\([A-Z][A-Z ]{2,40}\)\s*$', '', lines[i].strip())
    if not NAME_RE.match(name):
        return None, None
    # A wrapped name only joins when the line above is also a heading and short
    # enough to be half of one. Prose above an entry is sentence case, so it
    # fails NAME_RE and is never joined.
    above = lines[i - 1].strip() if i > 0 else ''
    if (NAME_RE.match(above) and len(above) < 24 and above not in NOISE_EXACT
            and not above.endswith('.')):
        return i - 1, f'{above} {name}'
    return i, name


ANY_LEVEL_RE = re.compile(r'^Level:\s*\d')


def parse_entries(lines, page_of, heads, lo, hi, kind, source):
    """Read every NAME / Level: entry in a span."""
    found, skipped = [], []
    for i in range(lo, min(hi, len(lines) - 1)):
        if not LEVEL_RE.match(lines[i].strip()):
            # Every line that opens an entry must be read as one. A stricter
            # pattern than the book warrants does not announce itself: it just
            # drops the entry and lengthens the one above it. Matching only
            # "(+2 dice)" and not "(+1 die)" lost eight secrets that way.
            if ANY_LEVEL_RE.match(lines[i].strip()):
                skipped.append((i, lines[i].strip(), lines[i - 1].strip()))
            continue
        start, name = name_above(lines, i)
        if name:
            found.append((start, i, name))
        else:
            skipped.append((i, lines[i].strip(), lines[i - 1].strip()))

    for i, level, above in skipped:
        print(f'  {source}: line {i + 1} reads {level!r} under {above!r} '
              f'but was not read as an entry')

    out = []
    for n, (name_idx, i, name) in enumerate(found):
        # The description runs to the *name line* of the next entry, not to its
        # level line, so a wrapped name or a qualifier is never left behind in
        # the text above it.
        end = found[n + 1][0] if n + 1 < len(found) else hi
        m = LEVEL_RE.match(lines[i].strip())
        body, change = [], []
        j = i + 1
        # "Change required:" comes before the description and can wrap over
        # several lines, so it runs until a line that starts a sentence.
        cm = CHANGE_RE.match(lines[j].strip()) if j < end else None
        if cm:
            change.append(cm.group(1))
            j += 1
            while j < end and lines[j].strip() and not lines[j].strip()[0].isupper():
                change.append(lines[j].strip())
                j += 1
        body = lines[j:end]
        out.append({
            'name': titlecase(name),
            'kind': kind,
            'level': int(m.group(1)),
            'bonusDice': int(m.group(2)) if m.group(2) else 0,
            'changeRequired': ' '.join(change).strip(),
            'description': clean(body, heads),
            'source': source,
            'page': page_of.get(i - 1),
        })
    return out


def sections_of(lines, title):
    """
    Locate each secrets listing in a book, and where it ends.

    A book heads its listing and its introduction with the same words, so the
    heading alone is ambiguous. Book M prints "CHARACTER SECRETS", "CHANGERY
    SECRETS" and "HOUSE SECRETS" twice each — once in the chapter that explains
    what they are, once over the list itself — and The Way's chapter title
    "CHARACTER AND HOUSE SECRETS" wraps, leaving a bare "HOUSE SECRETS" that
    heads nothing at all.

    The listing always comes last, so the last heading of each kind is the one
    to read from. Judging instead by whether an entry follows soon after chose
    Book M's explanatory heading over its listing, because that listing opens
    with an introduction and a sidebar before the first entry — and losing the
    heading lost all 23 of the book's changery secrets silently.

    The end is found by the entries thinning out. Inside a listing they come
    every few lines; the run of empty lines after the last one is the chapter
    ending, so the section stops there rather than at some heading that would
    have to be enumerated per book.
    """
    last_of_kind = {}
    for i, line in enumerate(lines):
        kind = SECTIONS.get(line.strip())
        if kind:
            last_of_kind[kind] = i
    starts = sorted((i, kind) for kind, i in last_of_kind.items())

    out = []
    for n, (start, kind) in enumerate(starts):
        limit = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        last, gap = start, 0
        for i in range(start, limit):
            if LEVEL_RE.match(lines[i].strip()) and NAME_RE.match(lines[i - 1].strip()):
                last, gap = i, 0
        # Run on past the final entry far enough to take its description, but
        # not so far as to reach the next chapter.
        end = min(limit, last + 60)
        out.append((start, end, kind))
    return out


def loose_entries(lines, page_of, heads, title, names):
    """Secrets printed loose in a chapter, found by name."""
    out = []
    for name in names:
        # The level does not follow the name directly. These entries sit in the
        # body of a chapter, so the page's marginal notes flatten in between —
        # Mirror Conjuration has four lines of cross-reference and a four-line
        # author's aside in the gap. And the name can appear more than once: the
        # Enchiridion works up to Secret Names of God in prose that repeats the
        # phrase as a heading forty lines before the entry itself.
        #
        # The entry is the occurrence with a level line under it, which settles
        # both. Everything above that line is the furniture, so the description
        # starts below it and the notes never enter the text.
        i = j = None
        for k, l in enumerate(lines):
            if l.strip() != name:
                continue
            found_level = next((x for x in range(k + 1, min(k + 24, len(lines)))
                                if LEVEL_RE.match(lines[x].strip())), None)
            if found_level is not None:
                i, j = k, found_level
                break
        if i is None:
            print(f'  {title}: no entry headed {name!r} is followed by a level')
            continue
        # The kind may be printed under the name — "(CHARACTER SECRET)" — or
        # in it, as The Wellspring's "CHARACTER SECRET: MAZEFLESH".
        kind = 'character'
        if lines[i + 1].strip().startswith('('):
            kind = SECTIONS.get(lines[i + 1].strip().strip('()') + 'S', 'character')
        m = LEVEL_RE.match(lines[j].strip())
        # Runs to the next heading, or to the end of the prose.
        end = j + 1
        while end < len(lines) and not (NAME_RE.match(lines[end].strip())
                                        and lines[end].strip() not in NOISE_EXACT):
            end += 1
        display = re.sub(r'^CHARACTER SECRET:\s*', '', name)
        out.append({
            'name': titlecase(display),
            'kind': kind,
            'level': int(m.group(1)),
            'bonusDice': int(m.group(2)) if m.group(2) else 0,
            'changeRequired': '',
            'description': clean(lines[j + 1:end], heads),
            'source': title,
            'page': page_of.get(i),
        })
    return out


def main():
    book_map = json.load(open(MAP, encoding='utf-8'))

    # The compilation, and each book it claims to cover, parsed separately so
    # the two can be compared rather than merged on trust.
    parsed = {}
    for title in [COMPILATION] + COVERED:
        lines, page_of, heads = load(title, book_map)
        found = []
        for lo, hi, kind in sections_of(lines, title):
            found += parse_entries(lines, page_of, heads, lo, hi, kind, title)
        parsed[title] = found
        kinds = {}
        for s in found:
            kinds[s['kind']] = kinds.get(s['kind'], 0) + 1
        print(f'{title:<28} {len(found):>4} secrets  {kinds}')

    # The books that print a secret loose in a chapter, read for the same two
    # reasons: to attribute what the compilation carries, and to catch what it
    # genuinely does not.
    print('\nreading the books that print secrets outside a secrets chapter')
    for title, names in LOOSE.items():
        lines, page_of, heads = load(title, book_map)
        found = loose_entries(lines, page_of, heads, title, names)
        parsed[title] = found
        print(f'  {title:<26} {len(found):>3} secrets')

    compiled = {norm(s['name']): s for s in parsed[COMPILATION]}

    # Does the compilation actually hold everything the other books do?
    print('\nchecking the compilation against every other book')
    missing, provenance = [], {}
    for title in COVERED + list(LOOSE):
        absent = []
        for s in parsed[title]:
            key = norm(s['name'])
            # The first book to print it owns it, and these are in publication
            # order, so an earlier attribution is never overwritten.
            provenance.setdefault(key, (title, s['page']))
            if key not in compiled:
                absent.append(s)
        if absent:
            missing += [(title, s['name']) for s in absent]
        print(f'  {title:<26} {len(parsed[title]):>4} in the book, '
              f'{len(parsed[title]) - len(absent):>4} of them compiled'
              + (f"   not compiled: {[s['name'] for s in absent]}" if absent else ''))

    # Built from the compilation's clean text, attributed to the book that first
    # printed it. The kind stays the compilation's: it sets its three sections
    # out unambiguously, where the original books head an explanation and a
    # listing identically and can be read wrong.
    from_book = {norm(x['name']): x
                 for title in COVERED + list(LOOSE) for x in parsed[title]}
    out, repaired = [], 0
    for s in parsed[COMPILATION]:
        book, page = provenance.get(norm(s['name']), (COMPILATION, s['page']))
        other = from_book.get(norm(s['name']))
        text = s['description']
        if other:
            fixed = repair_hyphens(text, other['description'])
            repaired += fixed != text
            text = fixed
        out.append({**s, 'description': text, 'source': book, 'page': page,
                    'compiledPage': s['page']})
    print(f'\n  {repaired} descriptions had a hyphen restored from the source book')

    unattributed = [s['name'] for s in out if s['source'] == COMPILATION]
    if unattributed:
        print(f'\n  {len(unattributed)} compiled secrets matched no source book: '
              f'{unattributed}')

    # Anything the compilation is missing comes from its own book instead.
    for title, name in missing:
        s = next(x for x in parsed[title] if x['name'] == name)
        out.append({**s, 'compiledPage': None})

    out.sort(key=lambda s: (s['kind'], s['name']))
    json.dump(out, open(DEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    kinds = {}
    for s in out:
        kinds[s['kind']] = kinds.get(s['kind'], 0) + 1
    print(f'\n{len(out)} secrets -> {DEST}')
    print(f'  {kinds}')
    empty = [s['name'] for s in out if not s['description']]
    print(f'  descriptions left empty: {empty or "none"}')
    by_book = {}
    for s in out:
        by_book[s['source']] = by_book.get(s['source'], 0) + 1
    for book, n in sorted(by_book.items(), key=lambda kv: -kv[1]):
        print(f'    {book:<28} {n:>4}')
    return 1 if empty else 0


if __name__ == '__main__':
    sys.exit(main())
