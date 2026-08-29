import { ISUN } from "../../helpers/config.mjs";

/**
 * Invisible Sun — an incantation — magic sought rather than known
 */
export class IncantationModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.spellColorChoices }),
      cost:        new fields.StringField({ required: false, initial: "" }),
      range:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.ranges }),
      duration:    new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      dice:        new fields.StringField({ required: false, initial: "" }),
      facets:      new fields.StringField({ required: false, initial: "" }),

      /**
       * What kind of thing this incantation does — offensive, movement,
       * defensive, deception and so on.
       *
       * A vislae who has not held a specific incantation before "can ask for a
       * general type of conation incantation... rather than a specific one"
       * (The Way, p106), so a type is needed to ask by. The deck prints none:
       * every incantation arrives with an empty `facets`. These are assigned
       * by reading each one — see scripts/categorise_incantations.py — and
       * several apply to most, since a conjured spider that attacks answers to
       * both creation and offensive.
       */
      categories:  new fields.ArrayField(new fields.StringField()),

      /** The italic aside printed under the card's labels. */
      note:        new fields.HTMLField({ required: false, initial: "" }),
    };
  }
}