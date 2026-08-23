/**
 * Invisible Sun — what a PDF is, and what can be done with it.
 *
 * The importer takes a folder rather than a file, so the first thing it has to
 * do is work out what it is looking at. This is the list it checks against.
 *
 * ── Recognised by content, not filename ──
 * Every self-print deck announces itself on its first page — "To print your
 * Sooth Deck, set your double-sided printer to short-edge binding" — and every
 * book carries its title. A filename is the user's to change, and they do:
 * files get renamed, re-dated, and copied out of downloads folders. What is
 * printed on the page does not move.
 *
 * The filename is still used, but only as a hint that saves opening a file to
 * find out it is one this version cannot read anyway. Anything acted upon is
 * confirmed against its first page.
 *
 * The book hints are anchored, because these files arrive named
 * "The-Key-Hyperlinked-and-Bookmarked-2018-08-13". Unanchored, "book m"
 * matches the word "Bookmarked" in every one of them — The Wellspring was
 * being announced to the reader as Book M — and "the path" matches the
 * Enchiridion of the Path. Neither could do real harm, both being files this
 * cannot read yet, but a wrong name in the report is a wrong name.
 *
 * ── Why unsupported sources are listed at all ──
 * So the importer can say "that is the Spell Deck, which this version cannot
 * read yet" instead of "unrecognised file". The first tells a user to wait for
 * a later release; the second sends them looking for a fault of their own.
 */
import * as sooth from "./sooth.mjs";
import * as gate from "./gate.mjs";
import * as spells from "./spells.mjs";
import * as objects from "./objects.mjs";
import * as aggregates from "./aggregates.mjs";
import * as nightside from "./nightside.mjs";
import * as keyBook from "./key.mjs";
import * as threshold from "./threshold.mjs";

/**
 * A book's title as it comes off its own cover.
 *
 * Cover type is letter-spaced, and pdf.js hands those back as real spaces —
 * Secrets of Silent Streets opens "SECRETS   o f  SILENT STREETS  M ONTE COO
 * K". Written out as it reads, the signature does not match its own book, and
 * the importer files it under "not recognised as an Invisible Sun PDF", which
 * sends the reader looking for a fault in their download.
 *
 * So a title is given as it is printed and matched letter by letter, with
 * whitespace allowed to fall anywhere inside a word and required between them.
 * It stays anchored to the start of the text, which is what keeps it a cover
 * and not a mention: several of these books name the others on their credits
 * page.
 */
export function coverTitle(title) {
  const pattern = title.trim().split(/\s+/)
    .map(word => word.split("").map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"))
    .join("\\s+");
  return new RegExp(`^\\s*${pattern}`, "i");
}

/**
 * Sources this can read.
 *
 * `signature` is matched against the first page's text; `hint` against the
 * filename. A source needs both to be recognised without opening every PDF in
 * the folder, and the signature is the one that decides.
 */
export const SOURCES = [
  {
    key: "sooth",
    label: "ISUN.SourceSoothDeck",
    hint: /sooth/i,
    signature: /to print your sooth deck/i,
    kind: "deck",
    pack: "invisible-sun.sooth",
    folder: "sooth",
    expected: 60,
    /* The Sooth cards are round, so a square crop of one carries white
     * corners. They are also the one deck you look at rather than read — the
     * card is turned face up on the table — which is why this deck alone gets
     * pictures cut for it. */
    mask: true,
    images: true,
    read: sooth.readDeck,
    verify: sooth.verifyNames,
    toItem: sooth.toItem,
    slug: sooth.slug
  },
  {
    key: "spell",
    label: "ISUN.SourceSpellDeck",
    hint: /^spell deck/i,
    /* The comma matters. This deck opens "To print your Spell Deck, set your
     * double-sided printer…" and the Book M cards open "To print your Spell
     * Deck cards, set…", so a signature without it matches both — and matched
     * the wrong one first, which showed up as the Book M deck being refused
     * for holding 40 cards where the main deck should have 300. */
    signature: /to print your spell deck,/i,
    /* A deck that is read rather than looked at. Its cards are a name, a level
     * and a description — no art at all — so nothing here measures a grid in
     * pixels or cuts a picture per card. It could not anyway: these sheets
     * print their cards hard against one another, with crop marks bridging
     * what gaps there are, so there is no white to find them by. The text
     * layer carries everything. */
    kind: "deck-text",
    pack: "invisible-sun.spells",
    folder: "spells",
    expected: 300,
    read: spells.readDeck,
    toItem: spells.toItem,
    /* Every card in the deck shares one back, so one picture stands for all
     * three hundred spells. It is the deck's own livery rather than a generic
     * rune, which is the most this deck can offer — the faces carry no art. */
    sharedBack: true
  },
  {
    key: "spell-m",
    label: "ISUN.SourceSpellCardsM",
    hint: /book.?m.*spell/i,
    signature: /to print your spell deck cards/i,
    kind: "deck-text",
    pack: "invisible-sun.spells",
    folder: "spells",
    expected: 40,
    read: spells.readDeck,
    toItem: spells.toItem,
    sharedBack: true,
    backName: "back-book-m"
  },
  {
    key: "vance",
    label: "ISUN.SourceVanceDeck",
    hint: /vance spell deck/i,
    signature: /to print your vance spell deck/i,
    kind: "deck-text",
    pack: "invisible-sun.vance-spells",
    folder: "vance-spells",
    expected: 50,
    read: spells.readDeck,
    toItem: spells.toItem,
    spellType: "vance",
    /* A Vancian spell's class is the size of the card it is printed on, and no
     * card names it in words — so the sizes have to be measured off the sheets
     * as they are read. Only this deck needs it; nothing else has a class. */
    classes: true,
    sharedBack: true
  },
  {
    key: "vance-tn",
    label: "ISUN.SourceVanceCardsTN",
    hint: /tn vance/i,
    /* The same words as the main Vance deck, to the letter: both open "To
     * print your Vance Spell deck". These two cannot be told apart by what
     * they say, only by what they are called — the one exception to reading
     * the page rather than the filename, and it is recorded here rather than
     * worked around silently. If this file is renamed it will be read as the
     * main deck and refused for holding ten cards instead of fifty, which is
     * the right way to fail. */
    signature: /to print your vance spell deck,/i,
    kind: "deck-text",
    pack: "invisible-sun.vance-spells",
    folder: "vance-spells",
    expected: 10,
    read: spells.readDeck,
    toItem: spells.toItem,
    spellType: "vance",
    classes: true,
    sharedBack: true,
    backName: "back-nightside"
  },
  {
    key: "objects",
    label: "ISUN.SourceObjectDeck",
    hint: /objects of power deck/i,
    signature: /to print your objects of power deck/i,
    kind: "deck-text",
    pack: "invisible-sun.objects-of-power",
    folder: "objects-of-power",
    expected: 182,
    read: objects.readDeck,
    toItem: objects.toItem,
    sharedBack: true
  },
  {
    key: "objects-m",
    label: "ISUN.SourceObjectCardsM",
    hint: /book.?m.*objects of power/i,
    signature: /to print your objects of power cards/i,
    kind: "deck-text",
    /* The same compendium as the main deck. These are the objects printed in
     * Book M rather than a second kind of thing, and entries are matched by
     * name, so the two simply fill in the one pack between them. */
    pack: "invisible-sun.objects-of-power",
    folder: "objects-of-power",
    /* 26, not the 25 the old pipeline reported. Vital Aspect — a level 7
     * multifaceted jewel — sits where the column arithmetic used to lose
     * cards, the same place Winter and Woodflesh were hiding. */
    expected: 26,
    read: objects.readDeck,
    toItem: objects.toItem,
    sharedBack: true,
    /* Its own name, so it does not overwrite the main deck's back. The two
     * print the same livery but they are not the same picture, and an item
     * should carry the back of the deck it was actually printed in. */
    backName: "back-book-m"
  },
  {
    key: "incantations",
    label: "ISUN.SourceIncantationDeck",
    hint: /incantations deck/i,
    signature: /to print your incantations deck/i,
    kind: "deck-text",
    pack: "invisible-sun.incantations",
    folder: "incantations",
    expected: 208,
    /* Read by the spell reader, because an incantation card and a spell card
     * are the same card. That is not a convenience — it is why a deck mixing
     * the two cannot be told apart on the card face at all. */
    read: spells.readDeck,
    toItem: spells.toIncantationItem,
    sharedBack: true
  },
  {
    key: "ephemera",
    label: "ISUN.SourceEphemeraDeck",
    hint: /ephemera objects deck/i,
    signature: /to print your ephemera objects deck/i,
    kind: "deck-text",
    pack: "invisible-sun.ephemera",
    folder: "ephemera",
    /* 241, not the 240 the old pipeline reported. Woodflesh sits on a sheet
     * that is only part full, and the column arithmetic that assumed a full
     * sheet lost it — the same fault that hid Winter in the aggregates deck.
     * The count is the true one; the guard caught the change and refused to
     * import until it was reconciled, which is what it is for. */
    expected: 241,
    read: objects.readDeck,
    toItem: objects.toEphemeraItem,
    sharedBack: true
  },
  {
    key: "ephemera-m",
    label: "ISUN.SourceEphemeraCardsM",
    hint: /book.?m.*ephemera/i,
    signature: /to print your ephemera objects cards/i,
    kind: "deck-text",
    pack: "invisible-sun.ephemera",
    folder: "ephemera",
    expected: 52,
    read: objects.readDeck,
    toItem: objects.toEphemeraItem,
    sharedBack: true,
    backName: "back-book-m"
  },
  {
    key: "aggregates",
    label: "ISUN.SourceAggregatesDeck",
    hint: /weaver aggregates/i,
    signature: /to print your weaver aggregates/i,
    kind: "deck-text",
    pack: "invisible-sun.threads",
    folder: "aggregates",
    expected: 18,
    read: aggregates.readDeck,
    toItem: aggregates.toItem,
    sharedBack: true
  },
  {
    key: "nightside",
    label: "ISUN.SourceNightsideCards",
    hint: /tn base|nightside cards/i,
    signature: /to print your nightside cards/i,
    /* The only deck that holds more than one kind of card — five of them,
     * shuffled together and sometimes several to a sheet. So it fills five
     * compendia rather than one, and each kind brings its own reader's output
     * and its own way of becoming an item. */
    kind: "mixed",
    expected: 40,
    read: nightside.readDeck,
    kinds: {
      spell:       { pack: "invisible-sun.spells", folder: "spells",
                     toItem: (c, img) => spells.toItem(c, img, "general") },
      incantation: { pack: "invisible-sun.incantations", folder: "incantations",
                     toItem: spells.toIncantationItem },
      object:      { pack: "invisible-sun.objects-of-power", folder: "objects-of-power",
                     toItem: objects.toItem },
      ephemera:    { pack: "invisible-sun.ephemera", folder: "ephemera",
                     toItem: objects.toEphemeraItem },
      aggregate:   { pack: "invisible-sun.threads", folder: "aggregates",
                     toItem: aggregates.toItem }
    }
  },
  {
    key: "gate",
    label: "ISUN.SourceGate",
    hint: /^the.?gate/i,
    signature: coverTitle("THE GATE"),
    /* A book rather than a deck: it carries no card faces and cuts no
     * pictures. What it holds is the write-up behind a card that has already
     * been imported — so it fills entries in rather than creating them. */
    kind: "book",
    pack: "invisible-sun.sooth",
    read: gate.readEntries
  },
  {
    key: "key",
    label: "ISUN.SourceKey",
    hint: /^the.?key/i,
    signature: coverTitle("THE KEY"),
    /* A book that makes items rather than filling them in, which is what
     * separates this from The Gate: the Money and Goods chapter is the only
     * place several hundred of these things are written down. What it does
     * fill in is the price of the fifty kindled items, which are cards. */
    kind: "listing",
    read: keyBook.readGoods,
    sort: keyBook.sort,
    buckets: {
      goods:   { pack: "invisible-sun.gear", toItem: keyBook.toItem },
      kindled: { pack: "invisible-sun.objects-of-power", toItem: keyBook.toPrice,
                 updateOnly: true }
    }
  },
  {
    key: "threshold",
    label: "ISUN.SourceThreshold",
    hint: /threshold/i,
    signature: coverTitle("THE THRESHOLD"),
    kind: "listing",
    read: threshold.readEntries,
    columns: threshold.COLUMNS.threshold,
    sort: (entry) => (entry.kind === "ephemera" ? "ephemera" : "objects"),
    buckets: {
      objects:  { pack: "invisible-sun.objects-of-power", toItem: threshold.toItem },
      ephemera: { pack: "invisible-sun.ephemera", toItem: threshold.toEphemeraItem }
    }
  },
  {
    key: "silent-streets",
    label: "ISUN.SourceSilentStreets",
    hint: /silent.?streets/i,
    signature: coverTitle("SECRETS OF SILENT STREETS"),
    kind: "listing",
    read: threshold.readEntries,
    columns: threshold.COLUMNS["silent-streets"],
    sort: () => "objects",
    buckets: {
      objects: { pack: "invisible-sun.objects-of-power", toItem: threshold.toItem }
    }
  }
];

/**
 * Sources this knows of but cannot read yet.
 *
 * Kept deliberately, so that pointing the importer at a full set of PDFs
 * produces a useful account of what is and is not covered rather than a list
 * of files it could not identify.
 */
export const NOT_YET = [
  { key: "way", label: "ISUN.SourceWay", hint: /^the.?way/i, signature: coverTitle("THE WAY") },
  { key: "path", label: "ISUN.SourcePath", hint: /^the.?path/i, signature: coverTitle("THE PATH") },
  { key: "book-m", label: "ISUN.SourceBookM", hint: /^book.?m\b/i, signature: coverTitle("BOOK M") }
];

const ALL = [...SOURCES, ...NOT_YET];

/** The text of a PDF's opening pages, which is where it says what it is. */
export async function openingText(doc, pages = 2) {
  const out = [];
  for (let n = 1; n <= Math.min(pages, doc.numPages); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    out.push(content.items.map(i => i.str).join(" "));
  }
  return out.join(" ");
}

/** What the filename suggests, if anything. Only ever a shortcut. */
export function guessFromName(filename) {
  const matches = ALL.filter(s => s.hint.test(filename));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * What the opening pages say it is. This is the answer that counts.
 *
 * More than one match is a fault in this list rather than in the file, and it
 * is reported instead of being settled by whichever entry happens to come
 * first. That is how the Book M spell cards came to be read as the main spell
 * deck: both signatures matched, the main deck was listed earlier, and the
 * only visible symptom was a count that did not add up.
 */
export function identifyFromText(text) {
  const matches = ALL.filter(s => s.signature.test(text));
  if (matches.length > 1) {
    /* Deliberately the first, which is the more general of the two — the main
     * deck rather than the supplement. A file that still has its own name gets
     * corrected to the supplement by the caller; one that has been renamed
     * falls back here and is refused by the count, which is a better failure
     * than being quietly read as the wrong deck. */
    console.warn("invisible-sun | more than one source signature matches this PDF: "
      + matches.map(m => m.key).join(", ") + " — taking the first; the filename "
      + "decides if it names one of them.");
  }
  return matches[0] ?? null;
}

/** True if this is a source the importer can actually act on. */
export const isSupported = (source) => SOURCES.includes(source);
