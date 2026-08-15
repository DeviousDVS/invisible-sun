# Invisible Sun — Foundry VTT System

This is a custom system for playing the **Invisible Sun** roleplaying game (by Monte Cook Games) on [Foundry Virtual Tabletop](https://foundryvtt.com/). Step into the Actuality, a surreal world where ideas have power, magic is real, and the ordinary is extraordinary.

## Features

- **Custom Actor Sheets:** Support for Vislae (player characters), NPCs, and Creatures.
- **Custom Item Sheets:** Comprehensive support for all facets of a Vislae's character and magic, including:
  - **Character Aspects:** Heart, Foundation, Soul, Order, Forte.
  - **Magic & Abilities:** Spells, Incantations, Secrets, Skills, Ephemera, Objects of Power, and Forte Abilities.
  - **Narrative Elements:** Character Arcs and Sooth Cards.
- **Compendium Packs:** Pre-configured packs for Character Arcs, Forte Abilities, Fortes, Foundations, Hearts, Incantations, Orders, Souls, and Spells.
- **Chat Commands:** Built-in hooks for chat commands like `/venture` to trigger dice rolls and magic mechanics directly from the chat.
- **Foundry v14 Support:** Designed and verified for Foundry VTT version 14.

## Installation

### Manual Installation
1. Navigate to your Foundry VTT `Data/systems/` directory.
2. Clone or extract the contents of this repository into a folder named `invisible-sun`.
3. Restart Foundry VTT.
4. When creating a new world in Foundry, select **Invisible Sun** as your game system.

## Development

If you are contributing to the system or looking to modify the compendia, this project includes utility scripts to help manage data.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed, and install the required dependencies:
```bash
npm install
```

### Managing Compendium Packs
The `scripts/` directory contains tools for packing and unpacking compendium data:
- `build_compendia.js`
- `compile_packs.js`

These scripts utilize the `@foundryvtt/foundryvtt-cli` to help compile your source JSON data into LevelDB packs (and vice versa).

## Compatibility

- **Foundry VTT Minimum Version:** 14.354
- **Foundry VTT Verified Version:** 14.364

## Authors

- **DeviousDVS**

## Licence

The system's code — sheets, templates, styles, and the tools under `scripts/` — is released under the [MIT licence](LICENSE). Use it, fork it, learn from it.

That licence covers the software only. It does not cover the game.

## Legal

*Invisible Sun* and its associated properties are trademarks and copyrights of Monte Cook Games. This system is an unofficial fan creation for playing the game on Foundry VTT, produced under the [Monte Cook Games Fan Use Policy](https://www.montecookgames.com/fan-support/fan-use-policy/). It is not affiliated with, endorsed by, or published by Monte Cook Games.

No Invisible Sun rules text is distributed with this system. If you own the books, the tools under `scripts/` let you generate compendium content from your own copy for your own table's use; that content remains the property of Monte Cook Games and should not be redistributed.

If you do not own Invisible Sun, [buy it from Monte Cook Games](https://www.montecookgames.com/store/product-category/invisible-sun/) — this system is no substitute for the books, and is not much use without them.
