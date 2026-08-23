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
    hint: /spell deck/i,
    signature: /to print your spell deck/i,
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
    key: "vance",
    label: "ISUN.SourceVanceDeck",
    hint: /vance/i,
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
    expected: 25,
    read: objects.readDeck,
    toItem: objects.toItem,
    sharedBack: true
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
    sharedBack: true
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
    hint: /the.?gate/i,
    signature: /^\s*THE GATE/im,
    /* A book rather than a deck: it carries no card faces and cuts no
     * pictures. What it holds is the write-up behind a card that has already
     * been imported — so it fills entries in rather than creating them. */
    kind: "book",
    pack: "invisible-sun.sooth",
    read: gate.readEntries
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
  { key: "spell-cards-m", label: "ISUN.SourceSpellCardsM", hint: /book.?m.*spell/i,
    signature: /to print your spell deck cards/i },
  { key: "key", label: "ISUN.SourceKey", hint: /the.?key/i, signature: /^\s*THE KEY/im },
  { key: "way", label: "ISUN.SourceWay", hint: /the.?way/i, signature: /^\s*THE WAY/im },
  { key: "path", label: "ISUN.SourcePath", hint: /the.?path/i, signature: /^\s*THE PATH/im },
  { key: "book-m", label: "ISUN.SourceBookM", hint: /book.?m/i, signature: /^\s*BOOK M/im }
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

/** What the opening pages say it is. This is the answer that counts. */
export function identifyFromText(text) {
  return ALL.find(s => s.signature.test(text)) ?? null;
}

/** True if this is a source the importer can actually act on. */
export const isSupported = (source) => SOURCES.includes(source);
