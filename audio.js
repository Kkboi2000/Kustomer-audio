// Everything that makes or plays sound lives here.
// One AudioContext for the whole app; recordings come back as Blobs,
// get decoded into AudioBuffers, and every playback is a "voice" you can stop.

let context = null;

export function audioContext() {
  context ??= new AudioContext();
  return context;
}

/** Browsers only start audio after a user gesture, so main.js calls this on every tap. */
export function unlockAudio() {
  const ctx = audioContext();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

/** iOS: "playback" stays audible with the silent switch on; the mic needs "play-and-record". */
function setSession(type) {
  const session = navigator.audioSession;
  if (session && session.type !== type) session.type = type;
}

const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];

/**
 * Opens the mic and starts recording.
 * Returns a take: `await take.stop()` gives the recording as a Blob and releases the mic.
 */
export async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new DOMException('Recording is not available', 'NotSupportedError');
  }

  setSession('play-and-record');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setSession('playback');
    throw error;
  }

  const mimeType = RECORDING_TYPES.find(type => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  const chunks = [];
  recorder.addEventListener('dataavailable', event => {
    if (event.data.size) chunks.push(event.data);
  });

  const finished = new Promise(resolve => {
    recorder.addEventListener('stop', () => {
      stream.getTracks().forEach(track => track.stop());
      setSession('playback');
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || '' }));
    }, { once: true });
  });

  recorder.start();

  return {
    startedAt: performance.now(),
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      return finished;
    },
  };
}

export async function decode(blob) {
  return audioContext().decodeAudioData(await blob.arrayBuffer());
}

/**
 * Plays a buffer once (or forever, with loop). `offset` and `duration` pick a slice,
 * which is how trimmed sounds play without ever cutting the original.
 * Returns a voice: { stop(), done }.
 */
export function play(buffer, { loop = false, offset = 0, duration } = {}) {
  const ctx = audioContext();
  setSession('playback');
  ctx.resume().catch(() => {});

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop; // sample-accurate, gapless looping
  source.connect(ctx.destination);

  const done = new Promise(resolve => source.addEventListener('ended', resolve, { once: true }));
  if (duration == null) source.start(0, offset);
  else source.start(0, offset, duration);

  return {
    done,
    stop() {
      try { source.stop(); } catch { /* already stopped */ }
    },
  };
}

/**
 * Where the sound actually is: skips the near-silence at both ends,
 * keeping a little padding so nothing gets clipped.
 */
export function audibleRange(buffer, { floor = 0.05, padding = 0.06 } = {}) {
  const whole = { start: 0, end: buffer.duration };
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const level = Math.abs(data[i]);
    if (level > peak) peak = level;
  }
  if (!peak) return whole;

  const threshold = peak * floor;
  let first = 0;
  let last = data.length - 1;
  while (first < last && Math.abs(data[first]) <= threshold) first++;
  while (last > first && Math.abs(data[last]) <= threshold) last--;

  const start = Math.max(0, first / buffer.sampleRate - padding);
  const end = Math.min(buffer.duration, (last + 1) / buffer.sampleRate + padding);
  return end - start >= 0.05 ? { start, end } : whole;
}

/** A new buffer with every channel's samples in reverse order. */
export function reversed(buffer) {
  const out = audioContext().createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    out.copyToChannel(buffer.getChannelData(channel).slice().reverse(), channel);
  }
  return out;
}

/** Turns a recording or decoding failure into a sentence that says what to do next. */
export function explain(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone is blocked. Allow it in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone found. Connect one and try again.';
    case 'NotReadableError':
      return 'Another app is using the microphone. Close it and try again.';
    case 'NotSupportedError':
      return 'This browser can’t record. Open the app over https in a recent browser.';
    case 'EncodingError':
      return 'That recording was too short. Try again and record a little longer.';
    default:
      return 'Audio stopped working. Try again.';
  }
}
