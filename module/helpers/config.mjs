/**
 * Invisible Sun — System Configuration Constants
 *
 * All game-mechanical lookup tables, sun colours, pool names, and UI
 * constants live here so they can be referenced throughout the system.
 */

const suns = {
  silver: { label: "ISUN.SunSilver", color: "#c0c0c0", order: 0 },
  green: { label: "ISUN.SunGreen", color: "#2ecc71", order: 1 },
  blue: { label: "ISUN.SunBlue", color: "#5b9bd5", order: 2 },
  red: { label: "ISUN.SunRed", color: "#e74c3c", order: 3 },
  indigo: { label: "ISUN.SunIndigo", color: "#8e6fbf", order: 4 },
  gold: { label: "ISUN.SunGold", color: "#f0c040", order: 5 },
  grey: { label: "ISUN.SunGrey", color: "#7f8c8d", order: 6 },
  pale: { label: "ISUN.SunPale", color: "#ecf0f1", order: 7 },
  invisible: { label: "ISUN.SunInvisible", color: "#d4af37", order: 8 },
};

export const ISUN = Object.freeze({

  /* ──────────────────────────────────────────────
   * THE NINE SUNS
   * ────────────────────────────────────────────── */

  suns,

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
