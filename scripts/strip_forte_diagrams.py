"""
Cut the page furniture off the end of forte ability descriptions.

Book M, The Nightside and The Threshold print each forte's progression diagram
at the end of its entry. The diagram is a picture, but its node labels are text,
so flattening the page appends the forte's name and every ability name to
whichever ability came last:

    "...I can travel to the Pale (or back) in one hour. CHASES DEATH Know the
     Dead Talk to Spirits The Knowledge of Death Call Spirit ..."

Boxed sidebars do the same, headed by the ability they belong to in caps.

Both announce themselves the same way: these books set headings in full caps,
and a description never contains one. So a description ends at the first run of
capitalised words — which catches the diagram, the sidebar before it, and
anything else set as a heading, without needing to know which is which.

The trees in source/forte-trees/*.mmd say what the diagram's nodes are, so what
is removed can be checked rather than trusted: for the fortes that carry one,
the cut text should be the forte name followed by exactly those nodes.

Usage:  python3 scripts/strip_forte_diagrams.py source/data/fortes.json
"""
import json, re, sys, glob, os

# Two or more capitalised words in a row, each long enough not to be an
# initialism inside a sentence. "GM" or a single shouted word stays; "CHASES
# DEATH" and "BATTLEMAGIC ARMORSUIT" do not.
HEADING = re.compile(r'(?<![A-Za-z])([A-Z][A-Z\'’&-]{2,}(?:\s+[A-Z][A-Z\'’&-]{1,})+)')

# Roman numerals and the handful of real acronyms the books use mid-sentence.
ALLOWED = {'GM', 'NPC', 'PC', 'PCS', 'NPCS'}


def cut_at_heading(text):
    """Return (kept, removed) splitting at the first heading."""
    for m in HEADING.finditer(text):
        words = m.group(1).split()
        if all(w in ALLOWED for w in words):
            continue
        return text[:m.start()].rstrip(), text[m.start():].strip()
    return text, ''


def cut_trailing_names(text, names):
    """
    Strip a diagram whose heading did not survive as capitals.

    Some pages flatten without the caps heading — the Order of Beauty's tree
    arrives as "...Not an action. Persuasion Eye of the Beholder Draw Out Beauty
    Serenity Harmony..." — so there is nothing for cut_at_heading to find. What
    gives it away is the tail: a run of the forte's own ability names, one after
    another, which prose never does.

    A single trailing name is left alone; the books really do end a description
    by naming another ability. Three in a row is a diagram.
    """
    longest = sorted(names, key=len, reverse=True)
    stripped, count = text.rstrip(), 0
    while True:
        for nm in longest:
            if stripped.endswith(nm) and len(stripped) > len(nm):
                stripped, count = stripped[:-len(nm)].rstrip(), count + 1
                break
        else:
            break
    if count >= 3:
        return stripped, text[len(stripped):].strip()
    return text, ''


def tree_nodes():
    """What each drawn tree says its nodes are, for checking the cut."""
    out = {}
    for path in glob.glob('source/forte-trees/*.mmd'):
        raw = open(path, encoding='utf-8').read()
        m = re.search(r'%%\s*forte\s*:\s*(.+)', raw)
        if not m:
            continue
        body = re.sub(r'%%.*$', '', raw, flags=re.M)
        out[m.group(1).strip()] = {lbl.strip() for _, lbl in
                                   re.findall(r'([A-Za-z0-9_]+)\s*[\[\(\{]\s*([^\]\)\}]+?)\s*[\]\)\}]', body)}
    return out


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def main(path):
    fortes = json.load(open(path, encoding='utf-8'))
    trees = tree_nodes()
    cut, checked, unverified = 0, 0, []

    for forte in fortes:
        names = [x['name'] for x in forte['abilities']] + [forte['name']]
        for a in forte['abilities']:
            kept, removed = cut_at_heading(a['description'])
            kept2, removed2 = cut_trailing_names(kept, names)
            if removed2:
                kept, removed = kept2, (removed2 + ' ' + removed).strip()
            if not removed:
                continue
            a['description'] = kept
            cut += 1
            nodes = trees.get(forte['name'])
            if nodes is None:
                unverified.append(f"{forte['name']}: {a['name']}")
                continue
            # What was removed should be the forte's name and its nodes, and
            # nothing that is not one of them.
            leftover = norm(removed)
            for token in [forte['name']] + sorted(nodes, key=len, reverse=True):
                leftover = leftover.replace(norm(token), '', 1)
            if leftover:
                print(f"  UNEXPECTED text removed from {forte['name']} / {a['name']}:")
                print(f"    {removed[:200]}")
                print(f"    residue after accounting for the diagram: {leftover[:120]!r}")
            else:
                checked += 1

    json.dump(fortes, open(path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(fortes)} fortes -> {path}')
    print(f'  {cut} descriptions trimmed')
    print(f'  {checked} verified as exactly the forte name plus its drawn nodes')
    if unverified:
        print(f'  {len(unverified)} trimmed with no drawn tree to check against '
              f'(The Key fortes, whose diagrams are not in source/forte-trees)')
    empty = [f"{f['name']}/{a['name']}" for f in fortes for a in f['abilities']
             if not a['description'].strip()]
    print(f'  descriptions left empty: {empty or "none"}')


if __name__ == '__main__':
    main(sys.argv[1])
