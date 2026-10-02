// Small building blocks shared by every tool.

/** h('button', { class: 'key', onclick }, 'Label') → a real element. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter(child => child != null && child !== false));
  return el;
}

export function roundKey(glyph, label, onclick, tone = '') {
  return h('button', { type: 'button', class: `key round ${tone}`.trim(), 'aria-label': label, onclick },
    h('span', { 'aria-hidden': 'true' }, glyph));
}

export const seconds = value => `${value.toFixed(1)} s`;

/* ---------- Icons ---------- */

const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.5a7.8 7.8 0 0 1 0 11"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  more: '<circle cx="12" cy="5.5" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.7" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M8 5.2v13.6L19 12z" fill="currentColor" stroke="none"/>',
};

export function icon(name) {
  const template = document.createElement('template');
  template.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  return template.content.firstElementChild;
}

export const iconButton = (name, label, onclick) =>
  h('button', { type: 'button', class: 'icon-button', 'aria-label': label, onclick }, icon(name));

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export const PALETTE = [
  { name: 'Chalk', value: '#eef0f6' },
  { name: 'Signal', value: '#ffd447' },
  { name: 'Coral', value: '#ff6b57' },
  { name: 'Mint', value: '#7be0b5' },
  { name: 'Lilac', value: '#c3b4ff' },
  { name: 'Sky', value: '#8fd3ff' },
];

/* ---------- Tap vs. hold ---------- */

const HOLD_MS = 450;

/**
 * Tap runs onTap. Long-press (touch or mouse), right-click, or the keyboard
 * menu key runs onHold — and the tap that would follow a hold is swallowed.
 */
export function pressable(el, { onTap, onHold }) {
  let timer = 0;
  let pressed = false;
  let swallowClick = false;
  let origin = null;

  const fireHold = () => {
    navigator.vibrate?.(12);
    onHold();
  };

  el.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pressed = true;
    swallowClick = false;
    origin = [event.clientX, event.clientY];
    timer = setTimeout(() => { swallowClick = true; fireHold(); }, HOLD_MS);
  });

  el.addEventListener('pointermove', event => {
    if (origin && Math.hypot(event.clientX - origin[0], event.clientY - origin[1]) > 10) clearTimeout(timer);
  });

  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    el.addEventListener(type, () => { clearTimeout(timer); pressed = false; });
  }

  // Right-click on desktop; Android also sends this on long-press.
  el.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (swallowClick) return; // the hold timer already handled it
    clearTimeout(timer);
    if (pressed) swallowClick = true;
    fireHold();
  });

  el.addEventListener('click', () => {
    if (swallowClick) { swallowClick = false; return; }
    onTap();
  });
}

/* ---------- Sheets ---------- */

const dialog = document.getElementById('sheet');
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close(); // tap on the backdrop
});

/**
 * Opens the bottom sheet (or, with variant 'drawer', a panel from the left).
 * `render(done, onClose)` returns its content; call done(value) to close with
 * a result. Resolves null when dismissed.
 */
export function sheet(title, render, { dismiss = 'Cancel', variant = 'sheet' } = {}) {
  if (dialog.open) return Promise.resolve(null);

  return new Promise(resolve => {
    let result = null;
    const cleanups = [];
    const done = value => { result = value; dialog.close(); };
    const content = render(done, fn => cleanups.push(fn));

    dialog.replaceChildren(h('div', { class: 'sheet-body' },
      h('h2', { class: 'sheet-title' }, title),
      ...content,
      h('button', { type: 'button', class: 'sheet-cancel', onclick: () => done(null) }, dismiss)));

    dialog.addEventListener('close', () => {
      cleanups.forEach(fn => fn());
      resolve(result);
    }, { once: true });
    dialog.classList.toggle('is-drawer', variant === 'drawer');
    dialog.showModal();
  });
}

export function closeSheet() {
  if (dialog.open) dialog.close();
}

/** A list of choices. Items: { label, value, danger? }; falsy items are skipped. */
export function menu(title, items) {
  return sheet(title, done => items.filter(Boolean).map(item =>
    h('button', {
      type: 'button',
      class: `key action${item.danger ? ' is-danger' : ''}`,
      onclick: () => done(item.value),
    }, item.label)));
}

/** A one-line text prompt. Resolves the trimmed text, or null. */
export function ask(title, { value = '', action = 'Save' } = {}) {
  return sheet(title, done => {
    const input = h('input', {
      class: 'field', value, maxlength: '40', required: true,
      autocomplete: 'off', enterkeyhint: 'done', 'aria-label': title,
    });
    requestAnimationFrame(() => input.select());
    const submit = event => {
      event.preventDefault();
      const text = input.value.trim();
      if (text) done(text);
    };
    return [h('form', { class: 'sheet-form', onsubmit: submit },
      input,
      h('button', { class: 'key action is-primary' }, action))];
  });
}

export async function confirm(title, message, action) {
  return Boolean(await sheet(title, done => [
    h('p', { class: 'sheet-text' }, message),
    h('button', { type: 'button', class: 'key action is-danger', onclick: () => done(true) }, action),
  ]));
}

export function notice(title, message) {
  return sheet(title, () => [h('p', { class: 'sheet-text' }, message)], { dismiss: 'OK' });
}

export function pickColor(title, current) {
  return sheet(title, done => [h('div', { class: 'swatches' },
    ...PALETTE.map(({ name, value }) => h('button', {
      type: 'button',
      class: 'key swatch',
      style: `--face: ${value}`,
      'aria-pressed': String(value === current),
      onclick: () => done(value),
    }, value === current ? `✓ ${name}` : name)))]);
}
