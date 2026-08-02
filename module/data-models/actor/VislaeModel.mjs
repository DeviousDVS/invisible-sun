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
import { pool, purseSchema, injuryTrack } from "../_fields.mjs";

export class VislaeModel extends foundry.abstract.DataModel {

  /**
   * `status.injuries` changed shape from `{physical, mental}` counters to an
   * ordered track. That is a type change rather than a removal, so the
   * deprecate-the-old-field approach does not apply — an ArrayField handed an
   * object simply falls back to empty and the values are gone. migrateData runs
   * against the raw source before cleaning, which is the only point the old
   * shape is still readable.
   *
   * Order within the rebuilt track is unknowable, so physical Injuries are
   * placed first. That only matters if the old counters summed to the
   * threshold, in which case the last entry decides Wound versus Anguish.
   *
   * Note this can change a character's standing: under the old two-counter
   * model, 2 physical and 1 mental were two part-full tracks converting
   * nothing, whereas one shared track of three is full and converts on the next
   * update. The old behaviour was not the rule, so the new reading is correct,
   * but a character carrying injuries across the upgrade may gain a Wound or an
   * Anguish they did not have.
   */
  static migrateData(source) {
    const inj = source?.status?.injuries;
    if (inj && !Array.isArray(inj) && typeof inj === "object") {
      const physical = Number(inj.physical) || 0;
      const mental = Number(inj.mental) || 0;
      source.status.injuries = [
        ...Array(physical).fill("physical"),
        ...Array(mental).fill("mental")
      ];
    }
    // A single number is no longer meaningful: scourges sit in individual
    // pools. Drop it rather than guess which pools it applied to.
    if (source?.status && "scourge" in source.status) delete source.status.scourge;
    return super.migrateData(source);
  }

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

    /* ── Status (health) ──
     * Injuries are one ordered track shared by physical and mental damage, not
     * two counters. Each entry records where it came from, because when the
     * track fills it is the *last* Injury that decides whether the set becomes
     * a Wound or an Anguish (The Gate, p2547). Two counters cannot express
     * that: 2 mental + 1 physical is a single Wound, not two part-full tracks. */
    const status = new fields.SchemaField({
      wounds:   pool(0, 3),
      anguish:  pool(0, 3),
      injuries: injuryTrack(),
      injuryThreshold: new fields.NumberField({ required: true, initial: 3, integer: true, min: 1 }),
      armor:    new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      ward:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
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
    /* ── House ──
     * A vislae's home and the neighbourhood around it; the fan sheet pairs the
     * two, and in play they are consulted together. */
    const house = new fields.SchemaField({
      name:         new fields.StringField({ required: false, initial: "" }),
      type:         new fields.StringField({ required: false, initial: "" }),
      level:        new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 10 }),
      augments:     new fields.StringField({ required: false, initial: "" }),
      secrets:      new fields.HTMLField({ required: false, initial: "" }),
      neighborhood: new fields.StringField({ required: false, initial: "" }),
      notes:        new fields.HTMLField({ required: false, initial: "" }),
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

    /* ── Narrative ──
     * Prompts a vislae is actually asked at the table, kept apart rather than
     * folded into one biography blob. "Shadow life" is the exile before
     * returning to the Actuality; "memories" is a prompt rather than a rules
     * term, but earns its place for the same reason the others do. */
    const titledEntry = () => new fields.SchemaField({
      title:       new fields.StringField({ required: false, initial: "" }),
      description: new fields.StringField({ required: false, initial: "" }),
    });

    const narrative = new fields.SchemaField({
      appearance:  new fields.HTMLField({ required: false, initial: "" }),
      quirk:       new fields.StringField({ required: false, initial: "" }),
      shadowLife:  new fields.HTMLField({ required: false, initial: "" }),
      memories:    new fields.ArrayField(titledEntry()),
      personality: new fields.ArrayField(titledEntry()),
    });

    /* ── Player ── */
    const player = new fields.SchemaField({
      name:    new fields.StringField({ required: false, initial: "" }),
      rpStyle: new fields.StringField({ required: false, initial: "" }),
    });

    /* ── Biography ── */
    const biography = new fields.HTMLField({ required: false, initial: "" });

    return { stats, status, advancement, meta, economy, house, rests, limitOverrides,
             narrative, player, biography };
  }
}
