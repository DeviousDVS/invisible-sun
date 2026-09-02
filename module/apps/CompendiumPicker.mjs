/**
 * Invisible Sun — adding something from a compendium
 *
 * A "+" that makes a blank item is the right control for things a player
 * invents — a memory, a connection, a skill the library does not carry. It is
 * the wrong one for things the books already define. Every aggregate a Weaver
 * can hold is printed in The Way and sits in the compendium, so creating an
 * empty one means retyping a page: eight qualities, three absences, a range and
 * a duration, all of which exist already.
 *
 * So the "+" opens this instead — the pack, searchable, with what the character
 * already holds marked so it cannot be taken twice. Creating a blank one is
 * still there as a button, because the game does invite invention, but it is no
 * longer the only thing the control can do.
 *
 * The pack is read through its index rather than loaded. Only the entries a
 * player actually picks are instantiated, so opening the window costs one index
 * read however large the pack is.
 */
const { DialogV2 } = foundry.applications.api;

export class CompendiumPicker {

  /**
   * @param {object}          config
   * @param {Actor}           config.actor  who is being added to
   * @param {string|string[]} config.pack   pack id, or several — spells are
   *                                        split across two, and a Vance holds
   *                                        from both
   * @param {string}   config.type       item type the "create new" button makes
   * @param {string}   config.title      window title
   * @param {string}   [config.hint]     a line above the list
   * @param {string[]} [config.fields]   system fields the summary needs
   * @param {Set}      [config.only]     ids to offer; omit to offer the pack
   * @param {Function} [config.summarise] entry -> a short line under the name
   * @returns {Promise<Item[]>} the items added, empty if nothing was
   */
  static async open({ actor, pack, type, title, hint = "", fields = [], only, summarise }) {
    /* One pack or several. A missing one is reported and passed over rather
     * than fatal: a world without the Vance deck should still be able to add a
     * general spell, and refusing the lot would say the opposite. */
    const wanted = [pack].flat().filter(Boolean);
    const packs = [];
    for (const id of wanted) {
      const compendium = game.packs.get(id);
      if (compendium) packs.push([id, compendium]);
      else ui.notifications?.warn(game.i18n.format("ISUN.PackMissing", { pack: id }));
    }
    if (!packs.length) return [];

    // Held by name: a compendium item copied onto an actor keeps its name but
    // gets a new id, so the id is no use for telling what is already there.
    const held = new Set(actor.items.filter(i => i.type === type)
      .map(i => i.name.toLowerCase()));

    const index = [];
    for (const [id, compendium] of packs) {
      const read = await compendium.getIndex({ fields: fields.map(f => `system.${f}`) });
      /* uuid is read across explicitly: on an index entry it is a getter, and
       * spreading would drop it and fall back to a uuid built by hand. The
       * pack id is carried for that fallback's sake. */
      for (const entry of read) index.push({ ...entry, uuid: entry.uuid, _pack: id });
    }

    const entries = index
      .filter(e => !type || e.type === type)
      // A caller may narrow the pack to a specific set — seeking a conation
      // incantation offers only the ones the vislae has known before, not the
      // whole deck.
      .filter(e => !only || only.has(e._id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({
        id: e._id,
        // "Compendium.<scope>.<pack>.<DocumentType>.<id>" — the document type
        // is not optional, and the form without it resolves to nothing.
        uuid: e.uuid ?? `Compendium.${e._pack}.Item.${e._id}`,
        name: e.name,
        img: e.img,
        summary: summarise?.(e) ?? "",
        // Searched over everything the index carries, not just the summary.
        // The summary shows an aggregate's first four qualities, so matching
        // against it alone meant "Fire" found the aggregate named Fire and not
        // the four others made partly of it — the opposite of the point.
        // Lowered once here rather than on every keystroke.
        search: this.#searchable(e),
        held: held.has(e.name.toLowerCase())
      }));

    const result = await DialogV2.wait({
      window: { title, icon: "fa-solid fa-book-open" },
      classes: ["invisible-sun", "compendium-picker"],
      position: { width: 560, height: 620 },
      content: this.#content(entries, hint),
      buttons: [
        { action: "add", label: game.i18n.localize("ISUN.PickerAdd"), default: true,
          icon: "fa-solid fa-plus",
          callback: (event, button) => ({
            picked: [...button.form.querySelectorAll("input[name=pick]:checked")]
              .map(i => i.value)
          }) },
        { action: "create", label: game.i18n.localize("ISUN.PickerCreateNew"),
          icon: "fa-solid fa-file-circle-plus", callback: () => ({ create: true }) },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });

    if (!result) return [];
    if (result.create) return this.#createBlank(actor, type);
    if (!result.picked?.length) return [];

    const docs = [];
    for (const uuid of result.picked) {
      const doc = await fromUuid(uuid);
      if (!doc) continue;
      const data = doc.toObject();
      delete data._id;
      docs.push(data);
    }
    if (!docs.length) return [];

    const created = await actor.createEmbeddedDocuments("Item", docs);
    ui.notifications?.info(game.i18n.format("ISUN.PickerAdded",
      { count: created.length, name: created[0].name }));
    return created;
  }

  /** Everything about an index entry that a player might search for. */
  static #searchable(entry) {
    const parts = [entry.name];
    const walk = value => {
      if (typeof value === "string") parts.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(entry.system ?? {});
    return parts.join(" ").toLowerCase();
  }

  /** A blank one, opened so it can be filled in straight away. */
  static async #createBlank(actor, type) {
    const label = game.i18n.localize(`TYPES.Item.${type}`);
    const [created] = await actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("DOCUMENT.New",
        { type: label.startsWith("TYPES.") ? type : label }),
      type,
      img: CONFIG.ISUN?.itemTypeIcons?.[type]
    }]);
    created?.sheet?.render(true);
    return created ? [created] : [];
  }

  static #content(entries, hint) {
    const esc = foundry.utils.escapeHTML;
    const rows = entries.map(e => `
      <label class="picker-row${e.held ? " held" : ""}" data-search="${esc(e.search)}">
        <input type="checkbox" name="pick" value="${esc(e.uuid)}"
               ${e.held ? "disabled" : ""} />
        <img src="${esc(e.img ?? "")}" alt="" />
        <span class="picker-name">${esc(e.name)}</span>
        <span class="picker-summary">${esc(e.summary)}</span>
        ${e.held ? `<span class="picker-held">${game.i18n.localize("ISUN.PickerHeld")}</span>` : ""}
      </label>`).join("");

    return `<div class="compendium-picker-body">
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
      <input type="search" class="picker-search" autofocus
             placeholder="${game.i18n.localize("ISUN.PickerSearch")}" />
      <div class="picker-list">${rows || `<p class="empty-state">${game.i18n.localize("ISUN.PickerEmpty")}</p>`}</div>
      <p class="picker-count"></p>
    </div>`;
  }

  /** Filter as the player types, and keep the Add button honest. */
  static #live(root) {
    const search = root.querySelector(".picker-search");
    const rows = [...root.querySelectorAll(".picker-row")];
    const count = root.querySelector(".picker-count");
    const add = root.querySelector('button[data-action="add"]');

    const update = () => {
      const q = (search?.value ?? "").trim().toLowerCase();
      for (const row of rows) {
        row.classList.toggle("hidden", !!q && !row.dataset.search.includes(q));
      }
      const chosen = rows.filter(r => r.querySelector("input")?.checked).length;
      // Adding nothing is not a useful thing to do, so the button says so
      // rather than closing the window and doing nothing.
      if (add) add.disabled = chosen === 0;
      if (count) {
        count.textContent = chosen
          ? game.i18n.format("ISUN.PickerChosen", { count: chosen })
          : "";
      }
    };

    search?.addEventListener("input", update);
    root.addEventListener("change", update);
    update();
  }
}
