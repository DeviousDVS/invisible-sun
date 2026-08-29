/**
 * Invisible Sun — a foundation: where a character stands in the world
 */
export class FoundationModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      description:             new fields.HTMLField({ required: false, initial: "" }),
      weeklyIncome:            new fields.NumberField({ required: true, initial: 50, integer: true, min: 0 }),
      initialSavings:          new fields.NumberField({ required: true, initial: 100, integer: true, min: 0 }),
      startingHiddenKnowledge: new fields.NumberField({ required: true, initial: 10, integer: true, min: 0 }),
      houseType:               new fields.StringField({ required: false, initial: "" }),
      houseLevel:              new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 10 }),
      connectionsCount:        new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      connectionsText:         new fields.StringField({ required: false, initial: "" }),
      specialRules:            new fields.HTMLField({ required: false, initial: "" }),
      initialMotivations:      new fields.HTMLField({ required: false, initial: "" }),
      suggestedArcs:           new fields.ArrayField(new fields.StringField()),
    };
  }
}