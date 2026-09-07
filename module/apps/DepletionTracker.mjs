/**
 * Invisible Sun — what is still running, and when to check it
 *
 * "It is the responsibility of the player to keep track of spells they cast and
 * ongoing effects that require depletion rolls, and to make those rolls…  If a
 * player loses track of this information, ongoing spells are assumed to have
 * depleted" (The Way, p11).
 *
 * That is a rule with a penalty attached to bookkeeping, which makes the
 * bookkeeping worth doing somewhere other than a player's memory. This is the
 * board it is done on.
 *
 * ── What is on it, and what is not ──
 * Only what is running. A character holds a great many things that state a
 * depletion — spells they know, ephemera in a pocket, an object of power on a
 * shelf — and none of those is depleting, because there is no effect to end.
 * The books ask after "spells they cast and ongoing effects", so an entry
 * arrives when something is used and leaves when it depletes or is ended.
 *
 * A list of everything held would be a catalogue, and the practices and
 * inventory tabs already print one: each has a Depletion column.
 *
 * ── Why it is grouped ──
 * "What do I roll at the end of my turn" is a question with an answer.  "Your
 * depletions" is not. So rows sit under the moment their card names — 168
 * entries across the packs check each round, 106 each hour, 80 each use — and
 * the forty phrasings written once each ("check each time the boots prevent a
 * step") group together under the sentence they print.
 *
 * ── Where it lives ──
 * One board for the table, in a world setting, the way the Path of Suns is. The
 * GM has to see every character's ongoing effects at once for "the GM can end a
 * PC's spell at any time" to be workable, and a player has to see their own.
 * Only a GM may write a world setting, so a player's changes go by the socket
 * relay the challenge and negation cards already use.
 */
import { depletionRange, depletionCadence, depletionMoment } from "../helpers/practice.mjs";
import { checkDepletion } from "../helpers/dice.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const SCOPE = "invisible-sun";
export const SETTING = "ongoingEffects";
const SOCKET = "system.invisible-sun";

/** An empty board, and the shape a stored one has. */
export const EMPTY = { version: 1, rows: [] };

export class DepletionTracker extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "isun-depletion-tracker",
    classes: ["invisible-sun", "depletion-tracker"],
    tag: "div",
    position: { width: 460, height: "auto" },
    window: { title: "ISUN.TrackerTitle", icon: "fa-solid fa-hourglass-half" },
    actions: {
      "roll-row":  DepletionTracker.#onRoll,
      "end-row":   DepletionTracker.#onEnd,
      "open-row":  DepletionTracker.#onOpen,
      "clear-all": DepletionTracker.#onClearAll
    }
  };

  static PARTS = {
    form: { template: "systems/invisible-sun/templates/apps/depletion-tracker.hbs" }
  };

  static open() {
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof DepletionTracker) return app.render(true);
    }
    return new this().render(true);
  }

  /* ──────────────────────────────────────────────
   * The board
   * ────────────────────────────────────────────── */

  /** What is running, as stored. Never null; a world that has never had one
   *  reads as an empty board rather than as nothing. */
  static read() {
    const stored = game.settings.get(SCOPE, SETTING);
    return { ...EMPTY, ...(stored ?? {}), rows: [...(stored?.rows ?? [])] };
  }

  /**
   * Can this user act on this row?
   *
   * The actor's owner, or a GM. A row names a character, and ending somebody
   * else's ongoing spell is the GM's prerogative rather than the table's —
   * "the GM can end a PC's spell at any time, but must award the PC 1 Despair".
   */
  static may(row, user = game.user) {
    if (user.isGM) return true;
    return game.actors.get(row?.actorId)?.testUserPermission(user, "OWNER") ?? false;
  }

  /* ──────────────────────────────────────────────
   * Starting and ending
   * ────────────────────────────────────────────── */

  /**
   * Put an effect on the board.
   *
   * Refused for anything with no roll in it: 176 of the 541 entries end on a
   * sunrise or a condition, and a row that can never be rolled is a row that
   * can only ever be removed by hand.
   *
   * The same item may be on the board twice. Casting a spell twice is two
   * ongoing effects, each depleting on its own die, so a row carries an id of
   * its own rather than being keyed by the item.
   */
  static async start(actor, item) {
    if (!actor || !item) return false;
    if (!depletionRange(item.system?.depletion)) return false;

    return this.#request({
      op: "start",
      row: {
        id: foundry.utils.randomID(),
        actorId: actor.id,
        itemId: item.id,
        /* Carried rather than looked up at render. An item deleted from a sheet
         * should not take the row with it silently: the effect is still running
         * in the fiction, and the board should still say so. */
        actorName: actor.name,
        name: item.name,
        img: item.img,
        depletion: item.system?.depletion ?? "",
        at: Date.now()
      }
    });
  }

  /** Take one off, because it depleted, or because somebody ended it. */
  static async end(id, { despair = false } = {}) {
    return this.#request({ op: "end", id, despair });
  }

  /** Take them all off. */
  static async clear() {
    return this.#request({ op: "clear" });
  }

  static async #request(payload) {
    if (game.user.isGM) return this.#apply({ ...payload, userId: game.user.id });

    /* No GM connected means nobody can write the setting, and an effect would
     * be started or ended on one client and nowhere else. Say so rather than
     * half doing it — the challenge and negation cards fail the same way for
     * the same reason. */
    if (!game.users.some(u => u.isGM && u.active)) {
      ui.notifications?.warn(game.i18n.localize("ISUN.TrackerNoGM"));
      return false;
    }
    game.socket.emit(SOCKET, { action: "depletion", ...payload, userId: game.user.id });
    return true;
  }

  /** Write the board. Only ever runs on a GM client. */
  static async #apply({ op, row = null, id = null, despair = false, userId }) {
    const user = game.users.get(userId);
    if (!user) return false;
    const board = this.read();

    if (op === "start") {
      /* Re-checked here rather than taken from the sender: a client could emit
       * this for an actor it does not own. */
      if (!this.may(row, user)) return false;
      board.rows.push(row);
    } else if (op === "end") {
      const found = board.rows.find(r => r.id === id);
      if (!found || !this.may(found, user)) return false;
      board.rows = board.rows.filter(r => r.id !== id);
      /* "The GM can end a PC's spell at any time, but must award the PC 1
       * Despair when this happens" (The Way, p11). Awarded rather than offered,
       * because by the time this arrives the GM has already said so. */
      if (despair && user.isGM) await this.#awardDespair(found);
    } else if (op === "clear") {
      if (!user.isGM) return false;
      board.rows = [];
    } else return false;

    await game.settings.set(SCOPE, SETTING, board);
    return true;
  }

  static async #awardDespair(row) {
    const actor = game.actors.get(row.actorId);
    if (!actor) return;
    const now = actor.system?.advancement?.despair ?? 0;
    await actor.update({ "system.advancement.despair": now + 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p>${game.i18n.format("ISUN.TrackerEndedByGM", { name: row.name })}</p>`
    });
  }

  /**
   * Listen for relayed changes, and keep every open board in step.
   *
   * Only a GM acts on what arrives, and only the first of them, so two GMs do
   * not both write the same change.
   */
  static listen() {
    game.socket.on(SOCKET, async (payload) => {
      if (!game.user.isGM || payload?.action !== "depletion") return;
      const firstGM = game.users.filter(u => u.isGM && u.active)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (firstGM?.id !== game.user.id) return;
      await this.#apply(payload);
    });

    /* A world setting is a Setting document, so a GM writing it reaches the
     * other clients as an update like any other. Without this a player's board
     * is whatever it was when they opened it. */
    Hooks.on("updateSetting", (setting) => {
      if (setting.key !== `${SCOPE}.${SETTING}`) return;
      for (const app of foundry.applications.instances.values()) {
        if (app instanceof DepletionTracker) app.render(false);
      }
    });
  }

  /* ──────────────────────────────────────────────
   * What the board shows
   * ────────────────────────────────────────────── */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const labels = CONFIG.ISUN.depletionCadenceLabels ?? {};
    const rows = this.constructor.read().rows;

    const seen = new Map();
    for (const row of rows.sort((a, b) => a.at - b.at)) {
      const range = depletionRange(row.depletion);
      const key = depletionCadence(row.depletion) || "event";
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push({
        ...row,
        mine: this.constructor.may(row),
        range: range ? (range.low === range.high ? `${range.low}` : `${range.low}–${range.high}`) : "",
        /* Printed only where the bucket does not already say it. A row under
         * "End of the round" repeating "check each round" is noise; one under
         * "When it happens" is only legible because of it. */
        moment: key === "event" ? depletionMoment(row.depletion) : ""
      });
    }

    /* In the order the labels are declared, so the board reads the same way
     * every time rather than by whichever group happened to fill first. */
    context.groups = Object.keys(labels)
      .filter(key => seen.has(key))
      .map(key => ({ key, label: game.i18n.localize(labels[key]), rows: seen.get(key) }));
    context.total = rows.length;
    context.isGM = game.user.isGM;
    return context;
  }

  /* ──────────────────────────────────────────────
   * The controls
   * ────────────────────────────────────────────── */

  static #rowOf(target) {
    const id = target.closest("[data-row-id]")?.dataset.rowId;
    return DepletionTracker.read().rows.find(r => r.id === id) ?? null;
  }

  /** Throw the die the card asks for, and take the row off if it lands. */
  static async #onRoll(event, target) {
    const row = DepletionTracker.#rowOf(target);
    if (!row || !DepletionTracker.may(row)) return;

    const actor = game.actors.get(row.actorId) ?? null;
    const result = await checkDepletion(row.depletion, actor);
    if (result?.depleted) await DepletionTracker.end(row.id);
  }

  /**
   * End it.
   *
   * "You can always end a spell that you cast whenever you wish it, and doing
   * so takes no action" — so for the character's own player this is one press
   * and no question. A GM ending somebody else's is the other rule in the same
   * paragraph, and owes the player 1 Despair, so that one asks.
   */
  static async #onEnd(event, target) {
    const row = DepletionTracker.#rowOf(target);
    if (!row || !DepletionTracker.may(row)) return;

    const actor = game.actors.get(row.actorId);
    const theirs = game.users.some(u => !u.isGM
      && (actor?.testUserPermission(u, "OWNER") ?? false));
    if (!(game.user.isGM && theirs)) return DepletionTracker.end(row.id);

    const choice = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.TrackerEndTitle"), icon: "fa-solid fa-wind" },
      classes: ["invisible-sun"],
      content: `<p>${game.i18n.format("ISUN.TrackerEndAsk",
        { name: row.name, who: row.actorName })}</p>`,
      buttons: [
        { action: "despair", default: true, icon: "fa-solid fa-cloud-bolt",
          label: game.i18n.localize("ISUN.TrackerEndDespair"), callback: () => "despair" },
        { action: "plain", icon: "fa-solid fa-wind",
          label: game.i18n.localize("ISUN.TrackerEndPlain"), callback: () => "plain" },
        { action: "cancel", icon: "fa-solid fa-xmark",
          label: game.i18n.localize("ISUN.Cancel") }
      ],
      rejectClose: false
    });
    if (!choice) return;
    return DepletionTracker.end(row.id, { despair: choice === "despair" });
  }

  /** Open what the row is about, where it still exists. */
  static async #onOpen(event, target) {
    const row = DepletionTracker.#rowOf(target);
    const item = game.actors.get(row?.actorId)?.items.get(row?.itemId);
    if (item) return item.sheet.render(true);
    ui.notifications?.info(game.i18n.format("ISUN.TrackerItemGone", { name: row?.name ?? "" }));
  }

  static async #onClearAll() {
    if (!game.user.isGM) return;
    const yes = await DialogV2.confirm({
      window: { title: game.i18n.localize("ISUN.TrackerClearTitle") },
      classes: ["invisible-sun"],
      content: `<p>${game.i18n.localize("ISUN.TrackerClearAsk")}</p>`,
      rejectClose: false
    });
    if (yes) await DepletionTracker.clear();
  }
}
