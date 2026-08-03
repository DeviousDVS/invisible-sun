"""
Merge the card decks into source/data/spells.json and incantations.json.

The cards are the authority where the two sources disagree: every conflict on
the first merge was the book pass losing text — a dropped closing paren, a
truncated Depletion clause, a run-on into the next entry — while the decks
agreed with the books on level, colour and facet across every shared entry.

Spells and incantations print identical cards, so a deck that mixes them cannot
be split on the card face. TN Base Cards does mix them, and those are routed by
which book list already names them.

A few book entries carry a mangled name — one joined across a line break, two
that lost their opening words to a column boundary — and would otherwise survive
the merge as duplicates of a card. They are dropped by matching descriptions
rather than by a hand-kept list of names, so a new one cannot slip through.

Usage:  python3 scripts/merge_cards.py <spell-cards.json> <incantation-cards.json>
"""
import json, re, sys

SPELLS = 'source/data/spells.json'
INCANTATIONS = 'source/data/incantations.json'

def norm(name):
    """Names differ only by apostrophe style between the two sources."""
    return name.upper().replace('’', "'").strip()


def load(path):
    book = json.load(open(path, encoding='utf-8'))
    return {norm(k): v for k, v in book.items()}


def key(text):
    """A description, reduced enough to match across the two extractions."""
    return re.sub(r'\W+', ' ', (text or '')).strip().lower()[:120]


def entry(card):
    return {
        'level': card['level'], 'dice': card['dice'],
        'description': card['description'], 'depletion': card['depletion'],
        'color': card['color'], 'facets': card['facets'], 'note': card['note'],
        'spellType': card['spellType'], 'source': card['deck'],
    }


def main(spell_cards, incantation_cards):
    books = {'spell': load(SPELLS), 'incantation': load(INCANTATIONS)}
    out = {'spell': {}, 'incantation': {}}

    cards = [(c, 'spell') for c in json.load(open(spell_cards, encoding='utf-8'))]
    cards += [(c, 'incantation') for c in json.load(open(incantation_cards, encoding='utf-8'))]

    routed = 0
    for card, default in cards:
        name = norm(card['name'])
        # A deck of one kind is trusted for its own cards; a card goes the other
        # way only where the other book list already names it.
        other = 'incantation' if default == 'spell' else 'spell'
        kind = default
        if name not in books[default] and name in books[other]:
            kind = other
            routed += 1
        out[kind][name] = entry(card)

    carded = {key(c['description']) for c in out['spell'].values()}
    carded |= {key(c['description']) for c in out['incantation'].values()}

    for kind, path in (('spell', SPELLS), ('incantation', INCANTATIONS)):
        kept, dropped = [], []
        for name, data in books[kind].items():
            if name in out['spell'] or name in out['incantation']:
                continue
            if key(data.get('description')) in carded:
                # Same text under a name the book pass mangled; the card wins.
                dropped.append(name)
                continue
            e = dict(data)
            e.setdefault('note', '')
            e.setdefault('spellType', 'general')
            e.setdefault('source', 'books')
            out[kind][name] = e
            kept.append(name)

        ordered = {k: out[kind][k] for k in sorted(out[kind])}
        json.dump(ordered, open(path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        print(f'{len(ordered):>4} {kind}s -> {path}')
        if kept:
            print(f'      {len(kept)} not carded, kept from the books: {", ".join(sorted(kept))}')
        if dropped:
            print(f'      {len(dropped)} dropped as mangled duplicates of a card: '
                  f'{", ".join(sorted(dropped))}')
    print(f'{routed} cards routed to the other list by book membership')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
