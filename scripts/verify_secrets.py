"""
Check the extracted secrets against the books they came from.

source/data/secrets.json is built from the Van Hauten Collection's text, because
its pages carry no marginal notes to flatten into the body. That is a judgement
about which flattening is cleaner, not about which is correct, and it is worth
nothing unless the two actually say the same thing.

They can be compared, because 269 of the 274 secrets are printed twice: once in
the book that introduced them and once in the compilation. Two independent
flattenings of the same passage agreeing is strong evidence both are right, and
any disagreement is a defect in one of them.

The comparison is on words, ignoring case and punctuation, because the two
typesettings differ in ways that do not matter — a line break falls elsewhere,
an em dash is spaced differently. What matters is a word present in one and
missing from the other, which is what truncation and swallowed furniture both
look like.

Usage:  python3 scripts/verify_secrets.py
"""
import json, re, sys, unicodedata
import extract_secrets as ex


def words(text):
    d = unicodedata.normalize('NFKD', text.lower().replace('’', "'"))
    d = ''.join(c for c in d if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9']+", d)


def main():
    secrets = json.load(open(ex.DEST, encoding='utf-8'))
    book_map = json.load(open(ex.MAP, encoding='utf-8'))

    # Re-read every book's own text, independently of how secrets.json was made.
    from_books = {}
    for title in ex.COVERED:
        lines, page_of, heads = ex.load(title, book_map)
        for lo, hi, kind in ex.sections_of(lines, title):
            for s in ex.parse_entries(lines, page_of, heads, lo, hi, kind, title):
                from_books[ex.norm(s['name'])] = s
    for title, names in ex.LOOSE.items():
        lines, page_of, heads = ex.load(title, book_map)
        for s in ex.loose_entries(lines, page_of, heads, title, names):
            from_books.setdefault(ex.norm(s['name']), s)

    compared = level_bad = kind_bad = text_bad = 0
    unpaired = []
    for s in secrets:
        other = from_books.get(ex.norm(s['name']))
        if other is None:
            unpaired.append(s['name'])
            continue
        compared += 1

        if s['level'] != other['level']:
            print(f"  LEVEL  {s['name']}: {s['source']} says {other['level']}, "
                  f"the compilation says {s['level']}")
            level_bad += 1
        if s['bonusDice'] != other['bonusDice']:
            print(f"  DICE   {s['name']}: {s['source']} says +{other['bonusDice']}, "
                  f"the compilation says +{s['bonusDice']}")
            level_bad += 1
        # A secret's kind is the same wherever it is printed. It differing means
        # a section boundary was read wrong in one of the two books.
        if s['kind'] != other['kind']:
            print(f"  KIND   {s['name']}: {s['source']} has it under "
                  f"{other['kind']}, the compilation under {s['kind']}")
            kind_bad += 1

        a, b = words(s['description']), words(other['description'])
        if a != b:
            # A word in one and not the other. Position is ignored so that a
            # single dropped word does not misalign everything after it.
            only_book = [w for w in b if w not in set(a)]
            only_comp = [w for w in a if w not in set(b)]
            if only_book or only_comp:
                print(f"  TEXT   {s['name']} ({s['source']} p{s['page']}): "
                      f"{len(a)} words compiled vs {len(b)} in the book")
                if only_book:
                    print(f"           only in the book: {only_book[:14]}")
                if only_comp:
                    print(f"           only compiled:    {only_comp[:14]}")
                text_bad += 1

    print(f'\n{len(secrets)} secrets, {compared} of them printed in two books '
          f'and compared word for word')
    print(f'  {level_bad} level or dice disagreements')
    print(f'  {kind_bad} kind disagreements')
    print(f'  {text_bad} text disagreements')
    print(f'  {len(unpaired)} printed only once, so nothing to compare against: '
          f'{unpaired}')
    return 1 if (level_bad or kind_bad or text_bad) else 0


if __name__ == '__main__':
    sys.exit(main())
