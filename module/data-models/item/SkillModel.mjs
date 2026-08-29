/**
 * Invisible Sun — a skill, and what its next level costs
 *
 * "Skills have levels, but only ever rise to 4 ... Each level adds +1 to your
 * venture when you attempt that action" (The Key, p2558). A skill's category
 * sets what a new level costs in Acumen, so it is a real mechanical field
 * rather than a label.
 *
 * The game has no definitive skill list — players invent their own — so the
 * compendium is a starting library and any name is valid. Two groups are
 * structured, because other rules point at them: the six weapon skills, and
 * the three defenses that item text names directly ("must take a successful
 * Resist action").
 */
export class SkillModel extends foundry.abstract.DataModel {

  /** The cap was wrongly 5. Anything already above the real cap is clamped. */
  static migrateData(source) {
    if (typeof source?.level === "number" && source.level > 4) source.level = 4;
    return super.migrateData(source);
  }

  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      /** 1 familiar, 2 practiced, 3 trained, 4 specialised. Never higher. */
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0, max: 4 }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      category:    new fields.StringField({ required: false, initial: "action", blank: true, choices: CONFIG.ISUN.skillCategoryChoices }),

      /** Set on the six weapon skills so a weapon can find its own skill. */
      weaponType:  new fields.StringField({ required: false, initial: "", blank: true, choices: CONFIG.ISUN.weaponTypeChoices }),
      weaponRange: new fields.StringField({ required: false, initial: "", blank: true, choices: CONFIG.ISUN.weaponRangeChoices }),
      /** Set on Resist, Dodge and Withstand, which other rules name. */
      defenseKey:  new fields.StringField({ required: false, initial: "", blank: true, choices: CONFIG.ISUN.defenseKeyChoices }),

      /** Other wordings the books use for the same skill. */
      aliases:     new fields.ArrayField(new fields.StringField()),
    };
  }

  /** What the next level costs, by category (The Key, p2745). */
  get acumenCostPerLevel() {
    return CONFIG.ISUN.skillAcumenCost[this.category] ?? 0;
  }

  /** A skill contributes its level to a venture. */
  get venture() {
    return this.level;
  }
}
