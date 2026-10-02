// Two draggable handles over a screen's waveform that choose which part of a
// sound plays. Nothing is cut: the result is just { start, end } in seconds.

import { h, seconds } from './ui.js';

const NUDGE = 0.05; // seconds per arrow-key press (×10 with Shift)
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export function attachTrimmer(screen, { length, start = 0, end = length, onChange }) {
  const area = screen.waveArea;
  const shortest = Math.min(0.05, length);
  let range = { start: 0, end: length };

  const handles = {
    start: handle('start', 'Start of sound'),
    end: handle('end', 'End of sound'),
  };
  const parts = [
    h('div', { class: 'trim-shade is-start' }),
    h('div', { class: 'trim-shade is-end' }),
    handles.start,
    handles.end,
  ];
  area.append(...parts);
  set({ start, end });

  function handle(edge, label) {
    const el = h('div', {
      class: `trim-handle is-${edge}`, role: 'slider', tabindex: '0', 'aria-label': label,
      'aria-valuemin': '0', 'aria-valuemax': length.toFixed(2),
    });

    el.addEventListener('pointerdown', event => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      const move = e => set({ ...range, [edge]: timeAt(e.clientX) }, edge);
      const release = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', release);
        el.removeEventListener('pointercancel', release);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    });

    el.addEventListener('keydown', event => {
      const step = { ArrowLeft: -NUDGE, ArrowDown: -NUDGE, ArrowRight: NUDGE, ArrowUp: NUDGE }[event.key];
      const jump = { Home: -Infinity, End: Infinity }[event.key];
      if (step == null && jump == null) return;
      event.preventDefault();
      set({ ...range, [edge]: jump ?? range[edge] + step * (event.shiftKey ? 10 : 1) }, edge);
    });

    return el;
  }

  function timeAt(clientX) {
    const box = area.getBoundingClientRect();
    return ((clientX - box.left) / box.width) * length;
  }

  /** A handle stops at the other one instead of pushing it. */
  function set(next, moved = null) {
    let { start: from, end: to } = next;
    if (moved === 'start') from = clamp(from, 0, range.end - shortest);
    else if (moved === 'end') to = clamp(to, range.start + shortest, length);
    else {
      from = clamp(from, 0, length - shortest);
      to = clamp(to, from + shortest, length);
    }
    range = { start: from, end: to };

    area.style.setProperty('--from', `${(from / length) * 100}%`);
    area.style.setProperty('--to', `${(to / length) * 100}%`);
    for (const [edge, el] of Object.entries(handles)) {
      el.setAttribute('aria-valuenow', range[edge].toFixed(2));
      el.setAttribute('aria-valuetext', seconds(range[edge]));
    }
    if (moved) onChange?.({ ...range });
  }

  return {
    get: () => ({ ...range }),
    destroy() {
      parts.forEach(part => part.remove());
      area.style.removeProperty('--from');
      area.style.removeProperty('--to');
    },
  };
}
