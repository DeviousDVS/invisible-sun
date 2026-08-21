#!/usr/bin/env bash
# Rebuild every dataset that comes from the printed card decks.
#
# The decks live in source/cards/, which is gitignored — they are Monte Cook
# Games PDFs. Only the extracted JSON is committed.
#
# Usage:  scripts/extract_all_cards.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARDS=source/cards
DATA=source/data
PY=${PYTHON:-python3}

if [ ! -d "$CARDS" ]; then
  echo "No $CARDS/ — unpack the card PDFs there first." >&2
  exit 1
fi

echo "== spells"
"$PY" scripts/extract_spell_cards.py "$DATA/spell-cards.json" \
  "$CARDS/Spell Deck-Self Print-2019-02-13.pdf" \
  "$CARDS/Vance Spell Deck-Self Print-2019-02-13.pdf" \
  "$CARDS/Invisible Sun - Book M - Spell Cards.pdf" \
  "$CARDS/TN Vance Spell Cards.pdf" \
  "$CARDS/TN Base Cards.pdf"

echo "== incantations"
"$PY" scripts/extract_spell_cards.py "$DATA/incantation-cards.json" \
  "$CARDS/Incantations Deck-Self Print-2019-02-13.pdf"

# Spells and incantations print the same card, so the decks that mix them are
# separated against the book lists rather than on the card face.
echo "== merge"
"$PY" scripts/merge_cards.py "$DATA/spell-cards.json" "$DATA/incantation-cards.json"

echo "== objects of power"
(cd scripts && "$PY" extract_object_cards.py "../$DATA/objects-of-power.json" \
  "../$CARDS/Objects of Power Deck-Self Print-2019-02-13.pdf" \
  "../$CARDS/Invisible Sun - Book M - Objects of Power Cards.pdf" \
  "../$CARDS/TN Base Cards.pdf")

echo "== ephemera"
(cd scripts && "$PY" extract_object_cards.py "../$DATA/ephemera.json" \
  "../$CARDS/Ephemera Objects Deck-Self Print-2019-02-13.pdf" \
  "../$CARDS/Invisible Sun - Book M - Ephemera-Cards.pdf")

echo "== sooth deck"
"$PY" scripts/extract_sooth.py \
  "$CARDS/Sooth Deck-Self Print-2019-02-13.pdf" "$DATA/sooth-cards.json" | head -1

# The cards give a name, a value and the suns; everything that makes a card
# usable at the table is written up in The Gate, one card to a page.
GATE="source/books/The-Gate-Hyperlinked-and-Bookmarked-2019-02-14_5c75d15831fa9.pdf"
if [ -f "$GATE" ]; then
  "$PY" scripts/extract_sooth_entries.py "$GATE" "$DATA/sooth-cards.json" "$DATA/sooth.json"
else
  echo "  (skipped the write-ups: $GATE not present)"
fi

# The card faces, cut out of the same PDFs. These are pictures of somebody
# else's cards, so unlike the JSON they never enter the repository: they are
# written into Foundry's data folder, beside the system rather than inside it,
# where a system update cannot remove them and the release build cannot pick
# them up. Set ISUN_ASSETS to put them somewhere else.
#
# Skipped with SKIP_IMAGES=1 — they take a minute a deck and only change when
# MCG reissues a PDF, whereas the JSON above is re-extracted often.
ASSETS=${ISUN_ASSETS:-../../invisible-sun/cards}
if [ "${SKIP_IMAGES:-0}" != "1" ]; then
  echo "== sooth card images"
  "$PY" scripts/extract_card_images.py \
    "$CARDS/Sooth Deck-Self Print-2019-02-13.pdf" "$DATA/sooth-cards.json" \
    "$ASSETS/sooth"
fi

echo "== aggregates"
"$PY" scripts/extract_aggregates.py \
  "$CARDS/Weaver Aggregates-Self Print-2019-02-13.pdf" "$DATA/aggregates.json" | head -1

echo
echo "Now run: node scripts/build_compendia.js"
