// ── Máquina de estados ─────────────────────────────────────────────────────
const STATE = {
  IDLE:         'IDLE',         // sin sesión activa
  WORKING:      'WORKING',      // timer de trabajo corriendo
  BREAK_EARNED: 'BREAK_EARNED', // trabajo parado, descanso calculado pero no iniciado
  BREAK:        'BREAK',        // countdown de descanso corriendo
};

// ── Claves de localStorage — configuración ─────────────────────────────────
// Estos valores sobreviven un reset completo y se pueden cambiar en cualquier momento.
const LS_CFG = {
  ratio:       'flowmodoro_ratio',
  breakRatio:  'flowmodoro_break_ratio',
  bonusMinutes:'flowmodoro_bonus_minutes',
  bonusTarget: 'flowmodoro_bonus_target',
  showInTitle: 'flowmodoro_title',
};

// ── Claves de localStorage — sesión ────────────────────────────────────────
// Todo lo que se borra al hacer reset. Si añades una nueva variable de sesión,
// solo tienes que añadirla aquí + en saveSession() + en restoreSession().
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
let ratio        = parseInt(localStorage.getItem(LS_CFG.ratio)        || '25', 10);
let breakRatio   = parseInt(localStorage.getItem(LS_CFG.breakRatio)   || '5',  10);
let bonusMinutes = parseInt(localStorage.getItem(LS_CFG.bonusMinutes) || '10', 10);
let bonusTarget  = parseInt(localStorage.getItem(LS_CFG.bonusTarget)  || '60', 10);

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
// Cumple dos funciones a la vez:
//   1. Ancla de reloj de pared — workSeconds = segmentStart + segundos transcurridos reales.
//      Esto evita que el drift del setInterval o el throttling del browser pierdan tiempo.
//   2. Punto de inicio del bonus — el bonus se calcula sobre (workSeconds - segmentStart),
//      así que pulsar "Continuar →" resetea el bonus aunque el total siga subiendo.
// Se pone a 0 en startWork() y a workSeconds en continueWork().
let segmentStartSeconds = 0;

// Anclas de reloj de pared para el BREAK (mismo patrón que segmentStartSeconds).
let workStartTime  = null; // Date.now() cuando arrancó el intervalo de trabajo
let breakStartTime = null; // Date.now() cuando arrancó el countdown de descanso
let breakDuration  = 0;    // breakSeconds total cuando arrancó el countdown

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

// Mostrar el panel de ajustes automáticamente la primera vez (sin config guardada)
if (!localStorage.getItem(LS_CFG.ratio)) ratioPanel.hidden = false;

ratioInput.value       = ratio;
breakInput.value       = breakRatio;
bonusInput.value       = bonusMinutes;
bonusTargetInput.value = bonusTarget;
titleCheckEl.checked   = localStorage.getItem(LS_CFG.showInTitle) === '1';

// ── Guardar ajustes de configuración ──────────────────────────────────────
function saveRatio(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) { ratio = n; localStorage.setItem(LS_CFG.ratio, n); }
}
function saveBreakRatio(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) { breakRatio = n; localStorage.setItem(LS_CFG.breakRatio, n); }
}
function saveBonusMinutes(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 0) { bonusMinutes = n; localStorage.setItem(LS_CFG.bonusMinutes, n); }
}
function saveBonusTarget(val) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= 1) { bonusTarget = n; localStorage.setItem(LS_CFG.bonusTarget, n); }
}

// ── Cálculo de bonus ───────────────────────────────────────────────────────
// Devuelve segundos de bonus según los segundos trabajados en el segmento actual.
function calcBonusEarned(segmentSeconds) {
  if (bonusMinutes === 0) return 0;
  const completedCycles = Math.floor(segmentSeconds / (bonusTarget * 60));
  return completedCycles * (bonusMinutes * 60);
}

// ── Persistencia de sesión ─────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(LS.state,            state);
  localStorage.setItem(LS.accumulatedBreak, accumulatedBreak);
  localStorage.setItem(LS.workSeconds,      workSeconds);
  localStorage.setItem(LS.segmentStart,     segmentStartSeconds);
  localStorage.setItem(LS.workStartTime,    workStartTime   ?? '');
  localStorage.setItem(LS.breakEarned,      breakEarned);
  localStorage.setItem(LS.bonusEarned,      bonusEarned);
  localStorage.setItem(LS.breakSeconds,     breakSeconds);
  localStorage.setItem(LS.breakRemaining,   breakRemaining);
  localStorage.setItem(LS.breakDuration,    breakDuration);
  localStorage.setItem(LS.breakStartTime,   breakStartTime  ?? '');
}

function restoreSession() {
  const savedState = localStorage.getItem(LS.state);
  if (!savedState) return; // primera vez, nada que restaurar

  accumulatedBreak    = parseInt(localStorage.getItem(LS.accumulatedBreak) || '0', 10);
  segmentStartSeconds = parseInt(localStorage.getItem(LS.segmentStart)     || '0', 10);
  workSeconds         = parseInt(localStorage.getItem(LS.workSeconds)       || '0', 10);
  breakEarned         = parseInt(localStorage.getItem(LS.breakEarned)       || '0', 10);
  bonusEarned         = parseInt(localStorage.getItem(LS.bonusEarned)       || '0', 10);
  breakSeconds        = parseInt(localStorage.getItem(LS.breakSeconds)      || '0', 10);
  breakRemaining      = parseInt(localStorage.getItem(LS.breakRemaining)    || '0', 10);
  breakDuration       = parseInt(localStorage.getItem(LS.breakDuration)     || '0', 10);

  const savedWorkStart  = parseInt(localStorage.getItem(LS.workStartTime)  || '0', 10);
  const savedBreakStart = parseInt(localStorage.getItem(LS.breakStartTime) || '0', 10);

  if (savedState === STATE.WORKING) {
    // Recalculamos con el tiempo real transcurrido, por si la pestaña estuvo
    // cerrada o el browser throttleó el setInterval en background
    if (savedWorkStart) {
      workSeconds = segmentStartSeconds + Math.floor((Date.now() - savedWorkStart) / 1000);
    }
    breakEarned  = Math.floor(workSeconds * breakRatio / ratio);
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
      playEndSound(880, 0.8);
      returnToIdle();
      return;
    }
    intervalId = setInterval(tick, 1000);
  }
  // STATE.IDLE: variables ya restauradas arriba, render() se encarga del resto
}

// ── Render ─────────────────────────────────────────────────────────────────
// Lee el estado global y actualiza TODOS los nodos del DOM. Nunca se escribe
// al DOM fuera de esta función (excepto las referencias iniciales de arriba).
function render() {
  // Ratio y bonus se ocultan mientras trabajas para no invitar a cambiarlos a mitad sesión
  ratioLabelEl.hidden = (state === STATE.WORKING);
  bonusLabelEl.hidden = (state === STATE.WORKING);

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

// Construye el HTML del progreso hacia el bonus mientras se trabaja
function buildBonusProgressHtml() {
  if (bonusMinutes === 0) return '';
  const segmentSeconds  = workSeconds - segmentStartSeconds;
  const targetSecs      = bonusTarget * 60;
  const progressSecs    = segmentSeconds % targetSecs;
  const completedCycles = Math.floor(segmentSeconds / targetSecs);
  if (completedCycles > 0) {
    return `★ ×${completedCycles} · <strong>${formatShortTime(progressSecs)}</strong> / ${formatShortTime(targetSecs)}`;
  }
  return `objetivo: <strong>${formatShortTime(progressSecs)}</strong> / ${formatShortTime(targetSecs)}`;
}

// Construye el HTML con el desglose del descanso (ganado + bonus + carry-over)
function buildBreakInfoHtml() {
  const bonusBadge = bonusEarned > 0
    ? ` <span class="bonus">+${formatShortTime(bonusEarned)} bonus</span>`
    : '';
  const carryLine  = accumulatedBreak > 0
    ? `<br>Descanso acumulado: <strong>${formatShortTime(accumulatedBreak)}</strong>`
    : '';
  return `Descanso obtenido: <strong>${formatShortTime(breakEarned)}</strong>${bonusBadge}${carryLine}`;
}

// Actualiza el título de la pestaña del navegador.
// El app corre dentro de un <iframe> en index.html, así que document.title solo
// afecta al iframe. Usamos postMessage para que index.html lo reciba y lo aplique.
function updateTabTitle() {
  let title = 'Flowmodoro';
  if (titleCheckEl.checked) {
    if (state === STATE.WORKING)      title = `▶ ${formatTime(workSeconds)} — Flowmodoro`;
    if (state === STATE.BREAK_EARNED) title = `⏸ ${formatTime(breakSeconds)} — Flowmodoro`;
    if (state === STATE.BREAK)        title = `☕ ${formatTime(breakRemaining)} — Flowmodoro`;
  }
  document.title = title; // funciona si se abre el HTML directamente (sin iframe)
  window.parent.postMessage({ type: 'title-update', title }, '*'); // funciona dentro del iframe
}

// ── Tick — se llama cada segundo por el setInterval ────────────────────────
function tick() {
  if      (state === STATE.WORKING) updateWorkTimer();
  else if (state === STATE.BREAK)   updateBreakTimer();
}

// Recalcula workSeconds usando el reloj de pared (no acumula drift del setInterval)
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
    playEndSound(880, 0.8);
    returnToIdle();
  } else {
    render();
  }
}

// ── Transiciones de estado ─────────────────────────────────────────────────
function startWork() {
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
  breakEarned  = Math.floor(workSeconds * breakRatio / ratio);
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
  // Elimina también la clave legacy de versiones anteriores
  localStorage.removeItem('flowmodoro_bonus_base_seconds');
  Object.values(LS).forEach(k => localStorage.removeItem(k));
}

// ── Listeners de eventos ───────────────────────────────────────────────────

// Botón principal: la acción depende del estado en que estemos
btnEl.addEventListener('click', () => {
  if      (state === STATE.IDLE)         startWork();
  else if (state === STATE.WORKING)      stopWork();
  else if (state === STATE.BREAK_EARNED) startBreak();
  else if (state === STATE.BREAK)        skipBreak();
});

btn2El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) { accumulatedBreak = 0; returnToIdle(); }
});

btn3El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) continueWork();
});

gearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  saveRatio(ratioInput.value);
  ratioPanel.hidden = !ratioPanel.hidden;
  if (!ratioPanel.hidden) ratioInput.focus();
});

// Evita que los clicks dentro del panel lleguen al document y lo cierren
ratioPanel.addEventListener('click', e => e.stopPropagation());

// Guardan en tiempo real mientras el usuario escribe, sin necesitar un botón "Guardar"
ratioInput.addEventListener('input',       () => saveRatio(ratioInput.value));
breakInput.addEventListener('input',       () => saveBreakRatio(breakInput.value));
bonusInput.addEventListener('input',       () => saveBonusMinutes(bonusInput.value));
bonusTargetInput.addEventListener('input', () => saveBonusTarget(bonusTargetInput.value));

titleCheckEl.addEventListener('change', () => {
  localStorage.setItem(LS_CFG.showInTitle, titleCheckEl.checked ? '1' : '0');
  render();
});

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
