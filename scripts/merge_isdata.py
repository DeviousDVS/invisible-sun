"""
Merge what source/isdata_2026.json holds that the book extraction does not.

That file is hand-built, and comparing it against the extraction found errors in
both. Where they disagree the book settles it, so this only takes what has been
checked, and says what it took.

Character arcs. The extraction slices arcs on their "Cost:" lines, which loses
the tail of an entry that runs over a page break. Six arcs suffered:

  Theft            carried Train a Creature's climax and resolution, the two
                   having been shifted by one.
  Train a Creature was left with neither.
  Learn, Master a Skill, Recover from a Wound
                   ran on into the next entry, so each resolution ended with a
                   sentence belonging to the arc after it (or a running head).
  Aid a Friend     lost its only step.

Quirks. Fifty of them, and the extraction had none — the field on the sheet was
free text with nothing to choose from. All fifty appear verbatim in The Key.
They are "neither advantages nor disadvantages" (p13531), so they carry no
mechanics; the list exists to be picked from, and a player may still invent
their own, which is what the rules ask for.

Not taken: Orders (the extraction has the degree ladders, this has only prose),
Souls (this lacks their cost and revelation penalty), Foundations and Hearts
(identical once formatting is set aside).

Usage:  python3 scripts/merge_isdata.py source/isdata_2026.json
"""
import json, re, sys, difflib

ARCS = 'source/data/character-arcs.json'
QUIRKS = 'source/data/quirks.json'

# Names the hand-built file spells differently. The book is the authority:
# GALANT has one L (The Key, p69) and TRANSFORMATION keeps its s (p15456).
ALIASES = {'tranformation': 'transformation', 'gallant': 'galant'}

# The arcs whose tails the extraction lost, and what is taken for each.
ARC_FIXES = {
    'theft':             ('climax', 'resolution'),
    # Its Training step breaks off mid-sentence at "you teach the creature a
    # new," and the page that follows starts Transformation — the rest of the
    # step is set on the far side of a spread and is not in the extracted text
    # at all. It is in the book (The Key, line 15422).
    'trainacreature':    ('climax', 'resolution', 'steps'),
    'learn':             ('resolution',),
    'masteraskill':      ('resolution',),
    'recoverfromawound': ('resolution',),
    'aidafriend':        ('resolution', 'steps'),
}


def norm(s):
    k = re.sub(r'[^a-z0-9]', '', (s or '').lower())
    return ALIASES.get(k, k)


def main(isdata_path):
    src = json.load(open(isdata_path, encoding='utf-8'))

    # ── Arcs ──
    arcs = json.load(open(ARCS, encoding='utf-8'))
    theirs = {norm(v['name']): v for v in src['Arcs'].values()}
    taken = []
    for arc in arcs:
        key = norm(arc['name'])
        other = theirs.get(key)
        if not other:
            match = difflib.get_close_matches(key, list(theirs), n=1, cutoff=0.8)
            other = theirs[match[0]] if match else None
        if not other or key not in ARC_FIXES:
            continue
        for field in ARC_FIXES[key]:
            before, after = arc.get(field), other.get(field)
            if after and after != before:
                arc[field] = after
                taken.append(f"{arc['name']}.{field}")
    json.dump(arcs, open(ARCS, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    # ── Quirks ──
    quirks = list(dict.fromkeys(src['Quirks']))
    json.dump(quirks, open(QUIRKS, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    print(f'{len(arcs)} arcs -> {ARCS}')
    print(f'  {len(taken)} fields taken: {", ".join(taken)}')
    empty = [a['name'] for a in arcs if not a.get('climax') or not a.get('resolution')]
    print(f'  arcs still missing a climax or resolution: {empty or "none"}')
    print(f'{len(quirks)} quirks -> {QUIRKS}')


if __name__ == '__main__':
    main(sys.argv[1])
