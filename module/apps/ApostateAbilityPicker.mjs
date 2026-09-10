import * as apostate from "../helpers/apostate.mjs";

/**
 * Invisible Sun — picking the next Apostate ability
 *
 * "Once an Apostate begins play, we can select a new ability for which we meet
 * the prerequisites for a cost of 1 Crux" (The Key, p62). That happens a
 * handful of times across a character's life, so the twelve abilities open on
 * request rather than sitting on the sheet — the sheet shows the two or five
 * this character actually has.
 *
 * The whole list is offered, taken and untaken alike, because what a player is
 * saving towards is half the point of having a list. The same reading the forte
 * tree is built on, and this is deliberately its sibling: an Apostate spending
 * Crux and a vislae spending Crux on a forte ability should not meet two
 * different windows.
 *
 * ── What it does not do ──
 * Several of these carry prerequisites — "we cannot select this ability again
 * until we have gained at least two other Apostate abilities", "we cannot
 * select this ability at all as a beginning Apostate" — and this does not
 * police them. It cannot: the importer currently sweeps every one of those
 * sentences into the order's own note rather than onto the ability that owns
 * it, so there is nothing here to read. What it does is show the count they are
 * counted against, and leave the judgement where the system leaves every other
 * one of its limits: with the table.
 */
const { DialogV2 } = foundry.applications.api;

export class ApostateAbilityPicker {

  /**
   * @param {Actor} actor
   * @param {Item}  order  the character's Order item, which holds the list
   */
  static async open(actor, order) {
    if (!order?.system?.apostateAbilities?.length) {
      ui.notifications?.warn(game.i18n.localize("ISUN.ApostateNoAbilities"));
      return;
    }

    const build = () => {
      const taken = actor.system.meta?.apostateAbilities ?? [];
      const held = new Set(taken.map(t => t.name));
      const crux = actor.system.advancement?.cruxAvailable ?? 0;
      const cost = apostate.costOf(taken);
      const rows = (order.system.apostateAbilities ?? []).map(a => ({
        name: a.name,
        description: a.description,
        owned: held.has(a.name),
        cost,
        free: cost === 0,
        affordable: crux >= cost
      }));
      return { crux, cost, taken, html: this.#content(rows, crux, apostate.freeLeft(taken)) };
    };

    const wire = (root) => {
      for (const el of root.querySelectorAll("[data-take]")) {
        el.addEventListener("click", async (event) => {
          event.preventDefault();
          if (el.classList.contains("disabled")) return;

          const { taken, cost } = build();
          const name = el.dataset.take;
          if (taken.some(t => t.name === name)) return;

          /* Charged before it is recorded, and through spendCrux, which takes
           * the Joy and the Despair that back it — Crux is never held, so there
           * is no stored total to decrement. An ability added and then not paid
           * for is worse than one refused. */
          if (cost > 0) {
            const paid = await actor.spendCrux(cost);
            if (paid.refused) {
              ui.notifications?.warn(game.i18n.format("ISUN.NotEnoughCrux",
                { need: paid.need, have: paid.have }));
              return;
            }
          }

          await actor.update({ "system.meta.apostateAbilities":
            apostate.add(order, taken, name, cost) });
          ui.notifications?.info(cost === 0
            ? game.i18n.format("ISUN.ApostateTakenFree", { name })
            : game.i18n.format("ISUN.ApostateTakenCrux", { name, cost }));

          /* Rebuilt in place rather than closed: the second free pick is
           * usually made in the same breath as the first, and the price on
           * every remaining row has just changed. */
          const next = build();
          const body = root.querySelector(".apostate-picker");
          if (body) {
            body.outerHTML = next.html;
            wire(root);
          }
        });
      }
    };

    await DialogV2.wait({
      window: { title: game.i18n.format("ISUN.ApostatePickerTitle", { name: actor.name }),
                icon: "fa-solid fa-hand-sparkles", resizable: true },
      classes: ["invisible-sun", "apostate-ability-picker"],
      position: { width: 620, height: 620 },
      content: build().html,
      buttons: [{ action: "close", label: game.i18n.localize("ISUN.Close"), default: true }],
      render: (event, dlg) => wire(dlg.element),
      rejectClose: false
    });
  }

  static #content(rows, crux, freeLeft) {
    const esc = foundry.utils.escapeHTML;

    const body = rows.map(r => {
      const control = r.owned
        ? `<span class="ap-state"><i class="fa-solid fa-check"></i></span>`
        : `<a class="ap-take${r.affordable ? "" : " disabled"}${r.free ? " free" : ""}"
              data-take="${esc(r.name)}"
              data-tooltip="${r.affordable ? game.i18n.localize("ISUN.ApostateTakeHint")
                                           : game.i18n.localize("ISUN.NotEnoughCruxShort")}">
             ${r.free ? game.i18n.localize("ISUN.ApostateFreePick")
                      : `${r.cost} <i class="fa-solid fa-star"></i>`}</a>`;

      return `<div class="ap-row ${r.owned ? "owned" : "available"}">
          <div class="ap-head">
            <span class="ap-name">${esc(r.name)}</span>
            ${control}
          </div>
          <div class="ap-desc">${r.description ?? ""}</div>
        </div>`;
    }).join("");

    /* What the next one costs, said once at the top rather than inferred from
     * twelve identical price tags. */
    const standing = freeLeft
      ? game.i18n.format("ISUN.ApostateFreeLeft", { n: freeLeft })
      : game.i18n.format("ISUN.ApostatePickerCost", { cost: CONFIG.ISUN.apostateAbilityCost ?? 1 });

    return `<div class="apostate-picker">
        <p class="ap-crux">
          <span class="ap-standing">${standing}</span>
          <span class="ap-have">${game.i18n.format("ISUN.ApostatePickerCrux", { crux })}</span>
        </p>
        <div class="ap-rows">${body}</div>
      </div>`;
  }
}
