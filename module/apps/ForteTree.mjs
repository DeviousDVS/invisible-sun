import { ISUN } from "../helpers/config.mjs";

/**
 * Invisible Sun — walking a forte's ability tree
 *
 * "Beginning with the starting ability (or, in some cases, one of the two
 * starting abilities at the top of each 'tree'), the lines show the possible
 * paths for attaining another. You must acquire the abilities along the given
 * paths, in order, although you can also move back to a point where the path
 * branched and make a choice you didn't choose the first time" (The Key,
 * p6405).
 *
 * So an ability is available when the character holds something that unlocks
 * it. Branching falls out of that: holding one ability opens every path leading
 * from it, and returning to an untaken branch works because the ability at the
 * fork is still held.
 *
 * A starting ability stays available whether or not the character already has
 * others. The top of the tree is itself a fork, and the book says so outright:
 * "If you choose Voice of the Serpent, you can later choose Bite of the
 * Serpent." Gating them on having none would close that off after the first
 * pick.
 *
 * Held abilities are matched by name. The compendium is rebuilt often enough
 * that ids are not stable across rebuilds, and the tree is drawn with names.
 */
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export class ForteTree {

  /**
   * Lay a forte's abilities out with what the character can do about each.
   *
   * @param {Item[]} abilities  the forte's abilities, as compendium documents
   * @param {Item[]} held       the ForteAbility items already on the actor
   * @param {number} crux       Crux the character has to spend
   * @returns {Array} one row per ability, in tier order
   */
  static layout(abilities, held, crux = 0) {
    const heldNames = new Set(held.map(i => norm(i.name)));
    const byName = new Map(abilities.map(a => [norm(a.name), a]));

    // An ability is a starting one when nothing in the forte unlocks it.
    const unlocked = new Set();
    for (const a of abilities) {
      for (const u of a.system.unlocks ?? []) unlocked.add(norm(u));
    }
    const isStart = (a) => !unlocked.has(norm(a.name));

    // What each ability needs: whatever unlocks it.
    const needs = new Map();
    for (const a of abilities) {
      for (const u of a.system.unlocks ?? []) {
        if (!needs.has(norm(u))) needs.set(norm(u), []);
        needs.get(norm(u)).push(a.name);
      }
    }

    const tiers = this.#tiers(abilities, byName);

    return abilities.map(a => {
      const key = norm(a.name);
      const owned = heldNames.has(key);
      const prereqs = needs.get(key) ?? [];
      // Any one prerequisite suffices — the paths are alternatives, not a set
      // to be collected. Two branches converging on an ability each open it.
      const opened = isStart(a) || prereqs.some(p => heldNames.has(norm(p)));
      const cost = ISUN.forteAbilityCrux(a.system.level ?? 1);

      return {
        id: a.id, uuid: a.uuid, name: a.name, img: a.img,
        level: a.system.level, levelText: a.system.levelText || String(a.system.level ?? ""),
        color: a.system.color, description: a.system.description,
        depletion: a.system.depletion,
        tier: tiers.get(key) ?? 0,
        unlocks: a.system.unlocks ?? [],
        prerequisites: prereqs,
        owned,
        starting: isStart(a),
        available: !owned && opened,
        affordable: crux >= cost,
        cost
      };
    }).sort((x, y) => x.tier - y.tier || x.name.localeCompare(y.name));
  }

  /** How deep each ability sits, so the tree can be drawn in rows. */
  static #tiers(abilities, byName) {
    const tier = new Map();
    const unlocked = new Set();
    for (const a of abilities) {
      for (const u of a.system.unlocks ?? []) unlocked.add(norm(u));
    }
    const queue = abilities.filter(a => !unlocked.has(norm(a.name)))
      .map(a => [norm(a.name), 0]);

    // Breadth-first, keeping the deepest position an ability can be reached at,
    // so a convergence sits below both the paths that feed it rather than
    // beside the shallower one.
    const seen = new Map();
    while (queue.length) {
      const [key, depth] = queue.shift();
      if ((seen.get(key) ?? -1) >= depth) continue;
      seen.set(key, depth);
      tier.set(key, depth);
      const node = byName.get(key);
      for (const u of node?.system.unlocks ?? []) queue.push([norm(u), depth + 1]);
    }
    return tier;
  }

  /**
   * Take an ability: charge the Crux, add it, and grant the stat points.
   *
   * "Every time you gain a new forte ability, you permanently increase one of
   * your stats by 2 points (or two of your stats by 1 point each)" (p6438).
   * Which stat is the player's, so the points go to the shared pot that either
   * may draw on, and the sheet's own controls place them.
   */
  static async take(actor, ability, cost) {
    const crux = actor.system.advancement?.crux ?? 0;
    if (crux < cost) return { refused: "crux", need: cost, have: crux };

    const data = ability.toObject();
    delete data._id;
    await actor.createEmbeddedDocuments("Item", [data]);
    await actor.update({
      "system.advancement.crux": crux - cost,
      "system.stats.statPoints.shared":
        (actor.system.stats?.statPoints?.shared ?? 0) + ISUN.forteAbilityStatPoints
    });
    return { taken: ability.name, cost, points: ISUN.forteAbilityStatPoints };
  }
}
