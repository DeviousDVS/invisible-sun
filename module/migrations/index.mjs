/**
 * Invisible Sun — world migrations
 *
 * Most shape changes never reach this file. A field that changes type or moves
 * within a document is handled by `migrateData` on the data model, which runs
 * against raw source before cleaning, costs nothing per load and needs no
 * version tracking at all. `VislaeModel` handles four historical shapes that
 * way. Prefer it.
 *
 * What lands here is what `migrateData` cannot do: a change that has to write
 * to the database, or that reaches across documents. Those need to run exactly
 * once, on one client, and be recorded as done.
 *
 * ── The version stamp ──
 * The world stores the system version it was last brought up to date with. Each
 * migration declares the version it arrived in, and only those newer than the
 * stamp are run. A world with no stamp — every world that predates this file —
 * compares as older than everything and therefore runs the lot, which is the
 * safe reading: we cannot know what such a world has already been through.
 *
 * That is only safe because **every migration here must be idempotent**. The
 * stamp is not written when one fails, so the whole set runs again on the next
 * load; a migration that cannot survive running twice will corrupt a world the
 * first time anything after it throws.
 */

const SCOPE = "invisible-sun";
const SETTING = "migrationVersion";

/**
 * Whether this client is the one that should run migrations.
 *
 * A GM — a player has no business rewriting everyone's documents, and an owner
 * has enough permission to succeed at it, so hoping they will not is not a
 * safeguard.
 *
 * And only *one* GM. A world may have several GM accounts connected at once,
 * and every GM client running the same migration at the same moment means each
 * reads the pre-migration value before any of them writes.
 *
 * The lowest-id active GM is elected, which is the same rule ChallengeCard uses
 * to decide which GM applies a relayed response. If that client never gets
 * there, the migration simply runs on the next load.
 */
export function isMigrationRunner() {
  if (!game.user.isGM) return false;
  const first = game.users.filter(u => u.isGM && u.active)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return first?.id === game.user.id;
}

/**
 * economy.savings was a single number of crystal orbs, matching the Foundation
 * entries in The Key ("Initial Savings: 100 crystal orbs"). It is now one
 * denomination among nine in economy.purse.
 *
 * The legacy field is deliberately still declared in VislaeModel: Foundry
 * prunes keys that are absent from the schema, so dropping it outright would
 * make the stored value unreadable here and silently lose a character's money.
 * Migrated actors are left with null, which is what makes this idempotent — a
 * second run finds no numbers and does nothing.
 *
 * This cannot be a migrateData: it moves a value between two fields and has to
 * persist the result, which model cleaning does not do.
 */
async function savingsToPurse() {
  const updates = [];
  for (const actor of game.actors) {
    if (actor.type !== "Vislae") continue;
    const legacy = actor.system?.economy?.savings;
    if (typeof legacy !== "number") continue;

    updates.push({
      _id: actor.id,
      "system.economy.purse.crystal": (actor.system.economy.purse?.crystal ?? 0) + legacy,
      "system.economy.savings": null
    });
  }

  if (!updates.length) return 0;
  // One call, not one per actor: a hundred separate updates is a hundred
  // round trips and a hundred re-renders on every connected client.
  await Actor.updateDocuments(updates);
  ui.notifications?.info(game.i18n.format("ISUN.MigratedSavings", { count: updates.length }));
  return updates.length;
}

/**
 * Every migration, in the order they must run.
 *
 * `version` is the system version the migration arrived in, not the version it
 * migrates from. Add new entries at the end.
 */
const MIGRATIONS = [
  {
    version: "0.1.0",
    id: "savings-to-purse",
    run: savingsToPurse
  }
];

/** Register the world's migration stamp. Call from `init`. */
export function registerMigrationSetting() {
  game.settings.register(SCOPE, SETTING, {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

/**
 * Run whatever this world has not had yet. Call from `ready`.
 *
 * The stamp is advanced only when everything succeeds. A failure leaves it
 * alone so the set is retried next load, and says so loudly rather than
 * leaving a world half-migrated and silently marked as done.
 */
export async function runMigrations() {
  if (!isMigrationRunner()) return;

  const from = game.settings.get(SCOPE, SETTING) || "";
  const to = game.system.version;
  const outstanding = MIGRATIONS.filter(m => foundry.utils.isNewerVersion(m.version, from));

  if (!outstanding.length) {
    // Still stamp it: a world created on 0.1.0 has nothing to do, and recording
    // that now means it is not re-examined on every load forever.
    if (from !== to) await game.settings.set(SCOPE, SETTING, to);
    return;
  }

  console.log(`invisible-sun | migrating world from ${from || "unstamped"} to ${to}`
    + ` — ${outstanding.length} migration(s) to run`);

  for (const migration of outstanding) {
    try {
      const touched = await migration.run();
      console.log(`invisible-sun | migration ${migration.id}: `
        + (touched ? `${touched} document(s) updated` : "nothing to do"));
    } catch (err) {
      console.error(`invisible-sun | migration ${migration.id} failed`, err);
      ui.notifications?.error(
        game.i18n.format("ISUN.MigrationFailed", { id: migration.id }), { permanent: true });
      return;   // stamp untouched, so the set runs again next load
    }
  }

  await game.settings.set(SCOPE, SETTING, to);
  console.log(`invisible-sun | world migrated to ${to}`);
}
