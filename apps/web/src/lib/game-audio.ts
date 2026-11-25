const storageKey = 'draw-and-guess.game-sounds';
const pauseBetweenCues = 0.12;
const sounds = {
  join: { notes: [659, 784], beat: 0.065, volume: 0.035, priority: 1 },
  start: { notes: [392, 523, 659], beat: 0.075, volume: 0.045, priority: 2 },
  correct: { notes: [523, 659, 880], beat: 0.065, volume: 0.05, priority: 3 },
  wrong: { notes: [294], beat: 0.055, volume: 0.022, priority: 0 },
  turn: { notes: [587, 698], beat: 0.075, volume: 0.04, priority: 2 },
  finish: {
    notes: [523, 659, 784, 1047],
    beat: 0.08,
    volume: 0.05,
    priority: 4,
  },
} as const;

type SoundCue = keyof typeof sounds;

let enabled = false;
let roomCode: string | undefined;
let context: AudioContext | undefined;
let voice: OscillatorNode | undefined;
let lastPriority = -1;
let availableAt = 0;
const listeners = new Set<() => void>();

export function subscribeToSoundPreference(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function soundEnabled() {
  return enabled;
}

function updatePreference(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  for (const listener of listeners) listener();
}

function unlockAudio() {
  if (!enabled || !roomCode || !window.AudioContext) return;
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
  } catch {
    // The next user gesture can retry if the browser cannot open audio now.
  }
}

function onGesture(event: Event) {
  if (event.isTrusted) unlockAudio();
}

function stopVoice() {
  if (voice) {
    voice.stop();
    voice = undefined;
  }
  availableAt = 0;
}

export function setSoundEnabled(value: boolean) {
  updatePreference(value);
  try {
    localStorage.setItem(storageKey, value ? 'on' : 'off');
  } catch {
    // Keep the preference in this tab if storage is blocked.
  }
  if (value) unlockAudio();
  else stopVoice();
}

export function bindRoomAudio(code: string) {
  roomCode = code;
  try {
    updatePreference(localStorage.getItem(storageKey) === 'on');
  } catch {
    // Keep the in-memory preference.
  }
  window.addEventListener('click', onGesture, true);
  window.addEventListener('keydown', onGesture, true);

  return () => {
    roomCode = undefined;
    window.removeEventListener('click', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    stopVoice();
    if (context) void context.close().catch(() => {});
    context = undefined;
  };
}

export function playGameSound(cue: SoundCue, code: string) {
  if (!enabled || code !== roomCode || context?.state !== 'running') return;
  const { notes, beat, volume, priority } = sounds[cue];
  const now = context.currentTime;
  if (now < availableAt && priority <= lastPriority) return;
  stopVoice();

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain).connect(context.destination);
  const start = now + 0.005;
  const end = start + beat * notes.length;
  notes.forEach((frequency, index) => {
    const at = start + index * beat;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.012);
    gain.gain.linearRampToValueAtTime(0, at + beat * 0.9);
  });
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    if (voice === oscillator) voice = undefined;
  };
  voice = oscillator;
  lastPriority = priority;
  availableAt = end + pauseBetweenCues;
  oscillator.start(start);
  oscillator.stop(end);
}
