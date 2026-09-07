/**
 * Every HTMLField path in a data model, including those nested in schemas.
 *
 * These are exactly the fields an editor is opened on, so collecting them from
 * the schema means no sheet has to keep a list of its own editable prose in
 * step with its template.
 */
function htmlFieldPaths(schema, prefix = "system") {
  const { HTMLField, SchemaField } = foundry.data.fields;
  const out = [];
  for (const [key, field] of Object.entries(schema?.fields ?? {})) {
    const path = `${prefix}.${key}`;
    if (field instanceof HTMLField) out.push(path);
    else if (field instanceof SchemaField) out.push(...htmlFieldPaths(field, path));
  }
  return out;
}

export const SheetMixin = (Base) => class extends Base {
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.document.system;
    context.config = CONFIG.ISUN;
    // Per-client, so the same sheet shows a GM controls a player does not.
    context.isGM = game.user.isGM;

    if (this.document.documentName === "Actor") {
      context.actor = this.document;
    } else if (this.document.documentName === "Item") {
      context.item = this.document;
    }

    /* Enriched prose for the editors, keyed by the path the template targets.
     * A toggled <prose-mirror> shows this when it is closed, so it is what
     * turns @UUID references and inline rolls into links rather than raw text.
     * Enriching is async, which is why it happens here and not in the helper. */
    const { TextEditor } = foundry.applications.ux;
    context.enriched = {};
    for (const path of htmlFieldPaths(this.document.system?.schema)) {
      const value = foundry.utils.getProperty(this.document, path);
      if (typeof value !== "string") continue;
      context.enriched[path] = await TextEditor.implementation.enrichHTML(value, {
        relativeTo: this.document,
        rollData: this.document.getRollData?.() ?? {},
        secrets: this.document.isOwner
      });
    }

    return context;
  }

  /* The portrait used to bind its own FilePicker here. DocumentSheetV2 ships an
   * `editImage` action that does the same thing and respects permissions, and
   * every profile-img already carried the data-edit="img" it reads — so the
   * templates name the core action and this mixin no longer needs a listener. */

  /**
   * Where a sheet scrolls, so that pressing something does not lose your place.
   *
   * Every one of these sheets is a single Handlebars part, which means every
   * render replaces the whole of it. ApplicationV2 will put the scroll back
   * afterwards, but only for the selectors a part names in `scrollable` — and
   * naming none, as all eight of these did, means a click anywhere returns you
   * to the top. Ticking a spell into mind two thirds of the way down the magic
   * tab sent the page back to the portrait, and the next tick had to be hunted
   * for again.
   *
   * One selector covers it: `.sheet-body` is the scrolling element on every
   * sheet here, actor and item alike, and measurement says nothing else on one
   * of them scrolls at all. A sheet that grows a second scroller adds it here.
   */
  static SCROLLABLE = [".sheet-body"];

  /**
   * Record where each of them was, for `_syncPartState` to put back.
   *
   * Added to what the parent collected rather than replacing it: it also
   * records which field had focus and which `<details>` were open, and losing
   * either would trade one kind of lost place for another.
   *
   * Recorded here rather than declared as `scrollable` on each part because
   * `PARTS` is written out in eight separate sheets, and a rule that has to be
   * remembered eight times is a rule that will be missed on the ninth.
   */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    for (const selector of this.constructor.SCROLLABLE ?? []) {
      const el = priorElement.querySelector(selector);
      /* Only where there is something to remember. A sheet shorter than its
       * window scrolls to 0, and writing that back is harmless but it is also
       * a line of state saying nothing. */
      if (el?.scrollTop || el?.scrollLeft) {
        state.scrollPositions.push([selector, el.scrollTop, el.scrollLeft]);
      }
    }
  }
}

export const ActorSheetMixin = (Base) => class extends SheetMixin(Base) {
  /* Declared rather than bound by hand. ApplicationV2 merges an actions map up
   * the class hierarchy, so a mixin can contribute its three and the sheet its
   * own without either knowing about the other.
   *
   * This is the fix for a bug that happened twice here. These were once bound
   * to [data-action="item-create"], an attribute no template set, so nothing
   * was ever attached; then they were bound by class, and the secret chips —
   * which are not .item rows — silently did nothing. Both failed in silence.
   * An action named in markup with no entry in this map now raises a console
   * warning, and npm test refuses the commit. */
  static DEFAULT_OPTIONS = {
    actions: {
      "item-create": this.prototype._onItemCreate,
      "item-edit":   this.prototype._onItemEdit,
      "item-delete": this.prototype._onItemDelete
    }
  };

  async _onItemCreate(event, target) {
    event.preventDefault();
    const type = target.dataset.type;
    if (!type) return;
    const label = game.i18n.localize(`TYPES.Item.${type}`);
    const itemData = {
      name: game.i18n.format("DOCUMENT.New", { type: label.startsWith("TYPES.") ? type : label }),
      type,
      img: CONFIG.ISUN?.itemTypeIcons?.[type]
    };

    // A create button may seed system fields via data-preset, so that e.g. the
    // "PC Bonds" heading creates a Connection already set to that bond type
    // rather than making the user pick it afterwards.
    const preset = target.dataset.preset;
    if (preset) {
      try {
        itemData.system = JSON.parse(preset);
      } catch (err) {
        console.warn("invisible-sun | unparseable data-preset on create button", preset, err);
      }
    }

    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  _onItemEdit(event, target) {
    event.preventDefault();
    const id = this._itemIdFor(target);
    if (!id) return;
    this.document.items.get(id)?.sheet?.render(true);
  }

  /**
   * The id of the item a control belongs to.
   *
   * Looking for a `.item` ancestor only works for the list rows that happen to
   * carry that class. Secrets are rendered as chips — `.secret-chip` — so their
   * delete button found nothing and silently did nothing, on the Magic tab as
   * well as under Appearance.
   *
   * What every one of them does have is `data-item-id`, on the control itself
   * or on the element wrapping it, so that is what to look for.
   */
  _itemIdFor(element) {
    return element.closest("[data-item-id]")?.dataset.itemId ?? null;
  }

  _onItemDelete(event, target) {
    event.preventDefault();
    const id = this._itemIdFor(target);
    if (!id) return;
    this.document.deleteEmbeddedDocuments("Item", [id]);
  }
}
