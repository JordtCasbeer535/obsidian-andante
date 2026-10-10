const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");
const source = esbuild.buildSync({ entryPoints: [path.join(__dirname, "../src/settings.ts")], bundle: true,
	write: false, platform: "node", format: "cjs" }).outputFiles[0].text;
const moduleScope = { exports: {} };
vm.runInNewContext(source, { module: moduleScope, exports: moduleScope.exports });
const { normalizeSettings, resizePattern, clampBpm } = moduleScope.exports;
const plain = value => JSON.parse(JSON.stringify(value));

test("legacy settings preserve tempo, sound, volume and the disabled downbeat", () => {
	const settings = normalizeSettings({ bpm: 103, beats: 3, volume: 0.73, sound: "woodblock", accent: false });
	assert.deepEqual(plain(settings), { bpm: 103, beats: 3, volume: 0.73, sound: "woodblock", subdivision: 1,
		beatPattern: ["normal", "normal", "normal"], sessionMinutes: 0, presets: [] });
});

test("invalid data cannot produce NaN, zero subdivisions or unbounded beats", () => {
	const settings = normalizeSettings({ bpm: Infinity, beats: -9, volume: NaN, subdivision: 0,
		beatPattern: ["invalid"], sound: "missing", sessionMinutes: -1 });
	assert.equal(settings.bpm, 100);
	assert.equal(settings.beats, 1);
	assert.equal(settings.volume, 0.8);
	assert.equal(settings.subdivision, 1);
	assert.equal(settings.sound, "click");
	assert.equal(settings.sessionMinutes, 0);
	assert.deepEqual(plain(settings.beatPattern), ["accent"]);
	assert.equal(clampBpm(NaN), 100);
});

test("new settings preserve rests, triplets, silent volume and practice duration", () => {
	const settings = normalizeSettings({ bpm: 280, beats: 4, volume: 0, subdivision: 3,
		beatPattern: ["accent", "mute", "accent", "normal"], sound: "soft", sessionMinutes: 5 });
	assert.equal(settings.bpm, 240);
	assert.equal(settings.volume, 0);
	assert.equal(settings.subdivision, 3);
	assert.equal(settings.sessionMinutes, 5);
	assert.deepEqual(plain(settings.beatPattern), ["accent", "mute", "accent", "normal"]);
});

test("resizing a pattern preserves existing accents and rests", () => {
	assert.deepEqual(plain(resizePattern(["mute", "accent"], 4)), ["mute", "accent", "normal", "normal"]);
	assert.deepEqual(plain(resizePattern(["accent", "mute", "normal"], 2)), ["accent", "mute"]);
});

test("preset validation rejects duplicate or reserved IDs and enforces the limit", () => {
	const presets = [{ id: "builtin-warmup", name: "bad" }, { id: "a", name: "  Scales  ", bpm: 600, beats: 3 },
		{ id: "a", name: "duplicate" }, { id: "empty", name: " " },
		...Array.from({ length: 20 }, (_, i) => ({ id: `p-${i}`, name: `Preset ${i}` }))];
	const settings = normalizeSettings({ presets });
	assert.equal(settings.presets.length, 12);
	assert.equal(settings.presets[0].name, "Scales");
	assert.equal(settings.presets[0].bpm, 240);
	assert.equal(new Set(settings.presets.map(p => p.id)).size, 12);
});

test("defaults and preset patterns do not share mutable arrays", () => {
	const a = normalizeSettings(null), b = normalizeSettings(null);
	a.beatPattern[0] = "mute";
	a.presets.push({ id: "a" });
	assert.equal(b.beatPattern[0], "accent");
	assert.equal(b.presets.length, 0);
});
