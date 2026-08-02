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

  /** All valid spell colour strings (for select dropdowns). */
  spellColorChoices: Object.fromEntries(
    [["", ""], ...Object.keys(suns).map(k => {
      const label = k.charAt(0).toUpperCase() + k.slice(1);
      return [label, label];
    })]
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
   * OBJECT OF POWER TYPES
   * ────────────────────────────────────────────── */

  objectTypes: {
    artifact: "ISUN.ObjectArtifact",
    kindled: "ISUN.ObjectKindled",
    installation: "ISUN.ObjectInstallation",
  },

  /* ──────────────────────────────────────────────
   * SECRET TYPES
   * ────────────────────────────────────────────── */

  secretTypes: {
    character: "ISUN.SecretCharacter",
    house: "ISUN.SecretHouse",
    order: "ISUN.SecretOrder",
    apostate: "ISUN.SecretApostate",
  },

  /* ──────────────────────────────────────────────
   * SOOTH DECK FAMILIES
   * ────────────────────────────────────────────── */

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
  },

  actorTypeIcons: {
    Vislae: "icons/svg/mystery-man.svg",
    NPC: "icons/svg/mystery-man-black.svg",
    Creature: "icons/svg/cowled.svg",
  },
});
