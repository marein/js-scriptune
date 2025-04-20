/**
 * @typedef {{signal?: AbortSignal}} Options
 * @typedef {{pitches: Number[], duration: Number, type: String, pan: Number, volume: Number}} Note
 * @typedef {{[key: string]: Note[]}} Tracks
 */

const scheduleAheadInSeconds = 5;
const audioContext = new AudioContext();
const masterGain = audioContext.createGain();
setMasterVolume(1);
masterGain.connect(audioContext.destination);

const pitches = {
    '-': 0,
    C1: 32.70, D1: 36.71, E1: 41.20, F1: 43.65, G1: 49.00, A1: 55.00, B1: 61.74,
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.26, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, F6: 1396.91, G6: 1567.98, A6: 1760.00, B6: 1975.53,
    C7: 2093.00, D7: 2349.32, E7: 2637.02, F7: 2793.83, G7: 3135.96, A7: 3520.00, B7: 3951.07
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
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function beep(frequency, note, currentTime, options) {
    const oscillator = audioContext.createOscillator();
    const stereoPanner = audioContext.createStereoPanner();
    stereoPanner.pan.value = note.pan;
    const gain = audioContext.createGain();
    gain.gain.value = note.volume;

    oscillator.connect(stereoPanner);
    stereoPanner.connect(gain);
    gain.connect(masterGain);

    oscillator.frequency.value = frequency;
    oscillator.type = note.type;
    oscillator.start(currentTime);
    oscillator.stop(currentTime + note.duration);

    const onAbort = () => oscillator.stop();
    options.signal?.addEventListener('abort', onAbort);

    return new Promise(r => oscillator.onended = () => {
        gain.disconnect();
        stereoPanner.disconnect();
        oscillator.disconnect();
        options.signal?.removeEventListener('abort', onAbort);
        r();
    });
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
        '#TRACK': args => track = tracks[args[0]] = [],
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
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function playTrack(notes, currentTime, options) {
    let lastBeeps = [];

    for (const note of notes) {
        if (currentTime - audioContext.currentTime > scheduleAheadInSeconds) await sleep(1000, options);
        if (options.signal?.aborted) break;

        lastBeeps = note.pitches.map(pitch => beep(pitch, note, currentTime, options));
        currentTime += note.duration;
    }

    await Promise.all(lastBeeps);
}

/**
 * @param {Number} value
 * @returns {void}
 */
export function setMasterVolume(value) {
    masterGain.gain.value = Math.max(0, Math.min(value, 1)) / 10;
}

/**
 * @param {String} sheet
 * @param {Options} options
 * @returns {Promise<void>}
 */
export async function play(sheet, options = {}) {
    const tracks = parseSheet(sheet), currentTime = audioContext.currentTime;

    await Promise.all(Object.values(tracks).map(notes => playTrack(notes, currentTime, options)));
}
