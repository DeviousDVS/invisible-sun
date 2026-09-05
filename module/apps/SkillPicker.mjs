/**
 * Invisible Sun — choosing which skills bear on a venture
 *
 * A skill adds its level to the venture, and "two skills may both apply when
 * the situation warrants it" — so the answer a roll needs is a short list, one
 * or two long, out of a set that only grows. A starting vislae has a handful;
 * one who has spent Acumen on development skills has shelves of them.
 *
 * That is the shape the "+ Skill" link answers. What has been chosen is shown
 * as rows, because those are the numbers going into the roll and they should be
 * readable without opening anything; what has not been chosen lives behind the
 * link, in a searchable list grouped the way the sheet groups them. It is the
 * same bargain the practices table makes with "+ Spell": the few things in play
 * are in front of you, the many things you could reach for are one click away.
 *
 * Nothing here reads or writes an actor. The rows carry hidden inputs named
 * "skills", so a dialog's own FormDataExtended collects them like any other
 * field and neither caller had to learn a new way to be answered.
 */
const { DialogV2 } = foundry.applications.api;

export class SkillPicker {

  /**
   * Draw the chosen skills into `.skill-picks`, and keep the "+" and each row's
   * "×" working.
   *
   * The rows are built here rather than in the template. A template can only
   * draw what was chosen when the dialog opened, and the picker adds more after
   * that — so a template drawing the first set and this drawing the rest would
   * be two places to disagree about what a row is.
   *
   * @param {HTMLElement} root      the dialog's element
   * @param {object[]} skills       {id, name, level, category, checked}
   * @returns {{chosen: () => string[]}} what is picked, at any moment
   */
  static wire(root, skills = []) {
    const list = root?.querySelector?.(".skill-picks");
    if (!list) return { chosen: () => [] };
    const add = root.querySelector(".add-skill");

    // Kept in the order they were offered in, which is by name: a row that
    // jumped to the bottom because it was picked last would be harder to find
    // than one that stayed where the list already put it.
    const picked = new Set(skills.filter(s => s.checked).map(s => s.id));
    const inOrder = () => skills.filter(s => picked.has(s.id));

    const draw = () => {
      list.innerHTML = this.#rows(inOrder());
      /* Nothing left to pick is nothing for the link to do, so it goes rather
       * than opening an empty window. */
      if (add) add.hidden = picked.size >= skills.length;
      /* The hidden inputs are new elements every time this runs, so anything
       * listening for a spend to change is told from here instead. Bubbling,
       * because the listener is on the dialog rather than on the field. */
      list.dispatchEvent(new Event("change", { bubbles: true }));
    };

    list.addEventListener("click", (event) => {
      if (!event.target.closest?.(".remove-skill")) return;
      const row = event.target.closest(".skill-pick");
      if (!row) return;
      picked.delete(row.dataset.id);
      draw();
    });

    add?.addEventListener("click", async () => {
      const taken = await this.open(skills, picked);
      if (!taken.length) return;
      for (const id of taken) picked.add(id);
      draw();
    });

    draw();
    return { chosen: () => [...picked] };
  }

  /**
   * The picker itself: everything the character knows, with what is already
   * chosen marked rather than hidden — a skill missing from the list reads as
   * a bug, where one marked "chosen" reads as an answer.
   *
   * @param {object[]} skills   every skill the character has
   * @param {Set<string>} taken what is already on the venture
   * @returns {Promise<string[]>} ids to add; empty if the window was dismissed
   */
  static async open(skills, taken = new Set()) {
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("ISUN.SkillPickerTitle"), icon: "fa-solid fa-plus" },
      classes: ["invisible-sun", "skill-picker"],
      position: { width: 420, height: 520 },
      content: this.#content(this.#grouped(skills, taken)),
      buttons: [
        { action: "add", label: game.i18n.localize("ISUN.PickerAdd"), default: true,
          icon: "fa-solid fa-plus",
          callback: (event, button) =>
            [...button.form.querySelectorAll("input[name=pick]:checked")].map(i => i.value) },
        { action: "cancel", label: game.i18n.localize("ISUN.Cancel"), icon: "fa-solid fa-xmark" }
      ],
      render: (event, dialog) => this.#live(dialog.element),
      rejectClose: false
    });
    return Array.isArray(result) ? result : [];
  }

  /**
   * By category, in the order the config names them — the order the sheet
   * shows and the order a new level is priced in.
   *
   * A skill whose category is unset or unrecognised still has to be reachable,
   * so it falls into a last group with no heading rather than out of the list.
   */
  static #grouped(skills, taken) {
    const categories = CONFIG.ISUN?.skillCategories ?? {};
    const groups = new Map(Object.entries(categories)
      .map(([key, label]) => [key, { label: game.i18n.localize(label), skills: [] }]));
    const loose = { label: "", skills: [] };

    for (const s of skills) {
      const entry = { ...s, level: Number(s.level) || 0, taken: taken.has(s.id) };
      (groups.get(s.category) ?? loose).skills.push(entry);
    }
    return [...groups.values(), loose].filter(g => g.skills.length);
  }

  static #content(groups) {
    const esc = foundry.utils.escapeHTML;
    const row = s => `
      <label class="picker-row${s.taken ? " held" : ""}" data-search="${esc(s.name.toLowerCase())}">
        <input type="checkbox" name="pick" value="${esc(s.id)}" ${s.taken ? "disabled" : ""} />
        <span class="picker-name">${esc(s.name)}</span>
        <span class="picker-level">+${s.level}</span>
        ${s.taken ? `<span class="picker-held">${game.i18n.localize("ISUN.SkillPickerTaken")}</span>` : ""}
      </label>`;

    const block = g => `
      <div class="picker-group">
        ${g.label ? `<div class="picker-group-name">${esc(g.label)}</div>` : ""}
        ${g.skills.map(row).join("")}
      </div>`;

    return `<div class="skill-picker-body">
      <p class="hint">${game.i18n.localize("ISUN.VentureTwoSkillsHint")}</p>
      <input type="search" class="picker-search" autofocus
             placeholder="${game.i18n.localize("ISUN.SkillPickerSearch")}" />
      <div class="picker-list">${groups.map(block).join("")}</div>
      <p class="picker-count"></p>
    </div>`;
  }

  /**
   * Filter as the player types, and keep the Add button honest.
   *
   * The same job CompendiumPicker does for a pack, with one addition: a group
   * whose rows have all been filtered away goes too, so a search does not leave
   * a column of headings standing over nothing.
   */
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
      for (const group of root.querySelectorAll(".picker-group")) {
        group.classList.toggle("hidden", ![...group.querySelectorAll(".picker-row")]
          .some(r => !r.classList.contains("hidden")));
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

  /** One row per skill on the venture: the level it adds, and a way off. */
  static #rows(skills) {
    if (!skills.length) {
      return `<p class="skill-empty">${game.i18n.localize("ISUN.SkillNone")}</p>`;
    }
    const esc = foundry.utils.escapeHTML;
    return skills.map(s => `
      <div class="skill-pick" data-id="${esc(s.id)}">
        <input type="hidden" name="skills" value="${esc(s.id)}" />
        <span class="skill-pick-name">${esc(s.name)}</span>
        <span class="skill-pick-level">+${Number(s.level) || 0}</span>
        <a class="remove-skill" data-tooltip="${game.i18n.localize("ISUN.Remove")}">
          <i class="fa-solid fa-xmark"></i>
        </a>
      </div>`).join("");
  }
}
