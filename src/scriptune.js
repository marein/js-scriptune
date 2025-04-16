/**
 * @typedef {{signal?: AbortSignal}} Options
 * @typedef {{pitches: Number[], duration: Number, type: String, pan: Number, volume: Number}} Note
 * @typedef {{[key: string]: Note[]}} Tracks
 */

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
 * @param {Number} frequency
 * @param {Note} note
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function beep (frequency, note, options) {
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

    oscillator.start();
    await new Promise(resolve => {
        let timer = null;
        const onResolve = () => {
            options.signal?.removeEventListener('abort', onResolve);
            clearTimeout(timer);
            resolve();
        };
        timer = setTimeout(onResolve, note.duration);
        options.signal?.addEventListener('abort', onResolve)
    });
    oscillator.stop();
}

/**
 * @param {String} sheet
 * @returns {Tracks}
 */
function parseSheet(sheet) {
    const tracks = {default: []};
    let currentTrack = 'default';
    let bpm = 120;
    let type = 'square';
    let pan = 0;
    let volume = 1;
    let loop = 0;
    let loopContent = [];

    const lines = sheet.split('\n').map(l => l.trim()).filter(l => l !== '');
    lines.forEach(line => {
        if (line.startsWith(';')) return;

        if (line.startsWith('#BPM')) {
            bpm = line.split(' ')[1];
            return;
        }

        if (line.startsWith('#PAN')) {
            pan = Math.max(-1, Math.min(parseFloat(line.split(' ')[1]), 1));
            return;
        }

        if (line.startsWith('#VOLUME')) {
            volume = Math.max(0, Math.min(parseFloat(line.split(' ')[1]), 1));
            return;
        }

        if (line.startsWith('#LOOP')) {
            loop = parseInt(line.split(' ')[1]);
            loopContent = [];
            return;
        }

        if (line.startsWith('#ENDLOOP')) {
            for (let i = 0; i < loop; i++) {
                tracks[currentTrack].push(...loopContent);
            }
            loop = 0;
            loopContent = [];
            return;
        }

        if (line.startsWith('#TYPE')) {
            type = line.split(' ')[1];
            return;
        }

        if (line.startsWith('#TRACK')) {
            currentTrack = line.split(' ')[1];
            tracks[currentTrack] = [];
            return;
        }

        let notes = loop > 0 ? loopContent : tracks[currentTrack];

        notes.push(...line.split(/\s+/).map(cell => {
            const [pitch, duration] = cell.split(':');

            return {
                pitches: pitch.split('+').map(p => pitches[p]),
                duration: durations[duration] * (60000 / bpm),
                type,
                pan,
                volume
            }
        }));
    });

    return tracks;
}

/**
 * @param {Note[]} notes
 * @param {Options} options
 * @returns {Promise<void>}
 */
async function playTrack(notes, options) {
    for (const note of notes) {
        if (options.signal?.aborted) return;

        await Promise.all(note.pitches.map(pitch => beep(pitch, note, options)));
    }
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
    const tracks = parseSheet(sheet);

    await Promise.all(Object.keys(tracks).map(name => playTrack(tracks[name], options)));
}
