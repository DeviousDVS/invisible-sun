/**
 * Invisible Sun — Vislae (Player Character) Data Model
 *
 * The full PC data model encompassing:
 *   - Certes (physical) & Qualia (mental/magical) stat pools
 *   - Hidden Knowledge
 *   - Health tracking (Wounds, Anguish, Injuries)
 *   - Advancement (Joy, Despair, Acumen, Crux)
 *   - Character identity metadata
 *   - Economy & House
 *   - Rest tracking
 */
import { pool, purseSchema } from "../_fields.mjs";

export class VislaeModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    /* ── Stats ── */
    const stats = new fields.SchemaField({
      certes: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 8, integer: true, min: 1 }),
        max:   new fields.NumberField({ required: true, initial: 20, integer: true, min: 1 }),
        pools: new fields.SchemaField({
          accuracy:    pool(0, 0),
          movement:    pool(0, 0),
          physicality: pool(0, 0),
          perception:  pool(0, 0),
        }),
      }),
      qualia: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 8, integer: true, min: 1 }),
        max:   new fields.NumberField({ required: true, initial: 20, integer: true, min: 1 }),
        pools: new fields.SchemaField({
          sorcery:     pool(0, 0),
          interaction: pool(0, 0),
          intellect:   pool(0, 0),
          sortilege:   pool(0, 0),
        }),
      }),
      hiddenKnowledge: pool(10, 99),
    });

    /* ── Status (health) ── */
    const status = new fields.SchemaField({
      wounds:   pool(0, 3),
      anguish:  pool(0, 3),
      injuries: new fields.SchemaField({
        physical: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        mental:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      }),
      armor:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      ward:    new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      scourge: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    });

    /* ── Advancement ── */
    const advancement = new fields.SchemaField({
      joy:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      despair: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      acumen:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      crux:    new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    });

    /* ── Character Identity Metadata ── */
    const meta = new fields.SchemaField({
      characterSentence: new fields.SchemaField({
        foundation: new fields.StringField({ required: false, initial: "" }),
        heart:      new fields.StringField({ required: false, initial: "" }),
        order:      new fields.StringField({ required: false, initial: "" }),
        forte:      new fields.StringField({ required: false, initial: "" }),
      }),
      secretName:  new fields.StringField({ required: false, initial: "" }),
      soulName:    new fields.StringField({ required: false, initial: "" }),
      orderDegree: new fields.StringField({ required: false, initial: "" }),
      orderType:   new fields.StringField({ required: false, initial: "" }),
    });

    /* ── Economy ──
     * `income` is weekly, denominated in crystal orbs to match the Foundation
     * entries in The Key ("Initial Savings: 100 crystal orbs"). Coin on hand
     * lives in `purse`, which replaced a single `savings` number. */
    const economy = new fields.SchemaField({
      income: new fields.NumberField({ required: true, initial: 50, integer: true, min: 0 }),
      purse:  purseSchema(),
      debts:  new fields.StringField({ required: false, initial: "" }),

      /**
       * @deprecated Superseded by `purse`. Retained only so the migration can
       * read it — Foundry prunes keys absent from the schema, so removing this
       * outright would make the old value unreadable and silently lost. Null
       * once migrated; delete the field once no world holds a number here.
       */
      savings: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
    });

    /* ── House ── */
    const house = new fields.SchemaField({
      type:     new fields.StringField({ required: false, initial: "" }),
      level:    new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 10 }),
      augments: new fields.StringField({ required: false, initial: "" }),
    });

    /* ── Rest Tracking ── */
    const rests = new fields.SchemaField({
      quickUsed:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 2 }),
      tenMinUsed: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 1 }),
      hourUsed:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 1 }),
    });

    /* ── Limit overrides ──
     * The effective cap is derived (base + item contributions + override).
     * These are the GM's manual escape hatch for entitlements the system does
     * not yet compute — null means "no override", not zero. */
    const nullableCap = () => new fields.NumberField({
      required: false, nullable: true, initial: null, integer: true, min: 0
    });

    const limitOverrides = new fields.SchemaField({
      ephemera:       nullableCap(),
      incantations:   nullableCap(),
      objectsOfPower: nullableCap(),
      arcs:           nullableCap(),
    });

    /* ── Biography ── */
    const biography = new fields.HTMLField({ required: false, initial: "" });

    return { stats, status, advancement, meta, economy, house, rests, limitOverrides, biography };
  }
}
