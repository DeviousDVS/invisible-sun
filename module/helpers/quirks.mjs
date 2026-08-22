/**
 * Invisible Sun — the quirks a vislae may have
 *
 * This file ships, and it ships empty. That is the point of it.
 *
 * "Vislae are odd and varied creatures... You should choose one from the
 * following list of quirks or use these as examples to make up your own"
 * (The Key). The list itself is Monte Cook Games' text, so it is not here and
 * never will be — it is generated from your own copy into quirks.local.mjs,
 * which is gitignored, and loaded at init when it is present.
 *
 * The stub exists because config.mjs imports this statically, at module load:
 * if the file were simply absent the system would not boot at all. So the
 * import always resolves, and the list is filled at init when the local file
 * is there. A fresh install with no generated data logs one 404 for
 * quirks.local.mjs and carries on; that stops as soon as you generate it.
 *
 * To fill it locally:  python3 scripts/build_quirks.py
 */
export const QUIRKS = [];
