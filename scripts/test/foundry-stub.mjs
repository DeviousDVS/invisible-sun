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
import { readFileSync } from "node:fs";
import { ISUN } from "../../module/helpers/config.mjs";

/**
 * The real language file, not a fake one.
 *
 * A stub that echoed keys back would let a test pass against a key nobody has
 * written, which is the one thing an i18n stub is well placed to catch. Read
 * once; it is 700 short strings.
 */
const STRINGS = JSON.parse(
  readFileSync(new URL("../../lang/en.json", import.meta.url), "utf8"));

/** Foundry's own: dotted lookup, then {placeholder} substitution. */
function localize(key) {
  const found = String(key ?? "").split(".")
    .reduce((at, part) => (at && typeof at === "object") ? at[part] : undefined, STRINGS);
  return typeof found === "string" ? found : String(key ?? "");
}

function format(key, data = {}) {
  return localize(key).replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(data, name) ? String(data[name]) : whole);
}

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
    isGM: true,
    /* Who else is connected, and what went out over the wire. A flux asks a GM
     * to turn a card before the roll is announced, so both are needed to test
     * which way that goes. */
    users: [],
    sent: [],
    socketHandlers: [],
    hooks: [],
    /* What the user was told. Some rules are only observable as a notification —
     * a spent deck says so out loud rather than failing. */
    notified: []
  };

  globalThis.CONFIG = { ISUN };
  globalThis.foundry = { utils: { randomID: () => `id${state.sent.length}` } };
  /* Recorded, not run. A module's arming point registers hooks as well as
   * socket handlers, and a test of the second should not trip over the first. */
  globalThis.Hooks = { on: (name, fn) => state.hooks.push({ name, fn }), once: () => {} };
  globalThis.ui = {
    notifications: Object.fromEntries(["warn", "error", "info"].map(kind =>
      [kind, (message) => state.notified.push({ kind, message })]))
  };
  globalThis.game = {
    user: { get isGM() { return state.isGM; }, id: "self" },
    get users() { return state.users; },

    /* Records rather than sends, and lets a test play the other end: `receive`
     * is what a payload arriving from another client looks like. */
    socket: {
      emit: (channel, payload) => state.sent.push({ channel, payload }),
      on: (channel, handler) => state.socketHandlers.push({ channel, handler })
    },

    /* Backed by lang/en.json, so a string the system never wrote comes back as
     * its own key and the assertion that expected English fails. */
    i18n: { localize, format },

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

  /** Deliver a payload as though another client had sent it. */
  state.receive = async (payload) => {
    for (const { handler } of state.socketHandlers) await handler(payload);
  };

  return state;
}

/** Undo it, so a file that stubs cannot leak into one that does not. */
export function unstubFoundry() {
  delete globalThis.CONFIG;
  delete globalThis.game;
  delete globalThis.foundry;
  delete globalThis.Hooks;
  delete globalThis.ui;
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
