/**
 * Invisible Sun — Skill Item Data Model
 */
export class SkillModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0, max: 5 }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      category:    new fields.StringField({ required: false, initial: "" }),
    };
  }
}