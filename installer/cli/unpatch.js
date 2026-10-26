/**
 * installer/cli/unpatch.js
 *
 * Restores the selected Fluxer app.asar from a marker-verified Fluxtop backup.
 *
 * Run with: node installer/cli/unpatch.js
 * Override: FLUXER_ASAR=C:\...\app.asar node installer/cli/unpatch.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const {createInterface} = require('node:readline/promises');
const {
  FLUXTOP_MARKER,
  chooseInstance,
  discoverInstances,
  normalizeAsarPath,
  readMainEntry,
} = require('../lib/instances.js');

// ---------------------------------------------------------------------------
// Helpers — mirrors the search logic in index.js
// ---------------------------------------------------------------------------

function promptForInstance(instances) {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  console.log('Fluxtop installations found:');
  instances.forEach((instance, index) => console.log(`  ${index + 1}) ${instance.label} — ${instance.asarPath}`));
  return rl.question('Select an instance number: ').finally(() => rl.close());
}

async function findResourcesDir() {
  if (process.env.FLUXER_ASAR) {
    return normalizeAsarPath(process.env.FLUXER_ASAR, path).resourcesDir;
  }
  const instances = discoverInstances({purpose: 'uninstall'});
  return (await chooseInstance(instances, {
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    prompt: promptForInstance,
  })).resourcesDir;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const resourcesDir = await findResourcesDir();
  const asarPath     = path.join(resourcesDir, 'app.asar');
  const bakPath      = asarPath + '.bak';

  console.log(`[Fluxtop] Resources dir: ${resourcesDir}`);

  // ── Step 1: Restore original asar ───────────────────────────────────────
  if (!fs.existsSync(asarPath)) throw new Error(`Fluxer archive not found: ${asarPath}`);
  if (!fs.existsSync(bakPath)) throw new Error('Fluxtop backup not found. Cannot restore.');
  if (!readMainEntry(asarPath).includes(FLUXTOP_MARKER)) {
    throw new Error('Active archive is not marked as a Fluxtop install; refusing to restore its backup.');
  }
  try {
    fs.accessSync(resourcesDir, fs.constants.W_OK);
    fs.accessSync(asarPath, fs.constants.W_OK);
  } catch {
    throw new Error(`No write permission for selected Fluxer instance: ${asarPath}`);
  }
  fs.copyFileSync(bakPath, asarPath);
  console.log(`[Fluxtop] Restored original asar from: ${bakPath}`);

  fs.unlinkSync(bakPath);
  console.log('[Fluxtop] Backup removed.');

  // ── Step 2: Clean up Fluxtop's own temporary directories ────────────────
  for (const suffix of ['.fluxtop-tmp', '.fluxtop-full-extract']) {
    const tmpDir = path.join(resourcesDir, suffix);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
      console.log(`[Fluxtop] Removed temp dir: ${tmpDir}`);
    }
  }

  console.log('\n[Fluxtop] Uninstalled successfully. Restart Fluxer to apply.');
}

main().catch((err) => {
  console.error('[Fluxtop] Uninstall failed:', err.message);
  process.exit(1);
});
