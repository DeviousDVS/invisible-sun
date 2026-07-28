/**
 * Invisible Sun — Character Arc Item Data Model
 */
export class CharacterArcModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    // A helper for arc steps (opening, climax, resolution, and generic steps)
    const arcStep = (defaultReward) => new fields.SchemaField({
      description: new fields.StringField({ required: false, initial: "" }),
      reward:      new fields.StringField({ required: false, initial: defaultReward }),
      completed:   new fields.BooleanField({ required: true, initial: false }),
    });

    return {
      description: new fields.StringField({ required: false, initial: "" }),
      cost:        new fields.StringField({ required: false, initial: "2 Acumen" }),
      status:      new fields.StringField({ required: true, initial: "active", choices: ["planned","active","completed"] }),
      
      opening:     arcStep("1 Acumen"),
      steps:       new fields.ArrayField(arcStep("")),
      climax:      arcStep("3 Acumen, 1 Joy or 1 Despair"),
      resolution:  arcStep("1 Acumen"),
    };
  }
}