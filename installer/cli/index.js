/**
 * installer/index.js
 *
 * Locates Fluxer's installed resources on Windows and injects Fluxtop by:
 *
 *   1. Backing up the original app.asar as app.asar.bak (idempotent).
 *   2. Injecting into the already-unpacked preload script
 *      (app.asar.unpacked/src-electron/dist/preload/index.js) — no repacking
 *      needed because Electron always reads this file from the filesystem.
 *   3. Injecting a `await import(...)` line into the main-process entry inside
 *      app.asar so that Fluxtop's main-side code (CSP stripping, content script
 *      injection) runs before any Fluxer windows are created.
 *
 * Fluxer uses the Squirrel Windows installer, so the install path is:
 *   %LOCALAPPDATA%\Fluxer\app-<version>\resources\
 *   %LOCALAPPDATA%\Fluxer Canary\app-<version>\resources\   (canary builds)
 *
 * Run with: node installer/index.js
 * Override asar path: FLUXER_ASAR=C:\...\app.asar node installer/index.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const asar = require('@electron/asar');
const {pathToFileURL} = require('url');
const {createInterface} = require('node:readline/promises');
const {
  FLUXTOP_MARKER,
  MAIN_ENTRY_CANDIDATES,
  chooseInstance,
  discoverInstances,
  normalizeAsarPath,
  validateReplacementBackup,
} = require('../lib/instances.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// When compiled with pkg, __dirname is a virtual snapshot path.
// Use the exe's actual directory and navigate up to the repo root instead.
const _BASE = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
const FLUXTOP_ROOT   = path.resolve(_BASE, '..');
const FLUXTOP_MAIN   = path.join(FLUXTOP_ROOT, 'src', 'main-inject.mjs');

/** Path inside the asar where the main-process entry lives (ESM). */
const ASAR_MAIN_ENTRY = 'dist/main/index.js';
const MAIN_ENTRIES = [...new Set([ASAR_MAIN_ENTRY, ...MAIN_ENTRY_CANDIDATES])];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function promptForInstance(instances) {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  console.log('Multiple Fluxer instances found:');
  instances.forEach((instance, index) => console.log(`  ${index + 1}) ${instance.label} — ${instance.asarPath}`));
  return rl.question('Select an instance number: ').finally(() => rl.close());
}

function inspectMainEntry(asarPath) {
  asar.uncache?.(asarPath);
  for (const entry of MAIN_ENTRIES) {
    try {
      return {entry, source: asar.extractFile(asarPath, entry).toString('utf8')};
    } catch {
      // Continue through the supported Fluxer archive layouts.
    }
  }
  throw new Error(`Main entry not found in app.asar. Tried: ${MAIN_ENTRIES.join(', ')}`);
}

function isLegacyRefluxInjection(source) {
  return /await\s+import\(\s*["']file:\/\/[^"']*reflux[^"']*main-inject\.mjs["']\s*\)/i.test(String(source));
}

async function confirmLegacyReplacement() {
  if (process.env.FLUXTOP_REPLACE_REFLUX === '1') return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Replacing the Reflux injection requires confirmation. Re-run interactively or set FLUXTOP_REPLACE_REFLUX=1.');
  }
  const rl = createInterface({input: process.stdin, output: process.stdout});
  try {
    const answer = await rl.question('Replace the Reflux injection with Fluxtop? Reflux settings and the original backup will be retained. [y/N] ');
    return /^y(?:es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function assertTarget(asarPath, purpose) {
  if (!fs.existsSync(asarPath)) throw new Error(`Fluxer archive not found: ${asarPath}`);
  const resourcesDir = path.dirname(asarPath);
  try {
    fs.accessSync(resourcesDir, fs.constants.W_OK);
    fs.accessSync(asarPath, fs.constants.W_OK);
  } catch {
    throw new Error(`No write permission for selected Fluxer instance: ${asarPath}`);
  }

  const {source} = inspectMainEntry(asarPath);
  const installed = source.includes(FLUXTOP_MARKER);
  const legacyInstalled = isLegacyRefluxInjection(source);
  const hasBackup = fs.existsSync(`${asarPath}.bak`);
  if (hasBackup && !installed && !legacyInstalled) {
    throw new Error('A backup exists but this archive is not marked as a Fluxtop install; refusing to modify it.');
  }
  if ((installed || legacyInstalled) && !hasBackup) {
    throw new Error('Fluxtop or Reflux injection found but its backup is missing; refusing to modify this instance.');
  }
  if (legacyInstalled) validateReplacementBackup(asarPath);
  if (purpose === 'uninstall' && (!installed || !hasBackup)) {
    throw new Error('This Fluxer instance has no marker-verified Fluxtop install to uninstall.');
  }
}

async function findResourcesDir(purpose = 'install') {
  if (process.env.FLUXER_ASAR) {
    const target = normalizeAsarPath(process.env.FLUXER_ASAR, path);
    assertTarget(target.asarPath, purpose);
    return target.resourcesDir;
  }

  const instances = discoverInstances({purpose});
  const instance = await chooseInstance(instances, {
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    prompt: promptForInstance,
  });
  if (instance.conflict) {
    throw new Error(`A backup exists but ${instance.asarPath} is not marked as a Fluxtop install; refusing to modify it.`);
  }
  if (!instance.writable) throw new Error(`No write permission for selected Fluxer instance: ${instance.asarPath}`);
  assertTarget(instance.asarPath, purpose);
  return instance.resourcesDir;
}

/**
 * Prepend `line` to a file if it isn't already the first line.
 * Returns true if the file was modified, false if it was already patched.
 * @param {string} filePath
 * @param {string} line
 * @returns {boolean}
 */
function prependOnce(filePath, line) {
  const contents = fs.readFileSync(filePath, 'utf8');
  if (contents.includes(FLUXTOP_MARKER)) {
    return false; // already injected
  }
  fs.writeFileSync(filePath, line + '\n' + contents, 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const resourcesDir = await findResourcesDir('install');
  const asarPath     = path.join(resourcesDir, 'app.asar');
  const bakPath      = asarPath + '.bak';

  console.log(`[Fluxtop] Resources dir: ${resourcesDir}`);

  const currentMain = inspectMainEntry(asarPath);
  if (isLegacyRefluxInjection(currentMain.source)) {
    if (!fs.existsSync(bakPath)) throw new Error('Reflux injection found but its original backup is missing.');
    if (!await confirmLegacyReplacement()) throw new Error('Replacement cancelled; no files were changed.');
    fs.copyFileSync(bakPath, asarPath);
    asar.uncache?.(asarPath);
    console.log('[Fluxtop] Restored the original archive from the existing backup; preserving that backup.');
  }

  // ── Step 1: Backup ──────────────────────────────────────────────────────
  if (!fs.existsSync(bakPath)) {
    fs.copyFileSync(asarPath, bakPath);
    console.log(`[Fluxtop] Backup created: ${bakPath}`);
  } else {
    console.log(`[Fluxtop] Backup already present: ${bakPath}`);
  }

  // ── Step 2: Patch the main-process entry inside the asar ────────────────
  // We need to inject our main-side bootstrap so Fluxtop can:
  //  • Strip CSP headers (allowing renderer content-script injection)
  //  • Inject renderer.js into the web context via webContents events
  //
  // The main entry is ESM (type: "module"), so we use top-level await + dynamic import.
  const tmpDir = path.join(resourcesDir, '.fluxtop-tmp');
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  fs.mkdirSync(tmpDir);

  console.log('[Fluxtop] Extracting asar to patch main entry…');
  const mainEntry = inspectMainEntry(asarPath).entry;
  // Extract only the main entry file for efficiency; fall back to full extract.
  try {
    asar.extractFile(asarPath, mainEntry, path.join(tmpDir, 'main_index.js'));
  } catch {
    asar.extractAll(asarPath, tmpDir);
  }

  const mainEntryInTmp = path.join(tmpDir, 'main_index.js');
  if (!fs.existsSync(mainEntryInTmp)) {
    // Full extract fallback.
    asar.extractAll(asarPath, tmpDir);
    const fullPath = path.join(tmpDir, ...mainEntry.split('/'));
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Cannot find ${mainEntry} inside the asar.`);
    }
    // Re-point.
    fs.copyFileSync(fullPath, mainEntryInTmp);
  }

  // Injection line — dynamic import works in top-level ESM.
  // On Windows, dynamic import() requires a file:// URL — raw C:\... paths are rejected by the ESM loader.
  const mainInjectUrl  = pathToFileURL(FLUXTOP_MAIN).href;
  const mainInjectLine = `${FLUXTOP_MARKER}\nawait import(${JSON.stringify(mainInjectUrl)});`;
  const alreadyPatched = prependOnce(mainEntryInTmp, mainInjectLine);

  if (!alreadyPatched) {
    console.log('[Fluxtop] Main entry already patched — skipping asar repack.');
    fs.rmSync(tmpDir, { recursive: true });
  } else {
    // We only changed one file — do a full extract + replace + repack.
    const fullExtractDir = path.join(resourcesDir, '.fluxtop-full-extract');
    if (fs.existsSync(fullExtractDir)) fs.rmSync(fullExtractDir, { recursive: true });

    console.log('[Fluxtop] Extracting full asar for repack…');
    asar.extractAll(asarPath, fullExtractDir);

    // Replace the main entry with our patched version.
    const mainEntryInFull = path.join(fullExtractDir, ...mainEntry.split('/'));
    fs.copyFileSync(mainEntryInTmp, mainEntryInFull);

    console.log('[Fluxtop] Repacking asar…');
    await asar.createPackage(fullExtractDir, asarPath);

    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(fullExtractDir, { recursive: true });

    console.log(`[Fluxtop] Main entry patched: ${mainEntry}`);
  }

  console.log('\n[Fluxtop] Installation complete! Restart Fluxer to activate Fluxtop.');
}

main().catch(err => {
  console.error('[Fluxtop] Installation failed:', err.message);
  process.exit(1);
});
