import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — a spell — level, colour, cost and what it depletes
 */
export class SpellModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.spellColorChoices }),
      cost:        new fields.StringField({ required: false, initial: "" }),
      range:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.ranges }),
      duration:    new fields.StringField({ required: false, initial: "" }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      spellType:   new fields.StringField({ required: true, initial: "general", choices: ISUN.spellTypes }),
      /** Vancian spells only: how much room the spell takes in a Vance's mind.
       *  Blank on every other kind of spell, which have no such limit. */
      spellClass:  new fields.StringField({ required: false, initial: "", blank: true,
                     choices: ISUN.spellClassChoices }),
      dice:        new fields.StringField({ required: false, initial: "" }),
      facets:      new fields.StringField({ required: false, initial: "" }),
      /** The italic aside printed under the card's labels — a rules
       *  clarification or a hook, not part of the spell's effect. */
      note:        new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}