const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const esbuild = require("esbuild");
const source = esbuild.buildSync({ entryPoints: [path.join(__dirname, "../src/engine.ts")], bundle: true,
	write: false, platform: "node", format: "cjs" }).outputFiles[0].text;

function fixture(overrides = {}, resume) {
	let id = 0, now = 0, context;
	const timeouts = new Map(), intervals = new Map(), sounds = [], pulses = [];
	const settings = { bpm: 120, beats: 4, volume: 0.7, subdivision: 1, pattern: ["accent", "normal", "normal", "normal"],
		sound: "click", duration: 0, ...overrides };
	const param = () => ({ value: 0, setValueAtTime(value) { this.value = value; },
		exponentialRampToValueAtTime(value) { if (value > 0.001) this.peak = value; } });
	class AudioContext {
		constructor() { this.currentTime = 0; this.state = resume ? "suspended" : "running"; this.destination = {}; context = this; }
		resume() { return resume; }
		close() { this.closed = true; return Promise.resolve(); }
		createGain() { const gain = { gain: param(), connect() {}, disconnect() {} }; this.master ??= gain; return gain; }
		createOscillator() {
			return { frequency: param(), connect(target) { this.gain = target; }, disconnect() {},
				start(time) { sounds.push({ time, frequency: this.frequency.value, peak: this.gain.gain.peak, type: this.type }); }, stop() {} };
		}
	}
	const window = { AudioContext,
		setInterval(callback) { const key = ++id; intervals.set(key, callback); return key; },
		clearInterval(key) { intervals.delete(key); },
		setTimeout(callback, delay) { const key = ++id; timeouts.set(key, { callback, at: now + delay / 1000 }); return key; },
		clearTimeout(key) { timeouts.delete(key); } };
	const moduleScope = { exports: {} };
	vm.runInNewContext(source, { module: moduleScope, exports: moduleScope.exports, window });
	const engine = new moduleScope.exports.MetronomeEngine({
		getBpm: () => settings.bpm, getBeats: () => settings.beats, getVolume: () => settings.volume,
		getBeatKind: beat => settings.pattern[beat] || "normal", getSubdivision: () => settings.subdivision,
		getSound: () => settings.sound, getDurationSeconds: () => settings.duration,
	});
	engine.onPulse = (beat, part, parts) => pulses.push({ beat, part, parts });
	function tickAt(time) {
		now = time;
		context.currentTime = time;
		for (const callback of [...intervals.values()]) callback();
		for (const [key, timeout] of [...timeouts]) if (timeout.at <= now + 1e-8) { timeouts.delete(key); timeout.callback(); }
	}
	return { engine, settings, sounds, pulses, intervals, timeouts, get ctx() { return context; }, tickAt,
		advance(time) { while (now < time - 1e-8) tickAt(Math.min(time, now + 0.025)); } };
}

test("triplets use the audio clock and quieter subdivision clicks", async () => {
	const f = fixture({ subdivision: 3 });
	await f.engine.start(); f.advance(1);
	const audible = f.sounds.filter(sound => sound.time < 1.08 - 1e-8);
	assert.equal(audible.length, 6);
	for (let i = 1; i < audible.length; i++) assert.ok(Math.abs(audible[i].time - audible[i - 1].time - 1 / 6) < 1e-8);
	assert.ok(audible[0].frequency > audible[1].frequency);
	assert.ok(audible[0].peak > audible[1].peak);
	assert.deepEqual(f.pulses.slice(0, 3), [{ beat: 0, part: 0, parts: 3 }, { beat: 0, part: 1, parts: 3 }, { beat: 0, part: 2, parts: 3 }]);
	f.engine.stop();
});

test("muted beats suppress all of their subdivisions but retain visual pulses", async () => {
	const f = fixture({ subdivision: 4, pattern: ["accent", "mute", "normal", "normal"] });
	await f.engine.start(); f.advance(1.06);
	assert.equal(f.sounds.filter(sound => sound.time >= 0.58 - 1e-8 && sound.time < 1.08 - 1e-8).length, 0);
	assert.equal(f.pulses.filter(pulse => pulse.beat === 1).length, 4);
	f.engine.stop();
});

test("timed practice schedules no click beyond the deadline and completes once", async () => {
	const f = fixture({ subdivision: 4, duration: 0.5 });
	let finishes = 0;
	f.engine.onFinish = () => { finishes++; };
	await f.engine.start(); f.advance(1);
	assert.ok(f.sounds.every(sound => sound.time < 0.58));
	assert.equal(finishes, 1);
	assert.equal(f.engine.isRunning, false);
	assert.ok(Math.abs(f.engine.elapsedSeconds - 0.5) < 1e-8);
	assert.equal(f.timeouts.size + f.intervals.size, 0);
	assert.equal(f.ctx.closed, true);
});

test("stop cancels scheduled visual work and closes the audio context", async () => {
	const f = fixture({ subdivision: 4 });
	await f.engine.start();
	const pending = [...f.timeouts.values()].map(timer => timer.callback);
	f.engine.stop(); pending.forEach(callback => callback());
	assert.equal(f.pulses.length, 0);
	assert.equal(f.timeouts.size + f.intervals.size, 0);
	assert.equal(f.ctx.closed, true);
});

test("a minute of triplets does not add a phantom beat or measure at the deadline", async () => {
	const f = fixture({ subdivision: 3, duration: 60 });
	await f.engine.start(); f.advance(61);
	assert.equal(f.sounds.length, 360);
	assert.equal(f.pulses.filter(pulse => pulse.part === 0).length, 120);
	assert.equal(f.pulses.filter(pulse => pulse.part === 0 && pulse.beat === 0).length, 30);
	assert.equal(f.engine.isRunning, false);
});

test("stopping while the audio device resumes cannot start a stale scheduler", async () => {
	let resolve;
	const resume = new Promise(done => { resolve = done; });
	const f = fixture({}, resume);
	const starting = f.engine.start();
	f.engine.stop(); resolve();
	assert.equal(await starting, false);
	assert.equal(f.engine.isRunning, false);
	assert.equal(f.intervals.size + f.timeouts.size, 0);
});

test("subdivision changes take effect at the next main beat", async () => {
	const f = fixture();
	await f.engine.start(); f.advance(0.2);
	f.settings.subdivision = 3; f.advance(0.9);
	assert.ok(Math.abs(f.sounds[1].time - 0.58) < 1e-8);
	assert.ok(Math.abs(f.sounds[2].time - f.sounds[1].time - 1 / 6) < 1e-8);
	f.engine.stop();
});

test("muting updates the master gain while the visual metronome continues", async () => {
	const f = fixture();
	await f.engine.start(); f.advance(0.1);
	f.settings.volume = 0; f.advance(0.7);
	assert.equal(f.ctx.master.gain.value, 0);
	assert.ok(f.pulses.length >= 2);
	f.engine.stop();
});

test("a delayed timer resumes without playing a burst of overdue clicks", async () => {
	const f = fixture({ subdivision: 4 });
	await f.engine.start();
	const before = f.sounds.length;
	f.tickAt(10);
	const resumed = f.sounds.slice(before);
	assert.ok(resumed.length <= 2);
	assert.ok(resumed.every(sound => sound.time >= 10));
	f.engine.stop();
});
