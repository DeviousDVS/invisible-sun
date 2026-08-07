"""
Work out where a printed page number lands in each book's extracted text.

source/data/index.json cites the *printed* page — "secrets: The Way 84" — but
the extracted text is a stream of PDF pages, and the two never agree: covers,
title pages and front matter sit in front of printed page 1. The offset is
constant within a book but different for every book, so it has to be measured
rather than guessed.

Measuring it is easy because these books print a folio on nearly every page.
A page's last few lines hold a bare number; if that number is n and the PDF
page is p, the offset is p - n. Taking the most common offset across the whole
book ignores the pages that have no folio and the odd number that is really a
table entry.

The map also records each ALL-CAPS heading with the printed page it falls on,
which turns index.json from a list of page numbers into something that can be
navigated: given a subject, the map says which book, which printed page, and
which line of the extracted text to start reading at.

Usage:  python3 scripts/build_book_map.py
"""
import json, os, re, glob
from collections import Counter

BOOKS = 'source/books'
DEST = 'source/data/book-map.json'

# The name each book is cited by in index.json, keyed by its text file.
TITLES = {
    'The-Key.txt': 'The Key',
    'The-Way.txt': 'The Way',
    'The-Path.txt': 'The Path',
    'The-Gate.txt': 'The Gate',
    'Teratology.txt': 'Teratology',
    'Enchiridion.txt': 'Enchiridion of the Path',
    'Book-M.txt': 'Book M',
    'The-Nightside.txt': 'The Nightside',
    'The-Threshold.txt': 'The Threshold',
    'The-Wellspring.txt': 'The Wellspring',
    'Secrets-Silent-Streets.txt': 'Secrets of Silent Streets',
    'Van-Hauten-1.txt': 'The Van Hauten Collection',
}

HEADING = re.compile(r"^[A-Z][A-Z0-9 ,’'&()\-–—:/\.]{4,60}$")
FOLIO = re.compile(r'^(\d{1,3})$')

# The Enchiridion of the Path sets its in-character asides in capitals, so they
# match the heading pattern — and its handwriting face flattens badly, giving
# "I SHOUL D JUST DEVOU R THEM ALL". None of it is a heading and none of it is
# navigable, so it is dropped: a heading is one clause, never two sentences.
PROSE = re.compile(r'[.!?]\s+\S')


def pages(text):
    """Split the extracted text into PDF pages, keeping each page's line span."""
    out, start = [], 0
    lines = text.split('\n')
    for i, line in enumerate(lines):
        if '\f' in line:
            out.append((start, i))
            start = i + 1
    out.append((start, len(lines)))
    return lines, out


def bare_numbers(lines, span):
    """Every line on this page that is nothing but a number."""
    lo, hi = span
    return {int(FOLIO.match(lines[i].strip()).group(1))
            for i in range(lo, hi) if FOLIO.match(lines[i].strip())}


def anchors(lines, spans):
    """
    Pair PDF pages with the printed page numbers they carry.

    Picking the folio off a page by position does not survive these books:
    Teratology's stat blocks end in bare numbers, and a two-column page can
    flatten with the folio stranded mid-page. Every bare number is therefore a
    candidate, and the folio is identified by how the candidates line up across
    the book rather than by where it sits on any one page.

    A folio sequence rises by one per page and never goes backwards. Chance
    numbers do neither. So the folio is the longest chain of (pdf page, number)
    pairs that increases in both — a plain longest-increasing-subsequence, with
    the extra rule that printed pages never advance *slower* than PDF pages,
    since a PDF can put two printed pages on one sheet but never the reverse.

    Assuming instead that one offset holds for the whole book would be wrong
    for four of these twelve. Secrets of Silent Streets drifts from -3 to -39
    because it is laid out in spreads; a single number would be right for eight
    pages of it and wrong for the other hundred and seventy.
    """
    cands = [(p, n) for p, span in enumerate(spans, start=1)
             for n in sorted(bare_numbers(lines, span))]
    if not cands:
        return {}

    # best[i] = length of the longest valid chain ending at candidate i
    best = [1] * len(cands)
    prev = [-1] * len(cands)
    for i, (pi, ni) in enumerate(cands):
        for j in range(i):
            pj, nj = cands[j]
            if pj < pi and nj < ni and (ni - nj) >= (pi - pj) and best[j] + 1 > best[i]:
                best[i], prev[i] = best[j] + 1, j
    i = max(range(len(cands)), key=lambda k: best[k])
    chain = []
    while i != -1:
        chain.append(cands[i])
        i = prev[i]
    return dict(reversed(chain))


def printed_pages(spans, anchor):
    """
    A printed page number for every PDF page, from the anchors outwards.

    Pages that print no folio — art, spreads, chapter openers — take the number
    implied by the nearest anchors on either side, which is exact wherever the
    two agree on the offset and is the best available guess where they do not.
    """
    if not anchor:
        return {}
    keys = sorted(anchor)
    out = {}
    for pdf_page in range(1, len(spans) + 1):
        if pdf_page in anchor:
            out[pdf_page] = anchor[pdf_page]
            continue
        before = [k for k in keys if k < pdf_page]
        after = [k for k in keys if k > pdf_page]
        if before:
            out[pdf_page] = anchor[before[-1]] + (pdf_page - before[-1])
        elif after:
            out[pdf_page] = anchor[after[0]] - (after[0] - pdf_page)
    return out


def main():
    out = {}
    for path in sorted(glob.glob(os.path.join(BOOKS, '*.txt'))):
        base = os.path.basename(path)
        if base not in TITLES:
            continue
        text = open(path, encoding='utf-8', errors='replace').read()
        lines, spans = pages(text)
        anchor = anchors(lines, spans)
        # A chain that never gets long is not a folio sequence. Enchiridion of
        # the Path carries no folio in its text layer at all; saying so beats
        # publishing numbers that were really coincidences.
        trusted = len(anchor) >= 8
        printed = printed_pages(spans, anchor) if trusted else {}

        # Every heading, with the printed page it falls on — which is what turns
        # index.json's page citations into somewhere to start reading.
        headings = []
        for pdf_page, (lo, hi) in enumerate(spans, start=1):
            for i in range(lo, hi):
                s = lines[i].strip()
                if HEADING.match(s) and not FOLIO.match(s) and not PROSE.search(s):
                    headings.append({'heading': s, 'line': i + 1,
                                     'pdf_page': pdf_page,
                                     'printed_page': printed.get(pdf_page)})

        offsets = {p - n for p, n in anchor.items()} if trusted else set()
        out[TITLES[base]] = {
            'file': path,
            'pdf_pages': len(spans),
            'lines': len(lines),
            # printed_page -> pdf_page is one constant offset for most books,
            # but not for the ones laid out in spreads, so the per-page mapping
            # is what is authoritative. 'offset' is filled in only when it holds
            # for the whole book.
            'offset': (offsets.pop() if len(offsets) == 1 else None),
            'printed_page_by_pdf_page': {str(k): v for k, v in sorted(printed.items())},
            'folios_read': len(anchor),
            'pdf_pages_total': len(spans),
            'headings': headings,
        }
        if not trusted:
            note = '   NO READABLE FOLIO — printed pages unknown'
        elif out[TITLES[base]]['offset'] is None:
            lo_off, hi_off = min(p - n for p, n in anchor.items()), max(p - n for p, n in anchor.items())
            note = f'   spreads: offset drifts {lo_off} to {hi_off}'
        else:
            note = f"   offset {out[TITLES[base]]['offset']:+d} throughout"
        print(f'{TITLES[base]:<28} {len(spans):>4} pdf pages  '
              f'{len(anchor):>3} folios read  {len(headings):>4} headings{note}')

    json.dump(out, open(DEST, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(f'\n-> {DEST}')


if __name__ == '__main__':
    main()
