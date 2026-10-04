export function createHUD({ onRetry, onPause, onSound }) {
  const nodes = new Map();
  const el = (id) => {
    if (!nodes.has(id)) nodes.set(id, document.getElementById(id));
    return nodes.get(id);
  };
  const menu = el('menu'),
    actions = ['slash', 'stab', 'heavy', 'special', 'dodge', 'guard'],
    labels = new Map(actions.map((id) => [id, el(id).querySelector('small')]));
  // DOM writes can invalidate layout and accessibility state even when the
  // displayed value is unchanged. Keep ownership here, outside simulation.
  const displayed = new WeakMap();
  const set = (node, key, value) => {
    if (!displayed.has(node)) displayed.set(node, new Map());
    const previous = displayed.get(node);
    if (previous.has(key) && previous.get(key) === value) return;
    node[key] = value;
    previous.set(key, value);
  };
  const attribute = (node, key, value) => {
    if (node.getAttribute(key) !== value) node.setAttribute(key, value);
  };
  let loaded = false,
    sound = true;
  function pause() {
    onPause(menu.open || document.hidden);
    document.body.classList.toggle('menu-open', menu.open);
  }
  function resize() {
    pause();
  }
  function toggleMenu() {
    if (!loaded) return;
    if (menu.open) menu.close();
    else menu.showModal();
    pause();
  }
  for (const id of ['resume', 'close-menu'])
    el(id).onclick = () => menu.close();
  menu.addEventListener('close', pause);
  menu.addEventListener('cancel', pause);
  el('menu-button').onclick = toggleMenu;
  el('retry').onclick = () => {
    menu.close();
    onRetry();
  };
  el('again').onclick = onRetry;
  el('sound').onclick = () => {
    sound = !sound;
    el('sound').textContent = sound ? 'Sound on' : 'Sound off';
    el('sound').setAttribute('aria-pressed', String(sound));
    onSound(sound);
  };
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', pause);
  resize();
  return {
    toggleMenu,
    resize,
    ready() {
      loaded = true;
      el('entry').hidden = true;
      el('hud').hidden = false;
      resize();
    },
    loading(text) {
      el('loading').textContent = text;
    },
    failed(message) {
      el('enter').disabled = false;
      el('enter').textContent = 'Retry loading';
      el('loading').textContent = message;
    },
    update(g) {
      const p = g.player,
        donor = g.pilot === 'donor-knife';
      set(el('health-fill').style, 'width', `${(p.hp / p.maxHP) * 100}%`);
      set(el('health-number'), 'textContent', `${Math.ceil(p.hp)} / ${p.maxHP}`);
      const maximum =
        Number.isFinite(p.maxStamina) && p.maxStamina > 0 ? p.maxStamina : 100;
      const rawStamina = p.stamina ?? p.guard;
      const stamina = Math.min(
        maximum,
        Math.max(0, Number.isFinite(rawStamina) ? rawStamina : 0),
      );
      const exhausted = p.exhausted === true;
      const unaffordable = (id) => {
        const cost = g.staminaCosts?.[id];
        return id === 'guard'
          ? stamina <= 0 || exhausted
          : Number.isFinite(cost) && cost > 0 && (stamina < cost || exhausted);
      };
      const low =
        stamina <= 0 ||
        ['slash', 'stab', 'heavy', 'special', 'dodge'].some(unaffordable);
      const staminaState = exhausted
        ? 'EXHAUSTED'
        : p.guardBrokenUntil > g.time
          ? 'GUARD BROKEN'
          : low
            ? 'LOW'
            : '';
      set(el('guard-fill').style, 'width', `${(stamina / maximum) * 100}%`);
      set(el('guard-number'), 'textContent', `${Math.ceil(stamina)} / ${maximum}`);
      const bar = el('stamina-bar');
      attribute(bar, 'aria-valuenow', String(stamina));
      attribute(bar, 'aria-valuemax', String(maximum));
      bar.classList.toggle('low-energy', low || exhausted);
      set(el('stamina-state'), 'textContent', staminaState);
      for (const id of actions) {
        const button = el(id),
          lowEnergy = unaffordable(id);
        button.classList.toggle('low-energy', lowEnergy);
        attribute(
          button,
          'aria-label',
          `${id}${lowEnergy ? ' · Low stamina' : ''}`,
        );
        if (id === 'slash' || id === 'stab')
          set(labels.get(id), 'textContent', lowEnergy ? 'LOW' : '');
      }
      set(el('objective'), 'textContent', donor
        ? `WESTMINSTER · GOBLIN ENCOUNTER · ${g.enemies.length} HOSTILES`
        : `WESTMINSTER · WAVE ${g.wave} / 3 · ${g.enemies.length} HOSTILES`);
      const message = g.time < g.messageUntil ? g.message : '';
      set(el('notice'), 'textContent', message);
      for (const [id, ready, fallback] of [
        ['heavy', p.heavyReady, 1.6],
        ['special', p.specialReady, 7],
        ['dodge', p.dodgeReady, 1.05],
      ]) {
        const button = el(id),
          left = Math.max(0, ready - g.time),
          period = donor ? (g.cooldowns?.[id] ?? fallback) : fallback;
        button.classList.toggle('cooldown', left > 0);
        // Heavy has no extra cooldown in the pilot; its commitment is combat-owned.
        const readiness = String(period > 0 ? 1 - left / period : 1);
        if (button.style.getPropertyValue('--ready') !== readiness)
          button.style.setProperty('--ready', readiness);
        set(labels.get(id), 'textContent', [
          left > 0 ? `${left.toFixed(1)}s` : '',
          unaffordable(id) ? 'LOW' : '',
        ]
          .filter(Boolean)
          .join(' · '));
      }
      el('guard').classList.toggle('pressed', p.guarding);
      const boss = g.enemies.find((e) => e.kind === 3);
      set(el('boss'), 'hidden', !boss);
      if (boss)
        set(el('boss-fill').style, 'width', `${(boss.hp / boss.maxHP) * 100}%`);
      set(el('ending'), 'hidden', !g.finished);
      if (g.finished) {
        set(el('result'), 'textContent', g.won
          ? 'CHECKPOINT CLEARED'
          : 'THE ASH CLAIMS YOU');
        set(el('result-hint'), 'textContent', g.won
          ? donor
            ? 'The Goblin has fallen.'
            : 'The warlord has fallen.'
          : 'Watch their wind-up. Dodge, then strike.');
      }
    },
  };
}
