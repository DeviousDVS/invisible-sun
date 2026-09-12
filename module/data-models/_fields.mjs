const fields = foundry.data.fields;

/* ── Helper: a value/max pair ──
 * `scourge` is a lingering vex sitting in the pool: −1 to venture for every
 * action drawing on it (The Gate, glossary). This field holds scourges applied
 * directly — by spells, curses or the GM. Those that come from Wounds and
 * Anguish are derived per pool in ISUNActor, not stored here. */
export const pool = (initVal = 0, initMax = 0) => new fields.SchemaField({
  value:   new fields.NumberField({ required: true, initial: initVal, integer: true, min: 0 }),
  max:     new fields.NumberField({ required: true, initial: initMax, integer: true, min: 0 }),
  scourge: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
  /**
   * A vex is the opposite of a bene: spent to subtract 1 from a venture, and
   * the GM decides when. Unlike a scourge it is consumed, and refreshing the
   * pool clears any left over (The Key, p2241).
   */
  vex:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
});

/* ── The shared Injury track ──
 * One ordered list, not separate physical and mental counters. When it fills,
 * the *last* Injury decides whether the set becomes a Wound or an Anguish
 * (The Gate, p2547) — two mental plus one physical is a Wound. */
export const injuryTrack = () => new fields.ArrayField(
  new fields.StringField({ required: true, blank: false, initial: "physical",
                           choices: { physical: "ISUN.InjuryPhysical", mental: "ISUN.InjuryMental" } })
);

/* ── Limit grants ──
 * Items that entitle their owner to a higher cap declare it here; ISUNActor
 * sums these across owned items. Zero means "grants nothing", which is the
 * right default for the overwhelming majority of items. */
export const grantsSchema = () => new fields.SchemaField({
  limits: new fields.SchemaField({
    objectsOfPower: new fields.NumberField({ required: true, initial: 0, integer: true }),
    ephemera:       new fields.NumberField({ required: true, initial: 0, integer: true }),
    incantations:   new fields.NumberField({ required: true, initial: 0, integer: true }),
    arcs:           new fields.NumberField({ required: true, initial: 0, integer: true }),
  }),
});

/* ── Purse ──
 * One counter per denomination. Mundane orbs convert into each other at fixed
 * rates; magecoins and demontears do not convert to orbs at all, and are held
 * for their power rather than their price. */
export const purseSchema = () => {
  const coin = () => new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 });
  return new fields.SchemaField({
    bitsAndBobs: coin(),
    glass:       coin(),
    crystal:     coin(),
    gem:         coin(),
    trueorb:     coin(),
    bloodsilver: coin(),
    vim:         coin(),
    lumin:       coin(),
    demontear:   coin(),
  });
};

/* ── Base Schema for NPCs and Creatures ──
 * Teratology scales the Injury threshold by level rather than fixing it at
 * three: level 1–2 creatures take a Wound after only one or two, level 6+ after
 * four to six. `injuryThreshold` null means "derive it from level". */
export function baseNonPlayerSchema(defaultWoundMax = 1) {
  return {
    level: new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
    armor: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    /**
     * When the armour applies, where the book qualifies it.
     *
     * Rare — a handful of entries across 307 — but the qualification is the
     * whole of the rule where it appears: "Armor: 4 (while dancing)" is not an
     * armour of 4. The importer has always read it and had nowhere to put it,
     * so it printed as a bare number that was wrong for everyone who was not
     * dancing.
     */
    armorNote: new fields.StringField({ required: false, initial: "" }),
    ward:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    health: new fields.SchemaField({
      /** For an NPC a scourge is -1 to their level rather than to a pool. */
      scourge:         new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      injuries:        injuryTrack(),
      injuryThreshold: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true, min: 1 }),
      wounds:  pool(0, defaultWoundMax),
      anguish: pool(0, defaultWoundMax),
    }),

    /**
     * The rest of a printed stat block.
     *
     * An entry in Teratology, The Path or The Nightside is a name, a
     * description, a level, the blank Injuries/Wounds/Anguish boxes a GM ticks
     * in play, and some subset of the fields below. `level`, `armor` and the
     * tracks above carry the numbers; the rest is text the table reads, because
     * none of it is arithmetic the system does.
     *
     * The boxes are deliberately not among these. All 310 entries print them
     * empty — they are tick boxes, not values — so there is nothing to import
     * and the blank tracks above are already the right answer.
     */

    /**
     * How it defends itself, as printed.
     *
     * An array because an entry may print two profiles rather than one: many
     * separate "Defenses (Spiritual)" from "Defenses (Physical)", being one
     * thing in the world and another out of it. `kind` is what the bracket
     * said, and is empty where there was no bracket.
     */
    defenses: new fields.ArrayField(new fields.SchemaField({
      kind: new fields.StringField({ required: false, initial: "" }),
      text: new fields.StringField({ required: false, initial: "" }),
    })),

    /** Skill and task modifiers, as printed: "+3 stealth; +3 remember books". */
    modifications: new fields.StringField({ required: false, initial: "" }),

    /** The adjectives an entry closes on: "Organized. Bookish. Timid." */
    traits: new fields.StringField({ required: false, initial: "" }),

    /**
     * Named powers, each as the book heads it — "Claw Attack: 5 points of
     * damage", "Fictional Genesis: Object, creature, or sometimes concept…".
     * Anything between the stat lines and Traits carrying a label of its own.
     */
    abilities: new fields.ArrayField(new fields.SchemaField({
      name:        new fields.StringField({ required: false, initial: "" }),
      description: new fields.StringField({ required: false, initial: "" }),
    })),

    /** Which book prints it, and the printed page — not the PDF's. */
    source: new fields.StringField({ required: false, initial: "" }),
    page:   new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
  };
}
