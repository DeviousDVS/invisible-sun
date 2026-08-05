import { ISUN } from "../../helpers/config.mjs";

import { grantsSchema } from "../_fields.mjs";

/**
 * Invisible Sun — Forte Ability Item Data Model
 *
 * The books state an ability's level as a compound string — "4", "4 (+1 die)",
 * "7 (no cost)", "3 (+1 die if used as an attack)" — packing three separate
 * rules into one field: the level, a dice bonus, and whether it costs Sorcery.
 * A plain NumberField could hold only the first and silently discarded rules a
 * player needs at the table, so each part gets its own field. `levelText` keeps
 * the book's exact phrasing for display.
 */
export class ForteAbilityModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    return {
      level:       new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      /** Extra dice this ability adds to the roll, from "(+1 die)" / "(+2 dice)". */
      bonusDice:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      /** True when the book says "(no cost)" — costs no Sorcery to use. */
      noCost:      new fields.BooleanField({ required: true, initial: false }),
      /** When a bonus applies only sometimes: "if used as an attack". */
      condition:   new fields.StringField({ required: false, initial: "" }),
      /** The level exactly as printed, e.g. "8 (+2 dice)". */
      levelText:   new fields.StringField({ required: false, initial: "" }),

      description: new fields.HTMLField({ required: false, initial: "" }),
      color:       new fields.StringField({ required: false, initial: "", blank: true, choices: ISUN.spellColorChoices }),
      depletion:   new fields.StringField({ required: false, initial: "" }),

      /** Owning forte, by name — readable, and what the books key on. */
      parentForte: new fields.StringField({ required: false, initial: "" }),
      /** Stable id of the owning Forte item, for a precise link across packs. */
      /**
       * The abilities this one opens the way to.
       *
       * A forte is a tree, not a list: "You must acquire the abilities along
       * the given paths, in order... learning one ability unlocks the potential
       * acquisition of another (or sometimes two) later" (The Key, p6405).
       * Held as the names the book gives them, since that is what the diagram
       * labels and what survives a rebuild of the compendium.
       */
      unlocks:     new fields.ArrayField(new fields.StringField()),

      forteId:     new fields.StringField({ required: false, initial: "" }),

      grants:      grantsSchema(),
    };
  }

  /**
   * Parse a compound level string into its parts.
   * Mirrored in scripts/build_compendia.js — keep the two in step.
   */
  static parseLevel(raw) {
    const out = { level: 1, bonusDice: 0, noCost: false, condition: "", levelText: String(raw ?? "").trim() };
    if (!out.levelText) return out;

    const lvl = out.levelText.match(/^(\d+)/);
    if (lvl) out.level = Number(lvl[1]);

    // "(no cost)" may sit in its own parenthetical beside a dice bonus, as in
    // the single case of "5 (no cost) (+1 die)".
    if (/no cost/i.test(out.levelText)) out.noCost = true;

    const dice = out.levelText.match(/\+(\d+)\s*d(?:ie|ice)\b([^)]*)/i);
    if (dice) {
      out.bonusDice = Number(dice[1]);
      out.condition = dice[2].trim();
    }
    return out;
  }
}
