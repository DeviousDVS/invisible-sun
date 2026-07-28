const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../source/data');
const PACKS_DIR = path.join(__dirname, '../packs/_source');

const crypto = require('crypto');

function generateId(name, type) {
  return crypto.createHash('md5').update(type + ':' + name).digest('hex').substring(0, 16);
}

function cleanHtml(text) {
  if (!text) return "";
  return `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
}

function createItem(name, type, systemData, img) {
  const id = generateId(name, type);
  return {
    _id: id,
    _key: `!items!${id}`,
    name: name,
    type: type,
    img: img || "icons/svg/item-bag.svg",
    system: systemData,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 }
  };
}

function writeItem(packName, item) {
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) fs.mkdirSync(packDir, { recursive: true });
  
  // Safe filename
  const safeName = item.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filePath = path.join(packDir, `${safeName}_${item._id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
}

// Spells
if (fs.existsSync(path.join(SOURCE_DIR, 'spells.json'))) {
  const spellsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'spells.json'), 'utf8'));
  for (const [name, data] of Object.entries(spellsData)) {
    const item = createItem(name, "Spell", {
      level: parseInt(data.level) || 1,
      color: data.color || "",
      depletion: data.depletion || "",
      description: cleanHtml(data.description),
      dice: data.dice || "",
      facets: data.facets || "",
      spellType: "general"
    }, "icons/magic/symbols/runes-star-pentagram-blue.webp");
    writeItem("spells", item);
  }
  console.log(`Processed ${Object.keys(spellsData).length} spells.`);
}

// Incantations
if (fs.existsSync(path.join(SOURCE_DIR, 'incantations.json'))) {
  const incantationsData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'incantations.json'), 'utf8'));
  for (const [name, data] of Object.entries(incantationsData)) {
    const item = createItem(name, "Incantation", {
      level: parseInt(data.level) || 1,
      color: data.color || "",
      depletion: data.depletion || "",
      description: cleanHtml(data.description),
      dice: data.dice || "",
      facets: data.facets || ""
    }, "icons/magic/symbols/rune-sigil-yellow.webp");
    writeItem("incantations", item);
  }
  console.log(`Processed ${Object.keys(incantationsData).length} incantations.`);
}

// Fortes
if (fs.existsSync(path.join(SOURCE_DIR, 'fortes.json'))) {
  const fortesData = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'fortes.json'), 'utf8'));
  let abilitiesCount = 0;
  for (const data of fortesData) {
    const item = createItem(data.name, "Forte", {
      description: cleanHtml(data.description),
      background: cleanHtml(data.background),
      appearance: cleanHtml(data.appearance),
      suggestedArcs: data.character_arcs || "",
      pathToJoy: cleanHtml(data.path_to_joy),
      pathToDespair: cleanHtml(data.path_to_despair)
    }, "icons/magic/light/explosion-star-glow-silhouette.webp");
    writeItem("fortes", item);

    if (data.abilities && data.abilities.length > 0) {
      for (const ability of data.abilities) {
        const abItem = createItem(ability.name, "ForteAbility", {
          description: cleanHtml(ability.description)
        }, "icons/skills/melee/strike-slashes-orange.webp");
        writeItem("forte-abilities", abItem);
        abilitiesCount++;
      }
    }
  }
  console.log(`Processed ${fortesData.length} fortes and ${abilitiesCount} forte abilities.`);
}

const simpleTypes = [
  { file: 'character-arcs.json', type: 'CharacterArc', pack: 'character-arcs', icon: 'icons/sundries/documents/document-symbol-star-yellow.webp' },
  { file: 'foundations.json', type: 'Foundation', pack: 'foundations', icon: 'icons/environment/settlement/house-wood.webp' },
  { file: 'hearts.json', type: 'Heart', pack: 'hearts', icon: 'icons/magic/life/heart-glowing-red.webp' },
  { file: 'orders.json', type: 'Order', pack: 'orders', icon: 'icons/magic/symbols/ring-circle-smoke-blue.webp' },
  { file: 'souls.json', type: 'Soul', pack: 'souls', icon: 'icons/magic/life/soul-spirit-blue.webp' }
];

for (const st of simpleTypes) {
  if (fs.existsSync(path.join(SOURCE_DIR, st.file))) {
    const dataObj = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, st.file), 'utf8'));
    let count = 0;
    
    if (Array.isArray(dataObj)) {
      for (const data of dataObj) {
        const item = createItem(data.name, st.type, {
          description: cleanHtml(data.description)
        }, st.icon);
        writeItem(st.pack, item);
        count++;
      }
    } else {
      for (const [name, data] of Object.entries(dataObj)) {
        const item = createItem(name, st.type, {
          description: typeof data === 'string' ? cleanHtml(data) : cleanHtml(data.description || "")
        }, st.icon);
        writeItem(st.pack, item);
        count++;
      }
    }
    console.log(`Processed ${count} ${st.pack}.`);
  }
}
