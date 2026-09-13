/**
 * Invisible Sun — which picture belongs to which creature
 *
 * The authoritative mapping, and the reason it is a file in the repository
 * rather than a setting in somebody's world: a world setting helps exactly one
 * table. This ships, so every reader who imports Teratology gets the portraits
 * somebody already matched instead of 307 identical icons.
 *
 * It works across installations because the paths are not this machine's. The
 * importer saves a book's art named for the page it was printed on, and a page
 * is a fact about the book — so the same PDF gives the same file names to
 * everyone, and `teratology/p128-1.webp` means the same picture here as it does
 * anywhere else. A reader with a different printing may find some of them
 * shifted; a mapping whose file is missing is passed over rather than shown as
 * a broken image, so the worst that costs is the default icon.
 *
 * ── Editing this ──
 * Do not, by hand. Open the Match Portraits window, do the matching there, and
 * press Export — it writes this file's exact contents, ready to be dropped in
 * and committed. Matching by hand in here means typing page numbers from memory
 * against 399 files, which is the mistake this window exists to prevent.
 *
 * Anything a world sets locally wins over what is written here, so a table that
 * disagrees with your copy of a book can be corrected without a release.
 *
 * Paths are relative to the folder the importer saves art into. Keys are the
 * book as the creature records it, then the creature's name.
 */
export const SHIPPED_PORTRAITS = {
};
