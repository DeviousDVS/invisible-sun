"""
Merge the card-deck spells into source/data/spells.json.

The cards are the authority where the two disagree: every conflict found on the
first merge was the book pass losing text — a dropped closing paren, a truncated
Depletion clause, a run-on into the next entry — and the decks agreed with the
books on level, colour and facet across all 332 shared spells.

Spells the decks do not carry are kept as the book pass extracted them; there
are a handful, printed in the books but never carded.

Usage:  python3 scripts/merge_spell_cards.py <cards.json> <spells.json>
"""
import json, sys


def norm(name):
    """Names differ only by apostrophe style between the two sources."""
    return name.upper().replace('’', "'").strip()


def main(cards_path, spells_path):
    cards = json.load(open(cards_path, encoding='utf-8'))
    book = json.load(open(spells_path, encoding='utf-8'))

    # The book pass joined this one across a line break.
    if 'NASCENTMIDNIGHT' in book:
        book['NASCENT MIDNIGHT'] = book.pop('NASCENTMIDNIGHT')

    by_card = {norm(c['name']): c for c in cards}
    merged, replaced = {}, 0

    for c in cards:
        merged[norm(c['name'])] = {
            'level': c['level'], 'dice': c['dice'],
            'description': c['description'], 'depletion': c['depletion'],
            'color': c['color'], 'facets': c['facets'],
            'note': c['note'], 'spellType': c['spellType'], 'source': c['deck'],
        }

    kept = []
    for name, data in book.items():
        if norm(name) in by_card:
            replaced += 1
            continue
        entry = dict(data)
        entry.setdefault('note', '')
        entry.setdefault('spellType', 'general')
        entry.setdefault('source', 'books')
        merged[norm(name)] = entry
        kept.append(name)

    out = {k: merged[k] for k in sorted(merged)}
    json.dump(out, open(spells_path, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    print(f'{len(out)} spells -> {spells_path}')
    print(f'  {len(cards)} from cards ({replaced} replacing a book entry)')
    print(f'  {len(kept)} book-only kept: {", ".join(sorted(kept))}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
