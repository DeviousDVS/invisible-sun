/**
 * Extend the base Actor document to support custom derivation logic.
 */
import * as pools from "../helpers/pools.mjs";
import * as vance from "../helpers/vance.mjs";
import * as matrix from "../helpers/matrix.mjs";
import * as apostate from "../helpers/apostate.mjs";

export class ISUNActor extends Actor {
  
  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    
    // Set default icons based on actor type
    if (!data.img || data.img === "icons/svg/mystery-man.svg") {
      const defaultIcons = CONFIG.ISUN?.actorTypeIcons || {};
      const img = defaultIcons[this.type];
      if (img) {
        this.updateSource({ img });
      }
    }
    
    /* A quirk to start from. "Vislae are odd and varied creatures... You should
     * choose one from the following list of quirks or use these as examples to
     * make up your own" (The Key, p13531) — so this is a suggestion already in
     * the box, not a decision made for the player, and the field stays free
     * text for them to replace.
     *
     * Only when the sheet arrives without one: a duplicated or imported
     * character brings its own, and overwriting that would lose it.
     *
     * The book adds that "two characters should never have the same quirk", so
     * those already in use are passed over while any remain. */
    if (this.type === "Vislae" && !data.system?.narrative?.quirk) {
      const all = CONFIG.ISUN?.quirks ?? [];
      if (all.length) {
        const taken = new Set(game.actors
          ?.filter(a => a.type === "Vislae")
          .map(a => a.system?.narrative?.quirk)
          .filter(Boolean) ?? []);
        const free = all.filter(q => !taken.has(q));
        const pool = free.length ? free : all;
        const quirk = pool[Math.floor(Math.random() * pool.length)];
        this.updateSource({ "system.narrative.quirk": quirk });
      }
    }

    // Set default token disposition
    if (this.type === "Vislae") {
      this.updateSource({ "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY });
    } else if (this.type === "Creature") {
      this.updateSource({ "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.HOSTILE });
    } else if (this.type === "NPC") {
      this.updateSource({ "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.NEUTRAL });
    }
  }

  /** @override */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;

    // Convert a track that has been filled by direct editing. Damage applied
    // through applyDamage() has already converted; this is the safety net for
    // someone ticking boxes on the sheet.
    this._convertFilledInjuries(changed);
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    const system = this.system;

    this._prepareHealth(system);

    if (this.type === "Vislae") {
      this._prepareVislaeData(system);
    }
  }

  /**
   * Derive scourges and the state of the Injury track.
   *
   * A scourge is a lingering vex sitting in a pool: −1 to venture for every
   * action drawing on that pool (The Gate, glossary). Wounds put one in every
   * Certes pool and Anguish one in every Qualia pool, per point sustained, so
   * these are computed per pool rather than held as a single number.
   */
  _prepareHealth(system) {
    const h = this.type === "Vislae" ? system.status : system.health;
    if (!h) return;

    const threshold = this.injuryThreshold;
    const track = h.injuries ?? [];
    h.injuryProgress = {
      count: track.length,
      threshold,
      // What the set would become if the next Injury landed now.
      pending: track.length ? (track[track.length - 1] === "mental" ? "anguish" : "wounds") : null
    };

    // Three Wounds is death. Three Anguish is a GM call among catatonia,
    // madness, utter suggestibility or death, so it is only flagged.
    //
    // Above the split because it is true of anything with a Wound track, not
    // of vislae alone — a creature at its maximum is as dead as a character is,
    // and the sheet that could not say so was reading a number the reader then
    // had to compare against a second number themselves. Derived, not applied:
    // nothing yet turns either into a token status effect.
    h.dead = h.wounds.value >= h.wounds.max;
    h.broken = h.anguish.value >= h.anguish.max;

    if (this.type !== "Vislae") {
      // "If an NPC gains a bene or a vex, this is a +1 bonus or -1 penalty to
      // the NPC's level" (The Gate, p1972) — an NPC has no pools for a scourge
      // to sit in, so it shifts their effective level instead.
      h.effectiveLevel = Math.max(0, (this.system.level ?? 0) - (h.scourge ?? 0));
      return;
    }

    // A pool's scourge is the sum of every scope that reaches it: one applied
    // to that pool alone, one to its half of the stats, one to all pools, and
    // one per Wound (Certes) or Anguish (Qualia).
    const wide = h.scourge ?? {};
    let worst = 0;
    for (const [group, fromHealth] of [["certes", h.wounds.value], ["qualia", h.anguish.value]]) {
      for (const p of Object.values(system.stats?.[group]?.pools ?? {})) {
        p.scourgeTotal = (p.scourge ?? 0) + (wide.all ?? 0) + (wide[group] ?? 0) + fromHealth;
        worst = Math.max(worst, p.scourgeTotal);
      }
    }

    // The Gate's Goetic pact turns on holding three scourges at once, so the
    // heaviest-hit pool is worth surfacing rather than making players count.
    h.worstScourge = worst;
  }

  /* ──────────────────────────────────────────────
   * INJURIES, WOUNDS AND ANGUISH
   * ────────────────────────────────────────────── */

  /** Where this actor's health lives: Vislae use `status`, others `health`. */
  get healthPath() {
    return this.type === "Vislae" ? "system.status" : "system.health";
  }

  get health() {
    return this.type === "Vislae" ? this.system.status : this.system.health;
  }

  /**
   * How many Injuries this actor takes before one becomes a Wound or Anguish.
   *
   * Three for a vislae. Teratology scales it by level for NPCs and creatures —
   * level 1–2 take a Wound after only one or two, level 6 and above after four
   * to six — so an explicit threshold wins, and otherwise it derives from level.
   */
  get injuryThreshold() {
    const h = this.health;
    if (Number.isInteger(h?.injuryThreshold)) return h.injuryThreshold;
    if (this.type === "Vislae") return 3;
    const level = this.system.level ?? 1;
    if (level <= 2) return 2;
    if (level >= 6) return 5;
    return 3;
  }

  /**
   * Fold any completed sets of Injuries into Wounds or Anguish.
   *
   * The last Injury of each set decides which it becomes (The Gate, p2547):
   * "the third Injury sustained determines whether the Injuries translate to a
   * Wound or an Anguish", so two mental plus one physical is a Wound.
   *
   * Mutates `changed` rather than calling updateSource, which is what
   * _preUpdate expects.
   */
  _convertFilledInjuries(changed) {
    const path = this.healthPath;
    const h = this.health;
    if (!h) return;

    const incoming = foundry.utils.getProperty(changed, `${path}.injuries`);
    let track = [...(incoming ?? h.injuries ?? [])];
    const threshold = this.injuryThreshold;
    if (track.length < threshold) return;

    let wounds = foundry.utils.getProperty(changed, `${path}.wounds.value`) ?? h.wounds.value;
    let anguish = foundry.utils.getProperty(changed, `${path}.anguish.value`) ?? h.anguish.value;

    while (track.length >= threshold) {
      const set = track.splice(0, threshold);
      if (set[set.length - 1] === "mental") anguish = Math.min(h.anguish.max, anguish + 1);
      else wounds = Math.min(h.wounds.max, wounds + 1);
    }

    foundry.utils.setProperty(changed, `${path}.injuries`, track);
    foundry.utils.setProperty(changed, `${path}.wounds.value`, wounds);
    foundry.utils.setProperty(changed, `${path}.anguish.value`, anguish);
  }

  /* ──────────────────────────────────────────────
   * RESTS AND RECOVERY
   * ────────────────────────────────────────────── */

  /**
   * The four rests available each day: two that cost only an action, one of ten
   * minutes and one of an hour, usable in any order (The Key, p29). Each resets
   * a single pool; the two longer ones may instead recover a Wound or an
   * Anguish (The Gate, p2606).
   */
  static REST_TYPES = {
    quick:  { field: "quickUsed",  max: 2, healsHealth: false },
    tenMin: { field: "tenMinUsed", max: 1, healsHealth: true },
    hour:   { field: "hourUsed",   max: 1, healsHealth: true },
  };

  /** How many of each rest remain today. */
  get restsRemaining() {
    const used = this.system.rests ?? {};
    return Object.fromEntries(Object.entries(ISUNActor.REST_TYPES)
      .map(([k, r]) => [k, Math.max(0, r.max - (used[r.field] ?? 0))]));
  }

  /** The cheapest rest still available, or null. */
  get cheapestRest() {
    return Object.keys(ISUNActor.REST_TYPES).find(k => this.restsRemaining[k] > 0) ?? null;
  }

  /**
   * Reset one pool, spending a rest unless told otherwise. Refreshing clears
   * any lingering vexes in that pool, but never a scourge — "you don't spend a
   * scourge... you have to get rid of it somehow" (The Key, p2242).
   */
  async restRefreshPool(group, poolKey, { restType = null, free = false } = {}) {
    const p = this.system.stats?.[group]?.pools?.[poolKey];
    if (!p) return null;

    const updates = {
      [`system.stats.${group}.pools.${poolKey}.value`]: p.max,
      [`system.stats.${group}.pools.${poolKey}.vex`]: 0
    };

    let used = null;
    if (!free) {
      used = restType ?? this.cheapestRest;
      if (!used) return { refused: "noRests" };
      const rest = ISUNActor.REST_TYPES[used];
      updates[`system.rests.${rest.field}`] = (this.system.rests[rest.field] ?? 0) + 1;
    }

    /* Read before the update, because after it they are what they became. What
     * the pool held, what it holds now, and what the refresh cleared are the
     * three things a table wants to hear; the caller announces them. */
    const before = { value: p.value ?? 0, vex: p.vex ?? 0 };

    await this.update(updates);
    return {
      refreshed: poolKey, group, restType: used, free,
      from: before.value, to: p.max ?? 0,
      gained: Math.max(0, (p.max ?? 0) - before.value),
      vexCleared: before.vex,
      restsLeft: this.restsRemaining
    };
  }

  /**
   * Spend a ten-minute or one-hour rest to recover 1 Wound or Anguish. The two
   * action-length rests cannot do this, and healing here never touches the
   * Injury track — the two are separate paths.
   */
  async restRecoverHealth(kind = "wounds", { restType = null } = {}) {
    const type = restType ?? Object.keys(ISUNActor.REST_TYPES)
      .find(k => ISUNActor.REST_TYPES[k].healsHealth && this.restsRemaining[k] > 0);
    if (!type || !ISUNActor.REST_TYPES[type].healsHealth) return { refused: "noRests" };

    const h = this.health;
    if (!h?.[kind]?.value) return { refused: "nothingToHeal" };

    const rest = ISUNActor.REST_TYPES[type];
    await this.update({
      [`${this.healthPath}.${kind}.value`]: Math.max(0, h[kind].value - 1),
      [`system.rests.${rest.field}`]: (this.system.rests[rest.field] ?? 0) + 1
    });
    return { healed: kind, restType: type };
  }

  /**
   * What the incantation ledger says, in the terms the rules are written in.
   *
   * Every day-bounded rule reads from here rather than walking the log itself,
   * so "today" means the same thing to all of them.
   *
   *   received   how many have been received today, against the daily cap:
   *              "You cannot get more incantations in a given day than your
   *              total ephemera limit" (The Way, p106)
   *   yesterday  names received on the previous day — "no vislae can gain the
   *              same incantation (either type) two days in a row"
   *   everKnown  every name ever received, which is what a conation
   *              incantation may be sought from
   */
  get incantationLedger() {
    const log = this.system.incantations?.log ?? [];
    const today = this.system.meta?.day ?? 1;
    const cap = this.system.limits?.ephemera?.value ?? 0;
    const received = log.filter(e => e.day === today);

    return {
      day: today,
      received: received.length,
      receivedToday: received.map(e => e.name),
      // A cap of zero would be a character with no ephemera limit at all, not
      // one forbidden to meditate, so it is left to the limit check to refuse.
      dailyCap: cap,
      atDailyCap: cap > 0 && received.length >= cap,
      yesterday: log.filter(e => e.day === today - 1).map(e => e.name),
      everKnown: [...new Map(log.map(e => [e.name.toLowerCase(), e])).values()],
      hoursToday: this.system.incantations?.hoursToday ?? 0,
    };
  }

  /**
   * The ceiling on a conation incantation.
   *
   * "Either way, the conation incantation cannot be of a higher level than the
   * highest-level spell the vislae knows" (The Way, p106). A vislae who knows
   * no spells therefore cannot seek one at all — which is a real consequence
   * of the rule and not an edge case to paper over, so it returns 0 rather
   * than falling back to something permissive.
   */
  get highestSpellLevel() {
    return this.items.filter(i => i.type === "Spell")
      .reduce((max, s) => Math.max(max, Number(s.system?.level) || 0), 0);
  }

  /**
   * Write an incantation into the ledger, and count the hour it took.
   *
   * "It takes about an hour to receive an incantation" — either kind — so the
   * hour is charged here rather than by the caller, which would leave the two
   * able to disagree.
   */
  async recordIncantation({ name, uuid = "", kind = "acquiescent" }) {
    const log = [...(this.system.incantations?.log ?? [])];
    log.push({ name, uuid, kind, day: this.system.meta?.day ?? 1 });
    await this.update({
      "system.incantations.log": log,
      "system.incantations.hoursToday": (this.system.incantations?.hoursToday ?? 0) + 1,
    });
    return log.length;
  }

  /**
   * An hour of meditation that produced nothing.
   *
   * Asking for a type is a blind ask, and a blind ask has to be able to fail
   * at a cost. If a fruitless hour were free, a vislae could work through
   * every type in turn and learn exactly what was within reach without
   * spending anything — which is precisely the knowledge the blindness is
   * there to withhold.
   */
  async spendMeditationHour() {
    const hours = (this.system.incantations?.hoursToday ?? 0) + 1;
    await this.update({ "system.incantations.hoursToday": hours });
    return hours;
  }

  /**
   * A night's sleep: every pool back to its starting value, vexes cleared, the
   * day's rests restored, and 1 Wound or Anguish recovered (The Key, p2300;
   * The Gate, p2609). Scourges persist — they are not what resting removes.
   */
  async newDay({ recover = "wounds" } = {}) {
    const updates = { "system.rests.quickUsed": 0, "system.rests.tenMinUsed": 0, "system.rests.hourUsed": 0 };

    /* The sun rising is what the incantation rules are counted against — no
     * more received in a day than the ephemera limit, never the same one two
     * days running — so the day advances here and the hours meditated reset
     * with it. The ledger itself is kept: it is the character's history, not
     * the day's tally. */
    if (this.system.meta?.day !== undefined) {
      updates["system.meta.day"] = (this.system.meta.day ?? 1) + 1;
      updates["system.incantations.hoursToday"] = 0;
    }

    for (const group of ["certes", "qualia"]) {
      for (const [key, p] of Object.entries(this.system.stats?.[group]?.pools ?? {})) {
        updates[`system.stats.${group}.pools.${key}.value`] = p.max;
        updates[`system.stats.${group}.pools.${key}.vex`] = 0;
      }
    }

    const h = this.health;
    if (recover && h?.[recover]?.value) {
      updates[`${this.healthPath}.${recover}.value`] = Math.max(0, h[recover].value - 1);
    }

    await this.update(updates);
    return { rested: true };
  }

  /**
   * Apply damage through the full sequence (The Gate, p2405–2470).
   *
   * Armor reduces physical damage point by point before anything is recorded;
   * it does nothing against mental damage. Some powerful magical attacks
   * inflict Wounds or Anguish directly and bypass both armor and the track —
   * pass `direct` for those.
   *
   * @param {object} options
   * @param {number} options.amount    points of damage
   * @param {"physical"|"mental"} options.type
   * @param {boolean} [options.ignoreArmor]
   * @param {boolean} [options.direct] inflict Wounds/Anguish rather than Injuries
   */
  async applyDamage({ amount = 0, type = "physical", ignoreArmor = false, direct = false } = {}) {
    const h = this.health;
    const path = this.healthPath;
    if (!h || amount <= 0) return null;

    if (direct) {
      const key = type === "mental" ? "anguish" : "wounds";
      const value = Math.min(h[key].max, h[key].value + amount);
      await this.update({ [`${path}.${key}.value`]: value });
      /* Reported the same way the converting path reports, so a Wound a flux
       * inflicts can be answered like a Wound a blow inflicts. It used to say
       * only how much was dealt, which is why nothing could offer the bene
       * window for one: there was no count of what had actually arrived. */
      return this.#damageDone({
        absorbed: 0, injuries: 0, direct: amount,
        newWounds: key === "wounds" ? value - h.wounds.value : 0,
        newAnguish: key === "anguish" ? value - h.anguish.value : 0
      });
    }

    // Armor is physical only; Ward is the magical counterpart and does not
    // reduce damage point-for-point, so it is not applied here.
    const armor = (type === "physical" && !ignoreArmor) ? (this.system.armor ?? h.armor ?? 0) : 0;
    const got = Math.max(0, amount - armor);
    if (!got) return this.#damageDone({ absorbed: amount, injuries: 0, direct: 0 });

    const before = { wounds: h.wounds.value, anguish: h.anguish.value };
    await this.update({ [`${path}.injuries`]: [...(h.injuries ?? []), ...Array(got).fill(type)] });

    // Report any conversion the damage caused, so a caller can offer the
    // bene-negation window while it is still open.
    const after = this.health;
    return this.#damageDone({
      absorbed: Math.min(armor, amount),
      injuries: got,
      direct: 0,
      newWounds: after.wounds.value - before.wounds,
      newAnguish: after.anguish.value - before.anguish
    });
  }

  /**
   * Announce what damage did, and hand the result back to the caller.
   *
   * A hook rather than a call, because the window that offers a bene to negate
   * a Wound is an application and this is a document: the layering forbids one
   * reaching for the other, and every caller remembering to offer it for itself
   * is what left a flux Wound landing in silence. One announcement here covers
   * the sheet's button, the injury pips, a flux and anything a macro does.
   *
   * Fired on the client that applied the damage, so one blow makes one offer
   * rather than one per person watching.
   */
  #damageDone(result) {
    if (result.newWounds || result.newAnguish) {
      Hooks.callAll("isun.damageApplied", this, result);
    }
    return result;
  }

  /**
   * Spend a bene to negate a Wound or an Anguish that has just landed.
   *
   * Physicality negates a Wound, Intellect an Anguish, and "a character cannot
   * use Intellect bene to negate Wounds at any time" (The Gate, p2508) — so the
   * pool is fixed by the kind, not chosen. This is only available as the damage
   * arrives: "once damage is sustained, a character cannot use Physicality to
   * negate a Wound" (The Gate, p2540). Enforcing that window is the caller's job.
   */
  async negateWithBene(kind = "wounds", { count = 1 } = {}) {
    const [group, poolKey] = kind === "anguish"
      ? ["qualia", "intellect"]
      : ["certes", "physicality"];

    const p = this.system.stats?.[group]?.pools?.[poolKey];
    const h = this.health;
    if (!p?.value) return { refused: "noBene", poolKey };
    if (!h?.[kind]?.value) return { refused: "nothingToNegate" };

    /* Several at once, under Expansive Endeavor, and in one update rather than
     * one per bene: three separate writes would let a sheet redraw between them
     * showing a character who had paid for a Wound they still had.
     *
     * Bounded here as well as by whatever asked. The pool cannot go past what
     * it holds and the track cannot go past what is on it — a request for more
     * than either takes what is there and no more. The cap that says how many
     * an *action* may spend belongs to the caller; this is only arithmetic. */
    const spend = Math.max(1, Math.min(Math.trunc(Number(count) || 1),
                                       p.value, h[kind].value));

    await this.update({
      [`system.stats.${group}.pools.${poolKey}.value`]: p.value - spend,
      [`${this.healthPath}.${kind}.value`]: h[kind].value - spend
    });
    return { negated: kind, spent: poolKey, count: spend };
  }

  /**
   * Heal Injuries that have not yet become Wounds or Anguish.
   *
   * Healing Injuries never touches a Wound or an Anguish: "A process or effect
   * that heals Injuries has no effect on Wounds or Anguish" (The Gate, p2468).
   */
  async healInjuries(count = 1) {
    const h = this.health;
    const track = [...(h?.injuries ?? [])];
    if (!track.length) return null;
    track.splice(-Math.min(count, track.length));
    return this.update({ [`${this.healthPath}.injuries`]: track });
  }

  /* ────────────────────────────────────────────── */

  /**
   * A stat's score is the sum of what its pools hold, and what remains to be
   * placed in each.
   *
   * "The points in these scores are always divided into the pools for each
   * stat. Points not put in a pool serve no purpose" (The Key, p1875), so a
   * stored score could only agree with the pools by accident. A pool's `max` is
   * what it refreshes to, which is the allocation; `value` is the bene in it
   * now and moves during play.
   *
   * The budgets do not mix. A heart's Certes belongs to Certes and its Qualia
   * to Qualia; only the 6 it leaves free may go either way. So a stat spends
   * its own points first and reaches for the shared reserve after — which also
   * gives the right answer on the way back, since a point taken out of a pool
   * returns to the reserve before it returns to the stat.
   */
  _prepareStatAllocation(system) {
    const granted = system.stats?.statPoints ?? {};
    const spent = {};
    for (const stat of ["certes", "qualia"]) {
      const pools = system.stats?.[stat]?.pools ?? {};
      spent[stat] = Object.values(pools).reduce((n, p) => n + (p.max ?? 0), 0);
      system.stats[stat].value = spent[stat];
    }

    // Each stat draws on its own grant first; whatever it could not cover came
    // out of the shared reserve.
    const fromOwn = {
      certes: Math.min(spent.certes, granted.certes ?? 0),
      qualia: Math.min(spent.qualia, granted.qualia ?? 0),
    };
    const fromShared = (spent.certes - fromOwn.certes) + (spent.qualia - fromOwn.qualia);

    system.stats.unspent = {
      certes: Math.max(0, (granted.certes ?? 0) - fromOwn.certes),
      qualia: Math.max(0, (granted.qualia ?? 0) - fromOwn.qualia),
      shared: Math.max(0, (granted.shared ?? 0) - fromShared),
    };
    // What a given stat could still place: its own, plus the shared reserve.
    system.stats.canPlace = {
      certes: system.stats.unspent.certes + system.stats.unspent.shared,
      qualia: system.stats.unspent.qualia + system.stats.unspent.shared,
    };
    system.stats.unspentPoints =
      system.stats.unspent.certes + system.stats.unspent.qualia + system.stats.unspent.shared;
  }

  /**
   * What the degrees a vislae has attained entitle them to.
   *
   * "Your degree determines how many ephemera a vislae can bear at a time,
   * and — at higher degrees — how many of these can be incantations you choose
   * rather than incantations granted to you" (The Key, p36). A Vance bears
   * three at 1st degree, four at 4th and five at 6th; a Maker four, five and
   * six, of which only two, two and three may be incantations.
   *
   * None of that is a flat item grant, because a 1st-degree and a 6th-degree
   * Vance hold the same Order item — so it cannot come from `grants.limits`
   * and has to be read against the degree actually held.
   *
   * Each ability restates the total rather than an increment, so the highest
   * attained wins rather than the sum. Reading the ladder rather than
   * hardcoding a table means an order whose degrees a GM has edited is followed
   * instead of overridden.
   *
   * The numbers come from `ability.grants`, extracted once at import time.
   * They used to be read here, by regexes run over the description on every
   * data preparation — which worked, and would have failed silently the first
   * time anyone reworded a sentence or translated the compendium: the caps
   * would simply drop back to the base with nothing said. See
   * `module/importers/orders.mjs`.
   *
   * An Apostate has no ladder, so theirs are read off the two lists instead —
   * the starting package, which is granted entire, and whichever of the open
   * list they have taken. That is the same question with a different index, so
   * it answers here rather than anywhere else: "Ephemera Use" and "Incantation"
   * carry real entitlements and both must reach the limits.
   */
  degreeEntitlements() {
    const order = this.items.find(i => i.type === "Order");
    const held = this.system.meta?.orderDegree ?? 0;
    const out = { ephemera: 0, incantations: 0, conation: 0 };

    if (this.orderKey === "apostate") {
      return apostate.entitlements(order, this.system.meta?.apostateAbilities ?? []);
    }

    for (const degree of order?.system?.degrees ?? []) {
      if ((degree.degree ?? 0) > held) continue;
      for (const ability of degree.abilities ?? []) {
        const grants = ability.grants;
        if (!grants) continue;
        for (const key of Object.keys(out)) {
          out[key] = Math.max(out[key], grants[key] ?? 0);
        }
      }
    }
    return out;
  }

  /**
   * Derive the effective caps as base + item contributions + GM override.
   *
   * Any owned item may raise a limit by declaring `system.grants.limits.<key>`.
   * The Magical Management secret does — "two additional objects of power above
   * and beyond the normal limit of three at a time" (The Way, p90) — and the
   * summing is general, so anything else that entitles its owner to more only
   * has to supply the number.
   *
   * Caps are advisory: `over` is reported for the sheet to flag, and nothing is
   * blocked. A limit we compute too low must never stop a player recording what
   * the rules allow.
   */
  _prepareLimits(system) {
    const base = { ...(CONFIG.ISUN?.limits ?? {}) };

    // The arc limit is GM advice rather than a rule, so the table can set it.
    const arcSetting = game.settings?.get?.("invisible-sun", "arcLimit");
    if (Number.isInteger(arcSetting)) base.arcs = arcSetting;

    /* A degree states a total, not a bonus, so it replaces the configured base
     * rather than adding to it. An Apostate has no degrees at all, so a stated
     * value of zero means "the ladder says nothing" and the base stands.
     *
     * The two are not the same kind of number. How many ephemera a vislae can
     * bear is an entitlement that grows, so it only ever raises the base. How
     * many of them may be incantations is a restriction — "but only two of
     * these can be incantations" — so it replaces the base even downwards, or
     * a Maker would be credited with three when the book allows two. */
    const byDegree = this.degreeEntitlements();
    if (byDegree.ephemera) base.ephemera = Math.max(base.ephemera ?? 0, byDegree.ephemera);
    if (byDegree.incantations) base.incantations = byDegree.incantations;

    // Sum contributions from owned items.
    const mods = { objectsOfPower: 0, ephemera: 0, incantations: 0, arcs: 0 };
    for (const item of this.items) {
      const granted = item.system?.grants?.limits;
      if (!granted) continue;
      for (const key of Object.keys(mods)) {
        const n = Number(granted[key]);
        if (Number.isFinite(n)) mods[key] += n;
      }
    }

    const count = type => this.items.filter(i => i.type === type).length;
    const incantations = count("Incantation");

    // Kindled items count toward neither limit (The Key, p16051).
    const objectsOfPower = this.items.filter(i =>
      i.type === "ObjectOfPower" && i.system?.objectType !== "kindled").length;

    const used = {
      // Incantations are held *within* the ephemera limit, not beside it.
      ephemera: count("Ephemera") + incantations,
      incantations,
      objectsOfPower,
      arcs: this.items.filter(i => i.type === "CharacterArc" && i.system?.status === "active").length,
    };

    const overrides = system.limitOverrides ?? {};
    system.limits = {};

    for (const key of Object.keys(mods)) {
      const override = overrides[key];
      const value = Number.isInteger(override) ? override : (base[key] ?? 0) + mods[key];
      system.limits[key] = {
        base: base[key] ?? 0,
        mods: mods[key],
        override: Number.isInteger(override) ? override : null,
        value,
        used: used[key],
        over: used[key] > value,
      };
    }

    /* How many of those incantations may be ones the character chose. Not a
     * cap on holdings like the others — it divides the incantations held into
     * the granted and the chosen — so it is derived here but counted from the
     * flag that marks a chosen one. */
    const conationHeld = this.items.filter(i => i.type === "Incantation"
      && i.getFlag("invisible-sun", "conation")).length;
    system.limits.conation = {
      base: 0, mods: 0, override: null,
      value: byDegree.conation,
      used: conationHeld,
      over: conationHeld > byDegree.conation,
    };
  }

  /**
   * Derive spendable wealth and the bloodsilver curse level.
   *
   * Only the mundane orb economy is totalled. Magecoins and demontears are
   * deliberately excluded: The Key is explicit that magical goods are never
   * paid for with orbs and that no standard exchange rate exists, so summing
   * the two together would invent a number the game refuses to supply.
   * Bloodsilver is excluded too — it is worth about a crystal orb but is
   * widely refused, so counting it as spendable would overstate what a
   * character can actually buy.
   */
  _prepareEconomy(system) {
    const purse = system.economy?.purse ?? {};
    const currencies = CONFIG.ISUN?.currencies ?? {};

    let glass = 0;
    for (const [key, def] of Object.entries(currencies)) {
      if (def.economy !== "mundane" || def.spendable === false) continue;
      glass += (purse[key] ?? 0) * def.glass;
    }

    system.economy.wealth = {
      glass: Math.floor(glass),
      // Largest-denomination-first breakdown, for display.
      gem:     Math.floor(glass / 10000),
      crystal: Math.floor((glass % 10000) / 100),
      remainder: Math.floor(glass % 100),
    };

    const coins = purse.bloodsilver ?? 0;
    system.economy.bloodsilver = {
      coins,
      challenge: CONFIG.ISUN?.bloodsilverChallenge?.(coins) ?? 0,
      atRisk: coins > 1,
    };
  }

  /**
   * What the character could spend, and what it would cost them.
   *
   * Crux is not held. A Joy and a Despair together are worth one, and the
   * exchange only happens when something is bought — so what a character "has"
   * is however many pairs they are sitting on, and spending three Crux spends
   * three Joy and three Despair.
   *
   * `spendCrux` is the counterpart, and the two belong together: anything that
   * charges Crux should go through it rather than reaching for the pools.
   */
  _prepareAdvancement(system) {
    const a = system.advancement ?? {};
    a.cruxAvailable = Math.min(a.joy ?? 0, a.despair ?? 0);
    // Which of the two is holding them back, for the sheet to say so.
    a.cruxShortOf = (a.joy ?? 0) === (a.despair ?? 0) ? null
      : ((a.joy ?? 0) < (a.despair ?? 0) ? "joy" : "despair");
  }

  /**
   * Charge Crux by spending the Joy and Despair that back it.
   *
   * @returns {object} `{ spent }`, or `{ refused: "crux", need, have }`.
   */
  async spendCrux(cost) {
    const a = this.system.advancement ?? {};
    const have = a.cruxAvailable ?? 0;
    if (cost > have) return { refused: "crux", need: cost, have };
    if (cost <= 0) return { spent: 0 };

    await this.update({
      "system.advancement.joy": (a.joy ?? 0) - cost,
      "system.advancement.despair": (a.despair ?? 0) - cost,
    });
    return { spent: cost };
  }

  /**
   * Put vex into a pool.
   *
   * The inverse of what ChallengeCard does, and until now the system had only
   * that half: a vex could be spent down and cleared by a rest, but nothing
   * could give one. A flux can — "You gain 1 vex to Sorcery", "Sudden pain adds
   * 3 vex to your Movement pool" (The Way) — and so, in time, can a scourge or
   * a curse.
   *
   * Takes the pool's name alone rather than its stat, because that is how the
   * books name it: they say Sorcery, never "the Qualia pool Sorcery". Which
   * stat holds it is looked up here so no caller has to know.
   *
   * @param {string} poolKey  accuracy, movement, sorcery…
   * @param {number} [amount] vex to add; negative removes, never below zero
   * @returns {Promise<number|null>} the pool's vex after, or null if no such pool
   */
  async addVex(poolKey, amount = 1) {
    const found = this.#findPool(poolKey);
    if (!found) return null;

    const vex = Math.max(0, (found.pool.vex ?? 0) + amount);
    await this.update({ [`${found.path}.vex`]: vex });
    return vex;
  }

  /**
   * Move the bene held in a pool.
   *
   * Not the allocation — that is what a pool refreshes to and belongs to
   * advancement. This is what is in it now, which is what a flux takes when it
   * says "You lose 1 Sortilege out of your pool" (The Way).
   *
   * @param {string} poolKey
   * @param {number} delta  negative to spend
   * @returns {Promise<number|null>} what the pool holds after
   */
  async adjustPool(poolKey, delta) {
    const found = this.#findPool(poolKey);
    if (!found) return null;

    const value = Math.min(found.pool.max ?? 0, Math.max(0, (found.pool.value ?? 0) + delta));
    await this.update({ [`${found.path}.value`]: value });
    return value;
  }

  /**
   * A pool by name alone, with the stat that holds it.
   *
   * The books name pools without their stat — Sorcery, never "the Qualia pool
   * Sorcery" — so anything taking a pool from a rule has to work this out, and
   * it should not be worked out twice. It is helpers/pools.mjs that works it
   * out; this is the name the methods below already call.
   */
  #findPool(poolKey) {
    return pools.find(this, poolKey);
  }

  /**
   * Which of the five orders this character belongs to, as a config key.
   *
   * Read from the Order item the character holds, falling back to the free-text
   * `meta.orderType` for a sheet filled in by hand before the item was dropped
   * on. Matched by containment because the item is named "Vance" while the key
   * is "vance", and because a world may rename it.
   *
   * Lives here rather than in the sheet so that derivation and display cannot
   * disagree about what order somebody is in — the sheet used to work this out
   * for itself, which was fine until something other than the sheet needed to
   * know.
   */
  get orderKey() {
    const names = Object.keys(CONFIG.ISUN?.orders ?? {});
    const source = (this.items.find(i => i.type === "Order")?.name
      || this.system?.meta?.orderType || "").toLowerCase();
    return names.find(k => source.includes(k)) ?? "";
  }

  /**
   * What the Vance is carrying in mind, and what room is left.
   *
   * Only a Vance has one. `system.mind` is null for everybody else, which the
   * sheet reads as "draw nothing" rather than as an empty mind — a Weaver with
   * a 0/0 capacity bar would be stating a limit that does not apply to them.
   *
   * The arithmetic is in helpers/vance.mjs, which is pure and tested; this
   * only decides who it applies to and hands it the spells.
   */
  _prepareVancianMind(system) {
    system.mind = this.orderKey === "vance"
      ? vance.mindState(system.meta?.orderDegree ?? 0, this.items)
      : null;
  }

  /**
   * What is on a Maker's bench, worked out for the sheet to show.
   *
   * The same shape as the Vance's mind, and for the same reason: only one order
   * has it, so `system.bench` is null for everybody else and the Magic tab draws
   * nothing rather than an empty workshop. A Weaver shown "0 of 4 components"
   * would be told a process that is not theirs.
   *
   * Null too for a Maker whose bench is clear, which is the commoner case — the
   * panel appears when there is work and goes away when the work is done.
   *
   * The Sorcery the work holds is reported rather than deducted. "For the
   * duration of the process, the Maker's Sorcery pool faces this deduction"
   * (The Way, p59) — but a scourge lowers a pool too, and this system has always
   * shown that beside the pool rather than rewriting its maximum. Reported keeps
   * it reversible, which matters for something that sits open across weeks of
   * game time and several sessions.
   */
  _prepareMakersBench(system) {
    const making = system.making ?? {};
    if (this.orderKey !== "maker" || !making.node) {
      system.bench = null;
      return;
    }

    const at = matrix.step(making);
    system.bench = {
      ...at,
      effect: making.effect,
      level: making.level,
      target: making.target,
      x: making.x,
      failures: making.failures,
      sideEffects: [...(making.sideEffects ?? [])],
      /* Chosen here rather than in the template, which has no way to say "one
       * flaw" without a helper that exists for this one line. */
      flawsLabel: (making.sideEffects ?? []).length === 1
        ? "ISUN.BenchFlawOne" : "ISUN.BenchFlaws",
      /* What the flaws actually are, for the tooltip on the count. A count on
       * its own tells a Maker the item is worth less and not what is wrong
       * with it. Empty where the side-effect tables have not been imported,
       * and the tooltip then says only what it said before. */
      flawText: (making.sideEffects ?? []).map(f => f.text).filter(Boolean).join("; "),
      /* How far the working level has climbed towards what it is aiming at.
       * Capped, because a failure can carry it past the target. */
      percent: making.target ? Math.min(100, Math.round((making.x / making.target) * 100)) : 0,
      /* Held, not spent — see above. */
      sorceryHeld: making.level,
      days: matrix.daysFor({ level: making.level, failures: making.failures }).days,
      onBench: Math.max(0, (system.meta?.day ?? 0) - (making.startedDay ?? 0)),
      stepLabel: CONFIG.ISUN.makerNodeLabels?.[at.node] ?? at.node,
      finished: matrix.ended(making),
      /* Whether there is something to pick up. Two of the three endings leave
       * an item and one leaves wreckage, so a mishap offers nothing to take —
       * the bench is only cleared. */
      takeable: ["created", "randomEffect"].includes(matrix.ended(making)),
      /* What a finished work turned out to be — the mishap, or the effect of an
       * item nobody chose. Rolled once when the process ended and kept, so the
       * bench and the chat card say the same thing. */
      outcome: making.outcome ?? ""
    };
  }

  _prepareVislaeData(system) {
    this._prepareStatAllocation(system);
    this._prepareLimits(system);
    this._prepareEconomy(system);
    this._prepareAdvancement(system);
    this._prepareVancianMind(system);
    this._prepareMakersBench(system);
  }
}