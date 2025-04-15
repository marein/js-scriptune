const audioContext = new AudioContext();
const gain = audioContext.createGain();
setMasterVolume(1);
gain.connect(audioContext.destination);

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
 * @param {Number} duration
 * @param {'sine'|'square'|'sawtooth'|'triangle'} type
 * @param {Number} pan
 */
async function beep (
    frequency,
    duration,
    type = 'square',
    pan = 0
) {
    const oscillator = audioContext.createOscillator();
    const stereoPanner = audioContext.createStereoPanner();
    stereoPanner.pan.value = pan;

    oscillator.connect(stereoPanner);
    stereoPanner.connect(gain);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    oscillator.start();
    await new Promise(r => setTimeout(r, duration));
    oscillator.stop();
}

function parseSheet(sheet) {
    const tracks = {default: []};
    let currentTrack = 'default';
    let bpm = 120;
    let type = 'square';
    let pan = 0;
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

        if (line.startsWith('#LOOP')) {
            loop = line.split(' ')[1];
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
                pitch: pitches[pitch],
                duration: durations[duration] * (60000 / bpm),
                type,
                pan
            }
        }));
    });

    return tracks;
}

async function playTrack(notes) {
    for (const note of notes) await beep(note.pitch, note.duration, note.type, note.pan);
}

/**
 * @param {Number} value
 */
export function setMasterVolume(value) {
    gain.gain.value = Math.max(0, Math.min(value, 1)) / 10;
}

export async function play(sheet) {
    const tracks = parseSheet(sheet);

    await Promise.all(Object.keys(tracks).map(name => playTrack(tracks[name])));
}
