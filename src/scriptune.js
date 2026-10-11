/**
 * @typedef {{signal?: AbortSignal}} Options
 * @typedef {{pitches: Number[], duration: Number, type: String, pan: Number, volume: Number}} Note
 * @typedef {{[key: string]: Note[]}} Tracks
 * @typedef {(throttleKey?: string) => Promise<void>} ThrottledPlay
 * @typedef {{play: (sheet: String, options?: Options) => Promise<void>, createThrottledPlay: (sheet: String, throttleTimeMs?: Number, options?: Options) => ThrottledPlay, setVolume: (volume: Number) => void, getVolume: () => Number}} Player
 */

const config = document.querySelector('meta[name="scriptune-config"]');
const defaultMasterVolume = parseVolume(config?.dataset.defaultMasterVolume, 1);
const volumeStorageKey = config?.dataset.volumeStorageKey || 'scriptune-master-volume';
const scheduleAheadInSeconds = 5;
const audioContext = new AudioContext();
const masterGain = audioContext.createGain();
masterGain.connect(audioContext.destination);
setMasterVolume(getMasterVolume());
const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
noiseBuffer.getChannelData(0).forEach((_, i, samples) => samples[i] = Math.random() < .5 ? -1 : 1);
const players = new Map();

const pitches = {
    '-': 0,
    C1: 32.70, 'C#1': 34.65, Db1: 34.65, D1: 36.71, 'D#1': 38.89, Eb1: 38.89, E1: 41.20, F1: 43.65,
    'F#1': 46.25, Gb1: 46.25, G1: 49.00, 'G#1': 51.91, Ab1: 51.91, A1: 55.00, 'A#1': 58.27, Bb1: 58.27, B1: 61.74,
    C2: 65.41, 'C#2': 69.30, Db2: 69.30, D2: 73.42, 'D#2': 77.78, Eb2: 77.78, E2: 82.41, F2: 87.31,
    'F#2': 92.50, Gb2: 92.50, G2: 98.00, 'G#2': 103.83, Ab2: 103.83, A2: 110.00, 'A#2': 116.54, Bb2: 116.54, B2: 123.47,
    C3: 130.81, 'C#3': 138.59, Db3: 138.59, D3: 146.83, 'D#3': 155.56, Eb3: 155.56, E3: 164.81, F3: 174.61,
    'F#3': 185.00, Gb3: 185.00, G3: 196.00, 'G#3': 207.65, Ab3: 207.65, A3: 220.00, 'A#3': 233.08, Bb3: 233.08, B3: 246.94,
    C4: 261.63, 'C#4': 277.18, Db4: 277.18, D4: 293.66, 'D#4': 311.13, Eb4: 311.13, E4: 329.63, F4: 349.23,
    'F#4': 369.99, Gb4: 369.99, G4: 392.00, 'G#4': 415.30, Ab4: 415.30, A4: 440.00, 'A#4': 466.16, Bb4: 466.16, B4: 493.88,
    C5: 523.25, 'C#5': 554.37, Db5: 554.37, D5: 587.33, 'D#5': 622.25, Eb5: 622.25, E5: 659.26, F5: 698.46,
    'F#5': 739.99, Gb5: 739.99, G5: 783.99, 'G#5': 830.61, Ab5: 830.61, A5: 880.00, 'A#5': 932.33, Bb5: 932.33, B5: 987.77,
    C6: 1046.50, 'C#6': 1108.73, Db6: 1108.73, D6: 1174.66, 'D#6': 1244.51, Eb6: 1244.51, E6: 1318.51, F6: 1396.91,
    'F#6': 1479.98, Gb6: 1479.98, G6: 1567.98, 'G#6': 1661.22, Ab6: 1661.22, A6: 1760.00, 'A#6': 1864.66, Bb6: 1864.66, B6: 1975.53,
    C7: 2093.00, 'C#7': 2217.46, Db7: 2217.46, D7: 2349.32, 'D#7': 2489.02, Eb7: 2489.02, E7: 2637.02, F7: 2793.83,
    'F#7': 2959.96, Gb7: 2959.96, G7: 3135.96, 'G#7': 3322.44, Ab7: 3322.44, A7: 3520.00, 'A#7': 3729.31, Bb7: 3729.31, B7: 3951.07,
    C8: 4186.01, 'C#8': 4434.92, Db8: 4434.92, D8: 4698.63, 'D#8': 4978.03, Eb8: 4978.03, E8: 5274.04, F8: 5587.65,
    'F#8': 5919.91, Gb8: 5919.91, G8: 6271.93, 'G#8': 6644.88, Ab8: 6644.88, A8: 7040.00, 'A#8': 7458.62, Bb8: 7458.62, B8: 7902.13
};
const durations = {
    w: 4, h: 2, q: 1, e: .5, s: .25, dw: 6, dh: 3, dq: 1.5, de: .75, ds: .375,
};

/**
 * @param {Number} duration
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function sleep(duration, options) {
    let onAbort, timerId;
    await Promise.race([
        new Promise(r => timerId = setTimeout(r, duration)),
        new Promise(r => options.signal?.addEventListener('abort', onAbort = r))
    ]).finally(() => {
        clearTimeout(timerId);
        options.signal?.removeEventListener('abort', onAbort)
    });
}

/**
 * @param {Number} frequency
 * @param {Note} note
 * @param {Number} currentTime
 * @param {AudioNode} destination
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function beep(frequency, note, currentTime, destination, options) {
    const [source, output, level] = createSource(frequency, note.type);
    const stereoPanner = audioContext.createStereoPanner();
    stereoPanner.pan.value = note.pan;
    const gain = audioContext.createGain();
    gain.gain.value = note.volume * level;

    output.connect(stereoPanner);
    stereoPanner.connect(gain);
    gain.connect(destination);

    source.start(currentTime, source.buffer ? Math.random() * source.buffer.duration : 0);
    source.stop(currentTime + note.duration);

    const onAbort = () => source.stop();
    options.signal?.addEventListener('abort', onAbort);

    return new Promise(r => source.onended = () => {
        gain.disconnect();
        stereoPanner.disconnect();
        output.disconnect();
        source.disconnect();
        options.signal?.removeEventListener('abort', onAbort);
        r();
    });
}

/**
 * @param {Number} frequency
 * @param {String} type
 * @returns {[AudioScheduledSourceNode, AudioNode, Number]}
 */
function createSource(frequency, type) {
    if (type !== 'noise') {
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.type = type;

        return [oscillator, oscillator, 1];
    }

    const noise = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    noise.connect(filter);

    const alpha = Math.sin(2 * Math.PI * frequency / audioContext.sampleRate) / (2 * filter.Q.value);
    return [noise, filter, alpha > 0 ? Math.sqrt((1 + alpha) / alpha) : 0];
}

/**
 * @param {String} sheet
 * @returns {Tracks}
 */
function parseSheet(sheet) {
    const tracks = {default: []};
    let track = tracks.default;
    let bpm = 120;
    let type = 'square';
    let pan = 0;
    let volume = 1;
    const loops = [];
    const commands = {
        '#BPM': args => bpm = parseInt(args[0]),
        '#PAN': args => pan = Math.max(-1, Math.min(parseFloat(args[0]), 1)),
        '#VOLUME': args => volume = Math.max(0, Math.min(parseFloat(args[0]), 1)),
        '#TYPE': args => type = args[0],
        '#TRACK': args => track = tracks[args[0]] ??= [],
        '#LOOP': args => loops.push({count: parseInt(args[0]), content: []}),
        '#ENDLOOP': () => {
            const loop = loops.pop();

            (loops.length > 0 ? loops[loops.length - 1].content : track).push(
                ...Array(loop.count).fill(loop.content).flat()
            );
        },
        '#NOTES': args => (loops.length > 0 ? loops[loops.length - 1].content : track)
            .push(...args.map(cell => {
                const [pitch, duration] = cell.split(':');

                return {
                    pitches: pitch.split('+').map(p => pitches[p]),
                    duration: durations[duration] * 60 / bpm,
                    type,
                    pan,
                    volume
                }
            }))
    };

    const lines = sheet.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(l => l !== '');
    lines.forEach(line => {
        if (!line.startsWith('#')) line = '#NOTES ' + line;
        const [command, ...args] = line.split(/\s+/);

        commands[command](args);
    });

    return tracks;
}

/**
 * @param {Note[]} notes
 * @param {Number} currentTime
 * @param {AudioNode} destination
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function playTrack(notes, currentTime, destination, options) {
    let lastBeeps = [];

    for (const note of notes) {
        if (currentTime - audioContext.currentTime > scheduleAheadInSeconds) await sleep(1000, options);
        if (options.signal?.aborted) break;

        lastBeeps = note.pitches.map(pitch => beep(pitch, note, currentTime, destination, options));
        currentTime += note.duration;
    }

    await Promise.all(lastBeeps);
}

/**
 * @param {String} sheet
 * @param {AudioNode} destination
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function playTo(sheet, destination, options) {
    const tracks = parseSheet(sheet), currentTime = audioContext.currentTime;

    await Promise.all(Object.values(tracks).map(notes => playTrack(notes, currentTime, destination, options)));
}

/**
 * @param {String} sheet
 * @param {AudioNode} destination
 * @param {Number} throttleTimeMs
 * @param {Options} options
 * @returns {ThrottledPlay}
 */
function createThrottledPlayTo(sheet, destination, throttleTimeMs, options) {
    const throttleKeys = new Map();

    return async (throttleKey = '') => {
        const now = Date.now();
        if (throttleKeys.has(throttleKey) && throttleKeys.get(throttleKey) >= now) return;
        if (throttleKey) throttleKeys.set(throttleKey, now + throttleTimeMs);
        await playTo(sheet, destination, options);
        throttleKeys.forEach((v, k) => v <= now && throttleKeys.delete(k));
    };
}

/**
 * @param {Number} volume
 * @returns {Number}
 */
function clampVolume(volume) {
    return Math.max(0, Math.min(volume, 1));
}

/**
 * @param {?String} value
 * @param {Number} defaultVolume
 * @returns {Number}
 */
function parseVolume(value, defaultVolume) {
    const volume = parseFloat(value);
    return clampVolume(isNaN(volume) ? defaultVolume : volume);
}

/**
 * @param {String} storageKey
 * @param {Number} volume
 * @returns {Number}
 */
function writeVolume(storageKey, volume) {
    volume = clampVolume(volume);
    localStorage.setItem(storageKey, volume.toString());
    return volume;
}

/**
 * @param {Number} volume
 * @returns {void}
 */
export function setMasterVolume(volume) {
    masterGain.gain.value = writeVolume(volumeStorageKey, volume) / 10;
}

/**
 * @returns {Number}
 */
export function getMasterVolume() {
    return parseVolume(localStorage.getItem(volumeStorageKey), defaultMasterVolume);
}

/**
 * @deprecated use `getPlayer(name).play` instead.
 * @param {String} sheet
 * @param {Options} options
 * @returns {Promise<void>}
 */
export async function play(sheet, options = {}) {
    await playTo(sheet, masterGain, options);
}

/**
 * @deprecated use `getPlayer(name).createThrottledPlay` instead.
 * @param {String} sheet
 * @param {Number} throttleTimeMs
 * @param {Options} options
 * @returns {ThrottledPlay}
 */
export function createThrottledPlay(sheet, throttleTimeMs = 3000, options = {}) {
    return createThrottledPlayTo(sheet, masterGain, throttleTimeMs, options);
}

/**
 * @param {String} name
 * @returns {Player}
 */
export function getPlayer(name) {
    if (players.has(name)) return players.get(name);
    if (!/^[a-z][a-z-]*$/.test(name)) throw new Error(`Invalid player name "${name}".`);
    const storageKey = config?.getAttribute(`data-player-${name}-volume-storage-key`) || `scriptune-player-${name}-volume`;
    const defaultVolume = parseVolume(config?.getAttribute(`data-default-player-${name}-volume`), 1);
    const gain = audioContext.createGain();
    gain.connect(masterGain);
    const player = {
        play: (sheet, options = {}) => playTo(sheet, gain, options),
        createThrottledPlay: (sheet, throttleTimeMs = 3000, options = {}) => createThrottledPlayTo(sheet, gain, throttleTimeMs, options),
        setVolume: volume => gain.gain.value = writeVolume(storageKey, volume),
        getVolume: () => parseVolume(localStorage.getItem(storageKey), defaultVolume)
    };
    player.setVolume(player.getVolume());
    players.set(name, player);
    return player;
}
