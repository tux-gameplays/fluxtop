'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {validateReplacementBackup} = require('../lib/instances.js');

const FLUXTOP_MARKER = '/* Fluxtop bootstrap */';
const MAIN_ENTRY_CANDIDATES = ['dist/main/index.js', 'src-electron/dist/main/index.js'];
const LEGACY_REFLUX_INJECTION = /await\s+import\(\s*["']file:\/\/[^"']*reflux[^"']*main-inject\.mjs["']\s*\)/i;

function runtimeSourceDir({platform = process.platform, env = process.env, home = os.homedir(), pathImpl = path} = {}) {
  if (platform === 'win32') {
    const appData = env.APPDATA || pathImpl.join(env.USERPROFILE || home, 'AppData', 'Roaming');
    return pathImpl.join(appData, 'Fluxtop', 'src');
  }
  const dataHome = env.XDG_DATA_HOME || pathImpl.join(home, '.local', 'share');
  return pathImpl.join(dataHome, 'fluxtop', 'src');
}

function getEntry(files, entryPath) {
  let current = files;
  for (const [index, part] of entryPath.split('/').entries()) {
    current = current?.[part];
    if (!current) return null;
    if (index < entryPath.split('/').length - 1) current = current.files;
  }
  return current?.files ? null : current;
}

function findMainEntry(asarPath, asarLib) {
  asarLib.uncache?.(asarPath);
  let header;
  try {
    header = asarLib.getRawHeader(asarPath).header;
  } catch (error) {
    throw new Error(`Unable to read selected app.asar: ${error.message}`);
  }

  for (const entry of MAIN_ENTRY_CANDIDATES) {
    if (getEntry(header.files, entry)) return entry;
  }
  throw new Error(`Main entry not found in selected app.asar. Tried: ${MAIN_ENTRY_CANDIDATES.join(', ')}`);
}

function validateTarget(asarPath, {fsImpl = fs, asarLib} = {}) {
  if (!fsImpl.existsSync(asarPath)) throw new Error(`Selected app.asar no longer exists: ${asarPath}`);
  try {
    fsImpl.accessSync(path.dirname(asarPath), fsImpl.constants?.W_OK ?? 2);
    fsImpl.accessSync(asarPath, fsImpl.constants?.W_OK ?? 2);
  } catch {
    throw new Error(`No write permission for selected Fluxer instance: ${asarPath}`);
  }
  if (!asarLib) throw new Error('An asar reader is required to validate the selected archive.');
  const entry = findMainEntry(asarPath, asarLib);
  const source = asarLib.extractFile(asarPath, entry).toString('utf8');
  const installed = source.includes(FLUXTOP_MARKER);
  const legacyInstalled = LEGACY_REFLUX_INJECTION.test(source);
  const hasBackup = fsImpl.existsSync(`${asarPath}.bak`);
  if (hasBackup && !installed && !legacyInstalled) throw new Error('A backup exists but the selected archive is not marked as a Fluxtop or recognized Reflux install.');
  if ((installed || legacyInstalled) && !hasBackup) throw new Error('Fluxtop or Reflux injection found but its backup is missing.');
  if (legacyInstalled) validateReplacementBackup(asarPath, {
    fsImpl,
    archiveReader: {readMainEntry(archivePath) {
      const backupEntry = findMainEntry(archivePath, asarLib);
      return asarLib.extractFile(archivePath, backupEntry).toString('utf8');
    }},
  });
  return {entry, installed, legacyInstalled, hasBackup};
}

module.exports = {FLUXTOP_MARKER, MAIN_ENTRY_CANDIDATES, findMainEntry, runtimeSourceDir, validateTarget};
