const fields = foundry.data.fields;

/* ── Helper: a value/max pair ── */
export const pool = (initVal = 0, initMax = 0) => new fields.SchemaField({
  value: new fields.NumberField({ required: true, initial: initVal, integer: true, min: 0 }),
  max:   new fields.NumberField({ required: true, initial: initMax, integer: true, min: 0 }),
});

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

/* ── Base Schema for NPCs and Creatures ── */
export function baseNonPlayerSchema(defaultWoundMax = 1) {
  return {
    level: new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
    armor: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    ward:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    health: new fields.SchemaField({
      wounds:  pool(0, defaultWoundMax),
      anguish: pool(0, defaultWoundMax),
    }),
  };
}
