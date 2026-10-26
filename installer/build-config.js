'use strict';

const platforms = ['win-x64', 'linux-x64'];

function artifactName(platform, version, kind) {
  const prefix = `fluxtop-v${version}-${platform}`;
  if (kind === 'gui') return platform === 'linux-x64' ? `${prefix}-setup.AppImage` : `${prefix}-setup.exe`;
  if (kind === 'cli') return platform === 'linux-x64' ? `${prefix}-cli` : `${prefix}-cli.exe`;
  throw new Error(`Unknown artifact kind: ${kind}`);
}

function cliTarget(platform) {
  if (platform === 'win-x64') return 'node20-win-x64';
  if (platform === 'linux-x64') return 'node20-linux-x64';
  throw new Error(`Unsupported build platform: ${platform}`);
}

module.exports = {artifactName, cliTarget, platforms};
