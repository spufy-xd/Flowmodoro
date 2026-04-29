// ── Constants ──────────────────────────────────────────────────────────────
const COUNTDOWN_ID = new URLSearchParams(window.location.search).get('id') || '0';
const IS_NEW       = new URLSearchParams(window.location.search).get('new') === '1';

const LS = {
  state:     `countdown_${COUNTDOWN_ID}_state`,
  title:     `countdown_${COUNTDOWN_ID}_title`,
  target:    `countdown_${COUNTDOWN_ID}_target`,   // ms timestamp when countdown ends
  collapsed: `countdown_${COUNTDOWN_ID}_collapsed`,
  showtime:  `countdown_${COUNTDOWN_ID}_showtime`, // '1' = remaining, '0' = end time
  mode:      `countdown_${COUNTDOWN_ID}_mode`,     // 'time' | 'duration'
  input:     `countdown_${COUNTDOWN_ID}_input`,    // raw input string
};

const CD = { IDLE: 'IDLE', RUNNING: 'RUNNING', DONE: 'DONE' };

// ── State ──────────────────────────────────────────────────────────────────
let cdState        = CD.IDLE;
let cdTitle        = '';
let cdTarget       = 0;   // Date.now() ms when the countdown ends
let cdRemaining    = 0;   // seconds, derived from cdTarget each tick
let cdInterval     = null;
let cdMode         = localStorage.getItem(LS.mode) || 'time'; // 'time' | 'duration'
let timeInputVal   = '';          // preserves hora-fin input while duration mode is active
let durInputVal    = '00:00:00'; // preserves duración input while time mode is active

const savedCollapsed = localStorage.getItem(LS.collapsed);
let isCollapsed   = savedCollapsed !== null ? savedCollapsed === '1' : !IS_NEW;
let showRemaining = localStorage.getItem(LS.showtime) !== '0'; // true = remaining, false = end time

// ── DOM refs ───────────────────────────────────────────────────────────────
const collapseBtn    = document.getElementById('collapse-btn');
const collapseArrow  = document.getElementById('collapse-arrow');
const headerLabel    = document.getElementById('header-label');
const headerTime     = document.getElementById('header-time');
const moduleContent  = document.getElementById('module-content');
const setupPanel     = document.getElementById('setup');
const runningPanel   = document.getElementById('running');
const titleInput     = document.getElementById('title-input');
const targetInput    = document.getElementById('target-input');
const timeLabelEl    = document.getElementById('time-label');
const tomorrowNote   = document.getElementById('tomorrow-note');
const clearBtn       = document.getElementById('clear-btn');
const startBtn       = document.getElementById('start-btn');
const deleteBtn      = document.getElementById('delete-btn');
const titleDisplay   = document.getElementById('title-display');
const timerEl        = document.getElementById('timer');
const cancelBtn      = document.getElementById('cancel-btn');
const endTimeLabelEl = document.getElementById('end-time-label');
const modeTimeBtnEl  = document.getElementById('mode-time-btn');
const modeDurBtnEl   = document.getElementById('mode-dur-btn');

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

// Parses MM, H:MM, or H:MM:SS into total seconds
function parseDuration(val) {
  const parts = val.trim().split(':').map(Number);
  if (!parts.length || parts.some(isNaN)) return 0;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
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
  localStorage.setItem(LS.mode,      cdMode);
  localStorage.setItem(LS.input,     targetInput.value);
}

function restoreSession() {
  cdTitle  = localStorage.getItem(LS.title)  || '';
  cdTarget = parseInt(localStorage.getItem(LS.target) || '0', 10);

  titleInput.value = cdTitle;

  targetInput.type = 'time';
  targetInput.step = cdMode === 'duration' ? '1' : '60';

  const savedInput = localStorage.getItem(LS.input) || (cdMode === 'duration' ? '00:00:00' : '');
  if (savedInput) {
    targetInput.value = savedInput;
    // In time mode, show "mañana" if the saved target is in the past (IDLE only)
    if (cdMode === 'time' && cdTarget > 0 && cdTarget <= Date.now()) {
      tomorrowNote.textContent = `mañana a las ${savedInput}`;
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

  const hasActiveTime = isCollapsed && cdState !== CD.IDLE;

  if (hasActiveTime) {
    headerTime.hidden = false;
    if (cdState === CD.DONE) {
      headerTime.textContent = '· ¡Tiempo!';
      headerTime.className   = 'done';
      headerTime.title       = '';
    } else if (showRemaining) {
      headerTime.textContent = '· ' + formatShortTime(cdRemaining);
      headerTime.className   = 'running';
      headerTime.title       = 'Ver hora fin';
    } else {
      headerTime.textContent = '· ' + formatEndTime();
      headerTime.className   = 'endtime';
      headerTime.title       = 'Ver tiempo restante';
    }
  } else {
    headerTime.hidden = true;
  }

  if (expanded) {
    setupPanel.hidden   = cdState !== CD.IDLE;
    runningPanel.hidden = cdState === CD.IDLE;

    // Title is already visible in the header — never duplicate it inside
    titleDisplay.hidden = true;

    if (cdState === CD.IDLE) {
      // Mode toggle active state
      modeTimeBtnEl.className = cdMode === 'time'     ? 'active' : '';
      modeDurBtnEl.className  = cdMode === 'duration' ? 'active' : '';
      // step="60" → HH:MM (hora fin); step="1" → HH:MM:SS (duración)
      if (cdMode === 'time') {
        targetInput.step        = '60';
        timeLabelEl.textContent = '¿Hasta qué hora?';
      } else {
        targetInput.step        = '1';
        timeLabelEl.textContent = '¿Cuánto tiempo?';
      }
    }

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
  const val = targetInput.value.trim();
  if (!val) return;

  if (cdMode === 'duration') {
    const totalSecs = parseDuration(val);
    if (totalSecs <= 0) return;
    cdTarget = Date.now() + totalSecs * 1000;
  } else {
    const parts = val.split(':').map(Number);
    const target = new Date();
    target.setHours(parts[0], parts[1], 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    cdTarget = target.getTime();
  }

  cdRemaining         = calcRemaining();
  cdTitle             = titleInput.value.trim();
  cdState             = CD.RUNNING;
  tomorrowNote.hidden = true;
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
  targetInput.value = cdMode === 'duration' ? '00:00:00' : '';
  cdTitle  = '';
  cdTarget = 0;
  tomorrowNote.hidden = true;
  localStorage.removeItem(LS.title);
  localStorage.removeItem(LS.target);
  localStorage.removeItem(LS.input);
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

headerTime.addEventListener('click', e => {
  if (!isCollapsed || cdState === CD.IDLE) return;
  e.stopPropagation();
  showRemaining = !showRemaining;
  render();
});

modeTimeBtnEl.addEventListener('click', () => {
  if (cdMode === 'time') return;
  durInputVal = targetInput.value;
  cdMode = 'time';
  targetInput.step  = '60'; // must set step before value or browser silently rejects HH:MM
  targetInput.value = timeInputVal;
  tomorrowNote.hidden = true;
  render();
});

modeDurBtnEl.addEventListener('click', () => {
  if (cdMode === 'duration') return;
  timeInputVal = targetInput.value;
  cdMode = 'duration';
  targetInput.step  = '1'; // must set step before value or browser silently rejects HH:MM:SS
  targetInput.value = durInputVal;
  tomorrowNote.hidden = true;
  render();
});

titleInput.addEventListener('blur', () => {
  cdTitle = titleInput.value.trim();
  render();
});

titleInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { cdTitle = titleInput.value.trim(); render(); }
});

startBtn.addEventListener('click', startCountdown);
cancelBtn.addEventListener('click', resetCountdown);
clearBtn.addEventListener('click', clearCountdown);
deleteBtn.addEventListener('click', deleteCountdown);

targetInput.addEventListener('input', () => {
  const val = targetInput.value.trim();
  if (!val) { tomorrowNote.hidden = true; return; }

  if (cdMode === 'duration') {
    const totalSecs = parseDuration(val);
    if (totalSecs > 0) {
      const endDate = new Date(Date.now() + totalSecs * 1000);
      tomorrowNote.textContent = `termina a las ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
      tomorrowNote.hidden = false;
    } else {
      tomorrowNote.hidden = true;
    }
  } else {
    const parts = val.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      tomorrowNote.hidden = true;
      return;
    }
    const target = new Date();
    target.setHours(parts[0], parts[1], 0, 0);
    if (target <= new Date()) {
      tomorrowNote.textContent = `mañana a las ${val}`;
      tomorrowNote.hidden = false;
    } else {
      tomorrowNote.hidden = true;
    }
  }
});

// Recalculate when tab regains focus (tab may have been throttled)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cdState === CD.RUNNING) tick();
});

// ── Init ───────────────────────────────────────────────────────────────────
restoreSession();
render();
