const id = name => document.getElementById(name);
const toggle = id('toggle');
const menu = id('menu');
const widget = document.querySelector('.widget');
const title = document.querySelector('.title');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let transitioning = false;

/* ---- UI polish helpers (frontend only) ---- */
menu.querySelectorAll(':scope > :not(fieldset), #options > *').forEach((el, i) => el.style.setProperty('--i', i));

function paint(key) {
  const el = id(key), min = +el.min, max = +el.max;
  const pct = (el.value - min) / (max - min) * 100;
  const pos = p => `calc(${p}% + ${(.5 - p / 100) * 14}px)`;
  const mid = min < 0 ? 50 : 0;
  el.style.setProperty('--a', mid === 0 ? '0%' : pos(Math.min(mid, pct)));
  el.style.setProperty('--b', pos(Math.max(mid, pct)));
}
function syncSwatch() {
  const swatch = document.querySelector('.swatch'), value = id('lights').value;
  if (value.startsWith('#')) { swatch.dataset.palette = 'custom'; swatch.style.setProperty('--custom', value); }
  else swatch.dataset.palette = value;
}
document.querySelectorAll('.actions button, #hide-widget').forEach(button =>
  button.addEventListener('pointerdown', event => {
    if (button.disabled || button.closest('fieldset:disabled')) return;
    const box = button.getBoundingClientRect(), size = Math.max(box.width, box.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    Object.assign(dot.style, { width: size + 'px', height: size + 'px',
      left: event.clientX - box.left - size / 2 + 'px', top: event.clientY - box.top - size / 2 + 'px' });
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    button.append(dot);
  }));

async function animateMenu(open, collapsed) {
  if (motion.matches) return;
  const bounds = widget.getBoundingClientRect();
  const inset = Math.max(0, (bounds.width - collapsed.width) / 2);
  const bottom = Math.max(0, bounds.height - collapsed.height);
  const icon = toggle.getBoundingClientRect();
  const offset = bounds.left + bounds.width / 2 - icon.left - icon.width / 2;
  const duration = open ? 480 : 400;
  const options = { duration, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both' };
  const frames = (closed, expanded) => open ? [closed, expanded] : [expanded, closed];
  const animations = [
    widget.animate(frames({ clipPath: `inset(0 ${inset}px ${bottom}px round 22px)` },
      { clipPath: 'inset(0 round 22px)' }), options),
    toggle.animate(frames({ transform: `translate(${offset}px, -8px)` }, { transform: 'none' }), options),
    title.animate(frames({ opacity: 0 }, { opacity: 1 }), options),
    menu.animate(frames({ opacity: 0, transform: 'translateY(-14px)' },
      { opacity: 1, transform: 'none' }), options),
  ];
  // Keep the transition bounded even if Electron pauses the hidden window's timeline.
  await new Promise(resolve => setTimeout(resolve, duration));
  for (const animation of animations) animation.cancel();
}

let collapsed;

async function setOpen(open) {
  if (transitioning || open === !menu.hidden) return;
  transitioning = true;
  try {
    if (open) {
      collapsed = widget.getBoundingClientRect();
      await wintermas.widget(true);
    }
    if (open) menu.hidden = false;
    else {
      menu.inert = true;
      await animateMenu(false, collapsed);
      menu.hidden = true;
    }
    document.body.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close Christmas menu' : 'Open Christmas menu');
    if (open) {
      menu.inert = false;
      const resize = wintermas.widget(true, menu.offsetTop + menu.scrollHeight + 6);
      await Promise.all([resize, animateMenu(true, collapsed)]);
    } else await wintermas.widget(false);
  } catch (error) { report(error); }
  finally { transitioning = false; }
}
function report(error) {
  console.error(error);
  id('message').textContent = 'Something went wrong. Please try again.';
}
function show(settings) {
  document.body.classList.toggle('enabled', settings.enabled);
  id('enabled').checked = settings.enabled;
  id('options').disabled = !settings.enabled;
  id('snow').checked = !settings.paused;
  id('taskbar').checked = settings.taskbar;
  for (const key of ['intensity', 'wind']) {
    id(key).value = settings[key];
    id(key + '-value').textContent = settings[key] + ' %';
    paint(key);
  }
}
const update = patch => wintermas.update(patch).catch(report);
toggle.addEventListener('click', () => setOpen(menu.hidden));
id('hide-widget').addEventListener('click', async () => {
  if (transitioning) return;
  try {
    await setOpen(false);
    transitioning = true;
    if (motion.matches) await wintermas.hideWidget();
    else {
      const animation = widget.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-5px)' }],
        { duration: 240, easing: 'ease-in-out', fill: 'forwards' });
      try {
        await new Promise(resolve => setTimeout(resolve, 240));
        await wintermas.hideWidget();
      } finally { animation.cancel(); }
    }
  } catch (error) { report(error); }
  finally { transitioning = false; }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) { setOpen(false); toggle.focus(); }
});
id('enabled').addEventListener('change', () => update({ enabled: id('enabled').checked }));
id('snow').addEventListener('change', () => update({ paused: !id('snow').checked }));
id('taskbar').addEventListener('change', () => update({ taskbar: id('taskbar').checked }));
for (const key of ['intensity', 'wind']) {
  id(key).addEventListener('input', () => { id(key + '-value').textContent = id(key).value + ' %'; paint(key); });
  id(key).addEventListener('change', () => update({ [key]: Number(id(key).value) }));
}
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', async () => {
    try {
      const action = button.dataset.action;
      if (action === 'garland' || action === 'tree') {
        await setOpen(false);
        await wintermas.action(action, id('lights').value);
      } else await wintermas.action(action);
    } catch (error) { report(error); }
  });
}
id('lights').addEventListener('change', syncSwatch);
id('light-color').addEventListener('change', () => {
  let option = id('lights').querySelector('[data-custom]');
  if (!option) {
    option = new Option('Custom');
    option.dataset.custom = '';
    id('lights').add(option);
  }
  option.value = id('light-color').value;
  option.selected = true;
  syncSwatch();
});
wintermas.onSettings(show);
wintermas.settings().then(show).catch(report);