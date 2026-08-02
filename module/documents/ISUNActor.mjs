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
    await super._preUpdate(changed, options, user);
    
    if (this.type === "Vislae") {
      this._handleVislaeInjuryOverflow(changed);
    }
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    const system = this.system;

    if (this.type === "Vislae") {
      this._prepareVislaeData(system);
    }
  }

  _handleVislaeInjuryOverflow(changed) {
    const currentStatus = this.system.status;
    const changedStatus = changed.system?.status || {};
    
    const newPhysicalInjuries = changedStatus.injuries?.physical ?? currentStatus.injuries.physical;
    const newMentalInjuries = changedStatus.injuries?.mental ?? currentStatus.injuries.mental;

    const updates = {};
    
    if (newPhysicalInjuries >= 3) {
      const extraWounds = Math.floor(newPhysicalInjuries / 3);
      const currentWounds = changedStatus.wounds?.value ?? currentStatus.wounds.value;
      const maxWounds = currentStatus.wounds.max;
      
      updates["system.status.wounds.value"] = Math.min(maxWounds, currentWounds + extraWounds);
      updates["system.status.injuries.physical"] = newPhysicalInjuries % 3;
    }
    
    if (newMentalInjuries >= 3) {
      const extraAnguish = Math.floor(newMentalInjuries / 3);
      const currentAnguish = changedStatus.anguish?.value ?? currentStatus.anguish.value;
      const maxAnguish = currentStatus.anguish.max;
      
      updates["system.status.anguish.value"] = Math.min(maxAnguish, currentAnguish + extraAnguish);
      updates["system.status.injuries.mental"] = newMentalInjuries % 3;
    }

    if (Object.keys(updates).length > 0) {
      this.updateSource(updates);
    }
  }

  /**
   * Derivation logic for Vislae characters
   */
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

  _prepareVislaeData(system) {
    this._prepareLimits(system);

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