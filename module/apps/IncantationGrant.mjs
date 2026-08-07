import { CompendiumPicker } from "./CompendiumPicker.mjs";

/**
 * Invisible Sun — receiving an incantation
 *
 * An incantation is not bought or looked up. "The character does not get to
 * choose the incantation; instead, the universe... grants them what it wants
 * them to have" (The Way, p106). So the control that adds one draws at random
 * rather than opening a list — the whole point of an acquiescent incantation is
 * that it arrives unasked.
 *
 * Two rules bound it.
 *
 * An incantation is held in the mind the way an ephemera object is held in the
 * hand, and they share one limit: "Ephemera limits apply to the total number of
 * Ephemera a character can hold, which encompasses both physical Ephemera
 * objects and mental Incantations." A character with no room gets nothing, and
 * is told which limit stopped them rather than left wondering why the button
 * did nothing.
 *
 * Choosing is a later privilege. "Your degree determines how many ephemera a
 * vislae can bear at a time, and — at higher degrees — how many of these can be
 * incantations you choose rather than incantations granted to you" (The Key,
 * p36). That capacity is already in the order data: every order grants one
 * conation incantation at 3rd degree and a second at 5th. So the option to
 * choose is offered exactly when the character's degree has earned it, and is
 * absent before — which is the rule, not a UI preference.
 *
 * The GM may always choose, since the rules put the granting in their hands:
 * the universe is "managed by the GM choosing or randomly drawing a card".
 */
const { DialogV2 } = foundry.applications.api;

const PACK = "invisible-sun.incantations";
const FLAG_SCOPE = "invisible-sun";
/** Set on an incantation the character chose, so slots can be counted. */
const FLAG_CONATION = "conation";

export class IncantationGrant {

  /** Open the grant. Returns the incantation received, or null. */
  static async open(actor) {
    const limit = actor.system.limits?.ephemera;
    if (limit && limit.used >= limit.value) {
      ui.notifications?.warn(game.i18n.format("ISUN.EphemeraFull",
        { used: limit.used, max: limit.value }));
      return null;
    }

    const pack = game.packs.get(PACK);
    if (!pack) {
      ui.notifications?.error(game.i18n.format("ISUN.PackMissing", { pack: PACK }));
      return null;
    }
    /* "You cannot get more incantations in a given day than your total
     * ephemera limit" — a separate rule from how many can be held at once.
     * The book has a vislae receive one, cast it, meditate again and receive
     * another, which frees holding space but still spends the day's
     * allowance, so both have to be checked. */
    const ledger = actor.incantationLedger;
    if (ledger.atDailyCap) {
      ui.notifications?.warn(game.i18n.format("ISUN.IncantationsDailyCap",
        { received: ledger.received, cap: ledger.dailyCap }));
      return null;
    }

    // Categories are fetched here even though the draw does not use them,
    // because the conation paths read them off this same index. Leaving them
    // out worked only by accident: seeking a known incantation goes through
    // the picker, which asks for a fuller index and quietly repopulates the
    // shared one, so asking by type found categories if and only if the
    // player had visited the other path first.
    const index = await pack.getIndex({
      fields: ["system.level", "system.color", "system.cost", "system.categories"] });
    const held = new Set(actor.items.filter(i => i.type === "Incantation")
      .map(i => i.name.toLowerCase()));
    // "No vislae can gain the same incantation (either type) two days in a
    // row", which the ledger remembers even after the incantation is gone.
    const yesterday = new Set(ledger.yesterday.map(n => n.toLowerCase()));
    // The universe has no reason to grant what the character already holds.
    const pool = [...index].filter(e => !held.has(e.name.toLowerCase())
      && !yesterday.has(e.name.toLowerCase()));
    if (!pool.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.IncantationsAllHeld"));
      return null;
    }

    // Both derived on the actor, so the sheet and this window cannot disagree.
    const conation = actor.system.limits?.conation ?? { value: 0, used: 0 };
    const earned = conation.used < conation.value;
    const canChoose = earned || game.user.isGM;

    let drawn = pool[Math.floor(Math.random() * pool.length)];
    let result;
    do {
      result = await DialogV2.wait({
        window: { title: game.i18n.localize("ISUN.IncantationGrantTitle"),
                  icon: "fa-solid fa-hand-sparkles" },
        classes: ["invisible-sun", "incantation-grant"],
        position: { width: 480 },
        content: this.#content(drawn, limit, conation, earned, ledger),
        buttons: [
          { action: "accept", label: game.i18n.localize("ISUN.IncantationAccept"),
            default: true, icon: "fa-solid fa-check" },
          // Redrawing is the GM's call — a player cannot reroll until they
          // like the answer, which would make it a choice by other means.
          ...(game.user.isGM
            ? [{ action: "again", label: game.i18n.localize("ISUN.IncantationDrawAgain"),
                 icon: "fa-solid fa-dice" }]
            : []),
          ...(canChoose
            ? [{ action: "choose", label: game.i18n.localize("ISUN.IncantationChoose"),
                 icon: "fa-solid fa-hand-pointer" }]
            : []),
          { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (result === "again") drawn = pool[Math.floor(Math.random() * pool.length)];
    } while (result === "again");

    if (result === "choose") return this.#choose(actor, pack, index);
    if (result !== "accept") return null;

    return this.#grant(actor, drawn.uuid ?? `Compendium.${PACK}.${drawn._id}`, false);
  }

  /**
   * Seek a conation incantation.
   *
   * The book gives two ways and no third. "If a vislae has already gained an
   * incantation as an acquiescent incantation, they can seek it as a conation
   * incantation. If not, they can ask for a general type of conation
   * incantation (offensive, movement, defensive, deception, and so on), rather
   * than a specific one."
   *
   * The distinction is the whole rule, so the two are separate paths rather
   * than one list. Seeking by name is a free choice among what the vislae has
   * known; asking by type is not a choice at all — the type is asked for and
   * one of that type arrives.
   *
   * Both are capped: "the conation incantation cannot be of a higher level
   * than the highest-level spell the vislae knows."
   */
  static async #choose(actor, pack, index) {
    const cap = actor.highestSpellLevel;
    const level = e => Number(e.system?.level) || 0;
    const eligible = [...index].filter(e => level(e) <= cap);

    // A vislae who knows no spells has a ceiling of zero and cannot seek at
    // all. That is the rule working, so it says so plainly.
    if (!eligible.length) {
      ui.notifications?.warn(cap
        ? game.i18n.format("ISUN.ConationNoneAtLevel", { cap })
        : game.i18n.localize("ISUN.ConationNoSpells"));
      return null;
    }

    const known = actor.incantationLedger.everKnown;
    const byName = new Map(eligible.map(e => [e.name.toLowerCase(), e]));
    const seekable = known.map(k => byName.get(k.name.toLowerCase())).filter(Boolean);

    const how = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.IncantationChooseTitle"),
                icon: "fa-solid fa-hand-pointer" },
      classes: ["invisible-sun", "incantation-grant"],
      position: { width: 480 },
      content: `<div class="incantation-grant-body">
          <p class="hint">${game.i18n.localize("ISUN.IncantationChooseHint")}</p>
          <p class="limit-note">${foundry.utils.escapeHTML(
            game.i18n.format("ISUN.ConationCap", { cap }))}</p>
          <p class="limit-note">${foundry.utils.escapeHTML(
            game.i18n.format("ISUN.ConationKnownCount", { count: seekable.length }))}</p>
        </div>`,
      buttons: [
        // Seeking a known one is only offered when there is one to seek; the
        // book makes asking by type the fallback for exactly that case.
        ...(seekable.length
          ? [{ action: "known", label: game.i18n.localize("ISUN.ConationSeekKnown"),
               default: true, icon: "fa-solid fa-book-bookmark" }]
          : []),
        { action: "type", label: game.i18n.localize("ISUN.ConationAskType"),
          default: !seekable.length, icon: "fa-solid fa-tags" },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });

    if (how === "known") return this.#seekKnown(actor, seekable);
    if (how === "type") return this.#askByType(actor, eligible, cap);
    return null;
  }

  /** Pick from what the vislae has known before. A free choice. */
  static async #seekKnown(actor, seekable) {
    const added = await CompendiumPicker.open({
      actor,
      pack: PACK,
      type: "Incantation",
      title: game.i18n.localize("ISUN.ConationSeekKnownTitle"),
      hint: game.i18n.localize("ISUN.ConationSeekKnownHint"),
      fields: ["level", "color", "cost", "categories"],
      only: new Set(seekable.map(e => e._id)),
      summarise: e => {
        const s = e.system ?? {};
        return [s.level != null ? `level ${s.level}` : "", s.color,
                (s.categories ?? []).join(", ")].filter(Boolean).join(" · ");
      }
    });
    for (const item of added) {
      await item.setFlag(FLAG_SCOPE, FLAG_CONATION, true);
      await actor.recordIncantation({ name: item.name, kind: "conation" });
    }
    return added[0] ?? null;
  }

  /**
   * Ask for a type, and receive one of that type.
   *
   * Not a choice of incantation: the vislae names a kind of thing and the
   * universe supplies. And it may supply nothing — "they are not creating the
   * incantation. They cannot receive an incantation that does not already
   * exist... if they ask for an incantation that protects against bears and
   * there isn't one, they get nothing."
   *
   * The ask is blind. Every type can be asked for, with no count beside it and
   * none greyed out, because knowing in advance that nothing offensive is
   * within reach is knowledge the vislae has not got — they find out by
   * asking and being answered with silence.
   */
  static async #askByType(actor, eligible, cap) {
    const categories = CONFIG.ISUN?.incantationCategories ?? {};
    const options = Object.entries(categories).map(([key, label]) =>
      `<option value="${key}">${game.i18n.localize(label)}</option>`).join("");

    const asked = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.ConationAskTypeTitle"), icon: "fa-solid fa-tags" },
      classes: ["invisible-sun", "incantation-grant"],
      position: { width: 460 },
      content: `<div class="incantation-grant-body">
          <p class="hint">${game.i18n.localize("ISUN.ConationAskTypeHint")}</p>
          <p class="limit-note">${foundry.utils.escapeHTML(
            game.i18n.format("ISUN.ConationCap", { cap }))}</p>
          <select name="category" class="conation-type">${options}</select>
        </div>`,
      buttons: [
        { action: "ask", label: game.i18n.localize("ISUN.ConationAsk"), default: true,
          icon: "fa-solid fa-hands-praying",
          callback: (event, button) => button.form.elements.category.value },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!asked || asked === "cancel") return null;

    const pool = eligible.filter(e => (e.system?.categories ?? []).includes(asked));
    if (!pool.length) {
      // The hour was spent whether or not anything answered.
      const hours = await actor.spendMeditationHour();
      ui.notifications?.warn(game.i18n.format("ISUN.ConationNothingOfType",
        { type: game.i18n.localize(categories[asked] ?? asked), hours }));
      return null;
    }

    // The type was asked for; which one arrives is not the vislae's to pick.
    const drawn = pool[Math.floor(Math.random() * pool.length)];
    return this.#grant(actor, drawn.uuid ?? `Compendium.${PACK}.${drawn._id}`, true);
  }

  static async #grant(actor, uuid, conation) {
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    const data = doc.toObject();
    delete data._id;
    if (conation) data.flags = { ...(data.flags ?? {}), [FLAG_SCOPE]: { [FLAG_CONATION]: true } };
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    // Written to the ledger, not just held: a conation incantation may be any
    // the vislae has *ever* known, so the history has to outlive the holding.
    await actor.recordIncantation({
      name: created.name, uuid,
      kind: conation ? "conation" : "acquiescent",
    });
    ui.notifications?.info(game.i18n.format("ISUN.IncantationGranted", { name: created.name }));

    /* "No two vislae working together can get the same incantation (either
     * type) at the same time." Which characters are working together is a
     * fact about the fiction that the system has no way to know, so this
     * reports the clash and leaves the ruling where it belongs. */
    const alsoHeld = game.actors.filter(a => a.id !== actor.id && a.type === "Vislae"
      && a.items.some(i => i.type === "Incantation"
        && i.name.toLowerCase() === created.name.toLowerCase()));
    if (alsoHeld.length) {
      ui.notifications?.warn(game.i18n.format("ISUN.IncantationAlsoHeld",
        { name: created.name, who: alsoHeld.map(a => a.name).join(", ") }));
    }
    return created;
  }

  static #content(entry, limit, conation, earned, ledger) {
    const esc = foundry.utils.escapeHTML;
    const s = entry.system ?? {};
    const meta = [s.level != null ? `${game.i18n.localize("ISUN.Lvl")} ${s.level}` : "",
                  s.color, s.cost].filter(Boolean).join(" · ");
    const room = limit
      ? game.i18n.format("ISUN.EphemeraRoom", { used: limit.used, max: limit.value })
      : "";
    // Meditating for this one is the hour that will be charged, so the count
    // shown is the one it is about to become.
    const day = game.i18n.format("ISUN.IncantationDayNote", {
      received: ledger.received, cap: ledger.dailyCap,
      hours: ledger.hoursToday + 1,
    });

    return `<div class="incantation-grant-body">
      <p class="hint">${game.i18n.localize("ISUN.IncantationGrantHint")}</p>
      <div class="granted">
        <img src="${esc(entry.img ?? "")}" alt="" />
        <div>
          <div class="granted-name">${esc(entry.name)}</div>
          <div class="granted-meta">${esc(meta)}</div>
        </div>
      </div>
      <p class="limit-note">${esc(room)} ${esc(day)}</p>
      ${this.#conationNote(conation, earned)}
    </div>`;
  }

  /**
   * Why "Choose instead" is on offer, when it is.
   *
   * A degree that has earned conation slots says so. A GM below that degree
   * still gets the button — the rules put the granting in their hands — but
   * saying "your degree lets 0 of your ephemera be a conation incantation"
   * would be nonsense, so it says what is actually true instead.
   */
  static #conationNote(conation, earned) {
    if (earned) {
      return `<p class="conation-note">${foundry.utils.escapeHTML(
        game.i18n.format("ISUN.ConationAvailable",
          { used: conation.used, slots: conation.value }))}</p>`;
    }
    if (game.user.isGM) {
      return `<p class="conation-note gm">${foundry.utils.escapeHTML(
        game.i18n.localize(conation.value
          ? "ISUN.ConationSpentGM" : "ISUN.ConationNoneGM"))}</p>`;
    }
    return "";
  }
}
