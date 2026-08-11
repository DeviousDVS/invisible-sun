/**
 * Invisible Sun — the challenge card
 *
 * Every roll in the game starts with the GM. "Only the players roll dice in
 * Invisible Sun. When a character acts, the player rolls dice for the action.
 * When an NPC acts against a PC, the player rolls to defend" (The Gate, p1240),
 * and the GM determines the challenge (The Gate, p4016). So a single card
 * carries the whole exchange — declaration, response, approval, result — and
 * combat needs no second mechanism: a defence is this card with another label.
 *
 * The card is also the record. A GM saying "this action costs you two vex" is a
 * ruling, and the table should be able to see it was made.
 *
 * ── Why the socket ──
 * ChatMessage declares no `update` permission (BaseChatMessage.metadata), so a
 * player cannot write to a message the GM authored. Their response is therefore
 * relayed: the player asks, a GM client applies it. Everything that mutates a
 * card goes through `#patch` for that reason, and the GM's own calls take the
 * same path minus the round trip.
 */
const SOCKET = "system.invisible-sun";
const FLAG_SCOPE = "invisible-sun";
const FLAG_KEY = "challenge";

export class ChallengeCard {

  /* ──────────────────────────────────────────────
   * Reading
   * ────────────────────────────────────────────── */

  /** The challenge data on a message, or null if it is not a challenge card. */
  static read(message) {
    return message?.getFlag(FLAG_SCOPE, FLAG_KEY) ?? null;
  }

  /**
   * The response belonging to one actor, or null.
   *
   * Keyed by actor id, never by UUID. Foundry expands a dotted flag path into
   * nested objects, and every UUID contains a dot — "Actor.x7f2" stored as a
   * key becomes {Actor: {x7f2: ...}}, so the key never exists as written and
   * every read and write against it silently misses. The UUID is kept inside
   * the response instead, where it is a value and not a path.
   */
  static responseFor(message, actorId) {
    return this.read(message)?.responses?.[actorId] ?? null;
  }

  /**
   * Which of a challenge's targets this user may answer for, as actor ids.
   *
   * A user answers for a targeted actor they own. A GM sees every target but
   * answers for none of them — the GM does not roll.
   */
  static answerableBy(message, user = game.user) {
    const data = this.read(message);
    if (!data || user.isGM) return [];
    return Object.entries(data.responses ?? {})
      .filter(([, r]) => fromUuidSync(r.uuid)?.testUserPermission(user, "OWNER"))
      .map(([id]) => id);
  }

  /* ──────────────────────────────────────────────
   * Declaring
   * ────────────────────────────────────────────── */

  /**
   * Post a challenge. GM only.
   *
   * @param {object}   config
   * @param {string}   config.pool       the pool the action draws on
   * @param {number}   config.challenge  the challenge rating
   * @param {string}   [config.label]    what the action is
   * @param {number}   [config.maxVex]   ceiling on vexes drawn from that pool
   * @param {string[]} config.targets    actor UUIDs being challenged
   * @param {boolean}  [config.defence]  framed as defending rather than acting
   */
  static async declare({ pool, challenge, label = "", maxVex = 0, targets = [], defence = false }) {
    if (!game.user.isGM) return null;
    if (!pool || !targets.length) return null;

    const responses = {};
    for (const uuid of targets) {
      const actor = fromUuidSync(uuid);
      if (actor) responses[actor.id] = this.#blankResponse(uuid, actor.name);
    }
    if (!Object.keys(responses).length) return null;

    return ChatMessage.create({
      speaker: { alias: game.i18n.localize("ISUN.Challenge") },
      content: "",
      flags: {
        [FLAG_SCOPE]: {
          [FLAG_KEY]: {
            state: "open",
            pool,
            challenge: Number(challenge) || 0,
            label,
            maxVex: Math.max(0, Number(maxVex) || 0),
            defence,
            targets,
            responses
          }
        }
      }
    });
  }

  static #blankResponse(uuid, name) {
    return {
      uuid,
      name,
      state: "pending",
      skills: [],
      bene: 0,
      sortilege: 0,
      /* Computed when the response is made, not chosen. A scourge applies
       * because the pool was named; a vex is min(the GM's ceiling, what the
       * pool holds) and cannot be declined. */
      vex: 0,
      scourge: 0,
      venture: 0,
      message: null
    };
  }

  /* ──────────────────────────────────────────────
   * Writing
   * ────────────────────────────────────────────── */

  /**
   * Merge a patch into one actor's response.
   *
   * Routed to a GM when the caller is not one. Returns true if the update was
   * applied or handed off, false if it was refused.
   */
  static async update(message, actorId, patch) {
    const data = this.read(message);
    if (!data || data.state !== "open") return false;
    if (!(actorId in (data.responses ?? {}))) return false;

    // A player may only write to a target they own; a GM may write to any.
    if (!game.user.isGM && !this.answerableBy(message).includes(actorId)) return false;

    return this.#patch(message.id, actorId, patch);
  }

  /** Close a card so no further responses are taken. GM only. */
  static async close(message) {
    if (!game.user.isGM) return false;
    await message.setFlag(FLAG_SCOPE, `${FLAG_KEY}.state`, "closed");
    return true;
  }

  static async #patch(messageId, actorId, patch) {
    if (game.user.isGM) return this.#applyPatch({ messageId, actorId, patch });

    // No GM connected means nobody can write the card. Say so rather than
    // failing silently, because the player's action simply will not happen.
    if (!game.users.some(u => u.isGM && u.active)) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ChallengeNoGM"));
      return false;
    }
    game.socket.emit(SOCKET, {
      action: "challengeResponse", messageId, actorId, patch, userId: game.user.id
    });
    return true;
  }

  /** Apply a patch locally. Only ever runs on a GM client. */
  static async #applyPatch({ messageId, actorId, patch }) {
    const message = game.messages.get(messageId);
    if (!message) return false;
    const current = this.responseFor(message, actorId);
    if (!current) return false;
    await message.setFlag(FLAG_SCOPE, `${FLAG_KEY}.responses.${actorId}`,
      foundry.utils.mergeObject(current, patch, { inplace: false }));
    return true;
  }

  /* ──────────────────────────────────────────────
   * What the declared pool costs
   * ────────────────────────────────────────────── */

  /** Which half of the stats a pool belongs to. */
  static groupOf(pool) {
    return CONFIG.ISUN.certesPoolNames.includes(pool) ? "certes" : "qualia";
  }

  /**
   * The scourge and vex the declared pool brings, before the player adds
   * anything. Neither is a choice.
   *
   * A scourge applies to every action related to its pool and is not spent
   * (The Key, p2242), so it is simply the pool's scourgeTotal — which already
   * sums the four scopes that reach it. A vex is spent, and how many is the
   * lesser of the GM's ceiling and what the pool actually holds.
   */
  static poolCost(actor, pool, maxVex = 0) {
    const p = actor?.system?.stats?.[this.groupOf(pool)]?.pools?.[pool];
    if (!p) return { scourge: 0, vex: 0, bene: 0 };
    return {
      scourge: p.scourgeTotal ?? 0,
      vex: Math.min(Math.max(0, maxVex), p.vex ?? 0),
      bene: p.value ?? 0
    };
  }

  /**
   * Accept a challenge: record what the pool costs and stand ready.
   *
   * The player's own contribution — skills, bene, sortilege — is added
   * separately; this fixes only the part they cannot argue with.
   */
  static async accept(message, actorId) {
    const data = this.read(message);
    const response = this.responseFor(message, actorId);
    if (!data || !response || response.state !== "pending") return false;

    const actor = fromUuidSync(response.uuid);
    if (!actor) return false;

    const { scourge, vex } = this.poolCost(actor, data.pool, data.maxVex);
    return this.update(message, actorId, {
      state: "proposed", scourge, vex, venture: -(scourge + vex)
    });
  }

  /* ──────────────────────────────────────────────
   * Wiring
   * ────────────────────────────────────────────── */

  /**
   * Listen for relayed responses. Called once at ready on every client; only a
   * GM acts on what arrives.
   *
   * The relay is trusted to the extent the table is: a client could emit a
   * patch for an actor it does not own. The permission that matters is
   * re-checked here rather than taken from the sender, so a forged request
   * still has to pass the same test the sender's own client applied.
   */
  /**
   * Draw the card into a rendered message, and bind its controls.
   *
   * Rendered per client rather than stored, because the card says different
   * things to different people: a player sees the one row they can answer, a
   * GM sees every row and the approvals. Storing one rendering would show the
   * GM's view to everyone.
   */
  static async render(message, html) {
    const data = this.read(message);
    if (!data) return;

    const answerable = this.answerableBy(message);
    const closed = data.state !== "open";
    const rows = Object.entries(data.responses ?? {}).map(([id, r]) => {
      const mine = answerable.includes(id);
      const actions = [];
      if (!closed && mine && r.state === "pending") actions.push({ action: "accept", label: game.i18n.localize("ISUN.Accept") });
      if (!closed && game.user.isGM && r.state === "proposed") actions.push({ action: "approve", label: game.i18n.localize("ISUN.Approve") });
      if (!closed && mine && r.state === "approved") actions.push({ action: "roll", label: game.i18n.localize("ISUN.Roll") });
      return {
        id, name: r.name, state: r.state,
        img: fromUuidSync(r.uuid)?.img ?? "icons/svg/mystery-man.svg",
        scourge: r.scourge, vex: r.vex,
        showCost: r.state !== "pending",
        stateLabel: game.i18n.localize(`ISUN.ChallengeState${r.state.charAt(0).toUpperCase()}${r.state.slice(1)}`),
        actions
      };
    });

    const { renderTemplate } = foundry.applications.handlebars;
    const content = await renderTemplate(
      "systems/invisible-sun/templates/chat/challenge-card.hbs",
      { data, rows, closed,
        poolLabel: game.i18n.localize(CONFIG.ISUN.poolLabels[data.pool] ?? data.pool),
        canClose: game.user.isGM && !closed });

    const target = html.querySelector(".message-content") ?? html;
    target.innerHTML = content;

    target.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", ev => this.#onAction(ev, message));
    });
  }

  static async #onAction(event, message) {
    event.preventDefault();
    const { action } = event.currentTarget.dataset;
    // Taken from the row rather than the button. One place holds it, so a
    // change to the markup cannot leave the two disagreeing.
    const actorId = event.currentTarget.closest("[data-actor-id]")?.dataset.actorId;
    switch (action) {
      case "accept":
        return this.accept(message, actorId);
      case "approve":
        if (!game.user.isGM) return;
        return this.update(message, actorId, { state: "approved" });
      case "roll":
        // The roll itself belongs with the response dialog, which knows what
        // the player is bringing. Until that exists the card only records that
        // the moment was reached.
        return this.update(message, actorId, { state: "rolled" });
      case "close-challenge":
        return this.close(message);
    }
  }

  static listen() {
    game.socket.on(SOCKET, async (payload) => {
      if (!game.user.isGM || payload?.action !== "challengeResponse") return;
      // The first active GM applies it, so two GMs do not both write.
      const firstGM = game.users.filter(u => u.isGM && u.active)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (firstGM?.id !== game.user.id) return;

      const message = game.messages.get(payload.messageId);
      const sender = game.users.get(payload.userId);
      const response = this.responseFor(message, payload.actorId);
      const actor = response ? fromUuidSync(response.uuid) : null;
      if (!message || !sender || !actor) return;
      if (!actor.testUserPermission(sender, "OWNER")) return;

      await this.#applyPatch(payload);
    });
  }
}
