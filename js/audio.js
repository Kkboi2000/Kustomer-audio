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

/** Plays a buffer once (or forever, with loop). Returns a voice: { stop(), done }. */
export function play(buffer, { loop = false } = {}) {
  const ctx = audioContext();
  setSession('playback');
  ctx.resume().catch(() => {});

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop; // sample-accurate, gapless looping
  source.connect(ctx.destination);

  const done = new Promise(resolve => source.addEventListener('ended', resolve, { once: true }));
  source.start();

  return {
    done,
    stop() {
      try { source.stop(); } catch { /* already stopped */ }
    },
  };
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
