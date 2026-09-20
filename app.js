(() => {
  'use strict';

  // ---------- Elements ----------
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const timeDisplay = $('timeDisplay');
  const sessionLabel = $('sessionLabel');
  const ringProgress = $('ringProgress');
  const cycleDots = $('cycleDots');
  const startBtn = $('startBtn');
  const resetBtn = $('resetBtn');
  const skipBtn = $('skipBtn');
  const tabs = [...document.querySelectorAll('.mode-tab')];
  const statFocus = $('statFocus');
  const statSessions = $('statSessions');
  const statStreak = $('statStreak');
  const settingsModal = $('settingsModal');

  const RING_C = 2 * Math.PI * 120;
  ringProgress.style.strokeDasharray = String(RING_C);
  ringProgress.style.strokeDashoffset = '0';

  // ---------- Settings ----------
  const DEFAULT_SETTINGS = { focus: 25, short: 5, long: 15, longEvery: 4, sound: true, autoStart: false };
  let settings = { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro-settings') || '{}');
    settings = { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) { /* corrupted settings — use defaults */ }

  function saveSettings() {
    localStorage.setItem('pomodoro-settings', JSON.stringify(settings));
  }

  // ---------- Stats ----------
  const dateStr = (d) => d.toISOString().slice(0, 10);
  const todayStr = () => dateStr(new Date());
  const yesterdayStr = () => dateStr(new Date(Date.now() - 86400000));

  let stats = { date: todayStr(), focusSec: 0, sessions: 0, streak: 0, lastActive: null };
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro-stats') || 'null');
    if (saved) stats = saved;
  } catch (e) { /* corrupted stats — start fresh */ }

  if (stats.date !== todayStr()) {
    const keptStreak = stats.lastActive === yesterdayStr();
    stats = {
      date: todayStr(),
      focusSec: 0,
      sessions: 0,
      streak: keptStreak ? stats.streak : 0,
      lastActive: stats.lastActive,
    };
  }

  function saveStats() {
    localStorage.setItem('pomodoro-stats', JSON.stringify(stats));
  }

  function renderStats() {
    const mins = Math.floor(stats.focusSec / 60);
    statFocus.textContent = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    statSessions.textContent = stats.sessions;
    statStreak.textContent = stats.streak;
  }

  // ---------- Audio ----------
  let audioCtx = null;
  function ac() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function chime() {
    if (!settings.sound) return;
    try {
      const a = ac();
      if (!a) return;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const t = a.currentTime + i * 0.16;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g);
        g.connect(a.destination);
        o.start(t);
        o.stop(t + 0.55);
      });
    } catch (e) { /* audio unavailable — stay silent */ }
  }

  // ---------- Notifications ----------
  function maybeAskNotificationPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch (e) { /* ignore */ }
  }

  function notify(title, bodyText) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: bodyText });
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- Timer state ----------
  let mode = 'focus';           // focus | short | long
  let totalSec = settings.focus * 60;
  let remainingSec = totalSec;
  let running = false;
  let endAt = 0;
  let cycleCount = 0;           // completed focus sessions in current cycle
  let tickTimer = null;

  const modeName = (m) => (m === 'focus' ? 'Focus' : m === 'short' ? 'Short Break' : 'Long Break');

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function render() {
    timeDisplay.textContent = fmt(remainingSec);
    ringProgress.style.strokeDashoffset = String(RING_C * (1 - remainingSec / totalSec));
    document.title = running || remainingSec < totalSec
      ? `${fmt(remainingSec)} · ${modeName(mode)} — 🍅 Focus`
      : 'Focus — Pomodoro Timer';
  }

  function renderMode() {
    body.dataset.mode = mode;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.modeTab === mode));
    if (mode === 'focus') {
      const n = settings.longEvery;
      const current = (cycleCount % n) + 1;
      sessionLabel.textContent = `Session ${current} of ${n}`;
    } else {
      sessionLabel.textContent = mode === 'long' ? 'Long break — you earned it' : 'Take a breather';
    }
    cycleDots.innerHTML = '';
    for (let i = 0; i < settings.longEvery; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i < cycleCount % settings.longEvery ? ' done' : '');
      cycleDots.appendChild(d);
    }
  }

  function setMode(m, keepCycle) {
    stopTick();
    running = false;
    startBtn.textContent = 'Start';
    mode = m;
    totalSec = settings[m] * 60;
    remainingSec = totalSec;
    if (!keepCycle && m === 'focus') { /* cycleCount persists across breaks */ }
    renderMode();
    render();
  }

  // ---------- Tick ----------
  function tick() {
    remainingSec = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    render();
    if (remainingSec <= 0) complete(false);
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function start() {
    ac();
    maybeAskNotificationPermission();
    if (remainingSec <= 0) {
      totalSec = settings[mode] * 60;
      remainingSec = totalSec;
    }
    running = true;
    endAt = Date.now() + remainingSec * 1000;
    startBtn.textContent = 'Pause';
    stopTick();
    tickTimer = setInterval(tick, 250);
    render();
  }

  function pause() {
    remainingSec = Math.max(0, Math.round((endAt - Date.now()) / 1000));
    running = false;
    stopTick();
    startBtn.textContent = 'Start';
    render();
  }

  function complete(skipped) {
    stopTick();
    running = false;
    startBtn.textContent = 'Start';

    let next;
    if (mode === 'focus') {
      stats.sessions += 1;
      stats.focusSec += totalSec;
      if (stats.lastActive !== todayStr()) {
        stats.streak += 1;
        stats.lastActive = todayStr();
      }
      saveStats();
      renderStats();
      cycleCount += 1;
      next = cycleCount % settings.longEvery === 0 ? 'long' : 'short';
      if (!skipped) {
        chime();
        notify('Focus session complete 🎉', next === 'long' ? 'Time for a long break.' : 'Time for a short break.');
      }
    } else {
      next = 'focus';
      if (!skipped) {
        chime();
        notify('Break over', 'Back to focus — you\'ve got this.');
      }
    }

    setMode(next, true);

    if (settings.autoStart && !skipped) {
      setTimeout(() => { if (!running) start(); }, 1200);
    }
  }

  // ---------- Events ----------
  startBtn.addEventListener('click', () => (running ? pause() : start()));
  resetBtn.addEventListener('click', () => {
    stopTick();
    running = false;
    startBtn.textContent = 'Start';
    remainingSec = totalSec;
    render();
  });
  skipBtn.addEventListener('click', () => complete(true));

  tabs.forEach((t) => {
    t.addEventListener('click', () => setMode(t.dataset.modeTab));
  });

  window.addEventListener('keydown', (e) => {
    // Space toggles start/pause, but not while the settings modal is open
    // or while typing in an input field.
    if (e.code === 'Space' && settingsModal.classList.contains('hidden')) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      running ? pause() : start();
    }
  });

  // ---------- Settings modal ----------
  const setFocus = $('setFocus'), setShort = $('setShort'), setLong = $('setLong');
  const setLongEvery = $('setLongEvery'), setSound = $('setSound'), setAutoStart = $('setAutoStart');

  function openSettings() {
    setFocus.value = settings.focus;
    setShort.value = settings.short;
    setLong.value = settings.long;
    setLongEvery.value = settings.longEvery;
    setSound.checked = settings.sound;
    setAutoStart.checked = settings.autoStart;
    settingsModal.classList.remove('hidden');
  }

  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', () => settingsModal.classList.add('hidden'));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  $('settingsSave').addEventListener('click', () => {
    const num = (el, fallback, min, max) => {
      const v = parseInt(el.value, 10);
      return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
    };
    settings.focus = num(setFocus, 25, 1, 120);
    settings.short = num(setShort, 5, 1, 60);
    settings.long = num(setLong, 15, 1, 60);
    settings.longEvery = num(setLongEvery, 4, 2, 8);
    settings.sound = setSound.checked;
    settings.autoStart = setAutoStart.checked;
    saveSettings();
    settingsModal.classList.add('hidden');
    // apply to current timer if it's idle
    if (!running) {
      totalSec = settings[mode] * 60;
      remainingSec = totalSec;
    }
    renderMode();
    render();
  });

  // ---------- Init ----------
  renderStats();
  renderMode();
  render();
})();
