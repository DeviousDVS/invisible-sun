const fields = foundry.data.fields;

/* ── Helper: a value/max pair ── */
export const pool = (initVal = 0, initMax = 0) => new fields.SchemaField({
  value: new fields.NumberField({ required: true, initial: initVal, integer: true, min: 0 }),
  max:   new fields.NumberField({ required: true, initial: initMax, integer: true, min: 0 }),
});

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
