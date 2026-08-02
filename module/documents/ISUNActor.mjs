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

    if (this.type !== "Vislae") return;

    // Wounds scourge the body, Anguish the mind.
    for (const [group, source] of [["certes", h.wounds.value], ["qualia", h.anguish.value]]) {
      for (const p of Object.values(system.stats?.[group]?.pools ?? {})) {
        p.scourgeTotal = (p.scourge ?? 0) + source;
      }
    }

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

    const changed = { [`${path}.injuries`]: [...(h.injuries ?? []), ...Array(got).fill(type)] };
    await this.update(changed);
    return { absorbed: Math.min(armor, amount), injuries: got, direct: 0 };
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