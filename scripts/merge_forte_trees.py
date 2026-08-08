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
import json, re, sys, os, glob, difflib

SUPPLEMENT = 'source/forte-trees'

# The Mermaid a forte tree is drawn with. A node may be declared on a line of
# its own or inline where it is first used — `A[Know the Dead] --> B[Call
# Spirit]` is as ordinary as declaring the two separately — so labels are looked
# for anywhere rather than only at the start of a line.
MMD_NODE = re.compile(r'([A-Za-z0-9_]+)\s*[\[\(\{]+\s*([^\]\)\}]+?)\s*[\]\)\}]+')
MMD_ARROW = re.compile(r'\s*[-.=]{1,3}[->]>?\s*')
MMD_EDGELBL = re.compile(r'\|[^|]*\|')
MMD_META = re.compile(r'^\s*%%\s*(forte|source)\s*:\s*(.+?)\s*$', re.M)
MMD_COMMENT = re.compile(r'%%.*$', re.M)


def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())


def read_mermaid(path):
    """
    Read a forte's tree from a Mermaid graph.

    The books draw these trees as diagrams, so their edges are vector art and
    cannot be read out of the text at all. Mermaid says the same thing in a form
    that can: `A[Know the Dead] --> B[Call Spirit]` is exactly the arrow on the
    page, and nothing about it is inferred.

    Node ids are local to the file; what matters is the label, which is matched
    to the ability by name (loosely — case and punctuation are ignored, so
    "Anti-Life" finds "Anti-life").
    """
    raw = open(path, encoding='utf-8').read()
    meta = dict(MMD_META.findall(raw))
    name = meta.get('forte') or os.path.basename(path).rsplit('.', 1)[0].replace('-', ' ').title()

    labels, edges = {}, []
    for line in MMD_COMMENT.sub('', raw).splitlines():
        line = MMD_EDGELBL.sub(' ', line).strip()
        if not line or line.split()[0] in ('graph', 'flowchart', 'subgraph', 'end'):
            continue
        # Take the labels, then reduce the line to its ids so that what is left
        # is the chain of arrows. A chain links each pair along it, so
        # `A --> B --> C` is two edges, as it draws.
        for node_id, label in MMD_NODE.findall(line):
            labels[node_id] = label.strip().strip('"\'')
        bare = MMD_NODE.sub(r'\1', line)
        if not MMD_ARROW.search(bare):
            continue
        chain = [t.strip() for t in MMD_ARROW.split(bare) if t.strip()]
        edges += list(zip(chain, chain[1:]))

    unlocks = {label: [] for label in labels.values()}
    for a, b in edges:
        for node_id in (a, b):
            if node_id not in labels:
                sys.exit(f"{path}: edge {a} --> {b} names a node that is never "
                         f"given a label: {node_id}")
        unlocks[labels[a]].append(labels[b])
    return name, meta.get('source', ''), unlocks


def read_supplement(directory):
    """Every tree drawn for a forte the hand-built dataset does not cover."""
    out = {}
    for path in sorted(glob.glob(os.path.join(directory, '*.mmd'))):
        name, source, unlocks = read_mermaid(path)
        if norm(name) in {norm(k) for k in out}:
            sys.exit(f"{path}: a tree for {name!r} was already read")
        out[name] = {'source': source, 'path': path, 'abilities': unlocks}
    return out


# Forte names as the books set them.
#
# An early extraction built these by title-casing the ALL-CAPS running head over
# each forte's entry. That capitalises the small words the books leave lowercase
# and breaks an apostrophe — "Caught Fire’S Eye" — and it stuck, because nothing
# regenerates fortes.json in the normal course of things.
#
# There is no rule to apply here. The books write "Calls Upon the Serpent" but
# "Walks the Path of Suns", "Speaks With the Moon" but "Sings the Earthsong", so
# each of these is the cased spelling that actually appears in the book text
# rather than anything derived. The 28 names not listed are already right.
CANONICAL_NAMES = {
    "Bears An Orb": "Bears an Orb",
    "Calls Upon The Serpent": "Calls Upon the Serpent",
    "Caught Fire’S Eye": "Caught Fire’s Eye",
    "Channels Strength And Skill": "Channels Strength and Skill",
    "Dwells In Darkness": "Dwells in Darkness",
    "Explores The Noösphere": "Explores the Noösphere",
    "Fuses Nightmare To Fist": "Fuses Nightmare to Fist",
    "Hosts A Legion": "Hosts a Legion",
    "Inhales The Aethyr": "Inhales the Aethyr",
    "Is Adored By The Sea": "Is Adored by the Sea",
    "Listens To The Whispers": "Listens to the Whispers",
    "Provides A Vessel For Spirits": "Provides a Vessel for Spirits",
    "Revels In Beauty": "Revels in Beauty",
    "Sings The Earthsong": "Sings the Earthsong",
    "Speaks With The Moon": "Speaks With the Moon",
    "Travels As A Spirit": "Travels as a Spirit",
    "Understands The Words": "Understands the Words",
    "Walks The Path Of Suns": "Walks the Path of Suns",
    "Wanders In Delirium": "Wanders in Delirium",
    "Warps Time And Space": "Warps Time and Space",
    "Writhes And Squirms": "Writhes and Squirms",
}

# Where neither source is right, taken from the book directly.
#
# Seeping Deeper runs to two paragraphs (The Key, lines 10838-10848). The
# prepared reading has only the first, ending "...into the dream of someone
# nearby", losing the paragraph that says what each choice actually does — the
# whole rule. Our extraction has both, but with the tree diagram's labels and a
# marginal note run on after them. So this is the book's text, verbatim.
#
# Every other disagreement between the two sources was settled against the book
# and went the prepared reading's way. This is the only one that did not.
TEXT_OVERRIDES = {
    ("Travels as a Spirit", "Seeping Deeper"): (
        "Since the Noösphere and the deeper levels of dreams are connected, my "
        "spiritform can travel into either. When I activate this ability, I "
        "must choose to travel to the Noösphere or into the dream of someone "
        "nearby. If I choose the Noösphere, I can delve into the collective "
        "memories of all the minds there and gain an answer to one question. "
        "If I choose the deep dream, I can view a specific memory from that "
        "person, up to ten minutes long."
    ),
}

# Book furniture, in the two shapes it survives in: a running head set as a
# caps line or the bare word "Forte", and a cross-reference to another entry.
FURNITURE = re.compile(
    r'[A-Z][^,]{0,44},\s*page\s+\d+'                       # "Scourge, page 29"
    r'|\bTHE\s+(PATH|WAY|KEY|GATE|NIGHTSIDE|THRESHOLD)\b'   # running head
    r'|\bForte\b')


def furniture_only(spans):
    """True if these fragments are nothing but page furniture."""
    text = FURNITURE.sub(' ', ' '.join(spans))
    return not re.search(r'[A-Za-z0-9]', text)


def strip_html(t):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t or '')).strip()


def prefer(pack, prepared):
    """
    Choose between two independent readings of the same ability text.

    Neither source is reliably cleaner, so the choice cannot be "trust one of
    them". Extraction pulls whole pages, so it picks up whatever was set around
    the ability — a marginal note, a running head, the labels of the tree
    diagram, and in a few places the next ability's text entirely: Psychic
    Attack ended with 768 characters belonging to Delve Into the Noösphere,
    which is why Delve itself was missing its list of actions.

    The prepared dataset was read ability by ability, so it carries none of
    that. What it does carry, in nine places, is a cross-reference or a running
    head that our extraction already strips.

    So: prefer the prepared text, unless the only thing it adds is furniture.
    """
    # Compared on alphanumerics, not norm() — that drops digits, so a depletion
    # reading "0–1" against "0–2" would look identical and never be corrected.
    same = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
    p, f = strip_html(pack), strip_html(prepared)
    if not f or same(p) == same(f):
        return None
    # Only spans the prepared text actually adds. A pack-only difference yields
    # an empty span, and an empty span reads as furniture — which would keep
    # every polluted description exactly as it was.
    added = [s for s in (f[j1:j2] for tag, _, _, j1, j2
                         in difflib.SequenceMatcher(None, p, f).get_opcodes()
                         if tag != 'equal') if s.strip()]
    if added and furniture_only(added):
        return None
    return f


# An ability that unlocks itself, which the diagram does not show: Stop is the
# terminal of Warps Time and Space, fed by both Reversal and Spatial Warp and
# leading nowhere (The Key, p133). Left in, it makes the tree cyclic and any
# walk of it non-terminating.
DROP_UNLOCKS = {("Warps Time and Space", "Stop"): {"Stop"}}

# Settled against The Key where the two datasets disagreed.
COLOUR_FIXES = {
    ("Explores the Noösphere", "Psychic Attack"): "Red",      # p8685
    ("Travels as a Spirit", "Seeping Deeper"): "Indigo",      # p10849
    ("Walks the Path of Suns", "Grey: The Illusion"): "Grey", # p11404
}

# Both tables are looked up by name, so a rename silently empties them — which
# is how a correction settled against the book turns back into the error it
# fixed. Keying on norm() makes the lookup survive a re-casing, and the counts
# are checked at the end so an entry that stops matching is reported.
DROP_UNLOCKS = {(norm(f), norm(a)): v for (f, a), v in DROP_UNLOCKS.items()}
COLOUR_FIXES = {(norm(f), norm(a)): v for (f, a), v in COLOUR_FIXES.items()}


def canonicalise_names(fortes):
    """
    Re-case forte names to the books' spelling.

    Idempotent: a name already corrected matches by norm() and is left alone.
    An entry that matches neither spelling is reported, because it means the
    correction has drifted from the data it was written against.
    """
    by_norm = {norm(k): v for k, v in CANONICAL_NAMES.items()}
    renamed, seen = 0, set()
    for forte in fortes:
        key = norm(forte['name'])
        if key not in by_norm:
            continue
        seen.add(key)
        if forte['name'] != by_norm[key]:
            forte['name'] = by_norm[key]
            renamed += 1
    for key, wrong in ((norm(k), k) for k in CANONICAL_NAMES):
        if key not in seen:
            print(f'  warning: no forte matches {wrong!r} — the correction is stale')
    return renamed


def main(isdata_path, fortes_path, supplement_path=SUPPLEMENT):
    trees = json.load(open(isdata_path, encoding='utf-8'))['Fortes']
    fortes = json.load(open(fortes_path, encoding='utf-8'))
    renamed = canonicalise_names(fortes)
    by_name = {norm(v['name']): v for v in trees.values()}

    # Trees drawn for the supplement books' fortes, reshaped to match what
    # isdata_2026.json holds so both merge by the same path.
    supp = read_supplement(supplement_path)
    for name, entry in supp.items():
        by_name[norm(name)] = {
            'name': name,
            'abilities': [{'name': k, 'unlocks': v}
                          for k, v in entry['abilities'].items()],
        }
    from_supp = {norm(k) for k in supp}

    # A drawn tree has to name every ability of its forte. One left out stays a
    # root, so it silently becomes a second starting ability that can be taken
    # at any time — the very fault these files are here to fix, and invisible
    # unless it is checked for.
    known_fortes = {norm(f['name']): f for f in fortes}
    problems = []
    for name, entry in supp.items():
        forte = known_fortes.get(norm(name))
        if not forte:
            problems.append(f"{entry['path']}: no forte is named {name!r}")
            continue
        drawn = {norm(k) for k in entry['abilities']}
        have = {norm(a['name']): a['name'] for a in forte['abilities']}
        for extra in sorted(drawn - set(have)):
            problems.append(f"{entry['path']}: {name} has no ability matching "
                            f"{[k for k in entry['abilities'] if norm(k) == extra][0]!r}")
        for missing in sorted(set(have) - drawn):
            problems.append(f"{entry['path']}: {name} ability {have[missing]!r} "
                            f"is not in the tree")
    if problems:
        for p in problems:
            print(f'  {p}')
        sys.exit(1)

    with_tree = added = edges = fixed = 0
    drops_hit, colours_hit = set(), set()
    retext = {'description': 0, 'depletion': 0}
    overrides_hit = set()
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
            if target is None and norm(forte['name']) in from_supp:
                # A supplement tree names only its nodes; the abilities come
                # from the prose. A name that matches nothing means the tree was
                # read wrong, and inventing an ability would hide that.
                sys.exit(f"{forte['name']}: supplement names an ability that "
                         f"does not exist: {s['name']!r}")
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
            # A source spells a name as it likes — a diagram prints "Anti-Life"
            # where the ability is "Anti-life". Matching is loose, but what is
            # stored is the ability's own name, so the tree in the data reads
            # the same as the abilities it points at.
            override = TEXT_OVERRIDES.get((forte['name'], target['name']))
            for field in ('description', 'depletion'):
                better = override if (override and field == 'description') \
                    else prefer(target.get(field), s.get(field))
                if better is not None and better != target.get(field):
                    target[field] = better
                    retext[field] += 1
                    if override and field == 'description':
                        overrides_hit.add((forte['name'], target['name']))
            drop = DROP_UNLOCKS.get((norm(forte['name']), norm(s['name'])), set())
            if drop: drops_hit.add((norm(forte['name']), norm(s['name'])))
            target['unlocks'] = [known[norm(u)]['name'] if norm(u) in known else u
                                 for u in (s.get('unlocks') or []) if u not in drop]
            edges += len(target['unlocks'])

        for a in forte['abilities']:
            a.setdefault('unlocks', [])
            fix = COLOUR_FIXES.get((norm(forte['name']), norm(a['name'])))
            if fix: colours_hit.add((norm(forte['name']), norm(a['name'])))
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
    print(f'  {with_tree} carry a tree ({len(from_supp)} of them read off a printed '
          f'diagram), {len(fortes) - with_tree} have none')
    print(f'  {edges} unlock edges, {added} abilities recovered, {fixed} colours corrected')
    print(f'  {renamed} forte names re-cased to the books\' spelling')
    print(f"  {retext['description']} ability descriptions and {retext['depletion']} "
          f'depletions taken from the prepared reading')
    print(f'  starting abilities per tree: {roots_seen}')

    # A correction that matches nothing is not a correction. Both tables were
    # settled against the book once; if the data moves out from under them they
    # have to say so rather than quietly applying to nobody.
    for key in TEXT_OVERRIDES:
        if not any(f['name'] == key[0] and any(a['name'] == key[1]
                                               for a in f['abilities']) for f in fortes):
            print(f'  warning: TEXT_OVERRIDES names no ability: {key[0]} / {key[1]}')

    for label, table, hit in (("DROP_UNLOCKS", DROP_UNLOCKS, drops_hit),
                              ("COLOUR_FIXES", COLOUR_FIXES, colours_hit)):
        for key in set(table) - hit:
            print(f'  warning: {label} entry {key} matched no ability')
    bad = [("dangling", dangling), ("cyclic", cyclic), ("unreachable", stranded)]
    if any(v for _, v in bad):
        for label, items in bad:
            for i in items[:8]:
                print(f'  {label.upper()}: {i}')
        sys.exit(1)
    print('  every tree walks: no dangling unlocks, no cycles, nothing stranded')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
