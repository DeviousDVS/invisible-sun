/**
 * Invisible Sun — a character arc: cost, opening, steps, climax, resolution
 */
import { splitBeat } from "./arc-beat.mjs";

export class CharacterArcModel extends foundry.abstract.DataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    
    /**
     * One beat of an arc: opening, a step, the climax or the resolution.
     *
     * The books name every beat — "Research", "Sharing Your Home" — and state
     * what it pays inside its own sentence. All three were kept in the
     * description, so the name of a beat existed only as the first words of its
     * prose and nothing could show it as a name. It has a field now.
     */
    const arcStep = (defaultReward) => new fields.SchemaField({
      title:       new fields.StringField({ required: false, initial: "" }),
      description: new fields.StringField({ required: false, initial: "" }),
      reward:      new fields.StringField({ required: false, initial: defaultReward }),
      completed:   new fields.BooleanField({ required: true, initial: false }),
    });

    return {
      description: new fields.StringField({ required: false, initial: "" }),
      cost:        new fields.StringField({ required: false, initial: "2 Acumen" }),
      status:      new fields.StringField({ required: true, initial: "active", choices: CONFIG.ISUN.arcStatuses }),
      
      opening:     arcStep("1 Acumen"),
      steps:       new fields.ArrayField(arcStep("")),
      climax:      arcStep("3 Acumen, 1 Joy or 1 Despair"),
      resolution:  arcStep("1 Acumen"),
    };
  }

  /**
   * Beats used to keep their name at the front of their prose.
   *
   * The books write every one of them as a name, then what it pays, then what
   * happens — "Research. 1 Acumen reward. You look into your own family
   * background…" — and the importer stored the lot as the description. So the
   * name of a beat existed only as its opening words, and a sheet could show
   * "Step 1" and never "Research".
   *
   * Done here rather than as a world migration because this is a value moving
   * within a document, which is what migrateData is for: it runs against raw
   * source before cleaning, costs nothing per load, needs no version stamp, and
   * — the part a world migration could not do — it reaches the compendium as
   * well as the arcs already on characters. The pack is built from the books
   * and is not ours to rewrite in place.
   *
   * A beat that already has a title is left alone, so a name written by hand
   * is never overwritten and re-reading changes nothing.
   */
  static migrateData(source) {
    const beats = [source?.opening, ...(source?.steps ?? []), source?.climax, source?.resolution];
    for (const beat of beats) {
      if (!beat || beat.title || !beat.description) continue;
      const { title, description } = splitBeat(beat.description);
      /* Only ever adds a name; never rewrites prose on its own.
       *
       * migrateData transforms on read and is not written back, so it may run
       * against its own output more than once in a session — and stripping a
       * beat's price without giving it a name leaves prose whose first sentence
       * looks exactly like a name. "1 Acumen reward. You contemplate how this
       * new knowledge sits with you." would lose its price on one pass and be
       * called "You contemplate how this new knowledge sits with you" on the
       * next. Writing a title is the guard against a second pass, so a pass
       * that finds no title must change nothing at all.
       *
       * The importer has no such problem: it runs once, against the book. The
       * thirty-seven nameless resolutions come out cleanly there, and here they
       * keep the price in their prose until the pack is next built. */
      if (!title) continue;
      beat.title = title;
      beat.description = description;
    }
    return super.migrateData(source);
  }
}