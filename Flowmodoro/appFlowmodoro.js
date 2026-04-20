// ── State ──────────────────────────────────────────────────────────────────
const STATE = { IDLE: 'IDLE', WORKING: 'WORKING', BREAK_EARNED: 'BREAK_EARNED', BREAK: 'BREAK' };

let ratio          = parseInt(localStorage.getItem('flowmodoro_ratio')       || '25', 10);
let breakRatio     = parseInt(localStorage.getItem('flowmodoro_break_ratio') || '5',  10);
let accumulated    = 0; // leftover break seconds from skipped breaks

let state          = STATE.IDLE;
let workSeconds    = 0;
let breakEarned    = 0; // earned in this session only
let breakSeconds   = 0; // total = earned + accumulated
let breakRemaining = 0;
let intervalId     = null;

// Wall-clock anchors — prevents drift and browser tab throttling
let workStartTime   = null; // Date.now() when work interval started
let workSecondsBase = 0;    // workSeconds snapshot when interval started
let breakStartTime  = null; // Date.now() when break interval started
let breakTotal      = 0;    // breakSeconds snapshot when break started

// ── Ratio helpers ────────────────────────────────────────────────────────
function saveRatio(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) {
    ratio = n;
    localStorage.setItem('flowmodoro_ratio', n);
  }
}

function saveBreakRatio(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) {
    breakRatio = n;
    localStorage.setItem('flowmodoro_break_ratio', n);
  }
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const timerEl   = document.getElementById('timer');
const infoEl    = document.getElementById('info');
const statusEl  = document.getElementById('status');
const btnEl     = document.getElementById('btn');
const btn2El    = document.getElementById('btn2');
const btn3El    = document.getElementById('btn3');
const ratioInput   = document.getElementById('ratio-input');
const breakInput   = document.getElementById('break-input');
const ratioLabelEl = document.getElementById('ratio-label');
const ratioPanel   = document.getElementById('ratio-panel');
const gearBtn      = document.getElementById('gear-btn');
const titleCheckEl = document.getElementById('title-check');
const resetBtn     = document.getElementById('reset-btn');
const resetConfirm = document.getElementById('reset-confirm');
const resetYesBtn  = document.getElementById('reset-yes-btn');
const resetNoBtn   = document.getElementById('reset-no-btn');

// Show panel on first use (no saved ratio yet)
if (!localStorage.getItem('flowmodoro_ratio')) {
  ratioPanel.hidden = false;
}
ratioInput.value = ratio;
breakInput.value = breakRatio;
titleCheckEl.checked = localStorage.getItem('flowmodoro_title') === '1';

// ── Helpers ────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ── Session persistence ────────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem('flowmodoro_state',            state);
  localStorage.setItem('flowmodoro_accumulated',      accumulated);
  localStorage.setItem('flowmodoro_work_seconds',     workSeconds);
  localStorage.setItem('flowmodoro_work_seconds_base',workSecondsBase);
  localStorage.setItem('flowmodoro_work_start_time',  workStartTime  ?? '');
  localStorage.setItem('flowmodoro_break_earned',     breakEarned);
  localStorage.setItem('flowmodoro_break_seconds',    breakSeconds);
  localStorage.setItem('flowmodoro_break_remaining',  breakRemaining);
  localStorage.setItem('flowmodoro_break_total',      breakTotal);
  localStorage.setItem('flowmodoro_break_start_time', breakStartTime ?? '');
}

function restoreSession() {
  const savedState = localStorage.getItem('flowmodoro_state');
  if (!savedState) return;

  accumulated     = parseInt(localStorage.getItem('flowmodoro_accumulated')       || '0', 10);
  workSecondsBase = parseInt(localStorage.getItem('flowmodoro_work_seconds_base') || '0', 10);
  workSeconds     = parseInt(localStorage.getItem('flowmodoro_work_seconds')      || '0', 10);
  breakEarned     = parseInt(localStorage.getItem('flowmodoro_break_earned')      || '0', 10);
  breakSeconds    = parseInt(localStorage.getItem('flowmodoro_break_seconds')     || '0', 10);
  breakRemaining  = parseInt(localStorage.getItem('flowmodoro_break_remaining')   || '0', 10);
  breakTotal      = parseInt(localStorage.getItem('flowmodoro_break_total')       || '0', 10);
  const savedWorkStart  = parseInt(localStorage.getItem('flowmodoro_work_start_time')  || '0', 10);
  const savedBreakStart = parseInt(localStorage.getItem('flowmodoro_break_start_time') || '0', 10);

  if (savedState === STATE.WORKING) {
    // Recalculate with wall-clock time in case tab was throttled or closed
    if (savedWorkStart) {
      workSeconds = workSecondsBase + Math.floor((Date.now() - savedWorkStart) / 1000);
    }
    // Pause so user decides to continue or rest
    breakEarned  = Math.floor(workSeconds * breakRatio / ratio);
    breakSeconds = breakEarned + accumulated;
    state        = STATE.BREAK_EARNED;

  } else if (savedState === STATE.BREAK_EARNED) {
    state = STATE.BREAK_EARNED;

  } else if (savedState === STATE.BREAK) {
    state = STATE.BREAK;
    if (savedBreakStart && breakTotal) {
      breakStartTime = savedBreakStart;
      breakRemaining = Math.max(0, breakTotal - Math.floor((Date.now() - breakStartTime) / 1000));
    } else {
      breakTotal     = breakRemaining;
      breakStartTime = Date.now();
    }
    if (breakRemaining <= 0) {
      accumulated = 0;
      beep();
      goIdle();
      return;
    }
    intervalId = setInterval(tick, 1000);
  }
  // STATE.IDLE: valores ya restaurados arriba
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  ratioLabelEl.hidden = (state === STATE.WORKING);

  if (state === STATE.IDLE) {
    timerEl.textContent  = formatTime(workSeconds);
    timerEl.className    = 'idle';
    infoEl.textContent   = accumulated > 0
      ? `⏳ descanso acumulado: ${formatTime(accumulated)}`
      : '';
    statusEl.textContent = 'listo para empezar';
    btnEl.textContent = '▶ Iniciar';
    btnEl.className   = '';
    btn2El.hidden     = true;
    btn3El.hidden     = true;

  } else if (state === STATE.WORKING) {
    timerEl.textContent  = formatTime(workSeconds);
    timerEl.className    = 'working';
    infoEl.textContent   = '';
    statusEl.textContent = 'trabajando…';
    btnEl.textContent    = '⏹ Parar';
    btnEl.className      = 'stop';
    btn2El.hidden        = true;
    btn3El.hidden        = true;

  } else if (state === STATE.BREAK_EARNED) {
    timerEl.textContent = formatTime(breakSeconds);
    timerEl.className   = 'break-earned';
    infoEl.innerHTML    = `Descanso obtenido: <strong>${formatTime(breakEarned)}</strong>`
      + (accumulated > 0 ? `<br>Descanso acumulado: <strong>${formatTime(accumulated)}</strong>` : '');
    statusEl.innerHTML = `Trabajado: <strong>${formatTime(workSeconds)}</strong>`;
    btnEl.textContent    = '▶ Iniciar descanso';
    btnEl.className      = 'start-break';
    btn2El.hidden        = true;
    btn3El.hidden        = false;
    btn3El.textContent   = 'Continuar →';

  } else if (state === STATE.BREAK) {
    timerEl.textContent = formatTime(breakRemaining);
    timerEl.className   = 'breaking';
    infoEl.innerHTML    = `Descanso obtenido: <strong>${formatTime(breakEarned)}</strong>`
      + (accumulated > 0 ? `<br>Descanso acumulado: <strong>${formatTime(accumulated)}</strong>` : '');
    const endTime = new Date(Date.now() + breakRemaining * 1000);
    const hh = pad(endTime.getHours());
    const mm = pad(endTime.getMinutes());
    statusEl.textContent = `descansando… fin a las ${hh}:${mm}`;
    btnEl.textContent    = '⏭ Saltar descanso';
    btnEl.className      = 'skip-break';
    btn2El.hidden        = true;
    btn3El.hidden        = true;
  }

  // Update browser tab title
  if (titleCheckEl.checked) {
    if (state === STATE.IDLE) {
      document.title = 'Flowmodoro';
    } else if (state === STATE.WORKING) {
      document.title = `▶ ${formatTime(workSeconds)} — Flowmodoro`;
    } else if (state === STATE.BREAK_EARNED) {
      document.title = `⏸ ${formatTime(breakSeconds)} — Flowmodoro`;
    } else if (state === STATE.BREAK) {
      document.title = `☕ ${formatTime(breakRemaining)} — Flowmodoro`;
    }
  } else {
    document.title = 'Flowmodoro';
  }

  saveSession();
}

// ── Tick — called by every setInterval; uses wall-clock time for accuracy ──
function tick() {
  if (state === STATE.WORKING) {
    workSeconds = workSecondsBase + Math.floor((Date.now() - workStartTime) / 1000);
    render();
  } else if (state === STATE.BREAK) {
    breakRemaining = Math.max(0, breakTotal - Math.floor((Date.now() - breakStartTime) / 1000));
    if (breakRemaining <= 0) {
      clearInterval(intervalId);
      intervalId  = null;
      accumulated = 0;
      beep();
      goIdle();
    } else {
      render();
    }
  }
}

// ── Transitions ────────────────────────────────────────────────────────────
function startWork() {
  workSeconds     = 0;
  workSecondsBase = 0;
  workStartTime   = Date.now();
  breakSeconds    = 0;
  state           = STATE.WORKING;
  intervalId      = setInterval(tick, 1000);
  render();
}

function stopWork() {
  clearInterval(intervalId);
  intervalId  = null;
  breakEarned  = Math.floor(workSeconds * breakRatio / ratio);
  breakSeconds = breakEarned + accumulated;
  state        = STATE.BREAK_EARNED;
  render();
}

function startBreak() {
  breakRemaining = breakSeconds;
  breakTotal     = breakSeconds;
  breakStartTime = Date.now();
  state          = STATE.BREAK;
  intervalId     = setInterval(tick, 1000);
  render();
}

function skipBreak() {
  clearInterval(intervalId);
  intervalId  = null;
  accumulated = breakRemaining; // save leftover for next session
  goIdle();
}

function goIdle() {
  workSeconds = 0;
  state       = STATE.IDLE;
  render();
}

function continueWork() {
  workSecondsBase = workSeconds;
  workStartTime   = Date.now();
  state           = STATE.WORKING;
  intervalId      = setInterval(tick, 1000);
  render();
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.8);
  } catch (_) {}
}

// ── Events ─────────────────────────────────────────────────────────────────
btnEl.addEventListener('click', () => {
  if      (state === STATE.IDLE)         startWork();
  else if (state === STATE.WORKING)      stopWork();
  else if (state === STATE.BREAK_EARNED) startBreak();
  else if (state === STATE.BREAK)        skipBreak();
});

btn2El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) {
    accumulated = 0; // discard earned break
    goIdle();
  }
});

btn3El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) continueWork();
});

// ── Ratio config events ───────────────────────────────────────────────────
gearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  saveRatio(ratioInput.value);
  ratioPanel.hidden = !ratioPanel.hidden;
  if (!ratioPanel.hidden) ratioInput.focus();
});

// Save live as the user types — no auto-close
ratioInput.addEventListener('input', () => {
  saveRatio(ratioInput.value);
});

breakInput.addEventListener('input', () => {
  saveBreakRatio(breakInput.value);
});

// Prevent clicks inside the panel from bubbling to document
ratioPanel.addEventListener('click', (e) => {
  e.stopPropagation();
});

titleCheckEl.addEventListener('change', () => {
  localStorage.setItem('flowmodoro_title', titleCheckEl.checked ? '1' : '0');
  render();
});

// ── Reset events ─────────────────────────────────────────────────────────
function cancelReset() {
  resetConfirm.hidden = true;
  resetBtn.hidden     = false;
}

resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetBtn.hidden     = true;
  resetConfirm.hidden = false;
});

resetNoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  cancelReset();
});

document.addEventListener('click', () => {
  if (!resetConfirm.hidden) cancelReset();
  if (!ratioPanel.hidden) ratioPanel.hidden = true;
});

resetYesBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearInterval(intervalId);
  intervalId     = null;
  workSeconds    = 0;
  breakEarned    = 0;
  breakSeconds   = 0;
  breakRemaining = 0;
  accumulated    = 0;
  state          = STATE.IDLE;
  localStorage.removeItem('flowmodoro_state');
  localStorage.removeItem('flowmodoro_accumulated');
  localStorage.removeItem('flowmodoro_work_seconds');
  localStorage.removeItem('flowmodoro_work_seconds_base');
  localStorage.removeItem('flowmodoro_work_start_time');
  localStorage.removeItem('flowmodoro_break_earned');
  localStorage.removeItem('flowmodoro_break_seconds');
  localStorage.removeItem('flowmodoro_break_remaining');
  localStorage.removeItem('flowmodoro_break_total');
  localStorage.removeItem('flowmodoro_break_start_time');
  cancelReset();
  render();
});

// Recalculate immediately when tab regains focus (browser may have throttled)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && intervalId !== null) {
    tick();
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
restoreSession();
render();
