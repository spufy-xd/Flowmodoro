// ── Máquina de estados ─────────────────────────────────────────────────────
const STATE = {
  IDLE:         'IDLE',         // sin sesión activa
  WORKING:      'WORKING',      // timer de trabajo corriendo
  BREAK_EARNED: 'BREAK_EARNED', // trabajo parado, descanso calculado pero no iniciado
  BREAK:        'BREAK',        // countdown de descanso corriendo
};

// ── Claves de localStorage — configuración ─────────────────────────────────
// Sobreviven un reset completo; se pueden cambiar en cualquier momento.
const LS_CFG = {
  ratio:        'flowmodoro_ratio',
  breakRatio:   'flowmodoro_break_ratio',
  bonusMinutes: 'flowmodoro_bonus_minutes',
  bonusTarget:  'flowmodoro_bonus_target',
  showInTitle:  'flowmodoro_title',
};

// ── Claves de localStorage — sesión ────────────────────────────────────────
// Todo lo que se borra al hacer reset. Añadir variable nueva:
//   1. Añadir clave aquí  2. Guardar en saveSession()  3. Restaurar en restoreSession()
const LS = {
  state:           'flowmodoro_state',
  accumulatedBreak:'flowmodoro_accumulated',
  workSeconds:     'flowmodoro_work_seconds',
  segmentStart:    'flowmodoro_work_seconds_base',
  workStartTime:   'flowmodoro_work_start_time',
  breakEarned:     'flowmodoro_break_earned',
  bonusEarned:     'flowmodoro_bonus_earned',
  breakSeconds:    'flowmodoro_break_seconds',
  breakRemaining:  'flowmodoro_break_remaining',
  breakDuration:   'flowmodoro_break_total',
  breakStartTime:  'flowmodoro_break_start_time',
};

// ── Configuración ──────────────────────────────────────────────────────────
// Agrupada en un objeto: añadir una nueva opción es una sola línea aquí
// + un listener de input abajo. saveCfg() se encarga del resto.
const cfg = {
  ratio:        lsInt(LS_CFG.ratio,        25),
  breakRatio:   lsInt(LS_CFG.breakRatio,   5),
  bonusMinutes: lsInt(LS_CFG.bonusMinutes, 10),
  bonusTarget:  lsInt(LS_CFG.bonusTarget,  60),
};

// Valida y persiste un campo de cfg. min=0 permite el valor 0 (ej: bonusMinutes)
function saveCfg(key, prop, val, min = 1) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= min) {
    cfg[prop] = n;
    localStorage.setItem(key, n);
  }
}

// ── Variables de sesión ────────────────────────────────────────────────────
let state            = STATE.IDLE;
let workSeconds      = 0;   // segundos totales trabajados en la sesión actual
let breakEarned      = 0;   // segundos de descanso ganados por el trabajo
let bonusEarned      = 0;   // segundos de bonus ganados por trabajo continuado
let breakSeconds     = 0;   // descanso total = breakEarned + bonusEarned + accumulatedBreak
let breakRemaining   = 0;   // segundos que quedan en el countdown de descanso
let accumulatedBreak = 0;   // descanso sobrante de sesiones anteriores (carry-over)
let intervalId       = null;

// segmentStartSeconds: valor de workSeconds cuando empezó el segmento actual.
// Doble función:
//   1. Ancla de reloj de pared — evita drift del setInterval o throttling del browser.
//   2. Base del bonus — "Continuar →" resetea el bonus avanzando este valor.
let segmentStartSeconds = 0;

// Anclas de reloj de pared para BREAK (mismo patrón que segmentStartSeconds).
let workStartTime  = null; // Date.now() cuando arrancó el intervalo de trabajo
let breakStartTime = null; // Date.now() cuando arrancó el countdown de descanso
let breakDuration  = 0;    // snapshot de breakSeconds cuando arrancó el countdown

// ── Referencias al DOM ─────────────────────────────────────────────────────
const timerEl          = document.getElementById('timer');
const infoEl           = document.getElementById('info');
const statusEl         = document.getElementById('status');
const btnEl            = document.getElementById('btn');
const btn2El           = document.getElementById('btn2');
const btn3El           = document.getElementById('btn3');
const ratioInput       = document.getElementById('ratio-input');
const breakInput       = document.getElementById('break-input');
const bonusInput       = document.getElementById('bonus-input');
const bonusTargetInput = document.getElementById('bonus-target-input');
const ratioLabelEl     = document.getElementById('ratio-label');
const bonusLabelEl     = document.getElementById('bonus-label');
const ratioPanel       = document.getElementById('ratio-panel');
const gearBtn          = document.getElementById('gear-btn');
const titleCheckEl     = document.getElementById('title-check');
const resetBtn         = document.getElementById('reset-btn');
const resetConfirm     = document.getElementById('reset-confirm');
const resetYesBtn      = document.getElementById('reset-yes-btn');
const resetNoBtn       = document.getElementById('reset-no-btn');

// Panel de ajustes visible la primera vez (sin config guardada)
if (!localStorage.getItem(LS_CFG.ratio)) ratioPanel.hidden = false;

ratioInput.value       = cfg.ratio;
breakInput.value       = cfg.breakRatio;
bonusInput.value       = cfg.bonusMinutes;
bonusTargetInput.value = cfg.bonusTarget;
titleCheckEl.checked   = lsBool(LS_CFG.showInTitle);

// ── Cálculo de bonus ───────────────────────────────────────────────────────
// Función pura: devuelve segundos de bonus según los segundos del segmento actual.
const calcBonusEarned = (segmentSeconds) => {
  if (cfg.bonusMinutes === 0) return 0;
  return Math.floor(segmentSeconds / (cfg.bonusTarget * 60)) * (cfg.bonusMinutes * 60);
};

// ── Persistencia de sesión ─────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(LS.state,            state);
  localStorage.setItem(LS.accumulatedBreak, accumulatedBreak);
  localStorage.setItem(LS.workSeconds,      workSeconds);
  localStorage.setItem(LS.segmentStart,     segmentStartSeconds);
  localStorage.setItem(LS.workStartTime,    workStartTime  ?? '');
  localStorage.setItem(LS.breakEarned,      breakEarned);
  localStorage.setItem(LS.bonusEarned,      bonusEarned);
  localStorage.setItem(LS.breakSeconds,     breakSeconds);
  localStorage.setItem(LS.breakRemaining,   breakRemaining);
  localStorage.setItem(LS.breakDuration,    breakDuration);
  localStorage.setItem(LS.breakStartTime,   breakStartTime ?? '');
}

function restoreSession() {
  const savedState = localStorage.getItem(LS.state);
  if (!savedState) return; // primera vez, nada que restaurar

  accumulatedBreak    = lsInt(LS.accumulatedBreak);
  segmentStartSeconds = lsInt(LS.segmentStart);
  workSeconds         = lsInt(LS.workSeconds);
  breakEarned         = lsInt(LS.breakEarned);
  bonusEarned         = lsInt(LS.bonusEarned);
  breakSeconds        = lsInt(LS.breakSeconds);
  breakRemaining      = lsInt(LS.breakRemaining);
  breakDuration       = lsInt(LS.breakDuration);

  const savedWorkStart  = lsInt(LS.workStartTime);
  const savedBreakStart = lsInt(LS.breakStartTime);

  if (savedState === STATE.WORKING) {
    // Recalculamos con tiempo real por si la pestaña estuvo cerrada o throttleada
    if (savedWorkStart) {
      workSeconds = segmentStartSeconds + Math.floor((Date.now() - savedWorkStart) / 1000);
    }
    breakEarned  = Math.floor(workSeconds * cfg.breakRatio / cfg.ratio);
    bonusEarned  = calcBonusEarned(workSeconds - segmentStartSeconds);
    breakSeconds = breakEarned + bonusEarned + accumulatedBreak;
    state        = STATE.BREAK_EARNED; // el usuario decide si descansar o continuar

  } else if (savedState === STATE.BREAK_EARNED) {
    state = STATE.BREAK_EARNED;

  } else if (savedState === STATE.BREAK) {
    state = STATE.BREAK;
    if (savedBreakStart && breakDuration) {
      breakStartTime = savedBreakStart;
      breakRemaining = Math.max(0, breakDuration - Math.floor((Date.now() - breakStartTime) / 1000));
    } else {
      // Fallback si faltan anclas: arrancamos desde el restante guardado
      breakDuration  = breakRemaining;
      breakStartTime = Date.now();
    }
    if (breakRemaining <= 0) {
      accumulatedBreak = 0;
      playEndSound();
      returnToIdle();
      return;
    }
    intervalId = setInterval(tick, 1000);
  }
  // STATE.IDLE: variables ya restauradas arriba, render() se encarga del resto
}

// ── Render ─────────────────────────────────────────────────────────────────
// Lee el estado global y actualiza TODOS los nodos del DOM. No hay escrituras
// al DOM fuera de esta función.
function render() {
  // Ratios ocultos mientras trabajas para no invitar a cambiarlos a mitad sesión
  ratioLabelEl.hidden = state === STATE.WORKING;
  bonusLabelEl.hidden = state === STATE.WORKING;

  if (state === STATE.IDLE) {
    timerEl.textContent  = formatTime(workSeconds);
    timerEl.className    = 'idle';
    infoEl.textContent   = accumulatedBreak > 0
      ? `⏳ descanso acumulado: ${formatShortTime(accumulatedBreak)}`
      : '';
    statusEl.textContent = 'listo para empezar';
    btnEl.textContent    = '▶ Iniciar';
    btnEl.className      = '';
    btn2El.hidden        = true;
    btn3El.hidden        = true;

  } else if (state === STATE.WORKING) {
    timerEl.textContent  = formatTime(workSeconds);
    timerEl.className    = 'working';
    infoEl.innerHTML     = buildBonusProgressHtml();
    statusEl.textContent = 'trabajando…';
    btnEl.textContent    = '⏹ Parar';
    btnEl.className      = 'stop';
    btn2El.hidden        = true;
    btn3El.hidden        = true;

  } else if (state === STATE.BREAK_EARNED) {
    timerEl.textContent = formatTime(breakSeconds);
    timerEl.className   = 'break-earned';
    infoEl.innerHTML    = buildBreakInfoHtml();
    statusEl.innerHTML  = `Trabajado: <strong>${formatTime(workSeconds)}</strong>`;
    btnEl.textContent   = '▶ Iniciar descanso';
    btnEl.className     = 'start-break';
    btn2El.hidden       = true;
    btn3El.hidden       = false;
    btn3El.textContent  = 'Continuar →';

  } else if (state === STATE.BREAK) {
    timerEl.textContent  = formatTime(breakRemaining);
    timerEl.className    = 'breaking';
    infoEl.innerHTML     = buildBreakInfoHtml();
    const endTime        = new Date(Date.now() + breakRemaining * 1000);
    statusEl.textContent = `descansando… fin a las ${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;
    btnEl.textContent    = '⏭ Saltar descanso';
    btnEl.className      = 'skip-break';
    btn2El.hidden        = true;
    btn3El.hidden        = true;
  }

  updateTabTitle();
  saveSession();
}

// HTML puro del progreso hacia el bonus mientras se trabaja
const buildBonusProgressHtml = () => {
  if (cfg.bonusMinutes === 0) return '';
  const segmentSeconds  = workSeconds - segmentStartSeconds;
  const targetSecs      = cfg.bonusTarget * 60;
  const completedCycles = Math.floor(segmentSeconds / targetSecs);
  const progressSecs    = segmentSeconds % targetSecs;
  return completedCycles > 0
    ? `★ ×${completedCycles} · <strong>${formatShortTime(progressSecs)}</strong> / ${formatShortTime(targetSecs)}`
    : `objetivo: <strong>${formatShortTime(progressSecs)}</strong> / ${formatShortTime(targetSecs)}`;
};

// HTML del desglose del descanso (ganado + bonus + carry-over)
const buildBreakInfoHtml = () => {
  const bonusBadge = bonusEarned > 0
    ? ` <span class="bonus">+${formatShortTime(bonusEarned)} bonus</span>`
    : '';
  const carryLine  = accumulatedBreak > 0
    ? `<br>Descanso acumulado: <strong>${formatShortTime(accumulatedBreak)}</strong>`
    : '';
  return `Descanso obtenido: <strong>${formatShortTime(breakEarned)}</strong>${bonusBadge}${carryLine}`;
};

// Actualiza el título de la pestaña. El app corre en un <iframe>, así que
// document.title solo afecta al iframe; postMessage lo aplica en el padre.
function updateTabTitle() {
  const showTime = titleCheckEl.checked;
  const title = showTime && state === STATE.WORKING      ? `▶ ${formatTime(workSeconds)} — Flowmodoro`
              : showTime && state === STATE.BREAK_EARNED ? `⏸ ${formatTime(breakSeconds)} — Flowmodoro`
              : showTime && state === STATE.BREAK        ? `☕ ${formatTime(breakRemaining)} — Flowmodoro`
              : 'Flowmodoro';
  document.title = title;
  window.parent.postMessage({ type: 'title-update', title }, '*');
}

// ── Tick — se llama cada segundo por el setInterval ────────────────────────
function tick() {
  if      (state === STATE.WORKING) updateWorkTimer();
  else if (state === STATE.BREAK)   updateBreakTimer();
}

// Recalcula workSeconds con reloj de pared (no acumula drift del setInterval)
function updateWorkTimer() {
  workSeconds = segmentStartSeconds + Math.floor((Date.now() - workStartTime) / 1000);
  render();
}

// Recalcula el tiempo restante del descanso; finaliza si llega a cero
function updateBreakTimer() {
  breakRemaining = Math.max(0, breakDuration - Math.floor((Date.now() - breakStartTime) / 1000));
  if (breakRemaining <= 0) {
    clearInterval(intervalId);
    intervalId       = null;
    accumulatedBreak = 0;
    playEndSound();
    returnToIdle();
  } else {
    render();
  }
}

// ── Transiciones de estado ─────────────────────────────────────────────────
function startWork() {
  clearInterval(intervalId);
  workSeconds         = 0;
  segmentStartSeconds = 0;
  workStartTime       = Date.now();
  breakSeconds        = 0;
  state               = STATE.WORKING;
  intervalId          = setInterval(tick, 1000);
  render();
}

function stopWork() {
  clearInterval(intervalId);
  intervalId   = null;
  breakEarned  = Math.floor(workSeconds * cfg.breakRatio / cfg.ratio);
  bonusEarned  = calcBonusEarned(workSeconds - segmentStartSeconds);
  breakSeconds = breakEarned + bonusEarned + accumulatedBreak;
  state        = STATE.BREAK_EARNED;
  render();
}

function startBreak() {
  breakDuration  = breakSeconds;
  breakRemaining = breakSeconds;
  breakStartTime = Date.now();
  state          = STATE.BREAK;
  intervalId     = setInterval(tick, 1000);
  render();
}

function skipBreak() {
  clearInterval(intervalId);
  intervalId       = null;
  accumulatedBreak = breakRemaining; // el tiempo sobrante se lleva a la siguiente sesión
  returnToIdle();
}

// Vuelve a IDLE limpiando el estado de la sesión actual
function returnToIdle() {
  workSeconds         = 0;
  segmentStartSeconds = 0;
  bonusEarned         = 0;
  state               = STATE.IDLE;
  render();
}

// Reanuda el trabajo sin descansar; reinicia el contador de bonus del segmento
function continueWork() {
  clearInterval(intervalId);
  segmentStartSeconds = workSeconds; // el bonus vuelve a cero para este nuevo segmento
  workStartTime       = Date.now();
  state               = STATE.WORKING;
  intervalId          = setInterval(tick, 1000);
  render();
}

// Resetea toda la sesión (la configuración se mantiene intacta)
function resetAll() {
  clearInterval(intervalId);
  intervalId          = null;
  workSeconds         = 0;
  segmentStartSeconds = 0;
  breakEarned         = 0;
  bonusEarned         = 0;
  breakSeconds        = 0;
  breakRemaining      = 0;
  breakDuration       = 0;
  workStartTime       = null;
  breakStartTime      = null;
  accumulatedBreak    = 0;
  state               = STATE.IDLE;
  localStorage.removeItem('flowmodoro_bonus_base_seconds'); // clave legacy
  Object.values(LS).forEach(k => localStorage.removeItem(k));
}

// ── Listeners de eventos ───────────────────────────────────────────────────

// Botón principal: dispatch table en lugar de cadena if/else
btnEl.addEventListener('click', () => {
  const actions = {
    [STATE.IDLE]:         startWork,
    [STATE.WORKING]:      stopWork,
    [STATE.BREAK_EARNED]: startBreak,
    [STATE.BREAK]:        skipBreak,
  };
  actions[state]?.();
});

btn2El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) { accumulatedBreak = 0; returnToIdle(); }
});

btn3El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) continueWork();
});

gearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  saveCfg(LS_CFG.ratio, 'ratio', ratioInput.value);
  ratioPanel.hidden = !ratioPanel.hidden;
  if (!ratioPanel.hidden) ratioInput.focus();
});

// Evita que los clicks dentro del panel lo cierren al burbujear al document
ratioPanel.addEventListener('click', e => e.stopPropagation());

// Guardan en tiempo real mientras el usuario escribe
ratioInput.addEventListener('input',       () => saveCfg(LS_CFG.ratio,        'ratio',        ratioInput.value));
breakInput.addEventListener('input',       () => saveCfg(LS_CFG.breakRatio,   'breakRatio',   breakInput.value));
bonusInput.addEventListener('input',       () => saveCfg(LS_CFG.bonusMinutes, 'bonusMinutes', bonusInput.value, 0));
bonusTargetInput.addEventListener('input', () => saveCfg(LS_CFG.bonusTarget,  'bonusTarget',  bonusTargetInput.value));

titleCheckEl.addEventListener('change', () => {
  localStorage.setItem(LS_CFG.showInTitle, titleCheckEl.checked ? '1' : '0');
  render();
});

const cancelReset = () => {
  resetConfirm.hidden = true;
  resetBtn.hidden     = false;
};

resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetBtn.hidden     = true;
  resetConfirm.hidden = false;
});

resetNoBtn.addEventListener('click',  (e) => { e.stopPropagation(); cancelReset(); });
resetYesBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetAll();
  cancelReset();
  render();
});

// Click fuera del panel o del confirm → cerrarlos
document.addEventListener('click', () => {
  if (!resetConfirm.hidden) cancelReset();
  if (!ratioPanel.hidden)   ratioPanel.hidden = true;
});

// Al volver a la pestaña recalcular inmediatamente (el browser pudo throttlear el intervalo)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && intervalId !== null) tick();
});

// ── Inicio ─────────────────────────────────────────────────────────────────
restoreSession();
render();
