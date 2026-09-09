import { QUIRKS } from "./quirks.mjs";

/**
 * Invisible Sun — the tables the rules are made of
 *
 * All game-mechanical lookup tables, sun colours, pool names, and UI
 * constants live here so they can be referenced throughout the system.
 */

/**
 * The nine suns, declared in Path order.
 *
 * The Path runs Silver → Green → Blue → Indigo → Grey → Pale → Red → Gold; the
 * Nightside Path is that sequence reversed. The Invisible Sun sits outside the
 * Path entirely, so it carries no position.
 *
 * This ordering is mechanically load-bearing: a Sooth card's effect is doubled
 * when its sun matches its position on the Path, so a wrong sequence silently
 * produces wrong magic.
 */
const suns = {
  silver: { label: "ISUN.SunSilver", color: "#c0c0c0", order: 0 },
  green: { label: "ISUN.SunGreen", color: "#2ecc71", order: 1 },
  blue: { label: "ISUN.SunBlue", color: "#5b9bd5", order: 2 },
  indigo: { label: "ISUN.SunIndigo", color: "#8e6fbf", order: 3 },
  grey: { label: "ISUN.SunGrey", color: "#7f8c8d", order: 4 },
  pale: { label: "ISUN.SunPale", color: "#ecf0f1", order: 5 },
  red: { label: "ISUN.SunRed", color: "#e74c3c", order: 6 },
  gold: { label: "ISUN.SunGold", color: "#f0c040", order: 7 },
  invisible: { label: "ISUN.SunInvisible", color: "#d4af37", order: null, offPath: true },
};

/** The Path in traversal order. Reverse this for the Nightside Path. */
const pathOfSuns = Object.entries(suns)
  .filter(([, s]) => !s.offPath)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([key]) => key);

/**
 * Localisation keys that are built at runtime rather than written out.
 *
 * Two syntaxes compose them. In a module it is a template literal —
 * `` `ISUN.Outcome${capitalise(outcome)}` `` — and in a template it is
 * `{{localize (concat "ISUN.Arc" (capitalize status))}}`. Either way the key
 * that reaches game.i18n exists in no file, so a search for it finds nothing
 * and a key audit cannot tell a live one from a dead one.
 *
 * Declaring the prefixes here is what makes that audit possible.
 * scripts/check.mjs reads this list: a literal matching one of these is treated
 * as a prefix rather than a whole key, and every key beneath it counts as used.
 *
 * Add to this list when you add a composition, and keep the note. A prefix that
 * matches no keys at all is reported as an error, since that means it is stale
 * or misspelled — which is the failure this list exists to catch.
 */
export const DYNAMIC_KEY_PREFIXES = Object.freeze([
  "ISUN.Arc",            // arc status:      character-arc-tracker.hbs
  "ISUN.ChallengeState", // response state:  ChallengeCard.mjs
  "ISUN.Injury",         // injury source:   wound-tracker.hbs, _fields.mjs
  "ISUN.Kind",           // practice kind:   ISUNVislaeSheet.mjs
  "ISUN.Outcome",        // roll outcome:    ChallengeCard.mjs
  "ISUN.Pool",           // pool name:       several
  "ISUN.Rest",           // rest length:     ISUNVislaeSheet.mjs

  /* Foundry's own namespace for document type labels. SheetMixin composes
   * `TYPES.Item.${type}` when naming a new item, and core reads these directly
   * to label types in its own dialogs — so they are used twice over, and by
   * nothing that a search of this repository would find. */
  "TYPES.Actor.",
  "TYPES.Item."
]);

/**
 * The Vancian spell classes.
 *
 * A class is a size: a Vance prepares whatever fits into a square three inches
 * on a side, and what a spell takes up is its class (The Key, p40). The
 * dimensions are kept because they are the rule — anything that works out what
 * a Vance can prepare needs them — but they are not shown. This is a virtual
 * tabletop; nobody is laying cards out on a mat, and "Beta (3 x 3 in)" tells a
 * player nothing they can act on.
 *
 * Written in the book's own orientation, 3 wide before 6 tall. Nothing computes
 * with these any more — see `cost` — but written the other way round the ladder
 * stops being visibly nested, each class the one below it with a side doubled,
 * and that nesting is what "reduce the occupying space of two of the spells we
 * know to half their original size" (Vance 2nd degree) relies on.
 *
 * ── Why there is a `cost` beside the inches ──
 * The four classes are already in a 1 : 2 : 4 : 8 ratio by area, and the three
 * minds a Vance can have in a 1 : 2 : 4, so counting square inches and counting
 * anything else in the same proportion answer every question identically. The
 * inches are the physical fact and stay here as provenance; `cost` is what the
 * sheet adds up, because a virtual tabletop has no mat and "4.5 of 18" asks a
 * player to do arithmetic about a card they will never hold.
 *
 * 2 for an alpha rather than 1, so that halving one stays a whole number — the
 * inches do not manage that, and put 2.25 on the sheet.
 *
 * The two must stay in step. scripts/test/vance.test.mjs holds `cost` to being
 * exactly proportional to `width * height`, so a class added with one and not
 * the other fails rather than quietly costing the wrong amount.
 */
const spellClasses = {
  alpha: { label: "ISUN.SpellClassAlpha", width: 3, height: 1.5, cost: 2 },
  beta:  { label: "ISUN.SpellClassBeta",  width: 3, height: 3,   cost: 4 },
  gamma: { label: "ISUN.SpellClassGamma", width: 3, height: 6,   cost: 8 },
  omega: { label: "ISUN.SpellClassOmega", width: 6, height: 6,   cost: 16 },
};

export const ISUN = Object.freeze({

  /* ──────────────────────────────────────────────
   * THE NINE SUNS
   * ────────────────────────────────────────────── */

  suns,
  pathOfSuns,

  /** Nightside traverses the Path in reverse. */
  nightsidePath: [...pathOfSuns].reverse(),

  /** Map spell colour strings (as stored in data) to sun keys. */
  spellColors: Object.fromEntries(
    Object.keys(suns).map(k => [k.charAt(0).toUpperCase() + k.slice(1), k])
  ),

  /** All valid spell colour strings (for select dropdowns). A few cards print
   *  "Varies" rather than a sun, so it is a colour a spell can hold even though
   *  it is not one of the Nine. */
  spellColorChoices: Object.fromEntries(
    [["", ""], ...Object.keys(suns).map(k => {
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      return [label, label];
    }), ["Varies", "Varies"]]
  ),

  /* ──────────────────────────────────────────────
   * SPENDING BENE
   * ────────────────────────────────────────────── */

  /**
   * How many bene one action may be paid with, before any secret raises it.
   *
   * One. "Any character can add 1 to the venture of a magical action by
   * spending 1 bene" (The Way, p8), and the two secrets below say what they
   * replace: "rather than just 1", "rather than just 3".
   */
  beneLimit: 1,

  /**
   * The secrets that raise it, by the name the books print.
   *
   *   Expansive Endeavor    "You can spend up to 3 bene from the appropriate
   *                          stat pool to devote effort to an action, rather
   *                          than just 1" (The Way, p88). Level 3.
   *   Magnificent Endeavor  "up to 10 … rather than just 3, as allowed by
   *                          Expansive Endeavor" (The Way, p90). Level 8, and
   *                          it requires the other.
   *
   * Matched on the name because that is all a character holds: a secret arrives
   * from the compendium as an item with a level and a description, and nothing
   * on it says what it does mechanically. A world that renames one loses the
   * raise, and a translation would have to translate this table with the pack —
   * the cost of reading rules out of content that was written for people.
   *
   * The higher of the two wins rather than the two summing. Magnificent
   * Endeavor replaces the 3 with 10, and says so.
   */
  beneSecrets: {
    "expansive endeavor": 3,
    "magnificent endeavor": 10,
  },

  /**
   * How many enhancements Sortilege may put on one action.
   *
   * Read out of the secret that raises it, because the secret says what it is
   * an improvement on: "You can add two enhancements from Sortilege to an
   * action, or you can add one enhancement from Sortilege to something that
   * already has enhancements, like a spell" (Advanced Sortilege, level 5).
   * Two rather than one, and one rather than none — so without it a vislae adds
   * one enhancement to an ordinary action and cannot aid a spell with Sortilege
   * at all, a spell already carrying enhancements of its own.
   *
   * `enhanced` is that second case: an action that already has enhancements,
   * which here means a practice, since a practice brings its own magic dice.
   */
  sortilegeLimits: {
    base:     { plain: 1, enhanced: 0 },
    advanced: { plain: 2, enhanced: 1 },
  },

  /** The secret that lifts it, by the name the book prints. */
  sortilegeSecret: "advanced sortilege",

  /* ──────────────────────────────────────────────
   * CHALLENGE SCALE
   * ────────────────────────────────────────────── */

  challengeScale: {
    0: "ISUN.ChallengeRoutine",
    1: "ISUN.ChallengeNormal",
    11: "ISUN.ChallengeTrained",
    14: "ISUN.ChallengeMagical",
  },

  /* ──────────────────────────────────────────────
   * RANGES
   * ────────────────────────────────────────────── */

  ranges: {
    "": "",
    "Close": "ISUN.RangeClose",
    "Short": "ISUN.RangeShort",
    "Long": "ISUN.RangeLong",
    "VeryLong": "ISUN.RangeVeryLong",
  },

  /** Distances behind each range band, and the area of the matching size. */
  rangeDetails: {
    "Close":    { distance: 10,  area: 10,  hint: "ISUN.RangeCloseHint" },
    "Short":    { distance: 50,  area: 50,  hint: "ISUN.RangeShortHint" },
    "Long":     { distance: 100, area: 100, hint: "ISUN.RangeLongHint" },
    "VeryLong": { distance: 500, area: 500, hint: "ISUN.RangeVeryLongHint" },
  },

  /* ──────────────────────────────────────────────
   * CURRENCY
   * ────────────────────────────────────────────── */

  /**
   * Invisible Sun runs two economies that deliberately do not convert into one
   * another (The Key, p181–182). Mundane goods are bought with orbs; magical
   * goods and services are "paid for with magecoins or sometimes barter... but
   * never with orbs or other nonmagical currencies". There is no standard
   * exchange rate — when a trade is possible at all it is roughly 1 magecoin
   * for 1–2 gem orbs, and rarely for more than a coin or two. So `glass` is
   * only defined for the mundane side; magical currency is never totalled into
   * a monetary value.
   *
   * `glass` is the value in glass orbs, the base unit.
   */
  currencies: {
    bitsAndBobs: { label: "ISUN.CurrencyBitsAndBobs", glass: 0.2,   economy: "mundane" },
    glass:       { label: "ISUN.CurrencyGlass",       glass: 1,     economy: "mundane" },
    crystal:     { label: "ISUN.CurrencyCrystal",     glass: 100,   economy: "mundane" },
    gem:         { label: "ISUN.CurrencyGem",         glass: 10000, economy: "mundane" },
    // Same value as a gem orb, but a vislae can consume one for +1 Hidden Knowledge.
    trueorb:     { label: "ISUN.CurrencyTrueorb",     glass: 10000, economy: "mundane", consumes: "hiddenKnowledge" },
    // Worth about a crystal orb, but cursed and widely refused, so it is
    // tracked apart from spendable wealth.
    bloodsilver: { label: "ISUN.CurrencyBloodsilver", glass: 100,   economy: "mundane", cursed: true, spendable: false },

    vim:         { label: "ISUN.CurrencyVim",       economy: "magical", restores: "certes" },
    lumin:       { label: "ISUN.CurrencyLumin",     economy: "magical", restores: "qualia" },
    demontear:   { label: "ISUN.CurrencyDemontear", economy: "magical", restores: "any" },
  },

  /**
   * Challenge level for the bloodsilver curse, by number of coins owned.
   * The Key p182: one coin is rarely a problem; 2–10 is level 1, 11–20 level 2,
   * and so on. Ownership alone triggers it — the coins need not be carried.
   */
  bloodsilverChallenge: coins => (coins <= 1 ? 0 : Math.ceil(coins / 10)),

  /* ──────────────────────────────────────────────
   * CAPS
   * ────────────────────────────────────────────── */

  /**
   * Base values only. The effective limit is derived per-actor as
   * base + item contributions + GM override — see ISUNActor#_prepareLimits.
   *
   *  - objectsOfPower: The Key p3825; raised by the Magical Management secret
   *  - ephemera:       The Key p4268; Maker 6th degree raises this to 6
   *  - incantations:   a sub-cap *within* the ephemera limit, not additional
   *  - arcs:           The Key p166 — GM advice rather than a rule, so this is
   *                    also exposed as a world setting
   *
   * Kindled items count toward none of these (The Key p16051).
   */
  limits: {
    objectsOfPower: 3,
    ephemera: 3,
    incantations: 3,
    arcs: 3,
  },

  /* ──────────────────────────────────────────────
   * ADVANCEMENT
   * ────────────────────────────────────────────── */

  /** What Acumen and Crux can be spent on. */
  advancementPurchases: {
    spell: "ISUN.PurchaseSpell",
    characterSecret: "ISUN.PurchaseCharacterSecret",
    houseSecret: "ISUN.PurchaseHouseSecret",
    orderSecret: "ISUN.PurchaseOrderSecret",
    forteAbility: "ISUN.PurchaseForteAbility",
    orderDegree: "ISUN.PurchaseOrderDegree",
    skill: "ISUN.PurchaseSkill",
    connection: "ISUN.PurchaseConnection",
    npcBond: "ISUN.PurchaseNpcBond",
    aggregate: "ISUN.PurchaseAggregate",
    minorMagic: "ISUN.PurchaseMinorMagic",
  },

  /** Plural forms, for the Connections tab's group headings. */
  bondTypeGroups: {
    connection: "ISUN.BondConnectionPlural",
    pcBond:     "ISUN.BondPcPlural",
    npcBond:    "ISUN.BondNpcPlural",
    other:      "ISUN.BondOtherPlural",
  },

  /** How a person relates to the character. */
  bondTypes: {
    connection: "ISUN.BondConnection",
    pcBond:     "ISUN.BondPc",
    npcBond:    "ISUN.BondNpc",
    other:      "ISUN.BondOther",
  },

  /** Minor magics are a category distinct from ephemera. */
  minorMagicTypes: {
    cantrip: "ISUN.MinorMagicCantrip",
    charm: "ISUN.MinorMagicCharm",
    hex: "ISUN.MinorMagicHex",
    sign: "ISUN.MinorMagicSign",
  },

  /* ──────────────────────────────────────────────
   * HEARTS
   * ────────────────────────────────────────────── */

  hearts: {
    galant: { label: "ISUN.HeartGalant", family: "visions", adjective: "Bold" },
    stoic: { label: "ISUN.HeartStoic", family: "mysteries", adjective: "Steady" },
    empath: { label: "ISUN.HeartEmpath", family: "notions", adjective: "Feeling" },
    ardent: { label: "ISUN.HeartArdent", family: "secrets", adjective: "Passionate" },
  },

  /* ──────────────────────────────────────────────
   * ORDERS
   * ────────────────────────────────────────────── */

  /**
   * How each order names itself in the character sentence, where they do not
   * agree with one another. A Weaver and a Maker are one of many — "of the
   * order of Weavers" — but a Vance is "of the order of the Vance", and a
   * Goetic is "of the order of Goetica". An Apostate is not of an order at all
   * and says so.
   *
   * Two things differ, and they are separate because they differ separately.
   * `sentence` is the shape of the phrase, and only the Vance and the Apostate
   * need their own. `affix` is the letter that joins onto the order's name, and
   * only the Goetic's differs from the plural — which is why the Goetic needs
   * no sentence of its own, and why the affix is not simply written into the
   * phrase.
   *
   * It is kept out of the phrase because the sheet has to mark it up: it joins
   * the name to make one word, so it has to be styled as part of that word,
   * while sitting outside the link, since "Weaver" is the item's name and the
   * "s" is not.
   *
   * An empty affix opts out. The fallback is the plural, so an order added
   * without one is spoken of like the Weavers and the Makers.
   */
  orders: {
    vance: { label: "ISUN.OrderVance", abbr: "V", magicStyle: "Prepared Spells",
             sentence: "ISUN.SentenceOfTheVance", affix: "" },
    weaver: { label: "ISUN.OrderWeaver", abbr: "W", magicStyle: "Thread Weaving" },
    goetic: { label: "ISUN.OrderGoetic", abbr: "G", magicStyle: "Summoning",
              affix: "a" },
    maker: { label: "ISUN.OrderMaker", abbr: "M", magicStyle: "Crafting" },
    apostate: { label: "ISUN.OrderApostate", abbr: "A", magicStyle: "Unaligned",
                sentence: "ISUN.SentenceApostate", affix: "" },
  },

  /** What joins onto an order's name when it does not say otherwise. */
  orderAffix: "s",

  /* ──────────────────────────────────────────────
   * STAT POOLS
   * ────────────────────────────────────────────── */

  certesPoolNames: ["accuracy", "movement", "physicality", "perception"],
  qualiaPoolNames: ["sorcery", "interaction", "intellect", "sortilege"],

  poolLabels: {
    accuracy: "ISUN.PoolAccuracy",
    movement: "ISUN.PoolMovement",
    physicality: "ISUN.PoolPhysicality",
    perception: "ISUN.PoolPerception",
    sorcery: "ISUN.PoolSorcery",
    interaction: "ISUN.PoolInteraction",
    intellect: "ISUN.PoolIntellect",
    sortilege: "ISUN.PoolSortilege",
  },

  /* ──────────────────────────────────────────────
   * CHARACTER ARCS
   * ────────────────────────────────────────────── */

  arcStatuses: {
    planned: "ISUN.ArcPlanned",
    active: "ISUN.ArcActive",
    completed: "ISUN.ArcCompleted",
  },

  /* ──────────────────────────────────────────────
   * SPELL TYPES
   * ────────────────────────────────────────────── */

  /**
   * The Vancian spell classes.
   *
   * A class is a size, not a label. A Vance prepares spells by fitting them
   * into a square three inches on a side, and what a spell takes up is its
   * class — alpha 3x1.5, beta 3x3, gamma 3x6, omega 6x6 (The Key, p40). So the
   * dimensions are carried here rather than just the names: they are the
   * mechanic, and a sheet working out what a Vance can prepare needs them.
   *
   * The cards are printed at these sizes, which is the only place the class is
   * recorded — no card states it in words.
   */
  spellClasses,

  /** The classes as a plain key-to-label map, for a select. */
  spellClassChoices: Object.fromEntries([
    ["", ""],
    ...Object.entries(spellClasses).map(([key, spec]) => [key, spec.label])
  ]),

  /**
   * How much room a Vance has for prepared spells, by degree.
   *
   * "The total space we have is represented by a square that is 3 inches by 3
   * inches… If we advance in degree, this space increases" (The Key, 1st
   * degree). The ladder then restates it: 3 x 6 at the 3rd degree, 6 x 6 at the
   * 5th. The even degrees say outright that the space does not increase, so
   * they repeat the odd one below them rather than being absent.
   *
   * `capacity` is what the sheet counts against, in the same units as a spell
   * class's `cost`; the rectangle is kept beside it because it is what the book
   * states and what a table using the printed cards would lay out, and it is
   * still shown, in the tooltip.
   *
   * Comparing one number rather than arranging cards is sound rather than a
   * shortcut. Every class and every one of these three containers is a whole
   * multiple of 1.5 inches, so over all the combinations that fit by area,
   * every one can also be physically arranged — scripts/test/vance.test.mjs
   * proves that by exhaustive packing rather than asserting it, and holds
   * `capacity` proportional to the rectangle so the two cannot drift.
   *
   * The book's own diagrams are captioned by degree, which is where "Mind of
   * the Postulant" and "Mind of the Magister" come from.
   *
   * A degree of 0 is an Apostate, who has no Vancian mind at all.
   */
  vancianMind: {
    1: { width: 3, height: 3, capacity: 4 },
    2: { width: 3, height: 3, capacity: 4 },
    3: { width: 3, height: 6, capacity: 8 },
    4: { width: 3, height: 6, capacity: 8 },
    5: { width: 6, height: 6, capacity: 16 },
    6: { width: 6, height: 6, capacity: 16 },
  },

  /**
   * How many prepared spells a Vance may carry at half their usual footprint.
   *
   * Granted at the 2nd, 4th and 6th degrees, two at a time. Read as cumulative:
   * unlike the ephemera entitlements, which restate a total each time ("we can
   * safely possess three ephemera"), this one describes an act — "we can reduce
   * the occupying space of two of the spells we know" — and a 6th-degree Vance
   * has been granted it three times over.
   *
   * That reading is not beyond argument, which is why it is a table a GM can
   * edit rather than a number in a function.
   */
  vancianReductions: { 1: 0, 2: 2, 3: 2, 4: 4, 5: 4, 6: 6 },

  /**
   * What class a spell falls into when a Vance learns it their way.
   *
   * "Vances may wish to learn other spells and use them in their Vancian spell
   * method, storing them in their mind for later. This requires twice the
   * amount of time to learn the spell in the first place, but no additional
   * Acumen. A spell can be placed within a Vancian spell class using these
   * guidelines: Level 1-3 alpha class, Level 4-5 beta class, Level 6-7 gamma
   * class, Level 8-10 omega class" (The Way, p57).
   *
   * Bands rather than a formula, because that is how the book prints it and the
   * widths are not regular: three levels, then two, then two, then three.
   *
   * The deck runs 1 to 10, so the ends are never reached in play; a level
   * outside them takes the nearest band, which is the reading that cannot
   * leave a spell with no class at all.
   */
  vancianConversion: [
    { upTo: 3,  spellClass: "alpha" },
    { upTo: 5,  spellClass: "beta"  },
    { upTo: 7,  spellClass: "gamma" },
    { upTo: 10, spellClass: "omega" },
  ],

  spellTypes: {
    general: "ISUN.SpellGeneral",
    vance: "ISUN.SpellVance",
    weaver: "ISUN.SpellWeaver",
    goetic: "ISUN.SpellGoetic",
    maker: "ISUN.SpellMaker",
  },

  /* ──────────────────────────────────────────────
   * EPHEMERA TYPES
   * ────────────────────────────────────────────── */

  /* ──────────────────────────────────────────────
   * THE MAKER'S MATRIX
   * ────────────────────────────────────────────── */

  /**
   * What a Maker is making, and what that does to the level.
   *
   * "The effect dictates the level required, as found on the Effects by Level
   * table. This is then modified by the kind of item being made — specifically,
   * how often it can be used before the magic depletes (minimum, level 1)"
   * (The Way, p59).
   *
   * So the modifier is not a property of the object but of how long its magic
   * lasts: an ephemera spends itself in one use and is a level easier, and an
   * object that never depletes at all is four levels harder. The keys name the
   * depletion band rather than the fiction, because that is what the table is
   * actually indexed by, and it is what a Maker chooses when they decide how
   * durable the thing should be.
   */
  makerItemKinds: {
    ephemera:       { label: "ISUN.MakerKindEphemera",   modifier: -1, depletion: "" },
    object0to4:     { label: "ISUN.MakerKindObject0to4", modifier:  0, depletion: "0–4" },
    object0to2:     { label: "ISUN.MakerKindObject0to2", modifier:  1, depletion: "0–2" },
    object0to1:     { label: "ISUN.MakerKindObject0to1", modifier:  2, depletion: "0–1" },
    object0:        { label: "ISUN.MakerKindObject0",    modifier:  3, depletion: "0" },
    objectConstant: { label: "ISUN.MakerKindConstant",   modifier:  4, depletion: "" },
  },

  /**
   * What a side effect taken on purpose is worth.
   *
   * "A Maker could intentionally attempt to work a side effect into an item to
   * lower its in-process level. This is different from its final level, which
   * does not change… In general, a minor side effect lowers the level by 1, and
   * a major side effect lowers it by 2" (The Way, p60).
   *
   * In-process only, and only for side effects declared before the work starts.
   * The ones a bad roll inflicts later buy nothing.
   */
  makerSideEffectRelief: { minor: 1, major: 2 },

  /** Two days an item level, and a day for every challenge failed (The Way, p58). */
  makerDaysPerLevel: 2,

  /**
   * How many emotion or concept leaves stand in for one component.
   *
   * "Makers can substitute an appropriate emotion or concept leaf for an
   * ingredient, stabilizer, or catalyst of any level if the emotion or concept
   * is appropriate… if the level needed is 6 or 7, two leaves are needed. If the
   * level is 8, five leaves are needed. At level 9, ten leaves are needed, and
   * at level 10, fifteen leaves are required" (The Way, p62).
   *
   * One leaf up to level 5, which the book states by omission: it names a count
   * only where the count is more than one.
   */
  makerLeafCosts: { 6: 2, 7: 2, 8: 5, 9: 10, 10: 15 },

  /**
   * What to call each box, for a sheet that has to say where the work is.
   *
   * Apart from `makerMatrix` on purpose: that table is the shape of the process
   * and this is what the process is called, and a house rule that reroutes an
   * arrow should not have to restate every name to do it.
   */
  makerNodeLabels: {
    material:            "ISUN.MakerNodeMaterial",
    challenge:           "ISUN.MakerNodeChallenge",
    ingredient:          "ISUN.MakerNodeIngredient",
    continue:            "ISUN.MakerNodeContinue",
    powerSource:         "ISUN.MakerNodePowerSource",
    finalChallenge:      "ISUN.MakerNodeFinalChallenge",
    catalyst:            "ISUN.MakerNodeCatalyst",
    catalystChallenge:   "ISUN.MakerNodeCatalystChallenge",
    minorSideEffect:     "ISUN.MakerNodeMinorSideEffect",
    stabilizer:          "ISUN.MakerNodeStabilizer",
    stabilizerChallenge: "ISUN.MakerNodeStabilizerChallenge",
    majorSideEffect:     "ISUN.MakerNodeMajorSideEffect",
    created:             "ISUN.MakerNodeCreated",
    randomEffect:        "ISUN.MakerNodeRandomEffect",
    mishap:              "ISUN.MakerNodeMishap",
  },

  /**
   * The Matrix itself, as the chart on The Way p62 draws it.
   *
   * A table rather than a switch, so the shape of the process is something a GM
   * can read, and something a house rule can change, without going through a
   * function. Each entry is one box: what it needs from the table, and where
   * each answer leads.
   *
   *   needs   "roll" a challenge, "add" a component, "choose" to go on, or
   *           nothing at all for a box the process just passes through.
   *   at      how the challenge number is worked out, where there is one.
   *   level   what level the component must be, where there is one.
   *   next    where each answer goes.
   *
   * `bumps` marks the boxes that raise the working level. The chart writes that
   * inside the box as "(x now = x + 1)" and it happens on the way in, before
   * the component's level is read — which is what makes the book's own worked
   * example come out: succeed at challenge 1, add a *level 2* ingredient, then
   * attempt a *level 2* challenge (The Way, p59). Incrementing on the way out
   * instead gives a level 1 ingredient and contradicts the text.
   */
  makerMatrix: {
    material:           { needs: "add",    level: "final",   next: { added: "challenge" } },
    challenge:          { needs: "roll",   at: "x",          next: { success: "ingredient", failure: "catalyst" } },
    ingredient:         { needs: "add",    level: "x", bumps: true, next: { added: "continue" } },
    continue:           { needs: "choose", next: { yes: "challenge", no: "atLevel" } },
    /* The chart's diamond. Passed through rather than asked about: it is a test
     * on the working level, not a decision anybody makes. */
    atLevel:            { next: { yes: "powerSource", no: "randomEffect" } },
    powerSource:        { needs: "add",    level: "x",       next: { added: "finalChallenge" } },
    finalChallenge:     { needs: "roll",   at: "x+1",        next: { success: "created", failure: "mishap" } },
    catalyst:           { needs: "add",    level: "x", bumps: true, next: { added: "catalystChallenge" } },
    catalystChallenge:  { needs: "roll",   at: "x+1",        next: { success: "minorSideEffect", failure: "stabilizer" } },
    minorSideEffect:    { needs: "add",    next: { added: "ingredient" } },
    stabilizer:         { needs: "add",    level: "x", bumps: true, next: { added: "stabilizerChallenge" } },
    stabilizerChallenge:{ needs: "roll",   at: "x+1",        next: { success: "majorSideEffect", failure: "mishap" } },
    majorSideEffect:    { needs: "add",    next: { added: "ingredient" } },

    created:            { ends: "created" },
    randomEffect:       { ends: "randomEffect" },
    mishap:             { ends: "mishap" },
  },

  /* ──────────────────────────────────────────────
   * WHEN A DEPLETION IS CHECKED
   * ────────────────────────────────────────────── */

  /**
   * How often an ongoing effect is checked, read out of what the card says.
   *
   * A depletion prints as a number and a moment: "0 (check each round)",
   * "0–1 (check each use)", "0–4 (check each hour)". helpers/practice.mjs reads
   * the number, which is what a die is thrown against. This reads the moment,
   * which is what a table needs to group by — "the end of your turn" is a
   * question with an answer, and "your depletions" is not.
   *
   * Across the packs: 168 entries check each round, 106 each hour, 80 each use,
   * 15 each day, and then a long tail of about forty phrasings written once —
   * "check each bird created", "check each time the boots prevent a step",
   * "check each Wound use". Those fall through to `event`, which is honest: the
   * moment is a sentence, and the sentence is shown beside the row.
   *
   * ── Order is the whole rule ──
   * First match wins, and several entries name two moments. "Check at the end
   * of each combat in which it is used" is a combat cadence that says "used",
   * so combat has to be tried first; "check each use, but never more than once
   * each day" is a use cadence that says "day", so use has to come before day.
   * `scripts/test/depletion.test.mjs` holds those two in place.
   */
  depletionCadences: [
    { key: "round",       match: /\bround/i },
    { key: "combat",      match: /\bcombat/i },
    { key: "interaction", match: /\binteraction/i },
    { key: "use",         match: /\b(use|used|using|activation|activated)\b/i },
    { key: "minute",      match: /\bminute/i },
    { key: "hour",        match: /\bhour/i },
    { key: "day",         match: /\bday/i },
    { key: "sunrise",     match: /\bsunrise/i },
    { key: "sunset",      match: /\bsunset/i },
  ],

  /** What to call each moment on the tracker, in the order they are shown. */
  depletionCadenceLabels: {
    round:       "ISUN.CadenceRound",
    use:         "ISUN.CadenceUse",
    minute:      "ISUN.CadenceMinute",
    hour:        "ISUN.CadenceHour",
    day:         "ISUN.CadenceDay",
    combat:      "ISUN.CadenceCombat",
    interaction: "ISUN.CadenceInteraction",
    sunrise:     "ISUN.CadenceSunrise",
    sunset:      "ISUN.CadenceSunset",
    event:       "ISUN.CadenceEvent",
  },

  ephemeraTypes: {
    conflux: "ISUN.EphemeraConflux",
    charm: "ISUN.EphemeraCharm",
    cypher: "ISUN.EphemeraCypher",
    oddity: "ISUN.EphemeraOddity",
  },

  /* ──────────────────────────────────────────────
   * GOODS
   * ────────────────────────────────────────────── */

  /**
   * The sections The Key divides its goods lists into (p183–193).
   *
   * Kept as keys with the book's own headings for labels, so that the
   * compendium browser offers a dropdown rather than asking a player to type
   * "Home Furnishings and Needs" to find a chair. Kindled and aethyric are not
   * among them: the book marks those with asterisks against entries scattered
   * through the other lists, not as lists of their own, and they are flags on
   * the item rather than a section.
   *
   * `other` is what an unrecognised heading falls back to. It should never be
   * reached from The Key, and it exists so that a heading this does not know
   * lands somewhere rather than being refused.
   */
  goodsCategories: {
    furnishings: "ISUN.GoodsFurnishings",
    supplies:    "ISUN.GoodsSupplies",
    clothing:    "ISUN.GoodsClothing",
    jewelry:     "ISUN.GoodsJewelry",
    implements:  "ISUN.GoodsImplements",
    travel:      "ISUN.GoodsTravel",
    expenses:    "ISUN.GoodsExpenses",
    weapons:     "ISUN.GoodsWeapons",
    poisons:     "ISUN.GoodsPoisons",
    services:    "ISUN.GoodsServices",
    property:    "ISUN.GoodsProperty",
    materials:   "ISUN.GoodsMaterials",
    emotions:    "ISUN.GoodsEmotions",
    other:       "ISUN.GoodsOther",
  },

  /* ──────────────────────────────────────────────
   * OBJECT OF POWER TYPES
   * ────────────────────────────────────────────── */

  objectTypes: {
    object: "ISUN.ObjectGeneral",
    artifact: "ISUN.ObjectArtifact",
    relic: "ISUN.ObjectRelic",
    kindled: "ISUN.ObjectKindled",
    installation: "ISUN.ObjectInstallation",
  },

  /* ──────────────────────────────────────────────
   * INCANTATION CATEGORIES
   * ────────────────────────────────────────────── */

  /**
   * What a vislae can ask for when seeking a conation incantation they have
   * not held before. The first four are the types the books name (The Way,
   * p106); the rest are what the deck turned out to contain.
   */
  incantationCategories: {
    offensive:      "ISUN.IncCatOffensive",
    defensive:      "ISUN.IncCatDefensive",
    movement:       "ISUN.IncCatMovement",
    deception:      "ISUN.IncCatDeception",
    knowledge:      "ISUN.IncCatKnowledge",
    control:        "ISUN.IncCatControl",
    creation:       "ISUN.IncCatCreation",
    transformation: "ISUN.IncCatTransformation",
    restoration:    "ISUN.IncCatRestoration",
    enhancement:    "ISUN.IncCatEnhancement",
    utility:        "ISUN.IncCatUtility",
  },

  /* ──────────────────────────────────────────────
   * SECRET TYPES
   * ────────────────────────────────────────────── */

  secretTypes: {
    character: "ISUN.SecretCharacter",
    house: "ISUN.SecretHouse",
    order: "ISUN.SecretOrder",
    apostate: "ISUN.SecretApostate",
    // A changery secret is bought like any other, but it only takes effect once
    // the body has been altered to suit — always a change of level 9 or higher.
    changery: "ISUN.SecretChangery",
  },

  /* ──────────────────────────────────────────────
   * SOOTH DECK FAMILIES
   * ────────────────────────────────────────────── */

  /** The royalty cards. Each family holds one of each, always at the same
   *  value: Apprentice 5, Companion 6, Defender 7, Adept 8, Sovereign 9,
   *  Nemesis 0. A royalty card shifts no sun; it carries a special effect. */
  soothRanks: {
    apprentice: "ISUN.RankApprentice",
    companion: "ISUN.RankCompanion",
    defender: "ISUN.RankDefender",
    adept: "ISUN.RankAdept",
    sovereign: "ISUN.RankSovereign",
    nemesis: "ISUN.RankNemesis",
  },

  /**
   * What each royalty card does, as numbers rather than as prose.
   *
   * "Sovereign: +1 to all actions, +2 if heart is linked to family. Nemesis: −1
   * to all actions, −2 if heart is linked to family. Defender: +2 to all
   * actions if heart is linked to family. Apprentice: −1 to all actions if
   * heart is linked to family. Companion: Duplicates the effects of the
   * previously played card (if played first in a session on the Silver Sun,
   * immediately play another card on the next sun). Adept: Play another card on
   * the next sun" (The Gate, p74).
   *
   * `all` applies to everyone, `family` to a character whose heart is linked to
   * the card's family — Defender and Apprentice have no `all`, so they touch
   * nobody else. `duplicates` and `chain` are not modifiers at all: they change
   * what happens next on the board, and helpers/sooth.mjs reads them there.
   *
   * The printed text stays on the card in `effectText`, and it is what the
   * board shows a reader. This is for the arithmetic.
   */
  soothRankEffects: {
    sovereign:  { all: 1, family: 2 },
    nemesis:    { all: -1, family: -2 },
    defender:   { family: 2 },
    apprentice: { family: -1 },
    companion:  { duplicates: true },
    adept:      { chain: 1 },
  },

  /**
   * What a forte ability costs in Crux, by its level: "An ability of level 1 to
   * 4 requires 1 Crux, level 5 to 6 requires 2 Crux, and level 7 and above
   * require 3 Crux" (The Key, p6432).
   */
  forteAbilityCrux: (level) => (level >= 7 ? 3 : level >= 5 ? 2 : 1),

  /**
   * Taking a forte ability also raises a stat: "Every time you gain a new forte
   * ability, you permanently increase one of your stats by 2 points (or two of
   * your stats by 1 point each)... distributed into the refined pools" (The Key,
   * p6438). Which stat is the player's choice, so the points land in the shared
   * pot that either stat may draw on.
   */
  forteAbilityStatPoints: 2,

  /**
   * Suggestions for a vislae's quirk. Not a closed list — "use these as
   * examples to make up your own" (The Key, p13531) — so the field stays free
   * text and these are offered alongside it.
   */
  quirks: QUIRKS,

  /* ──────────────────────────────────────────────
   * FLUX
   * ────────────────────────────────────────────── */

  /**
   * Which chart a flux is read off, by how many magic dice were cast.
   *
   * "The GM should associate the flux intensity (minor, major, or grand) with
   * the approximate number of dice that are (or would be) rolled" (The Way,
   * p13). Four or more dice stay grand; there is no fourth chart.
   *
   * Here rather than in dice.mjs because it is a rules table, and because the
   * Flux item's `intensity` has to agree with what the dice produce.
   */
  fluxByDice: { 1: "minor", 2: "major", 3: "grand" },

  /** The three charts, in order of severity. */
  fluxIntensities: {
    minor: "ISUN.FluxMinor",
    major: "ISUN.FluxMajor",
    grand: "ISUN.FluxGrand",
  },

  /**
   * The Experimental Die's marked face: Font Awesome 7 `fa-disease`.
   *
   * The last Font Awesome mark left. Everything else that stood for a flux now
   * wears `fluxMark` below — the sun drawn for this system — and this one is
   * next, whenever the die it belongs to is worth reopening.
   *
   * Read by the Experimental Die's 3D face, the chat card, and Foundry's own
   * roll tooltip. The
   * stylesheet reads it through the --isun-flux-glyph custom property rather
   * than repeating the codepoint, so changing this line changes all of them.
   *
   * It must be a Solid face: Dice So Nice prepends weight 900, and a Regular-
   * or Light-only icon renders as a blank. Look a codepoint up with
   *   grep -o '\.fa-NAME{--fa:"[^"]*"}' <foundry>/public/fonts/fontawesome/css/all.min.css
   */
  fluxGlyph: "\uf7fa", //.fa-disease{--fa:"\f7fa"}

  /**
   * The flux mark itself: a sun, drawn for this system.
   *
   * A magic die reading 0 has fluxed, and the 0 carries no other meaning —
   * dice are only thrown when the target is 1 or more, so a 0 face can never
   * score. Nothing is lost by showing the mark instead of the numeral, and
   * what the table sees is the thing that actually happened.
   *
   * One file for both uses. Dice So Nice draws a label as an image when it
   * ends in an image extension, and the chat card uses the same file as a CSS
   * mask so the mark takes its colour from the die it sits on.
   */
  fluxMark: "systems/invisible-sun/icons/flux.png",

  /* ──────────────────────────────────────────────
   * SKILLS
   * ────────────────────────────────────────────── */

  /** Skills never rise above 4 (The Key, p2558). */
  skillMaxLevel: 4,

  skillCategories: {
    action: "ISUN.SkillAction",
    narrative: "ISUN.SkillNarrative",
    development: "ISUN.SkillDevelopment",
  },
  skillCategoryChoices: { "": "", action: "Action", narrative: "Narrative", development: "Development" },

  /** Acumen per level, by category (The Key, p2745). */
  skillAcumenCost: { action: 3, narrative: 2, development: 1 },

  /** The six weapon skills are type x range. */
  weaponTypeChoices: { "": "", light: "Light", medium: "Medium", heavy: "Heavy" },
  weaponRangeChoices: { "": "", close: "Close Combat", ranged: "Ranged" },

  /** Resist, Dodge and Withstand — named directly by spell and item text. */
  defenseKeyChoices: { "": "", resist: "Resist", dodge: "Dodge", withstand: "Withstand" },

  soothFamilies: {
    secrets: "ISUN.FamilySecrets",
    mysteries: "ISUN.FamilyMysteries",
    visions: "ISUN.FamilyVisions",
    notions: "ISUN.FamilyNotions",
  },

  /* ──────────────────────────────────────────────
   * ITEM TYPE DEFAULT ICONS
   * ────────────────────────────────────────────── */

  itemTypeIcons: {
    Heart: "icons/svg/blood.svg",
    Foundation: "icons/svg/house.svg",
    Soul: "icons/svg/sun.svg",
    Order: "icons/svg/tower.svg",
    Forte: "icons/svg/lightning.svg",
    ForteAbility: "icons/svg/lightning.svg",
    Spell: "icons/svg/aura.svg",
    Incantation: "icons/svg/aura.svg",
    Secret: "icons/svg/eye.svg",
    Skill: "icons/svg/book.svg",
    CharacterArc: "icons/svg/anchor.svg",
    SoothCard: "icons/svg/card-hand.svg",
    Ephemera: "icons/svg/item-bag.svg",
    ObjectOfPower: "icons/svg/mage-shield.svg",
    Thread: "icons/svg/net.svg",
    MinorMagic: "icons/svg/daze.svg",
    Connection: "icons/svg/village.svg",
  },

  actorTypeIcons: {
    Vislae: "icons/svg/mystery-man.svg",
    NPC: "icons/svg/mystery-man-black.svg",
    Creature: "icons/svg/cowled.svg",
  },
});
