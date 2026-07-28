/**
 * Invisible Sun — Forte Item Data Model
 */
export class ForteModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description:   new fields.HTMLField({ required: false, initial: "" }),
      background:    new fields.HTMLField({ required: false, initial: "" }),
      appearance:    new fields.HTMLField({ required: false, initial: "" }),
      suggestedArcs: new fields.StringField({ required: false, initial: "" }),
      pathToJoy:     new fields.HTMLField({ required: false, initial: "" }),
      pathToDespair: new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}