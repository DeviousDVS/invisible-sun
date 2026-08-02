export const SheetMixin = (Base) => class extends Base {
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.system = this.document.system;
    context.config = CONFIG.ISUN;
    
    if (this.document.documentName === "Actor") {
      context.actor = this.document;
    } else if (this.document.documentName === "Item") {
      context.item = this.document;
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
    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  _onItemEdit(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    if (!li) return;
    const item = this.document.items.get(li.dataset.itemId);
    item?.sheet?.render(true);
  }

  _onItemDelete(event) {
    event.preventDefault();
    const li = event.currentTarget.closest(".item");
    if (!li) return;
    this.document.deleteEmbeddedDocuments("Item", [li.dataset.itemId]);
  }
}
