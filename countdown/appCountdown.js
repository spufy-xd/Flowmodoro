// ── Constants ──────────────────────────────────────────────────────────────
const COUNTDOWN_ID = new URLSearchParams(window.location.search).get('id') || '0';
const IS_NEW       = new URLSearchParams(window.location.search).get('new') === '1';

const LS = {
  state:     `countdown_${COUNTDOWN_ID}_state`,
  title:     `countdown_${COUNTDOWN_ID}_title`,
  target:    `countdown_${COUNTDOWN_ID}_target`,   // ms timestamp when countdown ends
  collapsed: `countdown_${COUNTDOWN_ID}_collapsed`,
  showtime:  `countdown_${COUNTDOWN_ID}_showtime`, // '1' = remaining, '0' = end time
};

const CD = { IDLE: 'IDLE', RUNNING: 'RUNNING', DONE: 'DONE' };

// ── State ──────────────────────────────────────────────────────────────────
let cdState        = CD.IDLE;
let cdTitle        = '';
let cdTarget       = 0;   // Date.now() ms when the countdown ends
let cdRemaining    = 0;   // seconds, derived from cdTarget each tick
let cdInterval     = null; // setTimeout handle

const savedCollapsed = localStorage.getItem(LS.collapsed);
let isCollapsed   = savedCollapsed !== null ? savedCollapsed === '1' : !IS_NEW;
let showRemaining = localStorage.getItem(LS.showtime) !== '0'; // true = remaining, false = end time

// ── DOM refs ───────────────────────────────────────────────────────────────
const collapseBtn   = document.getElementById('collapse-btn');
const collapseArrow = document.getElementById('collapse-arrow');
const headerLabel   = document.getElementById('header-label');
const headerTime    = document.getElementById('header-time');
const eyeBtn        = document.getElementById('eye-btn');
const moduleContent = document.getElementById('module-content');
const setupPanel    = document.getElementById('setup');
const runningPanel  = document.getElementById('running');
const titleInput    = document.getElementById('title-input');
const targetInput   = document.getElementById('target-input');
const tomorrowNote  = document.getElementById('tomorrow-note');
const clearBtn      = document.getElementById('clear-btn');
const startBtn      = document.getElementById('start-btn');
const deleteBtn     = document.getElementById('delete-btn');
const titleDisplay  = document.getElementById('title-display');
const timerEl       = document.getElementById('timer');
const cancelBtn      = document.getElementById('cancel-btn');
const endTimeLabelEl = document.getElementById('end-time-label');

// ── Helpers ────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function calcRemaining() {
  return Math.max(0, Math.floor((cdTarget - Date.now()) / 1000));
}

function formatShortTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  if (s < 3600) return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  return formatTime(s);
}

function formatEndTime() {
  const d = new Date(cdTarget);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Tick scheduling ────────────────────────────────────────────────────────
// Fire at the next wall-clock second boundary so all instances update in sync
function scheduleNextTick() {
  const delay = 1000 - (Date.now() % 1000);
  cdInterval = setTimeout(() => {
    tick();
    if (cdState === CD.RUNNING) scheduleNextTick();
  }, delay);
}

// ── Session persistence ────────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(LS.state,     cdState);
  localStorage.setItem(LS.title,     cdTitle);
  localStorage.setItem(LS.target,    cdTarget);
  localStorage.setItem(LS.collapsed, isCollapsed    ? '1' : '0');
  localStorage.setItem(LS.showtime,  showRemaining  ? '1' : '0');
}

function restoreSession() {
  // Always restore title and target (even on IDLE, so cancel keeps data)
  cdTitle  = localStorage.getItem(LS.title)  || '';
  cdTarget = parseInt(localStorage.getItem(LS.target) || '0', 10);

  titleInput.value = cdTitle;
  if (cdTarget > 0) {
    const d = new Date(cdTarget);
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    targetInput.value = hhmm;
    if (cdTarget <= Date.now()) {
      tomorrowNote.textContent = `mañana a las ${hhmm}`;
      tomorrowNote.hidden = false;
    }
  }

  const savedState = localStorage.getItem(LS.state);
  if (!savedState || savedState === CD.IDLE) return;

  if (savedState === CD.RUNNING) {
    cdRemaining = calcRemaining();
    if (cdRemaining <= 0) {
      // Time passed while tab was closed — surface DONE state silently
      cdState     = CD.DONE;
      cdRemaining = 0;
    } else {
      cdState = CD.RUNNING;
      scheduleNextTick();
    }
  } else if (savedState === CD.DONE) {
    cdState     = CD.DONE;
    cdRemaining = 0;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const expanded = !isCollapsed;

  collapseBtn.setAttribute('aria-expanded', expanded);
  collapseArrow.textContent = expanded ? '▼' : '▶';
  moduleContent.hidden = !expanded;

  // Header label — always shows current title or default
  headerLabel.textContent = cdTitle || 'Cuenta atrás';

  // Eye button — visible only when collapsed and timer is active
  const hasActiveTime = isCollapsed && cdState !== CD.IDLE;
  eyeBtn.hidden = !hasActiveTime;
  if (hasActiveTime) {
    eyeBtn.title     = showRemaining ? 'Mostrar hora de fin' : 'Mostrar tiempo restante';
    eyeBtn.className = showRemaining ? 'active' : '';
  }

  // Header inline time — always shown when active; eye toggles what is shown
  if (hasActiveTime) {
    headerTime.hidden = false;
    if (cdState === CD.DONE) {
      headerTime.textContent = '· ¡Tiempo!';
      headerTime.className   = 'done';
    } else if (showRemaining) {
      headerTime.textContent = '· ' + formatShortTime(cdRemaining);
      headerTime.className   = 'running';
    } else {
      // Reminder mode: show the target hour instead of remaining time
      headerTime.textContent = '· ' + formatEndTime();
      headerTime.className   = 'endtime';
    }
  } else {
    headerTime.hidden = true;
  }

  if (expanded) {
    setupPanel.hidden   = cdState !== CD.IDLE;
    runningPanel.hidden = cdState === CD.IDLE;

    // Title is already visible in the header — never duplicate it inside
    titleDisplay.hidden = true;

    if (cdState !== CD.IDLE) {
      timerEl.textContent = formatShortTime(cdRemaining);
      timerEl.className   = cdState === CD.RUNNING ? 'running' : 'done';

      cancelBtn.textContent = cdState === CD.RUNNING ? '■ Pausar' : '↺ Reiniciar';

      endTimeLabelEl.hidden      = cdState !== CD.RUNNING;
      endTimeLabelEl.textContent = formatEndTime();
    } else {
      endTimeLabelEl.hidden = true;
    }
  }

  saveSession();
  reportHeight();
}

// Tells the shell iframe how tall this module is so it can resize accordingly
function reportHeight() {
  window.parent.postMessage(
    { type: 'countdown-resize', id: COUNTDOWN_ID, height: document.body.scrollHeight },
    '*'
  );
}

// ── Tick ───────────────────────────────────────────────────────────────────
function tick() {
  cdRemaining = calcRemaining();
  if (cdRemaining <= 0) {
    clearTimeout(cdInterval);
    cdInterval  = null;
    cdState     = CD.DONE;
    cdRemaining = 0;
    beep();
  }
  render();
}

// ── Transitions ────────────────────────────────────────────────────────────
function startCountdown() {
  const timeVal = targetInput.value;
  if (!timeVal) return;

  const [h, m] = timeVal.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= new Date()) target.setDate(target.getDate() + 1);

  cdTarget    = target.getTime();
  cdRemaining = calcRemaining();
  cdTitle     = titleInput.value.trim();
  cdState     = CD.RUNNING;
  scheduleNextTick();
  render();
}

function resetCountdown() {
  if (cdInterval) { clearTimeout(cdInterval); cdInterval = null; }
  cdState     = CD.IDLE;
  cdRemaining = 0;
  // Keep cdTitle, cdTarget, titleInput and targetInput intact for easy resume
  tomorrowNote.hidden = true;
  render();
}

function clearCountdown() {
  titleInput.value  = '';
  targetInput.value = '';
  cdTitle  = '';
  cdTarget = 0;
  tomorrowNote.hidden = true;
  localStorage.removeItem(LS.title);
  localStorage.removeItem(LS.target);
  render();
}

function deleteCountdown() {
  if (cdInterval) clearTimeout(cdInterval);
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  window.parent.postMessage({ type: 'countdown-remove', id: COUNTDOWN_ID }, '*');
}

function beep() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);
  } catch (_) {}
}

// ── Events ─────────────────────────────────────────────────────────────────
collapseBtn.addEventListener('click', () => {
  isCollapsed = !isCollapsed;
  render();
});

eyeBtn.addEventListener('click', () => {
  showRemaining = !showRemaining;
  render();
});

startBtn.addEventListener('click', startCountdown);
cancelBtn.addEventListener('click', resetCountdown);
clearBtn.addEventListener('click', clearCountdown);
deleteBtn.addEventListener('click', deleteCountdown);

targetInput.addEventListener('change', () => {
  const timeVal = targetInput.value;
  if (!timeVal) { tomorrowNote.hidden = true; return; }
  const [h, m] = timeVal.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= new Date()) {
    tomorrowNote.textContent = `mañana a las ${timeVal}`;
    tomorrowNote.hidden = false;
  } else {
    tomorrowNote.hidden = true;
  }
});

// Recalculate when tab regains focus (tab may have been throttled)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cdState === CD.RUNNING) tick();
});

// ── Init ───────────────────────────────────────────────────────────────────
restoreSession();
render();
