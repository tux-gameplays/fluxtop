'use strict';

const {parentPort, workerData} = require('worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');
const os = require('node:os');
const asar = require('@electron/asar');
const {pathToFileURL} = require('node:url');
const extractZip = require('extract-zip');
const {FLUXTOP_MARKER, MAIN_ENTRY_CANDIDATES, findMainEntry, runtimeSourceDir, validateTarget} = require('./worker-platform.js');

process.noAsar = true;

// ── Constants ─────────────────────────────────────────────────────────────────

const GITHUB_REPO = 'tux-gameplays/fluxtop';
const RUNTIME_SRC_DIR = runtimeSourceDir();

// ── Inputs ────────────────────────────────────────────────────────────────────

const {op, asarPath, isPackaged, devSrc} = workerData;

// ── Helpers ───────────────────────────────────────────────────────────────────

function send(type, message) {
	parentPort.postMessage({event: 'progress', type, message});
}

function complete(success, message) {
	parentPort.postMessage({event: 'complete', success, message});
}

function download(url, dest) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		function get(u) {
			const mod = u.startsWith('https') ? https : http;
			mod.get(u, (res) => {
				if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
					res.resume();
					get(res.headers.location);
					return;
				}
				if (res.statusCode !== 200) {
					file.close();
					reject(new Error(`Download failed: HTTP ${res.statusCode}`));
					return;
				}
				res.pipe(file);
				file.on('finish', () => file.close(resolve));
				file.on('error', reject);
			}).on('error', reject);
		}
		get(url);
	});
}

async function downloadSrc() {
	const url = `https://github.com/${GITHUB_REPO}/releases/latest/download/fluxtop-src.zip`;
	const tmpZip = path.join(os.tmpdir(), `fluxtop-src-${Date.now()}.zip`);

	send('step', `Downloading Fluxtop runtime from GitHub…`);
	await download(url, tmpZip);

	const zipSize = fs.statSync(tmpZip).size;
	if (zipSize < 100) {
		fs.unlinkSync(tmpZip);
		throw new Error(`Downloaded file is too small (${zipSize} bytes) — GitHub release asset may be missing.`);
	}
	send('step', `Downloaded ${(zipSize / 1024).toFixed(1)} KB. Extracting…`);

	if (fs.existsSync(RUNTIME_SRC_DIR)) fs.rmSync(RUNTIME_SRC_DIR, {recursive: true});
	fs.mkdirSync(RUNTIME_SRC_DIR, {recursive: true});
	try {
		await extractZip(tmpZip, {dir: RUNTIME_SRC_DIR});
	} finally {
		if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
	}

	return RUNTIME_SRC_DIR;
}

async function getFluxtopSrc() {
	if (!isPackaged) {
		send('step', 'Using local Fluxtop source (dev mode)…');
		return devSrc;
	}
	return await downloadSrc();
}

// ── Asar pickle helpers ───────────────────────────────────────────────────────
// Minimal Chromium Pickle implementation for rebuilding asar headers in-place.
// Matches the exact byte layout used by @electron/asar / chromium-pickle-js.

function pickleUInt32(value) {
	const buf = Buffer.allocUnsafe(8);
	buf.writeUInt32LE(4, 0); // payload size = sizeof(uint32)
	buf.writeUInt32LE(value, 4);
	return buf;
}

function pickleString(str) {
	const strBuf = Buffer.from(str, 'utf8');
	const aligned = (strBuf.length + 3) & ~3; // round up to 4-byte boundary
	const buf = Buffer.allocUnsafe(4 + 4 + aligned);
	buf.writeUInt32LE(4 + aligned, 0); // payload size
	buf.writeUInt32LE(strBuf.length, 4); // string byte length
	strBuf.copy(buf, 8);
	if (aligned > strBuf.length) buf.fill(0, 8 + strBuf.length); // zero pad
	return buf;
}

// ── Asar header helpers ───────────────────────────────────────────────────────

function findMainEntryInAsar(asarPath) {
	return findMainEntry(asarPath, asar);
}

// ── Streaming asar patch ──────────────────────────────────────────────────────
// Patches a single entry without extracting the whole archive.
// Reads the asar once and writes a new one, splicing in the patched file.

function patchAsarEntry(asarPath, entryPath, patchLine) {
	const {header, headerSize} = asar.getRawHeader(asarPath);
	const dataStart = 8 + headerSize; // 8 bytes for the size pickle

	const entry = header.files;
	let target = entry;
	for (const part of entryPath.split('/')) target = target?.[part]?.files || target?.[part];
	if (!target || target.files) throw new Error(`Entry '${entryPath}' not found`);

	const oldOffset = Number(target.offset);
	const oldSize = target.size;

	// Read original content
	const rfd = fs.openSync(asarPath, 'r');
	const originalBuf = Buffer.alloc(oldSize);
	fs.readSync(rfd, originalBuf, 0, oldSize, dataStart + oldOffset);
	fs.closeSync(rfd);

	const originalStr = originalBuf.toString('utf8');
	if (originalStr.includes(FLUXTOP_MARKER)) return false; // already patched

	// Build patched content
	const patchedBuf = Buffer.from(patchLine + '\n' + originalStr, 'utf8');
	const sizeDelta = patchedBuf.length - oldSize;

	// Update header: fix entry size/integrity, shift subsequent offsets
	target.size = patchedBuf.length;
	delete target.integrity; // content changed — stale hash

	if (sizeDelta !== 0) {
		(function adjustOffsets(files) {
			for (const child of Object.values(files)) {
				if (child.files) adjustOffsets(child.files);
				else if (Number(child.offset) > oldOffset) {
					child.offset = String(Number(child.offset) + sizeDelta);
					// Integrity hashes are content-addressed, not position-based — keep them.
				}
			}
		})(header.files);
	}

	// Rebuild header buffers
	const newHeaderBuf = pickleString(JSON.stringify(header));
	const newSizeBuf = pickleUInt32(newHeaderBuf.length);

	// Stream: new header + original data with patched section spliced in
	const tmpPath = asarPath + '.fluxtop-patch';
	const wfd = fs.openSync(tmpPath, 'w');
	try {
		fs.writeSync(wfd, newSizeBuf);
		fs.writeSync(wfd, newHeaderBuf);

		const CHUNK = 4 * 1024 * 1024; // 4 MB
		const rfd2 = fs.openSync(asarPath, 'r');
		const asarTotalSize = fs.fstatSync(rfd2).size;
		const entryAbsStart = dataStart + oldOffset;

		// Data before the patched entry
		for (let pos = dataStart; pos < entryAbsStart; ) {
			const len = Math.min(CHUNK, entryAbsStart - pos);
			const chunk = Buffer.allocUnsafe(len);
			fs.readSync(rfd2, chunk, 0, len, pos);
			fs.writeSync(wfd, chunk);
			pos += len;
		}

		// Patched entry
		fs.writeSync(wfd, patchedBuf);

		// Data after the patched entry
		for (let pos = entryAbsStart + oldSize; pos < asarTotalSize; ) {
			const len = Math.min(CHUNK, asarTotalSize - pos);
			const chunk = Buffer.allocUnsafe(len);
			fs.readSync(rfd2, chunk, 0, len, pos);
			fs.writeSync(wfd, chunk);
			pos += len;
		}

		fs.closeSync(rfd2);
	} catch (err) {
		fs.closeSync(wfd);
		try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
		throw err;
	}
	fs.closeSync(wfd);

	fs.renameSync(tmpPath, asarPath);
	return true;
}

// ── Install / Repair ───────────────────────────────────────────────────────────

async function runInstall(asarPath, replaceLegacy = false) {
	const bakPath = asarPath + '.bak';
	const resourcesDir = path.dirname(asarPath);
	const validation = validateTarget(asarPath, {fsImpl: fs, asarLib: asar});
	if (validation.legacyInstalled && !replaceLegacy) {
		throw new Error('Replacing the existing Reflux injection requires explicit confirmation.');
	}
	const activeSrc = await getFluxtopSrc();
	const fluxtopMain = path.join(activeSrc, 'main-inject.mjs');
	if (validation.legacyInstalled) {
		fs.copyFileSync(bakPath, asarPath);
		asar.uncache?.(asarPath);
		send('step', 'Restored the original archive from the existing backup; preserving that backup.');
	}

	send('step', 'Backing up app.asar…');
	if (!fs.existsSync(bakPath)) {
		fs.copyFileSync(asarPath, bakPath);
	} else {
		if (!validation.installed && !(validation.legacyInstalled && replaceLegacy)) throw new Error('A backup exists but the selected archive is not marked as Fluxtop; refusing to modify it.');
		send('warn', 'Verified Fluxtop backup already exists — skipping.');
	}

	const mainInjectLine = `${FLUXTOP_MARKER}\nawait import(${JSON.stringify(pathToFileURL(fluxtopMain).href)});`;

	send('step', 'Patching app.asar…');
	let patched;
	try {
		const mainEntry = validation.entry;
		patched = patchAsarEntry(asarPath, mainEntry, mainInjectLine);
	} catch (err) {
		// Streaming patch failed — fall back to full extract+repack
		send('warn', `Streaming patch failed (${err.message}), falling back to full extract…`);
		patched = await runInstallFull(asarPath, resourcesDir, mainInjectLine);
	}

	if (!patched) send('warn', 'Already patched — no changes made.');

	complete(true, 'Fluxtop installed successfully. Restart Fluxer to activate.');
}

// Full extract+repack fallback for when the streaming patch can't be used.
async function runInstallFull(asarPath, resourcesDir, mainInjectLine) {
	const extractDir = path.join(resourcesDir, '.fluxtop-extract');
	if (fs.existsSync(extractDir)) fs.rmSync(extractDir, {recursive: true});

	send('step', 'Extracting asar…');
	asar.extractAll(asarPath, extractDir);

	send('step', 'Locating main entry…');
	const candidates = MAIN_ENTRY_CANDIDATES;
	let mainEntryPath = null;
	for (const c of candidates) {
		const p = path.join(extractDir, ...c.split('/'));
		if (fs.existsSync(p)) {
			mainEntryPath = p;
			break;
		}
	}
	if (!mainEntryPath) throw new Error(`Main entry not found. Tried: ${candidates.join(', ')}`);

	const contents = fs.readFileSync(mainEntryPath, 'utf8');
	if (contents.includes(FLUXTOP_MARKER)) {
		fs.rmSync(extractDir, {recursive: true});
		return false;
	}

	fs.writeFileSync(mainEntryPath, mainInjectLine + '\n' + contents, 'utf8');

	send('step', 'Repacking asar — this may take a moment…');
	await asar.createPackage(extractDir, asarPath);
	fs.rmSync(extractDir, {recursive: true});
	return true;
}

// ── Update ────────────────────────────────────────────────────────────────────

async function runUpdate() {
	if (!isPackaged) {
		complete(true, 'Running in dev mode — source is already up to date.');
		return;
	}
	await downloadSrc();

	// Read the stamped version from the freshly-extracted preload.js so the
	// user can see exactly what version was applied.
	let newVersion = null;
	try {
		const preloadSrc = fs.readFileSync(path.join(RUNTIME_SRC_DIR, 'preload.js'), 'utf8');
		const m = preloadSrc.match(/version:\s*'([^']+)'/);
		if (m) newVersion = m[1];
	} catch { /* non-fatal */ }

	const msg = newVersion
		? `Updated to Fluxtop v${newVersion}. Restart Fluxer to apply.`
		: 'Fluxtop runtime updated. Restart Fluxer to apply.';
	complete(true, msg);
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

function runUninstall(asarPath) {
	const bakPath = asarPath + '.bak';
	const resourcesDir = path.dirname(asarPath);
	const validation = validateTarget(asarPath, {fsImpl: fs, asarLib: asar});

	send('step', 'Restoring original asar…');
	if (!validation.installed || !fs.existsSync(bakPath)) throw new Error('No marker-verified Fluxtop backup found. Cannot restore.');
	fs.copyFileSync(bakPath, asarPath);

	send('step', 'Removing backup…');
	fs.unlinkSync(bakPath);

	send('step', 'Cleaning up temp files…');
	for (const suffix of ['.fluxtop-extract', '.fluxtop-tmp', '.fluxtop-full-extract', '.fluxtop-patch']) {
		const p = path.join(resourcesDir, suffix);
		if (fs.existsSync(p)) fs.rmSync(p, {recursive: true, force: true});
	}

	complete(true, 'Fluxtop uninstalled successfully. Restart Fluxer to apply.');
}

// ── Entry ─────────────────────────────────────────────────────────────────────

(async () => {
	try {
		if (op === 'install') await runInstall(asarPath, workerData.replaceLegacy === true);
		else if (op === 'update') await runUpdate();
		else if (op === 'uninstall') runUninstall(asarPath);
		else complete(false, `Unknown op: ${op}`);
	} catch (err) {
		send('error', err.message);
		complete(false, err.message);
	}
})();
