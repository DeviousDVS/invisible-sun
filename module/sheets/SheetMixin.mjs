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

  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    
    htmlElement.querySelectorAll('.profile-img').forEach(el => {
      el.addEventListener('click', () => {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.document.img,
          callback: path => this.document.update({ img: path })
        }).render(true);
      });
    });
  }
}

export const ActorSheetMixin = (Base) => class extends SheetMixin(Base) {
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);
    
    // Bound by class, matching the markup the templates actually emit. These
    // were previously bound to [data-action="item-create"], an attribute no
    // template sets, so no listener was ever attached.
    htmlElement.querySelectorAll('.item-create').forEach(el => {
      el.addEventListener('click', ev => this._onItemCreate(ev));
    });
    htmlElement.querySelectorAll('.item-edit').forEach(el => {
      el.addEventListener('click', ev => this._onItemEdit(ev));
    });
    htmlElement.querySelectorAll('.item-delete').forEach(el => {
      el.addEventListener('click', ev => this._onItemDelete(ev));
    });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const type = event.currentTarget.dataset.type;
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
    const preset = event.currentTarget.dataset.preset;
    if (preset) {
      try {
        itemData.system = JSON.parse(preset);
      } catch (err) {
        console.warn("invisible-sun | unparseable data-preset on create button", preset, err);
      }
    }

    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  _onItemEdit(event) {
    event.preventDefault();
    const id = this._itemIdFor(event.currentTarget);
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

  _onItemDelete(event) {
    event.preventDefault();
    const id = this._itemIdFor(event.currentTarget);
    if (!id) return;
    this.document.deleteEmbeddedDocuments("Item", [id]);
  }
}
