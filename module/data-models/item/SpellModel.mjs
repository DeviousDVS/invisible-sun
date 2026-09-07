/**
 * Invisible Sun — a spell — level, colour, cost and what it depletes
 */
export class SpellModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: CONFIG.ISUN.spellColorChoices }),
      cost:        new fields.StringField({ required: false, initial: "" }),
      range:       new fields.StringField({ required: false, initial: "", blank: true, choices: CONFIG.ISUN.ranges }),
      duration:    new fields.StringField({ required: false, initial: "" }),
      depletion:   new fields.StringField({ required: false, initial: "" }),
      description: new fields.HTMLField({ required: false, initial: "" }),
      spellType:   new fields.StringField({ required: true, initial: "general", choices: CONFIG.ISUN.spellTypes }),
      /** Vancian spells only: how much room the spell takes in a Vance's mind.
       *  Blank on every other kind of spell, which have no such limit. */
      spellClass:  new fields.StringField({ required: false, initial: "", blank: true,
                     choices: CONFIG.ISUN.spellClassChoices }),
      dice:        new fields.StringField({ required: false, initial: "" }),
      facets:      new fields.StringField({ required: false, initial: "" }),
      /** The italic aside printed under the card's labels — a rules
       *  clarification or a hook, not part of the spell's effect. */
      note:        new fields.HTMLField({ required: false, initial: "" }),

      /**
       * Vancian preparation: whether this spell is currently held in mind.
       *
       * Meaningless on anything but a Vancian spell owned by a Vance — a
       * compendium entry carries it as false and nothing reads it there. Kept
       * on the spell rather than as a list on the actor because "we cannot put
       * the same spell into our minds twice (or more) at the same time" (The
       * Key, Vance 1st degree), so there is exactly one answer per spell and a
       * list is able to hold two.
       *
       * A schema field rather than a flag, unlike the `conation` marker on
       * incantations: that records how one was acquired and is read when the
       * log is consulted, whereas this is live state read on every render of
       * the sheet, and it should migrate like any other rule if the shape of
       * preparation ever changes.
       */
      prepared:    new fields.BooleanField({ required: true, initial: false }),

      /**
       * Whether a Vance has learned this spell by their own method.
       *
       * "Vances may wish to learn other spells and use them in their Vancian
       * spell method, storing them in their mind for later. This requires twice
       * the amount of time to learn the spell in the first place, but no
       * additional Acumen" (The Way, p57). Twice the time, so it is a thing
       * done rather than a thing true — and once done the spell behaves in
       * every way like one of the tradition's own: it occupies the mind, it is
       * prepared, it casts free and costs Sorcery to keep.
       *
       * Recorded here rather than by rewriting `spellType`, which says which
       * deck the spell was printed in and stays true whatever a character does
       * with their copy. The two are different questions and the Kind column
       * answers both: "Spell, Vancian".
       *
       * A property of the character's copy, not of the spell. Two Vances may
       * hold the same general spell and only one of them have converted it, and
       * the compendium entry is neither. `ISUNItem._preCreate` is what sets it,
       * because that is the moment a spell arrives on somebody.
       */
      converted:   new fields.BooleanField({ required: true, initial: false }),

      /**
       * Whether this spell has been reduced to half its usual footprint — "we
       * can reduce the occupying space of two of the spells we know to half
       * their original size" (The Key, Vance 2nd degree, and again at the 4th
       * and the 6th).
       *
       * How many a character may reduce follows from their degree, so it is
       * counted against `CONFIG.ISUN.vancianReductions` rather than stored
       * anywhere. Halving a spell moves it one class down in every case —
       * omega to gamma, gamma to beta, beta to alpha — which is why the area
       * arithmetic stays exact.
       */
      halved:      new fields.BooleanField({ required: true, initial: false }),
    };
  }
}