/**
 * Invisible Sun — spending a bene to shrug off a Wound
 *
 * "A character can spend a Physicality bene to negate a Wound", and Intellect
 * does the same for an Anguish — but only as it lands: "once damage is
 * sustained, a character cannot use Physicality to negate a Wound" (The Gate,
 * p2540). So the offer has to arrive with the damage, and it has to arrive in
 * front of the person whose bene it is.
 *
 * ── Why a card and not a dialog ──
 * The offer used to be a confirm on the applier's client. That was tolerable
 * while a player could apply damage to themselves and became wrong the moment
 * applying damage went GM-only: the GM was being asked whether to spend a
 * player's bene, on the player's behalf, with the player watching.
 *
 * A card puts it where it belongs. Only the owner sees the pips; everyone sees
 * that the offer was made and what was done with it, which is how it goes at a
 * table — "you take a Wound" / "I'll spend a bene for that". It also survives a
 * reload, where a modal on someone's screen does not.
 *
 * The cost is that the Wound exists while the card is open. That is the honest
 * reading of a negation: the blow landed and was shrugged off, rather than
 * never having happened.
 *
 * ── Why the socket ──
 * The same reason ChallengeCard has one: ChatMessage declares no update
 * permission, so a player cannot write to a card the GM authored. The spend is
 * relayed to a GM client, which re-checks the permission rather than trusting
 * the sender and then applies it.
 */
import { SpendPips } from "./SpendPips.mjs";
import * as poolRules from "../helpers/pools.mjs";

const SOCKET = "system.invisible-sun";
const FLAG_SCOPE = "invisible-sun";
const FLAG_KEY = "negation";

export class NegationCard {

  /** The negation data on a message, or null if it is not one of these. */
  static read(message) {
    return message?.getFlag(FLAG_SCOPE, FLAG_KEY) ?? null;
  }

  /**
   * Offer the window, if there is anything to offer.
   *
   * Called from the damage hook, so every path into applyDamage reaches it —
   * the sheet's button, the injury pips, a flux, a macro.
   *
   * Nothing is posted when the character cannot act on it anyway: no bene in
   * the pool that answers, or a cap of zero. A card offering a choice nobody
   * can make is noise on a log that is also a record.
   */
  static async offer(actor, { newWounds = 0, newAnguish = 0 } = {}) {
    if (!actor) return null;
    const { cap, rows } = poolRules.negationRows(actor,
      { wounds: newWounds, anguish: newAnguish });
    if (!rows.some(r => r.spendable > 0)) return null;

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: "",
      flags: {
        [FLAG_SCOPE]: {
          [FLAG_KEY]: {
            state: "open",
            actorId: actor.id,
            uuid: actor.uuid,
            name: actor.name,
            cap,
            /* What arrived, kept as it was. The pools move as the card sits
             * open, so what may be spent is worked out again at render and
             * again at the spend; this is the part that cannot change. */
            arrived: Object.fromEntries(rows.map(r => [r.kind, r.arrived])),
            spent: {}
          }
        }
      }
    });
  }

  /* ──────────────────────────────────────────────
   * Wiring
   * ────────────────────────────────────────────── */

  /**
   * Draw the card into a rendered message, and bind its controls.
   *
   * Per client, like the challenge card and for the same reason: the owner is
   * offered pips and everybody else is told what happened.
   */
  static async render(message, html) {
    const data = this.read(message);
    if (!data) return;

    const actor = fromUuidSync(data.uuid);
    const mine = !!actor?.isOwner && data.state === "open";

    /* Read now, not when the card was posted. A pool that has been spent
     * elsewhere in the meantime cannot pay for this, and the pips should say so
     * before they are clicked rather than after. */
    const live = actor
      ? poolRules.negationRows(actor, {
        wounds: data.arrived?.wounds ?? 0, anguish: data.arrived?.anguish ?? 0
      })
      : { cap: data.cap, rows: [] };

    const rows = live.rows.map(r => ({
      ...r,
      label: game.i18n.localize(r.kind === "anguish" ? "ISUN.Anguish" : "ISUN.Wounds"),
      poolLabel: game.i18n.localize(
        CONFIG.ISUN.poolLabels[r.poolKey] ?? r.poolKey),
      spentHere: data.spent?.[r.kind] ?? 0
    }));

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/chat/negation-card.hbs",
      {
        data, rows, mine,
        cap: live.cap,
        resolved: data.state !== "open",
        anySpent: Object.values(data.spent ?? {}).some(n => n > 0),
        capHint: game.i18n.format("ISUN.BeneCapHint", { cap: live.cap })
      });

    const target = html.querySelector(".message-content") ?? html;
    target.innerHTML = content;
    if (!mine) return;

    /* One ceiling across both rows, because the cap is on the act. The widget
     * is the venture dialog's, so a bene is spent the same way wherever it is
     * spent from. */
    SpendPips.wire(target, ".bene-pips", live.cap);

    const total = () => [...target.querySelectorAll(".negate-spend")]
      .reduce((sum, el) => sum + (Number(el.value) || 0), 0);
    const button = target.querySelector('[data-action="negate"]');
    const sync = () => { if (button) button.disabled = total() === 0; };
    target.addEventListener("change", sync);
    sync();

    for (const el of target.querySelectorAll("[data-action]")) {
      el.addEventListener("click", (event) => this.#onAction(event, message, target));
    }
  }

  static async #onAction(event, message, root) {
    event.preventDefault();
    const { action } = event.currentTarget.dataset;
    if (action === "stand") return this.#request(message.id, { decline: true });
    if (action !== "negate") return;

    const spend = {};
    for (const el of root.querySelectorAll(".negate-spend")) {
      const count = Number(el.value) || 0;
      if (count > 0) spend[el.dataset.kind] = count;
    }
    if (!Object.keys(spend).length) return;
    return this.#request(message.id, { spend });
  }

  /* ──────────────────────────────────────────────
   * Applying
   * ────────────────────────────────────────────── */

  static async #request(messageId, payload) {
    if (game.user.isGM) return this.#apply({ messageId, ...payload, userId: game.user.id });

    // No GM connected means nobody can write the card, and the bene would be
    // spent against a card that never records it. Say so rather than half doing
    // it — see ChallengeCard, which fails the same way for the same reason.
    if (!game.users.some(u => u.isGM && u.active)) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ChallengeNoGM"));
      return false;
    }
    game.socket.emit(SOCKET,
      { action: "negation", messageId, ...payload, userId: game.user.id });
    return true;
  }

  /** Spend the bene and close the card. Only ever runs on a GM client. */
  static async #apply({ messageId, spend = null, decline = false, userId }) {
    const message = game.messages.get(messageId);
    const data = this.read(message);
    if (!data || data.state !== "open") return false;

    const actor = fromUuidSync(data.uuid);
    const user = game.users.get(userId);
    if (!actor || !user) return false;
    // Re-checked here rather than taken from the sender: a client could emit
    // this for an actor it does not own.
    if (!actor.testUserPermission(user, "OWNER")) return false;

    if (decline) {
      await message.setFlag(FLAG_SCOPE, `${FLAG_KEY}.state`, "stood");
      return true;
    }

    /* Bounded again on the way in. The pips enforce the cap as they are
     * clicked and a request arriving from a socket has not been through them,
     * so what the rules allow is worked out here from the actor as it stands. */
    const { cap, rows } = poolRules.negationRows(actor, {
      wounds: data.arrived?.wounds ?? 0, anguish: data.arrived?.anguish ?? 0
    });

    let budget = cap;
    const spent = {};
    for (const row of rows) {
      const wanted = Math.max(0, Math.trunc(Number(spend?.[row.kind]) || 0));
      const count = Math.min(wanted, row.spendable, budget);
      if (count <= 0) continue;
      const result = await actor.negateWithBene(row.kind, { count });
      if (result?.count) {
        spent[row.kind] = result.count;
        budget -= result.count;
      }
    }

    await message.update({
      [`flags.${FLAG_SCOPE}.${FLAG_KEY}.spent`]: spent,
      [`flags.${FLAG_SCOPE}.${FLAG_KEY}.state`]:
        Object.keys(spent).length ? "spent" : "stood"
    });
    return true;
  }

  /**
   * Listen for relayed spends. Called once at ready on every client; only a GM
   * acts on what arrives, and only the first of them, so two GMs do not both
   * spend the same bene.
   */
  static listen() {
    game.socket.on(SOCKET, async (payload) => {
      if (!game.user.isGM || payload?.action !== "negation") return;
      const firstGM = game.users.filter(u => u.isGM && u.active)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (firstGM?.id !== game.user.id) return;
      await this.#apply(payload);
    });
  }
}
