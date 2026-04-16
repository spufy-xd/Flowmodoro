// ── State ──────────────────────────────────────────────────────────────────
const STATE = { IDLE: 'IDLE', WORKING: 'WORKING', BREAK_EARNED: 'BREAK_EARNED', BREAK: 'BREAK' };

let ratio          = parseInt(localStorage.getItem('flowmodoro_ratio') || '5', 10);
let accumulated    = 0; // leftover break seconds from skipped breaks

let state          = STATE.IDLE;
let workSeconds    = 0;
let breakEarned    = 0; // earned in this session only
let breakSeconds   = 0; // total = earned + accumulated
let breakRemaining = 0;
let intervalId     = null;

// ── Ratio helpers ────────────────────────────────────────────────────────
function saveRatio(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) {
    ratio = n;
    localStorage.setItem('flowmodoro_ratio', n);
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
  localStorage.setItem('flowmodoro_state',          state);
  localStorage.setItem('flowmodoro_accumulated',    accumulated);
  localStorage.setItem('flowmodoro_work_seconds',   workSeconds);
  localStorage.setItem('flowmodoro_break_earned',   breakEarned);
  localStorage.setItem('flowmodoro_break_seconds',  breakSeconds);
  localStorage.setItem('flowmodoro_break_remaining',breakRemaining);
}

function restoreSession() {
  const savedState = localStorage.getItem('flowmodoro_state');
  if (!savedState) return;

  accumulated    = parseInt(localStorage.getItem('flowmodoro_accumulated')     || '0', 10);
  workSeconds    = parseInt(localStorage.getItem('flowmodoro_work_seconds')    || '0', 10);
  breakEarned    = parseInt(localStorage.getItem('flowmodoro_break_earned')    || '0', 10);
  breakSeconds   = parseInt(localStorage.getItem('flowmodoro_break_seconds')   || '0', 10);
  breakRemaining = parseInt(localStorage.getItem('flowmodoro_break_remaining') || '0', 10);

  if (savedState === STATE.WORKING) {
    // Al volver, mostrar pausa para que el usuario decida continuar o descansar
    breakEarned  = Math.floor(workSeconds / ratio);
    breakSeconds = breakEarned + accumulated;
    state        = STATE.BREAK_EARNED;

  } else if (savedState === STATE.BREAK_EARNED) {
    state = STATE.BREAK_EARNED;

  } else if (savedState === STATE.BREAK) {
    state      = STATE.BREAK;
    intervalId = setInterval(() => {
      breakRemaining--;
      if (breakRemaining <= 0) {
        clearInterval(intervalId);
        intervalId  = null;
        accumulated = 0;
        beep();
        goIdle();
      } else {
        render();
      }
    }, 1000);
  }
  // STATE.IDLE: valores ya restaurados arriba
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
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

// ── Transitions ────────────────────────────────────────────────────────────
function startWork() {
  workSeconds  = 0;
  breakSeconds = 0;
  state        = STATE.WORKING;
  intervalId   = setInterval(() => {
    workSeconds++;
    render();
  }, 1000);
  render();
}

function stopWork() {
  clearInterval(intervalId);
  intervalId  = null;
  breakEarned  = Math.floor(workSeconds / ratio);
  breakSeconds = breakEarned + accumulated;
  state        = STATE.BREAK_EARNED;
  render();
}

function startBreak() {
  breakRemaining = breakSeconds;
  state          = STATE.BREAK;
  intervalId     = setInterval(() => {
    breakRemaining--;
    if (breakRemaining <= 0) {
      clearInterval(intervalId);
      intervalId  = null;
      accumulated = 0; // fully used
      beep();
      goIdle();
    } else {
      render();
    }
  }, 1000);
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
  // Resume work timer from where it was; keep breakEarned/accumulated intact
  state      = STATE.WORKING;
  intervalId = setInterval(() => {
    workSeconds++;
    render();
  }, 1000);
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
  localStorage.removeItem('flowmodoro_break_earned');
  localStorage.removeItem('flowmodoro_break_seconds');
  localStorage.removeItem('flowmodoro_break_remaining');
  cancelReset();
  render();
});

// ── Init ───────────────────────────────────────────────────────────────────
restoreSession();
render();
