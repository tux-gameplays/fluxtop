'use strict';

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const FLUXTOP_MARKER = '/* Fluxtop bootstrap */';
const MAIN_ENTRY_CANDIDATES = [
  'dist/main/index.js',
  'src-electron/dist/main/index.js',
];

function normalizeAsarPath(input, pathImpl = path) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new TypeError('Select an app.asar file or its resources directory.');
  }

  const resolved = pathImpl.resolve(input.trim());
  const basename = pathImpl.basename(resolved).toLowerCase();
  if (basename === 'app.asar') {
    return {resourcesDir: pathImpl.dirname(resolved), asarPath: resolved};
  }
  if (basename === 'resources') {
    return {resourcesDir: resolved, asarPath: pathImpl.join(resolved, 'app.asar')};
  }
  throw new Error('Path must point to app.asar or its containing resources directory.');
}

function readMainEntry(asarPath) {
  asar.uncache?.(asarPath);
  for (const entry of MAIN_ENTRY_CANDIDATES) {
    try {
      return asar.extractFile(asarPath, entry).toString('utf8');
    } catch {
      // Try the next supported main entry.
    }
  }
  return '';
}

function isLegacyRefluxInjection(source) {
  return /await\s+import\(\s*["']file:\/\/[^"']*reflux[^"']*main-inject\.mjs["']\s*\)/i.test(String(source));
}

function validateReplacementBackup(asarPath, {fsImpl = fs, archiveReader = {readMainEntry}} = {}) {
  const backupPath = `${asarPath}.bak`;
  if (!fsImpl.existsSync(backupPath)) throw new Error('The Reflux original backup is missing.');
  let source;
  try {
    source = archiveReader.readMainEntry(backupPath);
  } catch {
    source = '';
  }
  if (!source) throw new Error('The Reflux backup is not a supported original archive.');
  if (source.includes(FLUXTOP_MARKER) || isLegacyRefluxInjection(source)) {
    throw new Error('The Reflux backup already contains an injection; it is not a safe original archive.');
  }
  return backupPath;
}

function candidateProducts(platform, env, home, pathImpl) {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || pathImpl.join(
      env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local',
    );
    return [
      {dir: pathImpl.join(localAppData, 'fluxer_app'), label: 'Fluxer Stable', versioned: true},
      {dir: pathImpl.join(localAppData, 'fluxer_app_canary'), label: 'Fluxer Canary', versioned: true},
      {dir: pathImpl.join(localAppData, 'Fluxer'), label: 'Fluxer Stable', versioned: true},
      {dir: pathImpl.join(localAppData, 'Fluxer Canary'), label: 'Fluxer Canary', versioned: true},
      {dir: pathImpl.join('C:\\', 'Program Files', 'Fluxer', 'resources'), label: 'Fluxer Stable'},
      {dir: pathImpl.join('C:\\', 'Program Files (x86)', 'Fluxer', 'resources'), label: 'Fluxer Stable'},
    ];
  }

  if (platform !== 'linux') return [];

  const roots = [
    ['/opt/Fluxer', 'Fluxer Stable'],
    ['/opt/Fluxer Canary', 'Fluxer Canary'],
    ['/usr/lib/fluxer', 'Fluxer Stable'],
    ['/usr/lib/fluxer-canary', 'Fluxer Canary'],
    [pathImpl.join(home, '.local/opt/Fluxer'), 'Fluxer Stable'],
    [pathImpl.join(home, '.local/opt/Fluxer Canary'), 'Fluxer Canary'],
    [pathImpl.join(home, '.local/opt/fluxer'), 'Fluxer Stable'],
    [pathImpl.join(home, '.local/opt/fluxer-canary'), 'Fluxer Canary'],
    [pathImpl.join(home, '.local/share/Fluxer'), 'Fluxer Stable'],
    [pathImpl.join(home, '.local/share/Fluxer Canary'), 'Fluxer Canary'],
    [pathImpl.join(home, '.local/share/Fluxer-Canary'), 'Fluxer Canary'],
    [pathImpl.join(home, '.local/share/fluxer'), 'Fluxer Stable'],
    [pathImpl.join(home, '.local/share/fluxer-canary'), 'Fluxer Canary'],
    [pathImpl.join(home, '.local/share/fluxer_app'), 'Fluxer Stable'],
    [pathImpl.join(home, '.local/share/fluxer_app_canary'), 'Fluxer Canary'],
  ];
  return roots.map(([dir, label]) => ({dir, label, versioned: true, linux: true}));
}

function canonicalPath(value, fsImpl, pathImpl, platform) {
  let resolved = pathImpl.resolve(value);
  try {
    resolved = fsImpl.realpathSync(resolved);
  } catch {
    // Keep the normalized path when the filesystem cannot resolve it.
  }
  resolved = pathImpl.normalize(resolved);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWritable(target, fsImpl) {
  try {
    fsImpl.accessSync(target, fsImpl.constants?.W_OK ?? 2);
    return true;
  } catch {
    return false;
  }
}

function discoverInstances({
  platform = process.platform,
  env = process.env,
  home = require('node:os').homedir(),
  fsImpl = fs,
  pathImpl = platform === 'win32' ? path.win32 : path,
  archiveReader = {readMainEntry},
  purpose = 'install',
} = {}) {
  const byId = new Map();

  function addResourcesDir(resourcesDir, label) {
    const asarPath = pathImpl.join(resourcesDir, 'app.asar');
    if (!fsImpl.existsSync(asarPath)) return;

    const id = canonicalPath(asarPath, fsImpl, pathImpl, platform);
    if (byId.has(id)) return;

    const hasBackup = fsImpl.existsSync(`${asarPath}.bak`);
    let entry = '';
    try {
      entry = archiveReader.readMainEntry(asarPath) || '';
    } catch {
      entry = '';
    }
    const installed = String(entry).includes(FLUXTOP_MARKER);
    const legacyInstalled = isLegacyRefluxInjection(entry);
    const conflict = (hasBackup && !installed && !legacyInstalled) || ((installed || legacyInstalled) && !hasBackup);
    const instance = {
      id,
      label,
      resourcesDir,
      asarPath,
      installed,
      legacyInstalled,
      hasBackup,
      conflict,
      writable: isWritable(asarPath, fsImpl),
    };

    if (purpose !== 'uninstall' || (installed && hasBackup)) byId.set(id, instance);
  }

  for (const product of candidateProducts(platform, env, home, pathImpl)) {
    const root = product.dir;

    // Traditional/system installations may point directly at resources.
    addResourcesDir(root, product.label);
    addResourcesDir(pathImpl.join(root, 'resources'), product.label);

    if (!product.versioned || !fsImpl.existsSync(root)) continue;
    let versions = [];
    try {
      versions = fsImpl.readdirSync(root, {withFileTypes: true})
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('app-'))
        .map((entry) => entry.name)
        .sort()
        .reverse();
    } catch {
      continue;
    }

    for (const version of versions) {
      const resourcesDir = pathImpl.join(root, version, 'resources');
      if (!fsImpl.existsSync(pathImpl.join(resourcesDir, 'app.asar'))) continue;
      addResourcesDir(resourcesDir, product.label);
      break;
    }
  }

  return [...byId.values()];
}

function comparablePath(value, pathImpl) {
  const {asarPath} = normalizeAsarPath(value, pathImpl);
  const resolved = pathImpl.normalize(pathImpl.resolve(asarPath));
  return pathImpl === path.win32 ? resolved.toLowerCase() : resolved;
}

async function chooseInstance(instances, {env = {}, stdin = {}, stdout = {}, prompt} = {}) {
  if (!instances.length) throw new Error('No supported Fluxer instances were found.');
  if (instances.length === 1) return instances[0];

  if (env.FLUXER_ASAR) {
    const override = comparablePath(env.FLUXER_ASAR, path);
    const match = instances.find((instance) => {
      try {
        return comparablePath(instance.asarPath, path) === override || instance.id === override;
      } catch {
        return false;
      }
    });
    if (match) return match;
    throw new Error('FLUXER_ASAR does not match a detected Fluxer instance.');
  }

  if (stdin.isTTY && typeof prompt === 'function') {
    const answer = Number(await prompt(instances, stdout));
    if (Number.isInteger(answer) && answer >= 1 && answer <= instances.length) {
      return instances[answer - 1];
    }
    throw new Error('Invalid Fluxer instance selection.');
  }

  throw new Error(`Multiple Fluxer instances found. Set FLUXER_ASAR to select one:\n${instances.map((x) => `  ${x.asarPath}`).join('\n')}`);
}

module.exports = {
  FLUXTOP_MARKER,
  MAIN_ENTRY_CANDIDATES,
  chooseInstance,
  discoverInstances,
  isLegacyRefluxInjection,
  normalizeAsarPath,
  readMainEntry,
  validateReplacementBackup,
};
