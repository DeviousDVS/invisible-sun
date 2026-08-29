/**
 * Invisible Sun — enough Foundry to test a helper in Node
 *
 * The pure helpers reach for three globals and nothing else: `CONFIG.ISUN` for
 * the rules tables, `game.settings` for world state, and `game.packs` for a
 * compendium index. None of that needs Foundry running — it needs those three
 * to exist and answer.
 *
 * `CONFIG.ISUN` is the *real* config, imported straight from the system.
 * `helpers/config.mjs` touches no global of its own, so Node can load it, and
 * a test that faked the royalty table or the order of the suns would be
 * testing the fake. The stub's job is to supply the plumbing, not the rules.
 *
 * ── Why the deck is invented ──
 * The real Sooth deck lives in `packs/_source/`, which is gitignored, because
 * it is Monte Cook Games' text. A test that read it would pass on the machine
 * that generated it and fail on every clean checkout — and it would be worse
 * even where it ran, because a case needs a card with *particular* properties
 * and the real deck has to be searched for one. `deck()` below builds exactly
 * the cards a case asks for.
 */
import { ISUN } from "../../module/helpers/config.mjs";

/**
 * Install the globals and return a handle for driving them.
 *
 * Called per test file rather than once: `globalThis` is shared across a Node
 * process, and a test that inherited another's board would pass or fail for
 * reasons in a different file.
 */
export function stubFoundry({ automated = true, board = null, deck = [] } = {}) {
  const state = {
    settings: {
      pathOfSuns: board ?? { version: 1, history: [], nightside: false },
      applySoothModifiers: automated
    },
    deck,
    isGM: true
  };

  globalThis.CONFIG = { ISUN };
  globalThis.game = {
    user: { get isGM() { return state.isGM; } },

    settings: {
      get: (scope, key) => state.settings[key],
      set: async (scope, key, value) => { state.settings[key] = value; }
    },

    /* Only the one pack, and only the one method the helpers call. An index
     * entry carries `uuid` because the real one does; `getIndex` ignores the
     * fields argument for the same reason a real index would already hold
     * everything this fixture puts in it. */
    packs: {
      get: (id) => id === "invisible-sun.sooth"
        ? { getIndex: async () => state.deck.map(toIndexEntry) }
        : undefined
    }
  };

  return state;
}

/** Undo it, so a file that stubs cannot leak into one that does not. */
export function unstubFoundry() {
  delete globalThis.CONFIG;
  delete globalThis.game;
}

/* ──────────────────────────────────────────────
 * Cards
 * ────────────────────────────────────────────── */

let counter = 0;

/**
 * A Sooth card, described by what a case needs and nothing more.
 *
 * The names are invented. Card names are Monte Cook Games' and a test has no
 * use for them: what a case is about is "a Secrets card that enhances Blue",
 * which is what this asks for.
 *
 * @param {object} [spec]
 * @param {string} [spec.name]      defaults to a unique one
 * @param {string} [spec.family]    secrets | mysteries | visions | notions
 * @param {number} [spec.value]     0-9
 * @param {string} [spec.rank]      a royalty rank; omit for a plain card
 * @param {string} [spec.enhanced]  sun name as printed — "Blue", not "blue"
 * @param {string} [spec.diminished]
 */
export function card({ name, family = "secrets", value = 3, rank = "",
                       enhanced = "", diminished = "", effectText = "" } = {}) {
  counter += 1;
  const id = `card${String(counter).padStart(4, "0")}`;
  return {
    _id: id,
    uuid: `Compendium.invisible-sun.sooth.Item.${id}`,
    name: name ?? `Card ${counter}`,
    img: `invisible-sun/cards/sooth/${id}.webp`,
    family,
    value,
    rank,
    enhancedSun: enhanced,
    diminishedSun: diminished,
    effectText
  };
}

/** The same card as a compendium index entry, which is what `deck()` reads. */
function toIndexEntry(c) {
  return {
    _id: c._id, uuid: c.uuid, name: c.name, img: c.img,
    system: {
      family: c.family, value: c.value, rank: c.rank,
      enhancedSun: c.enhancedSun, diminishedSun: c.diminishedSun,
      effectText: c.effectText
    }
  };
}

/**
 * A board with these cards on these suns, in this order.
 *
 * @param {Array<[object, string]>} pairs  [card, sun] in the order played
 */
export function boardOf(pairs, { nightside = false } = {}) {
  return {
    version: 1,
    nightside,
    history: pairs.map(([c, sun], i) => ({
      uuid: c.uuid, name: c.name, sun, turn: i + 1
    }))
  };
}

/** A vislae, as `ventureFor` reads one: an items list holding a heart. */
export function vislae(cardFamily) {
  return { items: cardFamily ? [{ type: "Heart", system: { cardFamily } }] : [] };
}
