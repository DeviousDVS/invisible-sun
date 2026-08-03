const { compilePack } = require('@foundryvtt/foundryvtt-cli');
const path = require('path');
const fs = require('fs');

const SOURCE_DIR = path.join(__dirname, '../packs/_source');
const DEST_DIR = path.join(__dirname, '../packs_temp');
const FINAL_DIR = path.join(__dirname, '../packs');

/**
 * Refuse to run while Foundry has the packs open.
 *
 * Compiling replaces each pack directory wholesale. Doing that under a running
 * server pulls the databases out from under it: its open handles point at
 * deleted files, and when it next opens the pack it finds a directory it has no
 * manifest for, fails with LEVEL_DATABASE_NOT_OPEN, and LevelDB's recovery
 * sweeps what is left into a lost/ folder. The pack ends up empty.
 *
 * Checking for a Foundry process is unreliable — it can be running under any
 * name, and an absent process is not proof nothing else holds the files. The
 * lock itself is the authority: LevelDB permits exactly one writer, so if a
 * pack can be opened here, nothing else has it.
 */
async function assertPacksUnlocked(packs) {
  const { ClassicLevel } = require('classic-level');
  const held = [];
  for (const pack of packs) {
    const dir = path.join(FINAL_DIR, pack);
    if (!fs.existsSync(dir)) continue;      // new pack, nothing to hold it
    const db = new ClassicLevel(dir, { createIfMissing: false });
    try {
      await db.open();
      await db.close();
    } catch (err) {
      held.push(pack);
    }
  }
  if (held.length) {
    throw new Error(
      `Cannot compile: ${held.length} pack(s) are locked or unreadable — `
      + `${held.join(', ')}.\nStop Foundry (or whatever holds them) and run again. `
      + `Nothing has been changed.`);
  }
}

async function compileAll() {
  const packs = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  await assertPacksUnlocked(packs);

  // Ensure temp dir exists and is empty
  if (fs.existsSync(DEST_DIR)) fs.rmSync(DEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEST_DIR, { recursive: true });

  const failed = [];
  for (const pack of packs) {
    console.log(`Compiling pack: ${pack}`);
    const src = path.join(SOURCE_DIR, pack);
    const dest = path.join(DEST_DIR, pack);

    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

    try {
      await compilePack(src, dest, { yaml: false, log: true });
      console.log(`Successfully compiled ${pack}`);
    } catch (err) {
      console.error(`Failed to compile ${pack}:`, err);
      failed.push(pack);
    }
  }

  // Moving deletes the live pack first, so a pack that failed to compile would
  // be replaced by nothing. Nothing is moved unless every pack built.
  if (failed.length) {
    fs.rmSync(DEST_DIR, { recursive: true, force: true });
    throw new Error(`${failed.length} pack(s) failed to compile: ${failed.join(', ')}. `
                    + `The live packs are untouched.`);
  }

  // Move them to final dir
  for (const pack of packs) {
    const srcPath = path.join(DEST_DIR, pack);
    const destPath = path.join(FINAL_DIR, pack);
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    fs.renameSync(srcPath, destPath);
  }

  fs.rmSync(DEST_DIR, { recursive: true, force: true });
  console.log(`\nCompiled ${packs.length} packs.`);
}

compileAll().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
