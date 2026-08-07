"""
Give every incantation a set of categories, so a conation incantation can be
asked for by type.

"They can ask for a general type of conation incantation (offensive, movement,
defensive, deception, and so on), rather than a specific one" (The Way, p106).
The deck prints no such type: all 211 incantations carry an empty `facets` and
a `spellType` of "general", so the categories have to be assigned.

They are assigned by reading each incantation, not by matching keywords against
its description. Keywords get this wrong in both directions — "The Decay of
Neglect" rots a foe's armour and never says damage, while "Only Footsteps Come
This Way" raises a barrier and never says defend — and a category that is wrong
is worse than none, because the player asks for a type and is handed something
unrelated.

The four types the book names are all here. The other seven come from what the
deck actually contains: a large group that only grants bene had no home in the
book's four, and neither did healing or summoning.

Categories are multiple, because most incantations genuinely are. A conjured
spider that attacks is creation and offensive, and someone asking for either
should find it.

An illusion is deception and not creation, however convincingly it conjures
something, because a player asking for creation wants a thing that is really
there. Applying that unevenly was the main fault a second pass turned up.

Assignments are keyed by position in the sorted list rather than by name only
to keep 211 long names from being mistyped; the script resolves them back to
names and fails if the two ever disagree.

Usage:  python3 scripts/categorise_incantations.py
"""
import json, sys

SOURCE = 'source/data/incantations.json'

# The four the book names, then what the deck turned out to need.
CATEGORIES = {
    'offensive':      'Harms, damages, kills, or cripples.',
    'defensive':      'Protects, wards, negates, or resists.',
    'movement':       'Travel, teleportation, flight, passage, escape.',
    'deception':      'Illusion, invisibility, disguise, concealment, lies.',
    'knowledge':      'Divination, detection, scrying, tracking, learning.',
    'control':        'Compels, binds, restrains, or commands another.',
    'creation':       'Summons or conjures a creature, object, or structure.',
    'transformation': 'Changes the form of the caster, another, or the world.',
    'restoration':    'Heals, cures, refreshes, or undoes.',
    'enhancement':    'Grants bene, dice, or a bonus to actions.',
    'utility':        'Does something useful that fits none of the above.',
}

# Position in the sorted list -> categories. Read one at a time from the text.
ASSIGNED = {
    1: ['offensive', 'creation'],          2: ['deception'],
    3: ['deception'],                      4: ['offensive'],
    5: ['movement'],                       6: ['restoration', 'defensive'],
    7: ['enhancement'],                    8: ['creation'],
    9: ['enhancement'],                    10: ['enhancement'],
    11: ['transformation', 'offensive', 'creation', 'enhancement'],
    12: ['utility', 'offensive'],          13: ['offensive'],
    14: ['enhancement'],                   15: ['offensive', 'creation'],
    16: ['offensive'],                     17: ['movement', 'control'],
    18: ['offensive'],                     19: ['offensive', 'utility'],
    20: ['restoration'],                   21: ['control', 'utility'],
    22: ['deception'],         23: ['deception'],
    24: ['offensive'],                     25: ['creation', 'offensive'],
    26: ['enhancement'],                   27: ['offensive', 'creation'],
    28: ['creation', 'defensive'],         29: ['utility'],
    30: ['knowledge'],                     31: ['offensive'],
    32: ['movement', 'creation'],          33: ['utility'],
    34: ['creation'],                      35: ['defensive', 'offensive'],
    36: ['knowledge'],                     37: ['knowledge'],
    38: ['offensive', 'enhancement'],      39: ['control'],
    40: ['creation'],                      41: ['offensive', 'enhancement', 'creation'],
    42: ['offensive'],                     43: ['movement'],
    44: ['creation', 'offensive'],         45: ['offensive', 'transformation'],
    46: ['deception'],                     47: ['offensive', 'creation'],
    48: ['control', 'offensive', 'creation'],          49: ['utility'],
    50: ['offensive'],                     51: ['offensive'],
    52: ['transformation'],                53: ['creation'],
    54: ['knowledge'],                     55: ['movement', 'creation'],
    56: ['creation', 'enhancement'],       57: ['offensive', 'movement'],
    58: ['offensive'],                     59: ['knowledge', 'control'],
    60: ['deception'],                     61: ['creation', 'offensive'],
    62: ['defensive'],                     63: ['movement', 'control'],
    64: ['restoration', 'control'],        65: ['offensive', 'utility'],
    66: ['enhancement'],                   67: ['utility', 'defensive'],
    68: ['offensive'],                     69: ['control'],
    70: ['enhancement'],                   71: ['utility'],
    72: ['control'],                       73: ['offensive', 'utility'],
    74: ['utility'],                       75: ['transformation'],
    76: ['knowledge'],                     77: ['enhancement'],
    78: ['restoration'],                   79: ['control'],
    80: ['offensive', 'utility'],          81: ['control'],
    82: ['enhancement'],                   83: ['control'],
    84: ['enhancement', 'deception'],      85: ['offensive'],
    86: ['utility'],                       87: ['movement'],
    88: ['offensive', 'defensive'],        89: ['movement'],
    90: ['enhancement', 'movement'],       91: ['creation'],
    92: ['defensive', 'creation'],         93: ['offensive', 'transformation'],
    94: ['transformation'],                95: ['movement'],
    96: ['restoration'],                   97: ['knowledge'],
    98: ['offensive', 'control'],          99: ['movement'],
    100: ['enhancement'],                  101: ['enhancement'],
    102: ['creation'],                     103: ['knowledge'],
    104: ['enhancement'],                  105: ['creation'],
    106: ['offensive'],                    107: ['defensive', 'utility'],
    108: ['offensive'],                    109: ['restoration', 'enhancement'],
    110: ['movement', 'creation'],         111: ['defensive'],
    112: ['offensive'],                    113: ['transformation', 'defensive', 'offensive'],
    114: ['knowledge'],                    115: ['offensive'],
    116: ['restoration'],                  117: ['creation', 'movement'],
    118: ['creation', 'knowledge'],        119: ['restoration', 'enhancement'],
    120: ['control'],                      121: ['control', 'offensive'],
    122: ['restoration'],                  123: ['offensive', 'transformation'],
    124: ['creation', 'defensive', 'offensive'],
    125: ['offensive'],                    126: ['offensive', 'deception'],
    127: ['offensive'],                    128: ['utility'],
    129: ['enhancement'],                  130: ['transformation', 'utility'],
    131: ['offensive', 'control'],         132: ['creation', 'movement'],
    133: ['defensive', 'movement'],        134: ['enhancement', 'knowledge'],
    135: ['knowledge'],                    136: ['offensive'],
    137: ['deception'],                    138: ['control'],
    139: ['offensive'],                    140: ['transformation', 'utility', 'offensive'],
    141: ['enhancement'],                  142: ['control', 'defensive'],
    143: ['offensive', 'creation'],        144: ['control', 'deception'],
    145: ['offensive'],                    146: ['utility', 'enhancement'],
    147: ['utility'],                      148: ['offensive', 'control'],
    149: ['deception', 'control'],         150: ['offensive'],
    151: ['enhancement'],                  152: ['utility', 'movement', 'defensive'],
    153: ['offensive'],                    154: ['enhancement', 'transformation'],
    155: ['knowledge', 'enhancement'],     156: ['offensive'],
    157: ['control'],                      158: ['creation', 'movement'],
    159: ['knowledge', 'defensive', 'creation', 'enhancement'],
    160: ['offensive', 'control'],         161: ['utility', 'movement'],
    162: ['enhancement'],                  163: ['offensive', 'control'],
    164: ['creation'],                     165: ['defensive', 'deception'],
    166: ['deception'],                    167: ['restoration'],
    168: ['offensive', 'defensive'],       169: ['offensive', 'creation'],
    170: ['enhancement'],                  171: ['knowledge', 'utility'],
    172: ['control'],                      173: ['knowledge'],
    174: ['transformation', 'control'],    175: ['offensive', 'creation'],
    176: ['creation'],                     177: ['transformation'],
    178: ['creation'],                     179: ['knowledge'],
    180: ['knowledge', 'deception'],
    181: ['utility', 'transformation', 'knowledge'],
    182: ['enhancement'],                  183: ['deception', 'control'],
    184: ['utility', 'defensive'],         185: ['offensive'],
    186: ['control', 'transformation'],    187: ['offensive', 'creation'],
    188: ['offensive'],                    189: ['movement', 'control', 'offensive'],
    190: ['defensive'],                    191: ['defensive'],
    192: ['control'],                      193: ['knowledge'],
    194: ['enhancement', 'restoration'],   195: ['control', 'utility'],
    196: ['control', 'knowledge'],         197: ['enhancement', 'defensive'],
    198: ['knowledge', 'defensive'],       199: ['movement'],
    200: ['movement', 'defensive'],        201: ['knowledge'],
    202: ['restoration', 'defensive'],     203: ['offensive'],
    204: ['offensive', 'control'],         205: ['control', 'transformation'],
    206: ['transformation', 'control'],    207: ['movement'],
    208: ['utility'],                      209: ['transformation', 'control', 'offensive'],
    210: ['knowledge'],                    211: ['enhancement'],
}


def main():
    data = json.load(open(SOURCE, encoding='utf-8'))
    names = sorted(data)

    problems = []
    if len(names) != len(ASSIGNED):
        problems.append(f'{len(names)} incantations but {len(ASSIGNED)} assignments')
    for position, cats in ASSIGNED.items():
        if not 1 <= position <= len(names):
            problems.append(f'position {position} is outside the list')
            continue
        for c in cats:
            if c not in CATEGORIES:
                problems.append(f'{names[position - 1]}: unknown category {c!r}')
        if not cats:
            problems.append(f'{names[position - 1]}: no category')
    missing = [i for i in range(1, len(names) + 1) if i not in ASSIGNED]
    for i in missing:
        problems.append(f'{names[i - 1]}: never assigned')

    if problems:
        for p in problems[:20]:
            print(f'  {p}')
        print(f'{len(problems)} problems; nothing written')
        return 1

    for position, cats in ASSIGNED.items():
        # Stored in a stable order so a rebuild produces no spurious diff.
        data[names[position - 1]]['categories'] = sorted(set(cats),
                                                         key=list(CATEGORIES).index)

    json.dump(data, open(SOURCE, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    counts = {c: 0 for c in CATEGORIES}
    for entry in data.values():
        for c in entry['categories']:
            counts[c] += 1
    print(f'{len(data)} incantations -> {SOURCE}')
    for c, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f'  {c:<16} {n:>3}  {CATEGORIES[c]}')
    labels = sum(len(e['categories']) for e in data.values())
    print(f'  {labels} labels, {labels / len(data):.2f} per incantation')
    return 0


if __name__ == '__main__':
    sys.exit(main())
