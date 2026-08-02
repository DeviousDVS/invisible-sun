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
    ward:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    health: new fields.SchemaField({
      injuries:        injuryTrack(),
      injuryThreshold: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true, min: 1 }),
      wounds:  pool(0, defaultWoundMax),
      anguish: pool(0, defaultWoundMax),
    }),
  };
}
