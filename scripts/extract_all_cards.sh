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
  "$CARDS/Sooth Deck-Self Print-2019-02-13.pdf" "$DATA/sooth.json" | head -1

echo "== aggregates"
"$PY" scripts/extract_aggregates.py \
  "$CARDS/Weaver Aggregates-Self Print-2019-02-13.pdf" "$DATA/aggregates.json" | head -1

echo
echo "Now run: node scripts/build_compendia.js"
