"""
Cut the card faces out of a self-print deck PDF and write them as image assets.

Monte Cook Games ships a print-your-own PDF with every deck: card faces laid
out on letter sheets with white gutters between them, backs on the facing page.
This takes those sheets apart into one image per card.

── Why render and crop rather than pull the embedded images ──
The embedded images are the *art* only. A card's name, its value and the suns
it shifts are vector text drawn on top, so `pdfimages` gives you a picture with
no writing on it — recognisable, but not the card. Rendering the page and
cutting out the card's rectangle gives the card as printed.

── Why the grid is measured, not written down ──
Every deck lays its cards out differently — the Sooth deck prints four round
cards two-by-two, the spell decks print rectangles — and MCG has reissued these
PDFs before. So the grid is found by looking at the page: the sheets are white,
the cards are not, and a card is a block of non-white with white all around it.
One table of measurements would be one reissue away from silently cutting every
card in half. Measuring also means this script did not need to know anything
about the Sooth deck to handle it, which is the point — the other decks are
meant to follow.

── How images are matched to cards ──
By position. Cards come off the sheet in the order the extractor for that deck
reads them — across the sheet, then down — so image *n* belongs to card *n*.
That only holds if both agree on the count, so the count is asserted rather
than assumed; a mismatch means the two are reading different things and every
name after the first missed card would be wrong.

── What is written ──
An index.json alongside the images maps card name to file. Nothing else has to
recreate the naming rule, and the compendium build can tell at a glance whether
a deck has been extracted at all.

Usage:
  python3 scripts/extract_card_images.py <deck.pdf> <cards.json> <out-dir>
  python3 scripts/extract_card_images.py ... --size 512 --quality 90
  python3 scripts/extract_card_images.py ... --dry-run

Requires poppler (pdftoppm, pdftotext, pdfinfo), as the rest of the pipeline
already does.
"""
import argparse
import json
import os
import re
import subprocess
import sys

# The sheets are white and the cards are not. Anything below this counts as
# card; JPEG-ish noise on a white page sits well above it.
INK = 200

# Resolution the page is measured at. Only wants to be fine enough to find the
# gutters — the cards themselves are rendered separately, at the output size.
DETECT_DPI = 100

# A run of ink thinner than this is furniture, not a card: every sheet carries
# a copyright line along the bottom, and that is the one thing on the page that
# is neither white nor a card.
MIN_CARD_INCHES = 1.0

# Two cards are the same size if they agree to within this. Anti-aliasing moves
# an edge by a pixel; a misdetected grid moves it by hundreds.
SIZE_TOLERANCE_PX = 6


def run(*args):
    return subprocess.run(args, capture_output=True)


def page_count(pdf):
    out = run("pdfinfo", pdf).stdout.decode("utf8", "replace")
    match = re.search(r"Pages:\s*(\d+)", out)
    if not match:
        sys.exit(f"pdfinfo could not read {pdf}")
    return int(match.group(1))


def render_gray(pdf, page, dpi):
    """Render one page to greyscale. Returns (width, height, pixels)."""
    raw = run("pdftoppm", "-gray", "-r", str(dpi),
              "-f", str(page), "-l", str(page), pdf).stdout
    # Netpbm P5: magic, width, height, maxval, then one byte per pixel.
    fields, i = [], 0
    while len(fields) < 4:
        while raw[i:i + 1].isspace():
            i += 1
        if raw[i:i + 1] == b"#":                    # comments are legal
            while raw[i:i + 1] != b"\n":
                i += 1
            continue
        j = i
        while not raw[j:j + 1].isspace():
            j += 1
        fields.append(raw[i:j])
        i = j
    i += 1
    width, height = int(fields[1]), int(fields[2])
    return width, height, raw[i:i + width * height]


def ink_runs(positions, gap):
    """Group a sorted list of positions into contiguous runs."""
    if not positions:
        return []
    runs, start, previous = [], positions[0], positions[0]
    for value in positions[1:]:
        if value - previous > gap:
            runs.append((start, previous))
            start = value
        previous = value
    runs.append((start, previous))
    return runs


def detect_boxes(pdf, page):
    """Find every block of ink on a page, in reading order.

    Rows first, then the columns within each row, so cards come out across the
    sheet before down it — the order the deck extractors read them in.
    Coordinates are returned in inches so they survive a change of resolution.

    Blocks are not necessarily cards. The front matter of these PDFs carries
    printing instructions and a credits page, and those come back as blocks
    too; deciding which blocks are cards needs the whole document, so it is
    done by the caller.

    `min` over a slice of the pixel buffer does the scanning, which reads
    oddly but is the difference between half a minute and half a second: it
    pushes the per-pixel work down into C instead of running it in Python.
    """
    width, height, pixels = render_gray(pdf, page, DETECT_DPI)
    gutter = int(MIN_CARD_INCHES * DETECT_DPI / 8)      # smaller than any gutter
    floor = int(MIN_CARD_INCHES * DETECT_DPI)

    def row_has_ink(y, left, right):
        return min(pixels[y * width + left:y * width + right + 1]) < INK

    def col_has_ink(x, top, bottom):
        return min(pixels[top * width + x:bottom * width + x + 1:width]) < INK

    inked_rows = [y for y in range(height) if row_has_ink(y, 0, width - 1)]
    bands = [(a, b) for a, b in ink_runs(inked_rows, gutter) if b - a + 1 >= floor]

    boxes = []
    for top, bottom in bands:
        inked_cols = [x for x in range(width) if col_has_ink(x, top, bottom)]
        columns = [(a, b) for a, b in ink_runs(inked_cols, gutter) if b - a + 1 >= floor]
        for left, right in columns:
            # A band is as tall as its tallest block, so re-measure this one's
            # own extent within its column. On the Sooth sheets the bottom band
            # would otherwise reach down into the copyright line.
            own = [y for y in range(top, bottom + 1) if row_has_ink(y, left, right)]
            runs = [(a, b) for a, b in ink_runs(own, gutter) if b - a + 1 >= floor]
            if len(runs) != 1:
                continue
            y0, y1 = runs[0]
            boxes.append((left / DETECT_DPI, y0 / DETECT_DPI,
                          (right - left + 1) / DETECT_DPI, (y1 - y0 + 1) / DETECT_DPI))
    return boxes


def words_in_inches(pdf, page):
    """Every word on the page, as (x, y, text) in inches from the top left."""
    out = run("pdftotext", "-bbox", "-f", str(page), "-l", str(page), pdf, "-")
    text = out.stdout.decode("utf8", "replace")
    found = re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" [^>]*>([^<]*)</word>', text)
    return [(float(x) / 72, float(y) / 72, word) for x, y, word in found]


def name_printed_on(box, words):
    """The card name as printed inside this block, squashed for comparison.

    Used only to check the matching, never to do it. The name is set along a
    curve, so pdftotext hands back the letters in fragments at varying heights
    ("W", then "hi spering Lover"); reading them left to right puts them back
    in order. Only the top of the card is read, because the value and the sun
    line would otherwise interleave with the name once everything is sorted by
    x alone.
    """
    x, y, w, h = box
    inside = [(wx, text) for wx, wy, text in words
              if x <= wx <= x + w and y <= wy <= y + h * 0.4]
    joined = "".join(text for _, text in sorted(inside))
    return re.sub(r"[^a-z0-9]", "", joined.lower())


def is_face(box, words):
    """True if this block is a card face rather than a card back.

    A face is printed with its name, its value and the suns it shifts; a back
    carries art alone. The two are otherwise the same shape, so what is written
    inside the block is the only thing that separates them — and it has to be
    *inside* the block, because every sheet has a copyright line along the
    bottom and the front matter has whole paragraphs sitting beside a sample
    card.
    """
    x, y, w, h = box
    return any(x <= wx <= x + w and y <= wy <= y + h for wx, wy, _ in words)


def slug(name):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")


def foundry_path(directory):
    """The path Foundry will serve this directory at, or None.

    Foundry addresses everything it serves relative to its user data folder, so
    an asset outside that folder is one it cannot show however correct the file
    is. Working the prefix out here means the mistake is caught while the images
    are being written rather than as sixty broken icons later.
    """
    absolute = os.path.abspath(directory)
    parts = absolute.split(os.sep)
    if "Data" not in parts:
        return None
    return "/".join(parts[parts.index("Data") + 1:])


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", help="the self-print deck PDF")
    parser.add_argument("cards", help="the JSON this deck's extractor produced")
    parser.add_argument("out", help="directory to write images into")
    parser.add_argument("--size", type=int, default=512,
                        help="width of the written image in pixels (default 512)")
    parser.add_argument("--quality", type=int, default=90, help="JPEG quality (default 90)")
    parser.add_argument("--dry-run", action="store_true",
                        help="report the grid that was found and write nothing")
    args = parser.parse_args()

    cards = json.load(open(args.cards, encoding="utf8"))
    names = [c["name"] for c in cards]

    pages = page_count(args.pdf)
    found = [(page, box) for page in range(1, pages + 1)
             for box in detect_boxes(args.pdf, page)]

    # A deck is mostly cards, and every card is the same size, so the size that
    # turns up most often is the card. Deciding this across the whole document
    # rather than page by page is what lets the front matter be discarded: the
    # printing instructions and the credits are blocks of ink too, and on these
    # PDFs they sit beside a sample card back that is exactly card-sized.
    tally = {}
    for _, (_, _, w, h) in found:
        key = (round(w, 1), round(h, 1))
        tally[key] = tally.get(key, 0) + 1
    card_w, card_h = max(tally, key=lambda k: tally[k])

    def is_card(box):
        return (abs(box[2] - card_w) * DETECT_DPI <= SIZE_TOLERANCE_PX
                and abs(box[3] - card_h) * DETECT_DPI <= SIZE_TOLERANCE_PX)

    faces, backs, text_cache = [], [], {}
    for page, box in found:
        if not is_card(box):
            continue
        if page not in text_cache:
            text_cache[page] = words_in_inches(args.pdf, page)
        (faces if is_face(box, text_cache[page]) else backs).append((page, box))

    # The credits are printed on a card. It is card-shaped, card-sized and has
    # writing on it, so every test so far says it is a card face — and it sits
    # alone on its page, which is what gives it away. A print sheet carries a
    # full grid; the front matter does not.
    per_sheet = {}
    for page, _ in faces:
        per_sheet[page] = per_sheet.get(page, 0) + 1
    counts = {}
    for count in per_sheet.values():
        counts[count] = counts.get(count, 0) + 1
    full_sheet = max(counts, key=lambda c: counts[c])
    front_matter = sorted(p for p, n in per_sheet.items() if n != full_sheet)
    faces = [(page, box) for page, box in faces if per_sheet[page] == full_sheet]

    # The same reasoning applies to the backs: page one prints a sample back
    # beside the cutting instructions, and the back that ships should be one
    # off a real sheet.
    backs_per_sheet = {}
    for page, _ in backs:
        backs_per_sheet[page] = backs_per_sheet.get(page, 0) + 1
    backs = [(page, box) for page, box in backs
             if backs_per_sheet[page] == full_sheet]

    if len(faces) != len(names):
        sys.exit(f"found {len(faces)} card faces but {args.cards} holds "
                 f"{len(names)} cards.\n"
                 f"Matching is by position, so a count that does not agree would "
                 f"name every card after the first missed one wrongly.\n"
                 f"Sheets hold {full_sheet} cards; pages {front_matter} hold fewer "
                 f"and were read as front matter.\n"
                 f"If one of those is a real sheet that is only part full, that is "
                 f"the bad assumption.")

    # Position is what pairs a picture with a name, and position is exactly the
    # thing that would go wrong quietly: one card missed at the front and every
    # name after it slides by one, which looks perfectly fine until someone who
    # knows the deck sees the Hunter labelled Vizier. So the name printed on
    # each card is read back and checked against the name it was given.
    misread = []
    for name, (page, box) in zip(names, faces):
        printed = name_printed_on(box, text_cache[page])
        if re.sub(r"[^a-z0-9]", "", name.lower()) not in printed:
            misread.append((name, printed))
    if misread:
        print(f"{len(misread)} card(s) do not carry the name they were matched to:",
              file=sys.stderr)
        for name, printed in misread[:10]:
            print(f"  expected {name!r}, card reads {printed!r}", file=sys.stderr)
        sys.exit("the images and the card list are out of step")

    dpi = round(args.size / card_w)

    if args.dry_run:
        sheets = len({page for page, _ in faces})
        print(f"{args.pdf}")
        print(f"  card {card_w:.2f} x {card_h:.2f} in")
        print(f"  {len(faces)} faces on {sheets} sheets of {full_sheet}, "
              f"{len(backs)} backs")
        print(f"  discarded {sum(1 for _, b in found if not is_card(b))} block(s) "
              f"that are not card-sized"
              + (f", and page(s) {front_matter} as front matter" if front_matter else ""))
        for page, (x, y, w, h) in faces[:4]:
            print(f"    page {page}: at {x:.2f},{y:.2f}")
        print(f"  would render at {dpi} dpi -> {args.size}px")
        return

    os.makedirs(args.out, exist_ok=True)

    # Every image comes out the same size. Detection puts a card's edge within
    # a pixel or two of its neighbours', which is invisible on the page but
    # would leave a UI laying these out side by side with images that disagree
    # about how big a card is. So the crop is the nominal card, centred on
    # where this one was actually found.
    crop_w, crop_h = args.size, round(args.size * card_h / card_w)

    def cut(page, box, stem):
        x, y, w, h = box
        out = os.path.join(args.out, stem)
        run("pdftoppm", "-jpeg", "-jpegopt", f"quality={args.quality}",
            "-r", str(dpi), "-f", str(page), "-l", str(page),
            "-x", str(round((x + w / 2) * dpi) - crop_w // 2),
            "-y", str(round((y + h / 2) * dpi) - crop_h // 2),
            "-W", str(crop_w), "-H", str(crop_h),
            "-singlefile", args.pdf, out)
        return stem + ".jpg"

    index, seen, written = {}, {}, 0
    for name, (page, box) in zip(names, faces):
        stem = slug(name)
        # Two cards may share a name across decks, and a deck may repeat one.
        # Silently overwriting would lose a card and leave the index pointing
        # both entries at the same picture.
        seen[stem] = seen.get(stem, 0) + 1
        if seen[stem] > 1:
            stem = f"{stem}-{seen[stem]}"
        index[name] = cut(page, box, stem)
        written += 1

    # The back is the same picture on every card, so one copy is enough. It is
    # what a face-down card shows, which the Sooth deck needs and the others do
    # not — hence written when present rather than required.
    back = cut(backs[0][0], backs[0][1], "back") if backs else None

    base = foundry_path(args.out)
    json.dump({"deck": os.path.basename(os.path.normpath(args.out)),
               "base": base, "back": back, "cards": index},
              open(os.path.join(args.out, "index.json"), "w", encoding="utf8"),
              indent=1, ensure_ascii=False)

    total = sum(os.path.getsize(os.path.join(args.out, f))
                for f in os.listdir(args.out) if f.endswith(".jpg"))
    print(f"{written} card images -> {args.out}  ({total / 1024 / 1024:.1f} MB)")
    if back:
        print(f"  card back: {back}")
    if base:
        print(f"  Foundry will serve these at: {base}/")
    else:
        print("  warning: this directory is not inside Foundry's Data folder, so\n"
              "           Foundry cannot serve these images. Move them under Data/.")


if __name__ == "__main__":
    main()
