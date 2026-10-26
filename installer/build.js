'use strict';

const {execSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const {artifactName, cliTarget} = require('./build-config.js');

const ROOT = __dirname;
const {version} = require(path.join(ROOT, 'package.json'));
const DIST = path.join(ROOT, 'dist');
const platform = process.platform === 'win32' ? 'win-x64' : process.platform === 'linux' ? 'linux-x64' : null;

if (!platform) throw new Error(`Unsupported installer build host: ${process.platform}`);
if (process.arch !== 'x64') throw new Error(`Only x64 installer builds are supported; got ${process.arch}`);
fs.mkdirSync(DIST, {recursive: true});

console.log(`\nBuilding Fluxtop v${version} — ${platform}\n${'─'.repeat(44)}`);

const guiArgs = platform === 'win-x64' ? '--win portable --x64' : '--linux AppImage --x64';
console.log('\n[1/2] GUI installer (electron-builder)…');
execSync(`npx electron-builder ${guiArgs} --publish never`, {
  cwd: ROOT,
  stdio: 'inherit',
  env: {...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false'},
});

console.log('\n[2/2] CLI installer (pkg)…');
const cliOut = path.join(DIST, artifactName(platform, version, 'cli'));
execSync(`npx pkg cli/index.js --targets ${cliTarget(platform)} --output "${cliOut}"`, {
  cwd: ROOT,
  stdio: 'inherit',
});

console.log(`\n${'─'.repeat(44)}\nArtifacts in installer/dist/:\n`);
for (const file of fs.readdirSync(DIST)) {
	if (!file.endsWith('.exe') && !file.endsWith('.AppImage') && !file.endsWith('.zip') && !file.endsWith('-linux-x64-cli')) continue;
  const {size} = fs.statSync(path.join(DIST, file));
  console.log(`  ${file}  (${(size / 1_048_576).toFixed(1)} MB)`);
}
console.log();
