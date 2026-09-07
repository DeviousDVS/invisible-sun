/**
 * Invisible Sun — reading the Sooth Deck out of its self-print PDF.
 *
 * Sixty round cards, four to a sheet. Each carries almost nothing: a name, a
 * value, and either the two suns it shifts or — on a royalty card — its rank.
 * Everything that makes a card usable at the table is written up in The Gate,
 * a page to a card, and is not read here.
 *
 * pdf-deck.mjs finds the cards; this decides what they say.
 */
import { readLine } from "./pdf-deck.mjs";

const RANKS = ["Apprentice", "Companion", "Defender", "Adept", "Sovereign", "Nemesis"];
const SUNS = ["Silver", "Green", "Blue", "Indigo", "Grey", "Pale", "Red", "Gold", "Invisible"];

/**
 * The Gate: the deck is 60 cards in four families of 15, each holding one of
 * every rank, and the sheets print the families in unbroken runs. The Companion
 * of each run is its family's animal, which is what fixes the families here —
 * the family itself is never printed on a card, it is carried by the icon art.
 */
const FAMILY_BY_ANIMAL = { Raven: "secrets", Swan: "visions", Rat: "mysteries", Cat: "notions" };

const FAMILY_SIZE = 15;

/**
 * Where each line sits on the card face, as a fraction of its height. The name
 * runs along the top arc, the value and family icon across the middle, and the
 * suns or rank along the bottom.
 */
const BANDS = { name: [0, 0.3], value: [0.3, 0.7], foot: [0.7, 1] };

/** Read one card face. */
function readCard(face) {
  const { box, words } = face;
  const name = readLine(box, words, ...BANDS.name);
  const value = readLine(box, words, ...BANDS.value).match(/\d+/)?.[0];
  const foot = readLine(box, words, ...BANDS.foot);

  const card = {
    name, value: value === undefined ? null : Number(value),
    rank: "", enhancedSun: "", diminishedSun: ""
  };

  const parts = foot.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && RANKS.includes(parts[0])) {
    card.rank = parts[0];
  } else if (parts.length && parts.every(p => SUNS.includes(p))) {
    // The card shifts one sun up and another down; the enhanced one is printed
    // first, in bold. Some cards name only one.
    card.enhancedSun = parts[0];
    card.diminishedSun = parts[1] ?? "";
  } else if (foot) {
    card.unparsed = foot;
  }
  return card;
}

/**
 * Assign families from the order the cards were printed in.
 *
 * This is asserted rather than assumed. If a future printing breaks the runs of
 * fifteen, or a card is misread so that a block holds two Companions, the
 * families would silently come out wrong for a quarter of the deck — and a
 * wrong family is invisible until someone notices their Stoic is not getting
 * the venture bonus they should.
 */
function assignFamilies(cards) {
  if (cards.length % FAMILY_SIZE) {
    throw new Error(`Expected a multiple of ${FAMILY_SIZE} cards, found ${cards.length}. `
      + `The deck is four families of ${FAMILY_SIZE}.`);
  }
  for (let i = 0; i < cards.length; i += FAMILY_SIZE) {
    const block = cards.slice(i, i + FAMILY_SIZE);
    const ranks = block.map(c => c.rank).filter(Boolean).sort();
    if (String(ranks) !== String([...RANKS].sort())) {
      throw new Error(`The block of ${FAMILY_SIZE} starting at card ${i + 1} holds ranks `
        + `[${ranks}] — every family should hold one of each of [${[...RANKS].sort()}].`);
    }
    const companion = block.find(c => c.rank === "Companion")?.name;
    const family = FAMILY_BY_ANIMAL[companion];
    if (!family) {
      throw new Error(`The Companion of the block starting at card ${i + 1} is `
        + `"${companion}", which is not one of the family animals `
        + `(${Object.keys(FAMILY_BY_ANIMAL).join(", ")}).`);
    }
    for (const card of block) card.family = family;
  }
  return cards;
}

/**
 * Read every card face, in printed order, without deciding families.
 *
 * Separate from readDeck because the family rule asserts hard — and when it
 * fires, what you need to see is what the cards actually said, not an
 * exception. This is the diagnostic view.
 */
export function readCards(faces) {
  return faces.map(readCard);
}

/** Read every card face in the deck, in printed order. */
export function readDeck(faces) {
  const cards = readCards(faces);

  const nameless = cards.filter(c => !c.name).length;
  if (nameless) throw new Error(`${nameless} card(s) came back with no name.`);

  return assignFamilies(cards);
}

/**
 * Check each picture against the name it was given.
 *
 * Images pair to cards by position, and position is exactly what fails
 * quietly: one card missed at the front and every name after it slides by one,
 * which looks fine until somebody who knows the deck sees the Hunter labelled
 * Vizier. So the name printed on the card is read back and compared.
 */
export function verifyNames(cards, faces) {
  const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wrong = [];
  cards.forEach((card, i) => {
    const printed = squash(readLine(faces[i].box, faces[i].words, ...BANDS.name));
    if (!printed.includes(squash(card.name))) wrong.push({ expected: card.name, printed });
  });
  return wrong;
}

/** A filename stem for a card. */
export const slug = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

/** The item a card becomes. */
export function toItem(card, img) {
  return {
    name: card.name,
    type: "SoothCard",
    img: img || "icons/sundries/gaming/playing-cards.webp",
    system: {
      family: card.family || "",
      value: card.value ?? 0,
      rank: (card.rank || "").toLowerCase(),
      enhancedSun: card.enhancedSun || "",
      diminishedSun: card.diminishedSun || ""

      /* The write-ups — meanings, divination, narrative, joy, despair,
       * description, quote, family line and a royalty card's effect — are not
       * written here at all. They live in The Gate, a page to a card, and are
       * imported from it separately.
       *
       * They used to be written empty, which is not the same thing and is the
       * difference between leaving a field alone and clearing it: a Foundry
       * update merges, so a field left out keeps what it has. Re-importing the
       * deck after importing The Gate wiped every write-up on all sixty cards.
       * The same mistake, made once for incantation categories and once here,
       * which is why neither now writes what it cannot read. */
    }
  };
}
