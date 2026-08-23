import { QUIRKS } from "./quirks.mjs";

/**
 * Invisible Sun — System Configuration Constants
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
  "ISUN.Flux",           // flux intensity:  dice.mjs
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
 */
const spellClasses = {
  alpha: { label: "ISUN.SpellClassAlpha", width: 3, height: 1.5 },
  beta:  { label: "ISUN.SpellClassBeta",  width: 3, height: 3 },
  gamma: { label: "ISUN.SpellClassGamma", width: 6, height: 3 },
  omega: { label: "ISUN.SpellClassOmega", width: 6, height: 6 },
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

  orders: {
    vance: { label: "ISUN.OrderVance", abbr: "V", magicStyle: "Prepared Spells" },
    weaver: { label: "ISUN.OrderWeaver", abbr: "W", magicStyle: "Thread Weaving" },
    goetic: { label: "ISUN.OrderGoetic", abbr: "G", magicStyle: "Summoning" },
    maker: { label: "ISUN.OrderMaker", abbr: "M", magicStyle: "Crafting" },
    apostate: { label: "ISUN.OrderApostate", abbr: "A", magicStyle: "Unaligned" },
  },

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
   * not held before. The first four are the types The Way names (p106); the
   * rest are what the deck turned out to contain.
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
   * What a forte ability costs in Crux, by its level: "An ability of level 1 to
   * 4 requires 1 Crux, level 5 to 6 requires 2 Crux, and level 7 and above
   * require 3 Crux" (The Key, p6432).
   */
  forteAbilityCrux: (level) => (level >= 7 ? 3 : level >= 5 ? 2 : 1),

  /**
   * Taking a forte ability also raises a stat: "Every time you gain a new forte
   * ability, you permanently increase one of your stats by 2 points (or two of
   * your stats by 1 point each)... distributed into the refined pools" (p6438).
   * Which stat is the player's choice, so the points land in the shared pot
   * that either stat may draw on.
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
   * The mark for magical flux: Font Awesome 7 `fa-burst`.
   *
   * Defined once here and read by everything that draws it — the Experimental
   * Die's 3D face, the chat card, and Foundry's own roll tooltip. The
   * stylesheet reads it through the --isun-flux-glyph custom property rather
   * than repeating the codepoint, so changing this line changes all of them.
   *
   * It must be a Solid face: Dice So Nice prepends weight 900, and a Regular-
   * or Light-only icon renders as a blank. Look a codepoint up with
   *   grep -o '\.fa-NAME{--fa:"[^"]*"}' <foundry>/public/fonts/fontawesome/css/all.min.css
   */
  fluxGlyph: "\uf7fa", //.fa-disease{--fa:"\f7fa"}

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
