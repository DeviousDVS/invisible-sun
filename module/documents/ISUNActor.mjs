/**
 * Extend the base Actor document to support custom derivation logic.
 */
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

    // Three Wounds is death. Three Anguish is a GM call among catatonia,
    // madness, utter suggestibility or death, so it is only flagged.
    h.dead = h.wounds.value >= h.wounds.max;
    h.broken = h.anguish.value >= h.anguish.max;
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

    if (!free) {
      const type = restType ?? this.cheapestRest;
      if (!type) return { refused: "noRests" };
      const rest = ISUNActor.REST_TYPES[type];
      updates[`system.rests.${rest.field}`] = (this.system.rests[rest.field] ?? 0) + 1;
    }

    await this.update(updates);
    return { refreshed: poolKey };
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
   * A night's sleep: every pool back to its starting value, vexes cleared, the
   * day's rests restored, and 1 Wound or Anguish recovered (The Key, p2300;
   * The Gate, p2609). Scourges persist — they are not what resting removes.
   */
  async newDay({ recover = "wounds" } = {}) {
    const updates = { "system.rests.quickUsed": 0, "system.rests.tenMinUsed": 0, "system.rests.hourUsed": 0 };

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
      return { absorbed: 0, injuries: 0, direct: amount };
    }

    // Armor is physical only; Ward is the magical counterpart and does not
    // reduce damage point-for-point, so it is not applied here.
    const armor = (type === "physical" && !ignoreArmor) ? (this.system.armor ?? h.armor ?? 0) : 0;
    const got = Math.max(0, amount - armor);
    if (!got) return { absorbed: amount, injuries: 0, direct: 0 };

    const before = { wounds: h.wounds.value, anguish: h.anguish.value };
    await this.update({ [`${path}.injuries`]: [...(h.injuries ?? []), ...Array(got).fill(type)] });

    // Report any conversion the damage caused, so a caller can offer the
    // bene-negation window while it is still open.
    const after = this.health;
    return {
      absorbed: Math.min(armor, amount),
      injuries: got,
      direct: 0,
      newWounds: after.wounds.value - before.wounds,
      newAnguish: after.anguish.value - before.anguish
    };
  }

  /**
   * Spend a bene to negate a Wound or an Anguish that has just landed.
   *
   * Physicality negates a Wound, Intellect an Anguish, and "a character cannot
   * use Intellect bene to negate Wounds at any time" (The Gate, p2508) — so the
   * pool is fixed by the kind, not chosen. This is only available as the damage
   * arrives: "once damage is sustained, a character cannot use Physicality to
   * negate a Wound" (p2540). Enforcing that window is the caller's job.
   */
  async negateWithBene(kind = "wounds") {
    const [group, poolKey] = kind === "anguish"
      ? ["qualia", "intellect"]
      : ["certes", "physicality"];

    const p = this.system.stats?.[group]?.pools?.[poolKey];
    const h = this.health;
    if (!p?.value) return { refused: "noBene", poolKey };
    if (!h?.[kind]?.value) return { refused: "nothingToNegate" };

    await this.update({
      [`system.stats.${group}.pools.${poolKey}.value`]: p.value - 1,
      [`${this.healthPath}.${kind}.value`]: h[kind].value - 1
    });
    return { negated: kind, spent: poolKey };
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
   * Derive the effective caps as base + item contributions + GM override.
   *
   * Any owned item may raise a limit by declaring `system.grants.limits.<key>`.
   * Nothing does so yet — the Magical Management secret, Maker degree
   * progression and forte abilities each need their item type modelled first —
   * but the summing is in place so those only have to supply the number.
   *
   * Caps are advisory: `over` is reported for the sheet to flag, and nothing is
   * blocked. A limit we compute too low must never stop a player recording what
   * the rules allow.
   */
  /**
   * A stat's score is the sum of what its pools hold, not a number of its own.
   *
   * "The points in these scores are always divided into the pools for each
   * stat. Points not put in a pool serve no purpose" (The Key, p1875) — so a
   * stored score could only ever agree with the pools by accident. A pool's
   * `max` is what it refreshes to, which is the allocation; `value` is the bene
   * currently in it and moves during play.
   *
   * The heart grants Certes and Qualia separately, but a point is a point once
   * it reaches a pool: assigning one of the free 6 to Certes and then into
   * Accuracy is the same as placing it in Accuracy directly. One budget
   * therefore covers both stats.
   */
  _prepareStatAllocation(system) {
    let allocated = 0;
    for (const stat of ["certes", "qualia"]) {
      const pools = system.stats?.[stat]?.pools ?? {};
      const sum = Object.values(pools).reduce((n, p) => n + (p.max ?? 0), 0);
      system.stats[stat].value = sum;
      allocated += sum;
    }
    system.stats.allocated = allocated;
    // Negative would mean pools hold more than was granted, which a GM editing
    // by hand can produce; there is nothing to place in that case either.
    system.stats.unspentPoints = Math.max(0, (system.stats.statPoints ?? 0) - allocated);
  }

  _prepareLimits(system) {
    const base = { ...(CONFIG.ISUN?.limits ?? {}) };

    // The arc limit is GM advice rather than a rule, so the table can set it.
    const arcSetting = game.settings?.get?.("invisible-sun", "arcLimit");
    if (Number.isInteger(arcSetting)) base.arcs = arcSetting;

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

  _prepareVislaeData(system) {
    this._prepareStatAllocation(system);
    this._prepareLimits(system);
    this._prepareEconomy(system);

    // 1. Crux Calculation: You can only have Crux equal to the pairs of Joy & Despair
    // Actually in IS, you "spend" Joy and Despair to get Crux, so this might be manually managed.
    // However, if we want to auto-calculate available crux pairs:
    // This is often manually managed, so we just ensure they are non-negative.
    
    
    // 3. Death/Incapacity Check
    const isDead = system.status.wounds.value >= system.status.wounds.max 
                || system.status.anguish.value >= system.status.anguish.max;
    
    // We could apply a status effect here for Dead/Incapacitated in the future
    
    // 4. Validate Pool Totals
    // Ensure the sum of Certes pool maxes doesn't exceed Certes value
    const certesPools = system.stats.certes.pools;
    const totalCertesMax = certesPools.accuracy.max + certesPools.movement.max + certesPools.physicality.max + certesPools.perception.max;
    if (totalCertesMax > system.stats.certes.value) {
      // In a real system we might warn the user, but for now we just compute it.
      // We don't forcefully overwrite it to avoid destroying user data during edit.
    }
  }
}