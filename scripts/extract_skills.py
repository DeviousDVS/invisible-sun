"""
Extract the sample skill lists from The Key.

Invisible Sun has no definitive skill list — "players are free to create their
own skills to suit their character" — so what the book prints is a starting
library, not a closed set. Two groups within it are structured and matter
mechanically, because other rules and item descriptions name them directly:

  Weapon skills   light/medium/heavy x close combat/ranged, six in all.
  Defense skills  Resist, Dodge and Withstand. An object of power that reads
                  "must take a successful Resist action (challenge 14)" needs
                  to point at one of these, so they carry a stable key.

Neither set is printed as a bullet list — they are described in prose — so they
are built from the rules rather than scraped, and the scrape covers the three
bulleted lists. Levels run 1-4 and each level adds +1 to a venture; a new level
costs Acumen by category, which is config rather than per-skill data.

Usage:  python3 scripts/extract_skills.py <The-Key.pdf> <out.json>
"""
import re, json, sys, subprocess

PAGES = {'action': 34, 'narrative': 34, 'development': 35}
# The anchor is whatever line immediately precedes the bullets, which is not
# always the section heading: the ACTION SKILLS heading opens the left column
# while its list sits in the right one under "Other Action Skills".
HEADINGS = {'action': 'Other Action Skills', 'narrative': 'NARRATIVE SKILLS',
            'development': 'DEVELOPMENT SKILLS'}
# The book's list marker, found anywhere in a line: a dumped line spans both
# columns, so a bullet can appear well inside it.
BULLET_RE = re.compile(r'[✦•]+\s*([^✦•]+?)(?=\s{3,}|$)')
# A list ends where the next heading or a run of prose begins.
STOP_RE = re.compile(r'^([A-Z][A-Z ]{4,}|\d+)$')

WEAPON_TYPES = ['Light', 'Medium', 'Heavy']
WEAPON_RANGES = [('Close Combat', 'close'), ('Ranged', 'ranged')]
DEFENSES = {
    'Resist': 'Resisting a spell or effect that affects your mind, your soul, '
              'or anything other than your body.',
    'Dodge': 'Avoiding being struck by an attack or other danger like a cave-in.',
    'Withstand': 'Dealing with poison, disease, or a magical attack that affects, '
                 'harms, or transforms your body.',
}


# Skills the rules name outside the sample lists. A heart's starting options
# are the ones that matter here, since a character has to be able to take them.
EXTRA = [{'name': 'Religious lore', 'category': 'narrative', 'weaponType': '',
          'weaponRange': '', 'defenseKey': '',
          'description': "Named among the Empath heart's starting skills, "
                         "though absent from the book's sample lists."}]

# The book words one skill two ways: the narrative list has "Understanding
# motives", the Empath heart "Understanding people's motives". They are the
# same skill, so the variant is kept as an alias rather than a second entry.
ALIASES = {'Understanding motives': ["Understanding people's motives"]}


def page_text(pdf, page):
    return subprocess.run(['pdftotext', '-layout', '-f', str(page), '-l', str(page), pdf, '-'],
                          capture_output=True, text=True).stdout.split('\n')


def bullets_after(lines, heading):
    """
    Collect the bulleted names following an anchor line.

    The pages are two columns and the neighbouring column interleaves line by
    line, so the list is picked out by staying at the anchor's indent. A bullet
    from the other column sits tens of characters away and is ignored.
    """
    start = next((i for i, l in enumerate(lines) if heading in l), None)
    if start is None:
        return []
    # A single dumped line spans both columns, so the anchor's column is where
    # the phrase sits in the line, not where the line's text begins.
    col = lines[start].index(heading)

    names = []
    for l in lines[start + 1:]:
        if not l.strip():
            continue
        hit = next((m for m in BULLET_RE.finditer(l) if abs(m.start() - col) <= 25), None)
        if hit:
            names.append(hit.group(1).strip())
            continue
        # A heading in this column ends the list; text in the other one is not
        # ours to care about.
        rest = l[max(0, col - 25):].strip()
        if names and rest and STOP_RE.match(rest):
            break
    return names


def tidy(name):
    """The lists wrap, and one entry carries a parenthetical aside."""
    name = re.sub(r'\s*\(.*$', '', name).strip()
    return re.sub(r'\s{2,}', ' ', name)


def extract(pdf):
    skills = []

    # The six weapon skills, from the prose rather than a list.
    for t in WEAPON_TYPES:
        for label, key in WEAPON_RANGES:
            skills.append({
                'name': f'{t} {label}',
                'category': 'action',
                'weaponType': t.lower(),
                'weaponRange': key,
                'defenseKey': '',
                'description': f'Attacking with a {t.lower()} '
                               f'{"close combat" if key == "close" else "ranged"} weapon.',
            })

    # The three defenses, which other rules name by their own names.
    for name, desc in DEFENSES.items():
        skills.append({'name': name, 'category': 'action', 'weaponType': '',
                       'weaponRange': '', 'defenseKey': name.lower(),
                       'description': desc})

    structured = {s['name'] for s in skills}
    for category, page in PAGES.items():
        lines = page_text(pdf, page)
        for raw in bullets_after(lines, HEADINGS[category]):
            name = tidy(raw)
            if not name or name in structured:
                continue
            skills.append({'name': name, 'category': category, 'weaponType': '',
                           'weaponRange': '', 'defenseKey': '', 'description': ''})
            structured.add(name)

    skills.extend(e for e in EXTRA if e['name'] not in structured)
    for s in skills:
        s['aliases'] = ALIASES.get(s['name'], [])
    return skills


if __name__ == '__main__':
    data = extract(sys.argv[1])
    json.dump(data, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)

    counts = {}
    for s in data:
        counts[s['category']] = counts.get(s['category'], 0) + 1
    print(f'{len(data)} skills -> {sys.argv[2]}')
    print('  by category:', counts)
    print('  weapon skills:', sum(1 for s in data if s['weaponType']))
    print('  defenses:', [s['name'] for s in data if s['defenseKey']])
    for c in ('action', 'narrative', 'development'):
        names = [s['name'] for s in data if s['category'] == c]
        print(f'  {c}: {", ".join(names)}')
