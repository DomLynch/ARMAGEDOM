export function createHUD({ onRetry, onPause, onSound }) {
  const el = (id) => document.getElementById(id),
    menu = el('menu');
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
  let lastMessage = '';
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
      const p = g.player;
      el('health-fill').style.width = `${(p.hp / p.maxHP) * 100}%`;
      el('health-number').textContent = `${Math.ceil(p.hp)} / ${p.maxHP}`;
      el('guard-fill').style.width = `${p.guard}%`;
      el('guard-number').textContent =
        p.guardBrokenUntil > g.time ? 'BROKEN' : Math.ceil(p.guard);
      el('objective').textContent =
        `WESTMINSTER · WAVE ${g.wave} / 3 · ${g.enemies.length} HOSTILES`;
      const message = g.time < g.messageUntil ? g.message : '';
      if (message !== lastMessage) {
        el('notice').textContent = message;
        lastMessage = message;
      }
      for (const [id, ready, period] of [
        ['heavy', p.heavyReady, 1.6],
        ['special', p.specialReady, 7],
        ['dodge', p.dodgeReady, 1.05],
      ]) {
        const button = el(id),
          left = Math.max(0, ready - g.time);
        button.classList.toggle('cooldown', left > 0);
        button.style.setProperty('--ready', String(1 - left / period));
        button.querySelector('small').textContent =
          left > 0 ? `${left.toFixed(1)}s` : '';
      }
      el('guard').classList.toggle('pressed', p.guarding);
      const boss = g.enemies.find((e) => e.kind === 3);
      el('boss').hidden = !boss;
      if (boss)
        el('boss-fill').style.width = `${(boss.hp / boss.maxHP) * 100}%`;
      el('ending').hidden = !g.finished;
      if (g.finished) {
        el('result').textContent = g.won
          ? 'CHECKPOINT CLEARED'
          : 'THE ASH CLAIMS YOU';
        el('result-hint').textContent = g.won
          ? 'The warlord has fallen.'
          : 'Watch their wind-up. Dodge, then strike.';
      }
    },
  };
}
