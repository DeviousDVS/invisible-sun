/**
 * Invisible Sun — what a character arc's beat is made of
 *
 * Its own file, and it touches nothing: the importer writes beats, the model
 * migrates the ones written before there was a field for their name, and both
 * have to agree about where a name ends and the prose begins. A data model may
 * not reach up to an importer, so the rule lives at the bottom where both can
 * reach down to it — and being free of Foundry, it can be tested in Node.
 */
/**
 * A beat, taken apart.
 *
 * Every one of them is written the same way: a name, then what it pays, then
 * what happens — "Research. 1 Acumen reward. You look into your own family
 * background…". All three used to be kept as one string with the reward copied
 * out beside it, which left the name of a beat existing only as the first words
 * of its prose. The sheet could show "Step 1" and never "Research".
 *
 * The title is the leading sentence. The reward sentence is dropped from the
 * description when it follows the title, because it is already a field and the
 * prose then reads as prose; a reward stated anywhere else is still lifted out
 * but left where it stands, since moving it would break the sentence it is in.
 *
 * Nothing is invented: a beat with no leading sentence keeps its whole text as
 * the description and gets no title.
 */
/* What a beat pays, stated inside its own sentence rather than in a field, and
   always in the same three currencies. */
const REWARD_RE = /(\d+\s+Acumen[^.]*|1\s+Joy[^.]*|1\s+Despair[^.]*)/i;
const TITLE_RE = /^\s*([^.]{2,60})\.(?=\s|$)\s*/;
/* Anchored to the start of the final sentence, not just to the end of the
   string. Unanchored, "Failure results in 1 Despair." matched from the "1" and
   would have left a beat reading "…Failure results in". */
const TRAILING_REWARD_RE =
  /(?:^|(?<=\.\s))(\d+\s+Acumen[^.]*|1\s+Joy[^.]*|1\s+Despair[^.]*)\.\s*$/i;
const LEADING_REWARD_RE = /^(\d+\s+Acumen[^.]*|1\s+Joy[^.]*|1\s+Despair[^.]*)\.(?=\s|$)\s*/i;

function looksLikeAName(text) {
  /* The rules' own nouns are not evidence of a name. They are capitalised
   * wherever they appear — "the swearing pays 2 Acumen at once", "There is no
   * Joy reward possibility" — and either would otherwise pass for title case.
   * Taken out before the words are counted. */
  const words = text.replace(REWARD_RE, " ").trim().split(/\s+/)
    .filter(w => w && !/^(Acumen|Joy|Despair)[.,;:]?$/i.test(w));
  if (!words.length) return false;
  if (words.length === 1) return true;
  // "the", "a", "of" stay lowercase in a title, so one more capital is enough.
  return words.slice(1).some(w => /^[A-Z]/.test(w));
}

export function splitBeat(text) {
  const whole = String(text ?? "").replace(/\s+/g, " ").trim();
  const reward = REWARD_RE.exec(whole)?.[1].trim() ?? "";

  /* A beat that leads with its price has no name. "1 Acumen reward. You finally
   * know." reads as a title followed by prose to a rule that only looks for a
   * leading sentence, and the resolution of Mysterious Background came out
   * called "1 Acumen reward". The price is dropped either way, since it is a
   * field already. */
  const priced = LEADING_REWARD_RE.exec(whole);
  if (priced) return { title: "", description: whole.slice(priced[0].length).trim(), reward };

  const titled = TITLE_RE.exec(whole);
  if (!titled) return { title: "", description: whole, reward };

  /* A name is written like a name.
   *
   * Length is not the tell. The book prices some beats after their name —
   * "Research. 1 Acumen reward. You look into…" — and others after their prose:
   * "You contemplate how this new knowledge sits with you. 1 Acumen reward."
   * Both are a short leading sentence followed by a price, so a rule that
   * counted characters called twenty resolutions "You contemplate how this new
   * knowledge sits with you" and left their descriptions empty.
   *
   * What separates them is case. Every name the book gives a beat is a noun
   * phrase in title case — Research, Discovery, Beginning the Search, Sharing
   * Your Home — and every unnamed beat opens with an ordinary sentence, one
   * capital and then lowercase. So a leading sentence is a name when it is one
   * word, or when some word after the first also starts capitalised. */
  if (!looksLikeAName(titled[1])) {
    /* Unnamed, but the price still gets out of the prose — it is a field
     * already. Safe to do without a title to guard it, because taking a
     * sentence off either end leaves the front of the prose where it was. */
    return { title: "", description: whole.replace(TRAILING_REWARD_RE, "").trim(), reward };
  }

  const rest = whole.slice(titled[0].length);
  const echoed = LEADING_REWARD_RE.exec(rest);
  return {
    title: titled[1].trim(),
    description: (echoed ? rest.slice(echoed[0].length) : rest).trim(),
    reward
  };
}
