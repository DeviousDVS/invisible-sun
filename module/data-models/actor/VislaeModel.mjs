/**
 * Invisible Sun — a vislae — everything a player character is
 *
 * The full PC data model encompassing:
 *   - Certes (physical) & Qualia (mental/magical) stat pools
 *   - Hidden Knowledge
 *   - Health tracking (Wounds, Anguish, Injuries)
 *   - Advancement (Joy, Despair, Acumen, Crux)
 *   - Character identity metadata
 *   - Economy & House
 *   - Rest tracking
 */
import { pool, purseSchema, injuryTrack } from "../_fields.mjs";

export class VislaeModel extends foundry.abstract.DataModel {

  /**
   * `status.injuries` changed shape from `{physical, mental}` counters to an
   * ordered track. That is a type change rather than a removal, so the
   * deprecate-the-old-field approach does not apply — an ArrayField handed an
   * object simply falls back to empty and the values are gone. migrateData runs
   * against the raw source before cleaning, which is the only point the old
   * shape is still readable.
   *
   * Order within the rebuilt track is unknowable, so physical Injuries are
   * placed first. That only matters if the old counters summed to the
   * threshold, in which case the last entry decides Wound versus Anguish.
   *
   * Note this can change a character's standing: under the old two-counter
   * model, 2 physical and 1 mental were two part-full tracks converting
   * nothing, whereas one shared track of three is full and converts on the next
   * update. The old behaviour was not the rule, so the new reading is correct,
   * but a character carrying injuries across the upgrade may gain a Wound or an
   * Anguish they did not have.
   */
  static migrateData(source) {
    /* A character built before the scores were derived carries its Certes and
     * Qualia as stored numbers with nothing in the pools. Those points are real
     * but now have nowhere to live, so they become points to place — the sheet
     * then asks the player to divide them, which is what should have happened
     * at creation. Only done when the pools are genuinely untouched, so a
     * character who has allocated is left alone. */
    /* orderDegree used to be free text, written however the player fancied —
     * "3rd", "3rd Degree: Magister", "Master of the Spindle". The number is
     * what matters now, so the first digit is taken and the rest discarded;
     * the title comes from the order. Text with no digit in it cannot be
     * placed on the ladder and becomes 0. */
    const deg = source?.meta?.orderDegree;
    if (typeof deg === "string") {
      const n = deg.match(/[1-6]/);
      source.meta.orderDegree = n ? Number(n[0]) : 0;
    }

    const stats = source?.stats;
    if (stats) {
      /* An earlier build held one pooled budget rather than three. Which stat
       * each of those points belonged to is not recoverable from the actor, so
       * they become free points: that keeps them spendable rather than
       * stranding them against the wrong stat. */
      if (typeof stats.statPoints === "number") {
        stats.statPoints = { certes: 0, qualia: 0, shared: stats.statPoints };
      }
      if (!stats.statPoints) {
        const held = ["certes", "qualia"].reduce((n, k) =>
          n + Object.values(stats[k]?.pools ?? {}).reduce((m, p) => m + (Number(p?.max) || 0), 0), 0);
        const certes = Number(stats.certes?.value) || 0;
        const qualia = Number(stats.qualia?.value) || 0;
        /* Scores stored with nothing in the pools: those points are real but
         * have nowhere to live, so they become points to place — against their
         * own stat, which is where they came from. */
        if (held === 0 && (certes || qualia)) {
          stats.statPoints = { certes, qualia, shared: 0 };
        }
      }
    }

    /* Crux was stored. It is now what a Joy and a Despair are worth together,
     * so a stored total has to go back where it came from: one Crux held is one
     * Joy and one Despair that were never spent. Adding it to both restores the
     * character to the state the new reading describes.
     *
     * Read from the raw source, which is the only place it still exists — the
     * schema no longer declares the key, so it is gone by the time anything
     * else could look. */
    const heldCrux = source?.advancement?.crux;
    if (typeof heldCrux === "number" && heldCrux > 0) {
      source.advancement.joy = (Number(source.advancement.joy) || 0) + heldCrux;
      source.advancement.despair = (Number(source.advancement.despair) || 0) + heldCrux;
    }
    if (source?.advancement) delete source.advancement.crux;

    const inj = source?.status?.injuries;
    if (inj && !Array.isArray(inj) && typeof inj === "object") {
      const physical = Number(inj.physical) || 0;
      const mental = Number(inj.mental) || 0;
      source.status.injuries = [
        ...Array(physical).fill("physical"),
        ...Array(mental).fill("mental")
      ];
    }
    // status.scourge was a bare number, which cannot say which pools it applied
    // to; it is now a {all, certes, qualia} object. Only drop the old numeric
    // form — testing for the key alone would wipe the new object on every load.
    if (typeof source?.status?.scourge === "number") delete source.status.scourge;
    return super.migrateData(source);
  }

  static defineSchema() {
    const fields = foundry.data.fields;

    /* ── Stats ── */
    const stats = new fields.SchemaField({
      certes: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 8, integer: true, min: 1 }),
        max:   new fields.NumberField({ required: true, initial: 20, integer: true, min: 1 }),
        pools: new fields.SchemaField({
          accuracy:    pool(0, 0),
          movement:    pool(0, 0),
          physicality: pool(0, 0),
          perception:  pool(0, 0),
        }),
      }),
      qualia: new fields.SchemaField({
        value: new fields.NumberField({ required: true, initial: 8, integer: true, min: 1 }),
        max:   new fields.NumberField({ required: true, initial: 20, integer: true, min: 1 }),
        pools: new fields.SchemaField({
          sorcery:     pool(0, 0),
          interaction: pool(0, 0),
          intellect:   pool(0, 0),
          sortilege:   pool(0, 0),
        }),
      }),
      hiddenKnowledge: pool(10, 99),

      /**
       * Points granted but not yet placed in a pool, kept as three separate
       * budgets because they are not interchangeable.
       *
       * A heart gives a Certes score and a Qualia score, and those belong to
       * their own stat — Stoic's 7 Certes can only ever reach Certes pools.
       * What it also gives is "6 points to divide among them as you wish"
       * (The Key, p5841), and only those are free to go either way. Advancement
       * adds to whichever stat it names.
       *
       * The core scores themselves are not stored: "the points in these scores
       * are always divided into the pools for each stat. Points not put in a
       * pool serve no purpose" (The Key, p1875), so a score is the sum of its
       * pools and cannot disagree with them.
       */
      statPoints: new fields.SchemaField({
        certes: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        qualia: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        /** The heart's free 6, spendable on either stat's pools. */
        shared: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      }),
    });

    /* ── Status (health) ──
     * Injuries are one ordered track shared by physical and mental damage, not
     * two counters. Each entry records where it came from, because when the
     * track fills it is the *last* Injury that decides whether the set becomes
     * a Wound or an Anguish (The Gate, p2547). Two counters cannot express
     * that: 2 mental + 1 physical is a single Wound, not two part-full tracks. */
    const status = new fields.SchemaField({
      wounds:          pool(0, 3),
      anguish:         pool(0, 3),
      injuries:        injuryTrack(),
      injuryThreshold: new fields.NumberField({ required: true, initial: 3, integer: true, min: 1 }),
      armor:           new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      ward:            new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),

      /**
       * Scourges applied at a wider scope than one pool. The books inflict them
       * at three: "1 scourge in all my pools" (The Gate, the Goetic soul-debt),
       * "1 scourge in all Certes pools" and "1 scourge to all Qualia"
       * (Teratology). Those arising from Wounds and Anguish are derived and do
       * not live here.
       */
      scourge: new fields.SchemaField({
        all:    new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        certes: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
        qualia: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      }),
    });

    /* ── Advancement ── */
    /* ── Advancement ──
     * Joy and Despair are earned along the paths every forte and every order
     * describes — "the following events may bring me Joy" — so they arrive by
     * recognition at the table rather than by any calculation. Acumen comes
     * from character arc beats, which state their own rewards.
     *
     * Crux is deliberately absent. It is not a resource a character holds: it
     * is what a Joy and a Despair are worth together, and it only comes into
     * existence at the moment something is bought. Spending 2 Crux spends 2 Joy
     * and 2 Despair. Holding a stored total beside the pair that backs it would
     * be two numbers that can disagree, and the pair is the one the rules talk
     * about. ISUNActor derives what is available. */
    const advancement = new fields.SchemaField({
      joy:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      despair: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      acumen:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    });

    /* ── Character Identity Metadata ── */
    const meta = new fields.SchemaField({
      characterSentence: new fields.SchemaField({
        foundation: new fields.StringField({ required: false, initial: "" }),
        heart:      new fields.StringField({ required: false, initial: "" }),
        order:      new fields.StringField({ required: false, initial: "" }),
        forte:      new fields.StringField({ required: false, initial: "" }),
      }),
      secretName:  new fields.StringField({ required: false, initial: "" }),
      /**
       * @deprecated The Soul is a Soul item now, shown in the Biography tab.
       * Retained so a name typed before that is still displayed, with a prompt
       * to drop the real item on; remove once no world has one.
       */
      soulName:    new fields.StringField({ required: false, initial: "" }),
      /**
       * Which degree of their order the vislae holds, 1 to 6, or 0 for none —
       * an Apostate has no degrees at all.
       *
       * Only the number is kept. Every order names its own six degrees (a
       * Vance 3rd is a Magister, a Weaver 3rd a Master of the Spindle), so the
       * title is a fact about the order rather than about the character and is
       * read from the Order item. Storing it here as well would let the two
       * disagree.
       */
      orderDegree: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 6 }),
      orderType:   new fields.StringField({ required: false, initial: "" }),

      /**
       * Which day of play this is, counted from 1 and advanced by newDay().
       *
       * Several incantation rules are worded in days — no more received in a
       * day than the ephemera limit, and never the same one two days running
       * — and none of them can be checked against a real-world clock, since a
       * session covers whatever span of game time the table says it does. A
       * counter the table advances deliberately is the only thing that tracks
       * the fiction rather than the wall.
       */
      day: new fields.NumberField({ required: true, initial: 1, integer: true, min: 1 }),
    });

    /* ── Incantations ──
     * A ledger of every incantation received, which is not the same as the
     * ones currently held: a conation incantation may be any the vislae has
     * *ever* known as an acquiescent one, and The Way tells players to keep
     * notes precisely because that history outlives the holding.
     *
     * It answers the three day-bounded rules from one place — what was
     * received today, what was received yesterday, and what has ever been
     * known — so they cannot drift apart. */
    const incantations = new fields.SchemaField({
      log: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ required: true, initial: "" }),
        /** The compendium entry, so it can be granted again by name change. */
        uuid: new fields.StringField({ required: false, initial: "" }),
        /** "acquiescent" — granted — or "conation" — chosen. */
        kind: new fields.StringField({ required: true, initial: "acquiescent" }),
        /** The value of meta.day when it was received. */
        day:  new fields.NumberField({ required: true, initial: 1, integer: true, min: 1 }),
      })),

      /**
       * Hours spent meditating today. Receiving any incantation takes about an
       * hour, and no more can be received in a day than the ephemera limit.
       *
       * Deliberately not the one-hour rest: the book has a vislae meditate for
       * three hours in a day to receive three incantations, where the rest is
       * one a day and restores health. Spending the rest here would cap
       * incantations at one and quietly cost the character their recovery.
       */
      hoursToday: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
    });

    /* ── Economy ──
     * `income` is weekly, denominated in crystal orbs to match the Foundation
     * entries in The Key ("Initial Savings: 100 crystal orbs"). Coin on hand
     * lives in `purse`, which replaced a single `savings` number. */
    const economy = new fields.SchemaField({
      income: new fields.NumberField({ required: true, initial: 50, integer: true, min: 0 }),
      purse:  purseSchema(),
      debts:  new fields.StringField({ required: false, initial: "" }),

      /**
       * @deprecated Superseded by `purse`. Retained only so the migration can
       * read it — Foundry prunes keys absent from the schema, so removing this
       * outright would make the old value unreadable and silently lost. Null
       * once migrated; delete the field once no world holds a number here.
       */
      savings: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
    });

    /* ── House ──
     * A vislae's home and the neighbourhood around it; the fan sheet pairs the
     * two, and in play they are consulted together. */
    const house = new fields.SchemaField({
      name:         new fields.StringField({ required: false, initial: "" }),
      type:         new fields.StringField({ required: false, initial: "" }),
      level:        new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 10 }),
      augments:     new fields.StringField({ required: false, initial: "" }),
      secrets:      new fields.HTMLField({ required: false, initial: "" }),
      neighborhood: new fields.StringField({ required: false, initial: "" }),
      notes:        new fields.HTMLField({ required: false, initial: "" }),
    });

    /* ── Rest Tracking ── */
    const rests = new fields.SchemaField({
      quickUsed:  new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 2 }),
      tenMinUsed: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 1 }),
      hourUsed:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 1 }),
    });

    /* ── The Maker's work ──
     * What is on the bench, if anything. A Maker works one thing at a time and
     * a commission runs for weeks of game time, so this is state that has to
     * survive being put down and picked up again.
     *
     * Kept on the character rather than as an item of its own. A half-finished
     * work is not a thing a vislae owns — it is something they are in the
     * middle of, like an unhealed Wound or a spell held in mind, and those live
     * here too. It also means the Magic tab can show the state of the bench
     * beside everything else a Maker would consult, which is where somebody
     * with time and materials goes looking for it.
     *
     * `node` is the whole of "is there work": it names the box of the Matrix the
     * process is resting on, and is empty when the bench is clear. Every other
     * field is meaningless without it.
     */
    const making = new fields.SchemaField({
      /** What is being made, in the Maker's own words. */
      effect:     new fields.StringField({ required: false, initial: "" }),
      /** Off the Effects by Level table, before the item kind modifies it. */
      effectLevel: new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      /** A key of CONFIG.ISUN.makerItemKinds — what is being made, and so how
       *  long its magic lasts, which is what the modifier turns on. */
      kind:       new fields.StringField({ required: false, initial: "" }),

      /** What the item ends up being: the Sorcery invested, and the level the
       *  material must match. */
      level:      new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      /** What the challenges actually climb towards, which is lower than the
       *  level when a side effect was accepted in advance to make it easier. */
      target:     new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      /** Paid for by hurrying: every day shaved raises every challenge by one. */
      challengeBonus: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),

      /** Where in the Matrix the work is resting. Empty means a clear bench. */
      node:       new fields.StringField({ required: false, initial: "" }),
      /** The chart's working level, which climbs as components go in. */
      x:          new fields.NumberField({ required: true, initial: 1, integer: true, min: 0 }),
      /** Challenges failed, because a day is owed for each of them. */
      failures:   new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      /** "minor" and "major", in the order the process inflicted them. */
      sideEffects: new fields.ArrayField(new fields.StringField({ required: true })),
      /** Every box the work has passed through and the answer it took, so a
       *  process picked up weeks later can say how it got where it is. */
      history: new fields.ArrayField(new fields.SchemaField({
        node:   new fields.StringField({ required: false, initial: "" }),
        answer: new fields.StringField({ required: false, initial: "" }),
        x:      new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
      })),
      /** The day the work began, against `meta.day`, so the sheet can say how
       *  long it has been on the bench rather than only how long it needs. */
      startedDay: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),

    });

    /* ── Limit overrides ──
     * The effective cap is derived (base + item contributions + override).
     * These are the GM's manual escape hatch for entitlements the system does
     * not yet compute — null means "no override", not zero. */
    const nullableCap = () => new fields.NumberField({
      required: false, nullable: true, initial: null, integer: true, min: 0
    });

    const limitOverrides = new fields.SchemaField({
      ephemera:       nullableCap(),
      incantations:   nullableCap(),
      objectsOfPower: nullableCap(),
      arcs:           nullableCap(),
    });

    /* ── Narrative ──
     * Prompts a vislae is actually asked at the table, kept apart rather than
     * folded into one biography blob. "Shadow life" is the exile before
     * returning to the Actuality; "memories" is a prompt rather than a rules
     * term, but earns its place for the same reason the others do. */
    const titledEntry = () => new fields.SchemaField({
      title:       new fields.StringField({ required: false, initial: "" }),
      description: new fields.StringField({ required: false, initial: "" }),
    });

    const narrative = new fields.SchemaField({
      appearance:  new fields.HTMLField({ required: false, initial: "" }),
      quirk:       new fields.StringField({ required: false, initial: "" }),
      shadowLife:  new fields.HTMLField({ required: false, initial: "" }),
      memories:    new fields.ArrayField(titledEntry()),
      personality: new fields.ArrayField(titledEntry()),
    });

    /* ── Player ── */
    const player = new fields.SchemaField({
      name:    new fields.StringField({ required: false, initial: "" }),
      rpStyle: new fields.StringField({ required: false, initial: "" }),
    });

    /* ── Biography ── */
    const biography = new fields.HTMLField({ required: false, initial: "" });

    return { stats, status, advancement, meta, economy, house, rests, limitOverrides,
             making, incantations, narrative, player, biography };
  }
}
