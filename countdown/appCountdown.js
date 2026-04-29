// ── Constants ──────────────────────────────────────────────────────────────
const COUNTDOWN_ID = '0';

const LS = {
  state:     `countdown_${COUNTDOWN_ID}_state`,
  title:     `countdown_${COUNTDOWN_ID}_title`,
  target:    `countdown_${COUNTDOWN_ID}_target`,   // ms timestamp when countdown ends
  collapsed: 'countdown_collapsed',
};

const CD = { IDLE: 'IDLE', RUNNING: 'RUNNING', DONE: 'DONE' };

// ── State ──────────────────────────────────────────────────────────────────
let cdState     = CD.IDLE;
let cdTitle     = '';
let cdTarget    = 0;   // Date.now() ms when the countdown ends
let cdRemaining = 0;   // seconds, always derived from cdTarget
let cdInterval  = null;

const savedCollapsed = localStorage.getItem(LS.collapsed);
let isCollapsed = savedCollapsed === null ? true : savedCollapsed === '1';

// ── DOM refs ───────────────────────────────────────────────────────────────
const collapseBtn   = document.getElementById('collapse-btn');
const collapseArrow = document.getElementById('collapse-arrow');
const headerLabel   = document.getElementById('header-label');
const headerTime    = document.getElementById('header-time');
const moduleContent = document.getElementById('module-content');
const setupPanel    = document.getElementById('setup');
const runningPanel  = document.getElementById('running');
const titleInput    = document.getElementById('title-input');
const targetInput   = document.getElementById('target-input');
const tomorrowNote  = document.getElementById('tomorrow-note');
const startBtn      = document.getElementById('start-btn');
const titleDisplay  = document.getElementById('title-display');
const timerEl       = document.getElementById('timer');
const statusTextEl  = document.getElementById('status-text');
const cancelBtn     = document.getElementById('cancel-btn');

// ── Helpers ────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function calcRemaining() {
  return Math.max(0, Math.floor((cdTarget - Date.now()) / 1000));
}

// ── Session persistence ────────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(LS.state,     cdState);
  localStorage.setItem(LS.title,     cdTitle);
  localStorage.setItem(LS.target,    cdTarget);
  localStorage.setItem(LS.collapsed, isCollapsed ? '1' : '0');
}

function restoreSession() {
  const savedState = localStorage.getItem(LS.state);
  if (!savedState || savedState === CD.IDLE) return;

  cdTitle  = localStorage.getItem(LS.title)  || '';
  cdTarget = parseInt(localStorage.getItem(LS.target) || '0', 10);

  if (savedState === CD.RUNNING) {
    cdRemaining = calcRemaining();
    if (cdRemaining <= 0) {
      // Time passed while tab was closed — surface DONE state silently
      cdState     = CD.DONE;
      cdRemaining = 0;
    } else {
      cdState    = CD.RUNNING;
      cdInterval = setInterval(tick, 1000);
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

  // Inline time shown in header only when collapsed and not IDLE
  if (!expanded && cdState !== CD.IDLE) {
    headerTime.hidden = false;
    if (cdState === CD.RUNNING) {
      headerTime.textContent = '· ' + formatTime(cdRemaining);
      headerTime.className   = 'running';
    } else {
      headerTime.textContent = '· ¡Tiempo!';
      headerTime.className   = 'done';
    }
  } else {
    headerTime.hidden = true;
  }

  if (expanded) {
    setupPanel.hidden  = cdState !== CD.IDLE;
    runningPanel.hidden = cdState === CD.IDLE;

    if (cdState !== CD.IDLE) {
      titleDisplay.textContent = cdTitle;
      titleDisplay.hidden      = !cdTitle;

      timerEl.textContent = formatTime(cdRemaining);
      timerEl.className   = cdState === CD.RUNNING ? 'running' : 'done';

      if (cdState === CD.RUNNING) {
        statusTextEl.textContent = 'contando…';
        statusTextEl.className   = '';
        cancelBtn.textContent    = '■ Cancelar';
      } else {
        statusTextEl.textContent = '¡Tiempo!';
        statusTextEl.className   = 'done';
        cancelBtn.textContent    = '↺ Reiniciar';
      }
    }
  }

  saveSession();
  reportHeight();
}

// Tells the shell iframe how tall this module is so it can resize accordingly
function reportHeight() {
  window.parent.postMessage(
    { type: 'countdown-resize', height: document.body.scrollHeight },
    '*'
  );
}

// ── Tick ───────────────────────────────────────────────────────────────────
function tick() {
  cdRemaining = calcRemaining();
  if (cdRemaining <= 0) {
    clearInterval(cdInterval);
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
  cdInterval  = setInterval(tick, 1000);
  render();
}

function resetCountdown() {
  if (cdInterval) { clearInterval(cdInterval); cdInterval = null; }
  cdState     = CD.IDLE;
  cdRemaining = 0;
  cdTarget    = 0;
  cdTitle     = '';
  titleInput.value  = '';
  targetInput.value = '';
  tomorrowNote.hidden = true;
  render();
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

startBtn.addEventListener('click', startCountdown);
cancelBtn.addEventListener('click', resetCountdown);

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
