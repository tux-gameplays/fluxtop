'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  FLUXTOP_MARKER,
  discoverInstances,
  normalizeAsarPath,
  readMainEntry,
} = require('../lib/instances.js');

function createInstanceRegistry({
  discover = discoverInstances,
  fsImpl = fs,
  pathImpl = path,
  archiveReader = {readMainEntry},
} = {}) {
  let selectedInstance = null;
  let selectedManual = false;
  let selectionInvalidated = false;

  function inspectManual(input) {
    const {resourcesDir, asarPath} = normalizeAsarPath(input, pathImpl);
    if (!fsImpl.existsSync(asarPath)) throw new Error(`Fluxer archive not found: ${asarPath}`);

    let source;
    try {
      source = archiveReader.readMainEntry(asarPath);
    } catch {
      source = '';
    }
    if (!source) throw new Error(`No supported Fluxer main entry found in ${asarPath}.`);

    let writable = true;
    try {
      fsImpl.accessSync(resourcesDir, fsImpl.constants?.W_OK ?? 2);
      fsImpl.accessSync(asarPath, fsImpl.constants?.W_OK ?? 2);
    } catch {
      writable = false;
    }

    const installed = String(source).includes(FLUXTOP_MARKER);
    const legacyInstalled = /await\s+import\(\s*["']file:\/\/[^"']*reflux[^"']*main-inject\.mjs["']\s*\)/i.test(String(source));
    const hasBackup = fsImpl.existsSync(`${asarPath}.bak`);
    const resolvedAsar = pathImpl.resolve(asarPath);
    const id = pathImpl === path.win32 ? resolvedAsar.toLowerCase() : resolvedAsar;
    return {
      id,
      label: `Custom Fluxer — ${pathImpl.basename(resourcesDir)}`,
      asarPath,
      resourcesDir,
      installed,
      legacyInstalled,
      hasBackup,
      conflict: (hasBackup && !installed && !legacyInstalled) || ((installed || legacyInstalled) && !hasBackup),
      writable,
    };
  }

  function refresh() {
    const instances = discover();
    if (selectedInstance) {
      const current = instances.find((instance) => instance.id === selectedInstance.id || instance.asarPath === selectedInstance.asarPath);
      if (current) {
        selectedInstance = current;
        selectedManual = false;
      } else if (selectedManual) {
        try {
          selectedInstance = inspectManual(selectedInstance.asarPath);
        } catch {
          selectedInstance = null;
          selectedManual = false;
          selectionInvalidated = true;
        }
      } else {
        selectedInstance = null;
        selectionInvalidated = true;
      }
    }

    if (!selectedInstance && !selectionInvalidated && instances.length === 1) {
      selectedInstance = instances[0];
      selectedManual = false;
    }

    const visible = selectedManual && selectedInstance
      ? [...instances.filter((instance) => instance.asarPath !== selectedInstance.asarPath), selectedInstance]
      : instances;
    return {instances: visible, selected: selectedInstance};
  }

  function select(id) {
    const {instances} = refresh();
    const selected = instances.find((instance) => instance.id === id || instance.asarPath === id);
    if (!selected) throw new Error('Selected Fluxer instance is no longer available.');
    selectedInstance = selected;
    selectedManual = false;
    selectionInvalidated = false;
    return refresh();
  }

  function selectManual(input) {
    selectedInstance = inspectManual(input);
    selectedManual = true;
    selectionInvalidated = false;
    return refresh();
  }

  function getSelected() {
    return selectedInstance;
  }

  function clearSelection() {
    selectedInstance = null;
    selectedManual = false;
    selectionInvalidated = false;
  }

  return {clearSelection, getSelected, refresh, select, selectManual};
}

module.exports = {createInstanceRegistry};
