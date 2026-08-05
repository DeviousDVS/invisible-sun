"""
Merge the forte ability trees into source/data/fortes.json.

A forte's abilities are not a list but a tree: "You must acquire the abilities
along the given paths, in order... learning one ability unlocks the potential
acquisition of another (or sometimes two) later" (The Key, p6405). The book
draws that tree as a diagram on the page facing the ability text, so it is not
in the extracted prose at all — the edges have to come from somewhere else.

They come from source/isdata_2026.json, a hand-built dataset that records each ability's
`unlocks`. Checked against the drawn diagram for Calls Upon the Serpent it is
exact, including the pair of crossing paths that no amount of reading order or
level would recover.

The two sources agree on every ability level and on all but three colours. Each
of those three was settled against the book — two were wrong here, one there —
so they are corrected by name rather than by trusting either side wholesale.

Only The Key's 31 fortes have trees. The other 20 come from Book M, The
Nightside and The Threshold, whose diagrams this dataset does not cover; their
abilities are left with no unlocks rather than being given invented ones.

Usage:  python3 scripts/merge_forte_trees.py source/isdata_2026.json source/data/fortes.json
"""
import json, re, sys

def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())


# An ability that unlocks itself, which the diagram does not show: Stop is the
# terminal of Warps Time and Space, fed by both Reversal and Spatial Warp and
# leading nowhere (The Key, p133). Left in, it makes the tree cyclic and any
# walk of it non-terminating.
DROP_UNLOCKS = {("Warps Time And Space", "Stop"): {"Stop"}}

# Settled against The Key where the two datasets disagreed.
COLOUR_FIXES = {
    ("Explores The Noösphere", "Psychic Attack"): "Red",      # p8685
    ("Travels As A Spirit", "Seeping Deeper"): "Indigo",      # p10849
    ("Walks The Path Of Suns", "Grey: The Illusion"): "Grey", # p11404
}


def main(isdata_path, fortes_path):
    trees = json.load(open(isdata_path, encoding='utf-8'))['Fortes']
    fortes = json.load(open(fortes_path, encoding='utf-8'))
    by_name = {norm(v['name']): v for v in trees.values()}

    with_tree = added = edges = fixed = 0
    for forte in fortes:
        src = by_name.get(norm(forte['name']))
        if not src:
            for a in forte['abilities']:
                a.setdefault('unlocks', [])
            continue
        with_tree += 1
        known = {norm(a['name']): a for a in forte['abilities']}

        for s in src['abilities']:
            target = known.get(norm(s['name']))
            if target is None:
                # An ability the prose extraction missed. "Pale: Cheat Death"
                # is headed "Level 5 (no cost)" with no colon, so the parser
                # that keys on "Level:" walked straight past it.
                target = {
                    'name': s['name'],
                    'level': f"{s['level']}" + (f" ({s['cost']})" if s.get('cost') else ""),
                    'description': s.get('description', ''),
                    'color': s.get('color', ''),
                    'depletion': s.get('depletion') or '',
                }
                forte['abilities'].append(target)
                added += 1
            # Names are recorded as written; they are matched loosely but stored
            # as the ability itself is named, so the tree can be walked by name.
            drop = DROP_UNLOCKS.get((forte['name'], s['name']), set())
            target['unlocks'] = [u for u in (s.get('unlocks') or []) if u not in drop]
            edges += len(target['unlocks'])

        for a in forte['abilities']:
            a.setdefault('unlocks', [])
            fix = COLOUR_FIXES.get((forte['name'], a['name']))
            if fix and a.get('color') != fix:
                a['color'] = fix
                fixed += 1

    # A tree that dangles, loops or strands an ability cannot be walked, so the
    # merge proves all three rather than assuming them.
    dangling, cyclic, stranded, roots_seen = [], [], [], {}
    for forte in fortes:
        ab = forte['abilities']
        if not any(a['unlocks'] for a in ab):
            continue
        names = {norm(a['name']) for a in ab}
        adj = {norm(a['name']): [norm(u) for u in a['unlocks']] for a in ab}
        for a in ab:
            for u in a['unlocks']:
                if norm(u) not in names:
                    dangling.append(f"{forte['name']}: {a['name']} -> {u}")

        unlocked = {u for us in adj.values() for u in us}
        roots = [n for n in adj if n not in unlocked]
        roots_seen[len(roots)] = roots_seen.get(len(roots), 0) + 1

        state = {}
        def walk(n):
            state[n] = 1
            for m in adj.get(n, []):
                if state.get(m) == 1:
                    cyclic.append(f"{forte['name']}: {m}")
                elif not state.get(m):
                    walk(m)
            state[n] = 2
        for r in roots:
            walk(r)
        missed = [a['name'] for a in ab if not state.get(norm(a['name']))]
        if missed:
            stranded.append(f"{forte['name']}: {missed}")

    json.dump(fortes, open(fortes_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'{len(fortes)} fortes -> {fortes_path}')
    print(f'  {with_tree} carry a tree, {len(fortes) - with_tree} have none (supplement books)')
    print(f'  {edges} unlock edges, {added} abilities recovered, {fixed} colours corrected')
    print(f'  starting abilities per tree: {roots_seen}')
    bad = [("dangling", dangling), ("cyclic", cyclic), ("unreachable", stranded)]
    if any(v for _, v in bad):
        for label, items in bad:
            for i in items[:8]:
                print(f'  {label.upper()}: {i}')
        sys.exit(1)
    print('  every tree walks: no dangling unlocks, no cycles, nothing stranded')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
