'use strict';

const fs = require('node:fs');
const path = require('node:path');

function migrateLegacySettings({legacyFile, fluxtopFile, fsImpl = fs, pathImpl = path}) {
  if (fsImpl.existsSync(fluxtopFile) || !fsImpl.existsSync(legacyFile)) return false;

  const legacySettings = JSON.parse(fsImpl.readFileSync(legacyFile, 'utf8'));
  if (!legacySettings || typeof legacySettings !== 'object' || Array.isArray(legacySettings)) {
    throw new Error('Reflux settings file must contain a JSON object.');
  }

  const migrated = {...legacySettings};
  if (migrated.reflux && typeof migrated.reflux === 'object' && !Array.isArray(migrated.reflux)) {
    migrated.fluxtop = {...migrated.reflux, ...(migrated.fluxtop || {})};
  }
  delete migrated.reflux;

  fsImpl.mkdirSync(pathImpl.dirname(fluxtopFile), {recursive: true});
  fsImpl.writeFileSync(fluxtopFile, JSON.stringify(migrated, null, 2), 'utf8');
  return true;
}

module.exports = {migrateLegacySettings};
