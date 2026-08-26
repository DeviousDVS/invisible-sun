import { ISUN } from "./config.mjs";

/**
 * Invisible Sun — the Path of Suns
 *
 * "Throughout a session of Invisible Sun, the GM will, at various points, play
 * a Sooth card on the Path of Suns, starting on the Silver Sun at the top, and
 * ending with the Invisible Sun off to the side. Playing a Sooth card on the
 * Path is usually called a card turn" (The Gate, p73).
 *
 * This is the board's memory and its rules. It holds no Foundry document and
 * draws nothing: everything here is a function of the stored state and the
 * deck, so the effects can be read by a window, by a roll dialog, or one day by
 * whatever builds Active Effects, without any of them re-deriving the rules.
 *
 * ── Why a history rather than nine slots ──
 * The board looks like nine positions, but a position is only ever "the last
 * card played there". Storing the turn order instead and deriving the slots
 * makes undo a pop, tells the deck which cards are spent, and keeps a record of
 * the session that the eventual chat card can read. Nine slots would need all
 * of that bolted on beside them.
 *
 * ── What is live ──
 * "The most recently turned card is the active card, and any effects of the
 * previous card are now canceled. The only exception is that a card played on
 * the Invisible Sun goes into the Testament of Suns and remains in effect until
 * a new card is played on the Invisible Sun" (The Gate, p73). So at most two
 * cards are in play: the active one and whatever sits on the Invisible Sun.
 */

const SCOPE = "invisible-sun";

/** The world setting the board is kept in. GM writes; everyone reads. */
export const SETTING = "pathOfSuns";

/** Where the sixty cards live once the deck has been imported. */
export const PACK = "invisible-sun.sooth";

export const DEFAULT_STATE = Object.freeze({ version: 1, history: [], nightside: false });

/* ──────────────────────────────────────────────
 * The board
 * ────────────────────────────────────────────── */

/**
 * The positions in the order cards are played onto them.
 *
 * The eight suns of the Path, then the Invisible Sun, which "presides over the
 * Path of Suns" (The Gate, p10874) rather than sitting on it — last in the
 * sequence and off to the side. The Nightside Path runs the eight in reverse
 * and still ends there.
 */
export function board(state) {
  return [...(state?.nightside ? ISUN.nightsidePath : ISUN.pathOfSuns), "invisible"];
}

/** The last card played on each sun, keyed by sun. Earlier ones are spent. */
export function slots(state) {
  const out = new Map();
  for (const entry of state?.history ?? []) out.set(entry.sun, entry);
  return out;
}

/** The most recently turned card, or null on an empty board. */
export function active(state) {
  const history = state?.history ?? [];
  return history[history.length - 1] ?? null;
}

/** The card in the Testament of Suns — whatever last landed on the Invisible
 *  Sun. It stays in effect until another one does. */
export function testament(state) {
  return slots(state).get("invisible") ?? null;
}

/**
 * Where the next card goes: the position after the active card, wrapping round
 * to the start of the Path once the Invisible Sun has been played.
 */
export function nextSun(state) {
  const order = board(state);
  const current = active(state)?.sun;
  if (!current) return order[0];
  const at = order.indexOf(current);
  return order[(at + 1) % order.length];
}

/** Both cards whose effects are in play, active first. */
export function live(state) {
  const out = [];
  const now = active(state);
  if (now) out.push(now);
  const kept = testament(state);
  if (kept && kept !== now) out.push(kept);
  return out;
}

/* ──────────────────────────────────────────────
 * The deck
 * ────────────────────────────────────────────── */

/** Every card already played, by uuid. A card is turned once per pass. */
export function spent(state) {
  return new Set((state?.history ?? []).map(e => e.uuid));
}

/** What is left to turn. */
export function remaining(state, deck) {
  const gone = spent(state);
  return deck.filter(card => !gone.has(card.uuid));
}

/**
 * A card at random from what is left, or null if the deck is spent.
 *
 * The deck is not shuffled and stored, because a stored order goes stale the
 * moment the pack is re-imported and would then name cards that no longer
 * exist. Drawing at random from what remains is the same thing to everyone
 * except a card counter.
 */
export function draw(state, deck) {
  const left = remaining(state, deck);
  if (!left.length) return null;
  return left[Math.floor(Math.random() * left.length)];
}

/* ──────────────────────────────────────────────
 * Playing
 * ────────────────────────────────────────────── */

/** Put a card on a sun. Returns the new state; the old one is untouched. */
export function place(state, card, sun) {
  const history = [...(state?.history ?? []),
    { uuid: card.uuid, name: card.name, sun, turn: (state?.history?.length ?? 0) + 1 }];
  return { ...DEFAULT_STATE, ...state, history };
}

/**
 * A card turn, and any turn it drags after it.
 *
 * Two royalty cards move the game on by themselves: "Adept: Play another card
 * on the next sun", and "Companion: Duplicates the effects of the previously
 * played card (if played first in a session on the Silver Sun, immediately play
 * another card on the next sun)" (The Gate, p74). A Companion with nothing
 * before it has nothing to duplicate, which is what that parenthesis is for.
 *
 * Chained turns can chain again — an Adept can turn an Adept — so the loop is
 * capped rather than trusted. The cap is the deck: it cannot draw what it has
 * already played, so a chain ends when the deck does.
 *
 * @returns {{state: object, placed: Array}} the new state and what it played
 */
export function turn(state, deck, sun = null) {
  const placed = [];
  let next = state;
  let where = sun ?? nextSun(state);

  for (let guard = 0; guard < deck.length; guard++) {
    const card = draw(next, deck);
    if (!card) break;
    next = place(next, card, where);
    placed.push({ card, sun: where });

    const rank = ISUN.soothRankEffects[card.rank];
    /* A Companion chains only when it is the first card of the session — the
     * card held over in the Testament does not count as one, which is what
     * `kept` marks it as. */
    const first = next.history.filter(e => !e.kept).length === 1;
    const chains = rank?.chain || (rank?.duplicates && first);
    if (!chains) break;
    where = nextSun(next);
  }

  return { state: next, placed };
}

/** Take back the last card turned. */
export function undo(state) {
  return { ...DEFAULT_STATE, ...state, history: (state?.history ?? []).slice(0, -1) };
}

/**
 * Start a session on the Silver Sun again.
 *
 * "GMs can, if they wish, pick up where one session left off, or simply start
 * over at the beginning of each session on the Silver Sun" (The Gate, p74) —
 * so this is a choice and not something that happens on its own. The Testament
 * survives it, because a card on the Invisible Sun stays in effect until
 * another is played there, and a new session does not play one.
 */
export function newSession(state) {
  const kept = testament(state);
  return {
    ...DEFAULT_STATE, ...state,
    history: kept ? [{ ...kept, turn: 1, kept: true }] : []
  };
}

/**
 * Return everything but the board itself to the deck.
 *
 * A pass down the Path plays nine cards and a long session plays more, so the
 * suns are written over and the spent pile grows. This puts the pile back,
 * keeping the cards currently showing so the board does not change as it is
 * shuffled.
 */
export function reshuffle(state) {
  const showing = new Set([...slots(state).values()]);
  const history = (state?.history ?? []).filter(e => showing.has(e))
    .map((e, i) => ({ ...e, turn: i + 1 }));
  return { ...DEFAULT_STATE, ...state, history };
}

/* ──────────────────────────────────────────────
 * What the cards do
 * ────────────────────────────────────────────── */

/**
 * The card an entry's effects actually come from, and the sun they are read at.
 *
 * Normally itself. A Companion is the exception: it duplicates the card before
 * it, and that card's doubling was decided by where *it* sat, so the position
 * travels with the effect. A Companion behind a Companion walks back again,
 * which the visited set stops from circling.
 *
 * The walk stops at a card held over from a previous session. A Companion
 * turned first has nothing to duplicate — that is what its parenthesis is for —
 * and the Testament is in play on its own account anyway, so duplicating it
 * would count it twice.
 */
function resolve(state, entry, cards) {
  const history = state?.history ?? [];
  const seen = new Set();
  let at = history.indexOf(entry);

  while (at >= 0 && !seen.has(at)) {
    seen.add(at);
    if (history[at].kept && history[at] !== entry) return null;
    const card = cards.get(history[at].uuid);
    if (!card) return null;
    if (!ISUN.soothRankEffects[card.rank]?.duplicates) {
      return { card, sun: history[at].sun };
    }
    at -= 1;
  }
  return null;
}

/**
 * Everything in play right now, ready to be read out or applied.
 *
 * @param {object} state  the stored board
 * @param {Map}    cards  uuid -> card, as `toCard` shapes them
 * @returns {{suns: Array, actions: Array}}
 *   `suns`   one entry per sun affected: {sun, amount, doubled, source}
 *            where amount is +1 or +2 for enhanced, -1 or -2 for diminished.
 *   `actions` venture modifiers: {value, family, familyValue, source, rank}
 *            `family` names whose heart is in question; a value that applies to
 *            everyone has no family.
 */
export function effects(state, cards) {
  const suns = [];
  const actions = [];

  for (const entry of live(state)) {
    const played = cards.get(entry.uuid);
    if (!played) continue;

    /* The family bonus keys on the card that was played — "if a card is played
     * from the card family associated with a character's heart… all of that
     * character's actions get a +1 bonus to their venture" (The Gate, p74). A
     * Companion duplicates *effects*, but it is still the card on the table, so
     * its own family is the one that counts. */
    if (played.family) {
      actions.push({ value: 0, familyValue: 1, family: played.family,
                     source: played.name, rank: "" });
    }

    const from = resolve(state, entry, cards);
    if (!from) continue;
    const { card, sun } = from;

    /* "Cards affecting magic of a particular color sun double the effect when
     * played on that sun in the Path" (The Gate, p74). Royalty cards list no
     * suns at all — 24 of the 60 — so this simply finds nothing for them. */
    for (const [key, direction] of [["enhancedSun", 1], ["diminishedSun", -1]]) {
      const affected = String(card[key] ?? "").toLowerCase();
      if (!affected) continue;
      const doubled = affected === sun;
      suns.push({ sun: affected, amount: direction * (doubled ? 2 : 1), doubled,
                  source: card.name });
    }

    const rank = ISUN.soothRankEffects[card.rank];
    if (rank && (rank.all || rank.family)) {
      actions.push({
        value: rank.all ?? 0,
        familyValue: rank.family ?? rank.all ?? 0,
        family: card.family,
        source: card.name,
        rank: card.rank
      });
    }
  }

  return { suns, actions };
}

/**
 * What a character with this heart's family is carrying, and where from.
 *
 * The two sources are read as separate: a Stoic under a Mysteries Sovereign has
 * the +1 every Mysteries card gives them and the Sovereign's +2 on top. The
 * books never say whether the royalty number replaces the family one or adds to
 * it, so nothing here decides — each line is listed with the card it came from,
 * and a table that reads it the other way can see exactly what to drop.
 *
 * @param {string} family  the heart's card family, in any casing
 * @returns {{venture: number, sources: Array<{text: string, value: number}>}}
 */
export function modifiersFor(family, state, cards) {
  const mine = String(family ?? "").toLowerCase();
  const sources = [];
  let venture = 0;

  for (const mod of effects(state, cards).actions) {
    const matched = mine && String(mod.family ?? "").toLowerCase() === mine;
    const value = matched ? mod.familyValue : mod.value;
    if (!value) continue;
    venture += value;
    sources.push({ text: mod.source, value });
  }

  return { venture, sources };
}

/**
 * What the board does to a spell of this colour: a number to add to its level,
 * or to take off its Sorcery cost — the player chooses which, so this reports
 * the size of the shift and not what to do with it.
 *
 * Spells store their colour capitalised ("Blue"), and a few store "Varies",
 * which belongs to no sun and is therefore never shifted.
 */
export function spellEffect(colour, state, cards) {
  const sun = String(colour ?? "").toLowerCase();
  if (!sun || !ISUN.suns[sun]) return { amount: 0, doubled: false, sources: [] };

  const mine = effects(state, cards).suns.filter(s => s.sun === sun);
  return {
    amount: mine.reduce((total, s) => total + s.amount, 0),
    doubled: mine.some(s => s.doubled),
    sources: mine
  };
}

/* ──────────────────────────────────────────────
 * Reading and writing the world's board
 * ────────────────────────────────────────────── */

/** The board as stored, with anything a newer version added filled in. */
export function read() {
  const stored = game.settings.get(SCOPE, SETTING) ?? {};
  return { ...DEFAULT_STATE, ...stored, history: [...(stored.history ?? [])] };
}

/** Write the board. Only a GM may: it is a world setting, and core refuses. */
export async function write(state) {
  if (!game.user.isGM) return false;
  await game.settings.set(SCOPE, SETTING, state);
  return true;
}

/** One card as the board needs it — enough to draw and to rule on. */
export function toCard(entry, pack = PACK) {
  return {
    uuid: entry.uuid ?? `Compendium.${pack}.Item.${entry._id}`,
    id: entry._id,
    name: entry.name,
    img: entry.img,
    family: entry.system?.family ?? "",
    value: entry.system?.value ?? 0,
    rank: entry.system?.rank ?? "",
    enhancedSun: entry.system?.enhancedSun ?? "",
    diminishedSun: entry.system?.diminishedSun ?? "",
    effectText: entry.system?.effectText ?? ""
  };
}

/**
 * The deck, read from the compendium index rather than loaded.
 *
 * Sixty documents to show sixty pictures is a waste; the index carries the art
 * and every field the rules need. The write-ups behind a card are only wanted
 * when someone opens one, and opening one is what the item sheet is for.
 */
export async function deck() {
  const pack = game.packs.get(PACK);
  if (!pack) return [];
  const index = await pack.getIndex({ fields: [
    "system.family", "system.value", "system.rank",
    "system.enhancedSun", "system.diminishedSun", "system.effectText"
  ] });
  return [...index].map(e => toCard(e, PACK));
}

/**
 * A lookup for the cards a board refers to.
 *
 * Keyed by uuid, and by name as well: the ids in a compendium survive a
 * re-import, because the importer updates what is already there, but they do
 * not survive a pack rebuilt from scratch. A board that outlived its deck then
 * points at nothing, and falling back to the name puts the picture back.
 */
export function lookup(deckCards, state) {
  const byUuid = new Map(deckCards.map(c => [c.uuid, c]));
  const byName = new Map(deckCards.map(c => [c.name.toLowerCase(), c]));

  for (const entry of state?.history ?? []) {
    if (byUuid.has(entry.uuid)) continue;
    const found = byName.get(String(entry.name ?? "").toLowerCase());
    if (found) byUuid.set(entry.uuid, found);
  }
  return byUuid;
}
