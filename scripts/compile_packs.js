const { compilePack } = require('@foundryvtt/foundryvtt-cli');
const path = require('path');
const fs = require('fs');

const SOURCE_DIR = path.join(__dirname, '../packs/_source');
const DEST_DIR = path.join(__dirname, '../packs_temp');
const FINAL_DIR = path.join(__dirname, '../packs');

async function compileAll() {
  // Ensure temp dir exists and is empty
  if (fs.existsSync(DEST_DIR)) fs.rmSync(DEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DEST_DIR, { recursive: true });

  const packs = fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

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
    }
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
}

compileAll();
