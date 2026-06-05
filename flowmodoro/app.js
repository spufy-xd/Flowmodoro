// ── Máquina de estados ─────────────────────────────────────────────────────
const STATE = {
  IDLE:         'IDLE',
  WORKING:      'WORKING',
  BREAK_EARNED: 'BREAK_EARNED',
  BREAK:        'BREAK',
  INTERRUPTED:  'INTERRUPTED', // trabajo pausado por evento externo (F3)
};

// ── Historial ──────────────────────────────────────────────────────────────
const LS_HISTORY       = 'fm_sessions';          // array JSON de entradas históricas
const LS_CURRENT_ENTRY = 'fm_current_entry_id';  // id de la entrada activa (para actualizar con pausas)

// ── Claves de localStorage — configuración ─────────────────────────────────
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
  state:            'flowmodoro_state',
  accumulatedBreak: 'flowmodoro_accumulated',
  workSeconds:      'flowmodoro_work_seconds',
  segmentStart:     'flowmodoro_work_seconds_base',
  workStartTime:    'flowmodoro_work_start_time',
  breakEarned:      'flowmodoro_break_earned',
  bonusEarned:      'flowmodoro_bonus_earned',
  breakSeconds:     'flowmodoro_break_seconds',
  breakRemaining:   'flowmodoro_break_remaining',
  breakDuration:    'flowmodoro_break_total',
  breakStartTime:   'flowmodoro_break_start_time',
  breakEarnedStart:     'flowmodoro_break_earned_start', // cuándo entramos en BREAK_EARNED
  currentInterruptions: 'flowmodoro_current_interruptions', // JSON array de interrupciones (F3)
};

// ── Configuración ──────────────────────────────────────────────────────────
const cfg = {
  ratio:        lsInt(LS_CFG.ratio,        25),
  breakRatio:   lsInt(LS_CFG.breakRatio,   5),
  bonusMinutes: lsInt(LS_CFG.bonusMinutes, 10),
  bonusTarget:  lsInt(LS_CFG.bonusTarget,  60),
};

function saveCfg(key, prop, val, min = 1) {
  const n = parseInt(val, 10);
  if (!isNaN(n) && n >= min) {
    cfg[prop] = n;
    localStorage.setItem(key, n);
  }
}

// ── Variables de sesión ────────────────────────────────────────────────────
let state            = STATE.IDLE;
let workSeconds      = 0;
let breakEarned      = 0;
let bonusEarned      = 0;
let breakSeconds     = 0;
let breakRemaining   = 0;
let accumulatedBreak = 0;
let intervalId       = null;

// segmentStartSeconds: valor de workSeconds cuando empezó el segmento actual.
// Doble función:
//   1. Ancla de reloj de pared — evita drift del setInterval o throttling del browser.
//   2. Base del bonus — "Continuar →" resetea el bonus avanzando este valor.
let segmentStartSeconds = 0;

// Anclas de reloj de pared para BREAK (mismo patrón que segmentStartSeconds).
let workStartTime    = null; // Date.now() cuando arrancó el intervalo de trabajo
let breakStartTime   = null; // Date.now() cuando arrancó el countdown de descanso
let breakDuration    = 0;    // snapshot de breakSeconds cuando arrancó el countdown

// breakEarnedStartTime: cuándo entramos en BREAK_EARNED.
// Se usa para medir la duración de la pausa (F_PAUSE).
let breakEarnedStartTime = null;

// F3 — Interrupciones
let interruptStartTime   = null; // Date.now() cuando empezó la interrupción actual
let currentInterruptions = [];   // array de interrupciones de la sesión actual

// ── Referencias al DOM ─────────────────────────────────────────────────────
const timerEl          = document.getElementById('timer');
const pauseTimerEl     = document.getElementById('pause-timer');
const infoEl           = document.getElementById('info');
const statusEl         = document.getElementById('status');
const btnEl            = document.getElementById('btn');
const btn2El           = document.getElementById('btn2');
const btn3El           = document.getElementById('btn3');
const btnInterruptEl   = document.getElementById('btn-interrupt');
const interruptPanel   = document.getElementById('interrupt-panel');
const interruptInput   = document.getElementById('interrupt-input');
const historyPanel     = document.getElementById('history-panel');
const historyCloseBtn  = document.getElementById('history-close-btn');
const historyList      = document.getElementById('history-list');
const historyClearBtn  = document.getElementById('history-clear-btn');
const historyClearConfirm   = document.getElementById('history-clear-confirm');
const historyClearYesBtn    = document.getElementById('history-clear-yes-btn');
const historyClearNoBtn     = document.getElementById('history-clear-no-btn');

// M1: el panel de configuración está en el shell. Este iframe solo envía señal al padre.
// Al cargar, notificamos al shell que actualice sus inputs con los valores actuales.
window.parent.postMessage({ type: 'cfg-loaded' }, '*');

// ── Cálculo de bonus ───────────────────────────────────────────────────────
const calcBonusEarned = (segmentSeconds) => {
  if (cfg.bonusMinutes === 0) return 0;
  return Math.floor(segmentSeconds / (cfg.bonusTarget * 60)) * (cfg.bonusMinutes * 60);
};

// ── Historial de sesiones (F2) ─────────────────────────────────────────────

// Guarda una entrada en fm_sessions. Solo si workSeconds >= 60.
// Llamado en stopWork() justo antes de cambiar estado.
function saveHistoryEntry() {
  if (workSeconds < 60) return;

  const segmentSeconds = workSeconds - segmentStartSeconds;
  const bonusCycles    = cfg.bonusMinutes === 0 ? 0
    : Math.floor(segmentSeconds / (cfg.bonusTarget * 60));

  const now   = Date.now();
  const today = new Date(now).toLocaleDateString('sv-SE'); // YYYY-MM-DD

  const entry = {
    id:                   String(workStartTime || now),
    date:                 today,
    startTs:              workStartTime || now,
    endTs:                now,
    workSeconds,
    breakEarned,
    bonusEarned,
    bonusCyclesCompleted: bonusCycles,
    accumulatedBreak,
    totalBreak:           breakSeconds,
    pauseSeconds:         0,
    pauses:               [],
    interruptions:        currentInterruptions.slice(), // copia las interrupciones del segmento actual
    task:                 null,
  };

  const sessions = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
  sessions.push(entry);
  if (sessions.length > 500) sessions.shift();
  localStorage.setItem(LS_HISTORY, JSON.stringify(sessions));
  localStorage.setItem(LS_CURRENT_ENTRY, entry.id);
}

// Actualiza la última entrada guardada añadiendo datos de pausa (F_PAUSE).
function updateLastEntryWithPause(pause) {
  const entryId = localStorage.getItem(LS_CURRENT_ENTRY);
  if (!entryId) return;
  try {
    const sessions = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
    const idx = sessions.findIndex(s => s.id === entryId);
    if (idx === -1) return;
    sessions[idx].pauses.push(pause);
    sessions[idx].pauseSeconds = sessions[idx].pauses
      .reduce((sum, p) => sum + p.durationSeconds, 0);
    localStorage.setItem(LS_HISTORY, JSON.stringify(sessions));
  } catch (_) {}
}

// ── Historial — panel de UI ────────────────────────────────────────────────

function openHistoryPanel() {
  renderHistoryList();
  historyPanel.hidden = false;
  window.parent.postMessage({ type: 'history-open' }, '*');
}

function closeHistoryPanel() {
  historyPanel.hidden = true;
  historyClearConfirm.hidden = true;
  historyClearBtn.hidden     = false;
  window.parent.postMessage({ type: 'history-close' }, '*');
}

function renderHistoryList() {
  const sessions = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');

  if (sessions.length === 0) {
    historyList.innerHTML = '<p class="history-empty">Sin sesiones registradas todavía.</p>';
    return;
  }

  // Últimas 30 entradas, más recientes primero
  const recent = sessions.slice(-30).reverse();

  const today     = new Date().toLocaleDateString('sv-SE');
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');

  // Agrupar por día
  const groupedByDay = {};
  recent.forEach(entry => {
    if (!groupedByDay[entry.date]) groupedByDay[entry.date] = [];
    groupedByDay[entry.date].push(entry);
  });

  let html = '';
  Object.keys(groupedByDay).forEach(date => {
    const dayLabel = date === today     ? 'Hoy'
                   : date === yesterday ? 'Ayer'
                   : date.split('-').slice(1).reverse().join('/'); // MM-DD → DD/MM

    html += `<div class="history-day"><span class="history-day-label">${dayLabel}</span>`;

    groupedByDay[date].forEach(entry => {
      const startTime = new Date(entry.startTs);
      const timeStr   = `${pad(startTime.getHours())}:${pad(startTime.getMinutes())}`;
      const workStr   = formatShortTime(entry.workSeconds);
      const breakStr  = formatShortTime(entry.totalBreak);

      const interruptCount = entry.interruptions ? entry.interruptions.length : 0;
      const pauseSecs      = entry.pauseSeconds  || 0;

      const details = [];
      if (interruptCount > 0) details.push(`${interruptCount} interrupción${interruptCount !== 1 ? 'es' : ''}`);
      if (pauseSecs      > 0) details.push(`${formatShortTime(pauseSecs)} en pausa`);

      html += `
        <div class="history-entry">
          <div class="history-entry-main">
            <span class="history-time">${timeStr}</span>
            <span class="history-work">${workStr} trabajo</span>
            <span class="history-break">${breakStr} descanso</span>
          </div>
          ${entry.task ? `<div class="history-task">${entry.task}</div>` : ''}
          ${details.length ? `<div class="history-details">${details.join(' · ')}</div>` : ''}
        </div>`;
    });

    html += '</div>';
  });

  historyList.innerHTML = html;
}

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
  localStorage.setItem(LS.breakStartTime,   breakStartTime   ?? '');
  localStorage.setItem(LS.breakEarnedStart,     breakEarnedStartTime ?? '');
  localStorage.setItem(LS.currentInterruptions, JSON.stringify(currentInterruptions));
}

function restoreSession() {
  const savedState = localStorage.getItem(LS.state);
  if (!savedState) return; // primera vez

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
  const savedBeStart    = localStorage.getItem(LS.breakEarnedStart);

  try {
    currentInterruptions = JSON.parse(localStorage.getItem(LS.currentInterruptions) || '[]');
  } catch (_) { currentInterruptions = []; }

  if (savedState === STATE.WORKING || savedState === STATE.INTERRUPTED) {
    // INTERRUPTED se restaura como BREAK_EARNED: el trabajo se considera parado
    if (savedWorkStart) {
      workStartTime = savedWorkStart;
      // Para INTERRUPTED, workSeconds está congelado (no avanza durante la interrupción)
      if (savedState === STATE.WORKING) {
        workSeconds = segmentStartSeconds + Math.floor((Date.now() - workStartTime) / 1000);
      }
      // savedState === INTERRUPTED: workSeconds ya tiene el valor congelado, no se actualiza
    }
    breakEarned  = Math.floor(workSeconds * cfg.breakRatio / cfg.ratio);
    bonusEarned  = calcBonusEarned(workSeconds - segmentStartSeconds);
    breakSeconds = breakEarned + bonusEarned + accumulatedBreak;
    state        = STATE.BREAK_EARNED;
    breakEarnedStartTime = Date.now();
    intervalId   = setInterval(tick, 1000);

  } else if (savedState === STATE.BREAK_EARNED) {
    state = STATE.BREAK_EARNED;
    breakEarnedStartTime = savedBeStart ? parseInt(savedBeStart, 10) : Date.now();
    intervalId = setInterval(tick, 1000);

  } else if (savedState === STATE.BREAK) {
    state = STATE.BREAK;
    if (savedBreakStart && breakDuration) {
      breakStartTime = savedBreakStart;
      breakRemaining = Math.max(0, breakDuration - Math.floor((Date.now() - breakStartTime) / 1000));
    } else {
      breakDuration  = breakRemaining;
      breakStartTime = Date.now();
    }
    if (breakRemaining <= 0) {
      accumulatedBreak     = 0;
      breakSeconds         = 0;
      playEndSound();
      breakEarnedStartTime = Date.now();
      state                = STATE.BREAK_EARNED;
      intervalId           = setInterval(tick, 1000);
      return;
    }
    intervalId = setInterval(tick, 1000);
  }
  // STATE.IDLE: variables ya restauradas, render() se encarga del resto
}

// ── Render ─────────────────────────────────────────────────────────────────
// Lee el estado global y actualiza TODOS los nodos del DOM. No hay escrituras
// al DOM fuera de esta función.
function render() {
  if (state === STATE.INTERRUPTED) {
    const interruptDur   = interruptStartTime
      ? Math.floor((Date.now() - interruptStartTime) / 1000)
      : 0;

    timerEl.textContent      = formatTime(workSeconds); // congelado durante la interrupción
    timerEl.className        = 'interrupted';
    pauseTimerEl.hidden      = false;
    pauseTimerEl.textContent = `⚡ ${formatTime(interruptDur)}`;
    infoEl.textContent       = `Interrupción #${currentInterruptions.length + 1}`;
    statusEl.textContent     = 'interrumpido…';
    btnEl.textContent        = '▶ Retomar trabajo';
    btnEl.className          = 'resume-interrupt';
    btnEl.hidden             = false;
    btn2El.hidden            = true;
    btn3El.hidden            = true;
    btnInterruptEl.hidden    = true;
    interruptPanel.hidden    = false;

  } else if (state === STATE.IDLE) {
    timerEl.textContent   = formatTime(workSeconds);
    timerEl.className     = 'idle';
    pauseTimerEl.hidden   = true;
    infoEl.textContent    = accumulatedBreak > 0
      ? `⏳ descanso acumulado: ${formatShortTime(accumulatedBreak)}`
      : '';
    statusEl.textContent  = 'listo para empezar';
    btnEl.textContent     = '▶ Iniciar';
    btnEl.className       = '';
    btnEl.hidden          = false;
    btn2El.hidden         = true;
    btn3El.hidden         = true;
    btnInterruptEl.hidden = true;
    interruptPanel.hidden = true;

  } else if (state === STATE.WORKING) {
    timerEl.textContent   = formatTime(workSeconds);
    timerEl.className     = 'working';
    pauseTimerEl.hidden   = true;
    infoEl.innerHTML      = buildBonusProgressHtml();
    statusEl.textContent  = 'trabajando…';
    btnEl.textContent     = '⏸ Pausar';
    btnEl.className       = 'stop';
    btnEl.hidden          = false;
    btn2El.hidden         = true;
    btn3El.hidden         = true;
    // Botón ⚡ con contador de interrupciones (F3)
    btnInterruptEl.hidden       = false;
    btnInterruptEl.textContent  = currentInterruptions.length > 0
      ? `⚡ ${currentInterruptions.length}`
      : '⚡';
    interruptPanel.hidden = true;

  } else if (state === STATE.BREAK_EARNED) {
    const pauseDur = breakEarnedStartTime
      ? Math.floor((Date.now() - breakEarnedStartTime) / 1000)
      : 0;

    timerEl.textContent   = formatTime(breakSeconds);
    timerEl.className     = 'break-earned';
    infoEl.innerHTML      = buildBreakEarnedInfoHtml(pauseDur);
    statusEl.innerHTML    = `Trabajado: <strong>${formatTime(workSeconds)}</strong>`;

    // Timer de pausa visible solo a partir de los 3 minutos
    pauseTimerEl.hidden      = pauseDur < 180;
    pauseTimerEl.textContent = pauseDur >= 180 ? `⏸ ${formatTime(pauseDur)}` : '';

    btnEl.hidden          = breakSeconds === 0; // ocultar si no hay descanso disponible
    btnEl.textContent     = '▶ Iniciar descanso';
    btnEl.className       = 'start-break';
    btn2El.hidden         = true;
    btn3El.hidden         = false;
    btn3El.textContent    = 'Continuar →';
    btnInterruptEl.hidden = true;
    interruptPanel.hidden = true;

  } else if (state === STATE.BREAK) {
    timerEl.textContent   = formatTime(breakRemaining);
    timerEl.className     = 'breaking';
    pauseTimerEl.hidden   = true;
    infoEl.innerHTML      = buildBreakInfoHtml();
    const endTime         = new Date(Date.now() + breakRemaining * 1000);
    statusEl.textContent  = `descansando… fin a las ${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;
    btnEl.textContent     = '⏭ Saltar descanso';
    btnEl.className       = 'skip-break';
    btnEl.hidden          = false;
    btn2El.hidden         = true;
    btn3El.hidden         = true;
    btnInterruptEl.hidden = true;
    interruptPanel.hidden = true;
  }

  updateTabTitle();
  saveSession();
}

// HTML del progreso de bonus mientras se trabaja
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

// HTML para BREAK_EARNED incluyendo mensajes de pausa progresivos (F_PAUSE)
function buildBreakEarnedInfoHtml(pauseDur) {
  const breakLine = buildBreakInfoHtml();
  if (pauseDur < 60)  return breakLine;
  if (pauseDur < 180) return breakLine
    + '<br><span class="pause-note">Llevas un momento en pausa. Este tiempo no cuenta como trabajo ni descanso.</span>';
  return breakLine
    + '<br><span class="pause-note">En pausa · registrando tiempo</span>';
}

// Recarga la configuración desde localStorage (llamado cuando el shell envía cfg-update)
function reloadCfg() {
  cfg.ratio        = lsInt(LS_CFG.ratio,        25);
  cfg.breakRatio   = lsInt(LS_CFG.breakRatio,   5);
  cfg.bonusMinutes = lsInt(LS_CFG.bonusMinutes, 10);
  cfg.bonusTarget  = lsInt(LS_CFG.bonusTarget,  60);
  render();
}

// Actualiza el título de la pestaña. El app corre en un <iframe>, así que
// document.title solo afecta al iframe; postMessage lo aplica en el padre.
function updateTabTitle() {
  const showTime = lsBool(LS_CFG.showInTitle); // lee directamente de LS (panel en shell)
  const title = showTime && state === STATE.WORKING      ? `▶ ${formatTime(workSeconds)} — Flowmodoro`
              : showTime && state === STATE.BREAK_EARNED ? `⏸ ${formatTime(breakSeconds)} — Flowmodoro`
              : showTime && state === STATE.BREAK        ? `☕ ${formatTime(breakRemaining)} — Flowmodoro`
              : 'Flowmodoro';
  document.title = title;
  window.parent.postMessage({ type: 'title-update', title }, '*');
}

// ── Tick — se llama cada segundo por el setInterval ────────────────────────
function tick() {
  if      (state === STATE.WORKING)      updateWorkTimer();
  else if (state === STATE.BREAK)        updateBreakTimer();
  else if (state === STATE.BREAK_EARNED) render(); // refresca el timer de pausa
  else if (state === STATE.INTERRUPTED)  render(); // refresca el timer de interrupción
}

// Recalcula workSeconds con reloj de pared (no acumula drift del setInterval)
function updateWorkTimer() {
  workSeconds = segmentStartSeconds + Math.floor((Date.now() - workStartTime) / 1000);
  render();
}

// Recalcula el tiempo restante del descanso; si llega a 0 va a BREAK_EARNED
function updateBreakTimer() {
  breakRemaining = Math.max(0, breakDuration - Math.floor((Date.now() - breakStartTime) / 1000));
  if (breakRemaining <= 0) {
    clearInterval(intervalId);
    intervalId   = null;
    accumulatedBreak = 0;
    breakSeconds = 0; // descanso consumido
    playEndSound();
    // Según spec: el descanso terminado lleva a BREAK_EARNED, no a IDLE
    breakEarnedStartTime = Date.now();
    state        = STATE.BREAK_EARNED;
    intervalId   = setInterval(tick, 1000);
    render();
  } else {
    render();
  }
}

// ── Helpers de pausa (F_PAUSE) ─────────────────────────────────────────────

// Registra la pausa actual si supera 30 segundos, luego limpia breakEarnedStartTime.
// Llamado al salir de BREAK_EARNED hacia startBreak() o continueWork().
function recordPauseIfNeeded() {
  if (!breakEarnedStartTime) return;
  const dur = Math.floor((Date.now() - breakEarnedStartTime) / 1000);
  if (dur >= 30) {
    updateLastEntryWithPause({ durationSeconds: dur, startTs: breakEarnedStartTime });
  }
  breakEarnedStartTime = null;
}

// ── Transiciones de estado (F3 — interrupciones) ──────────────────────────

function startInterrupt() {
  // No se limpia el intervalo: el tick sigue corriendo para el timer de interrupción
  interruptStartTime = Date.now();
  state              = STATE.INTERRUPTED;
  render();
}

function resumeFromInterrupt() {
  if (!interruptStartTime) { state = STATE.WORKING; render(); return; }

  const dur  = Math.floor((Date.now() - interruptStartTime) / 1000);
  const text = interruptInput.value.trim();

  currentInterruptions.push({
    durationSeconds: dur,
    text:            text || null,
    startTs:         interruptStartTime,
  });

  interruptInput.value = '';
  interruptStartTime   = null;

  // Ajusta workStartTime para que el tiempo de interrupción no cuente como trabajo.
  // La relación workSeconds = segmentStartSeconds + (Date.now() - workStartTime)/1000
  // debe dar el mismo workSeconds congelado → workStartTime = now - segmentOffset * 1000
  workStartTime = Date.now() - (workSeconds - segmentStartSeconds) * 1000;

  state = STATE.WORKING;
  render();
}

// ── Transiciones de estado ─────────────────────────────────────────────────
function startWork() {
  clearInterval(intervalId);
  workSeconds          = 0;
  segmentStartSeconds  = 0;
  workStartTime        = Date.now();
  breakSeconds         = 0;
  currentInterruptions = []; // nueva sesión: limpia interrupciones anteriores
  state                = STATE.WORKING;
  intervalId           = setInterval(tick, 1000);
  render();
}

function stopWork() {
  clearInterval(intervalId);
  intervalId   = null;
  breakEarned  = Math.floor(workSeconds * cfg.breakRatio / cfg.ratio);
  bonusEarned  = calcBonusEarned(workSeconds - segmentStartSeconds);
  breakSeconds = breakEarned + bonusEarned + accumulatedBreak;
  saveHistoryEntry();
  currentInterruptions = []; // las interrupciones ya se guardaron en la entrada del historial
  breakEarnedStartTime = Date.now();
  state        = STATE.BREAK_EARNED;
  intervalId   = setInterval(tick, 1000); // sigue tickeando para medir la pausa
  render();
}

function startBreak() {
  clearInterval(intervalId);
  intervalId = null;
  recordPauseIfNeeded();
  breakDuration  = breakSeconds;
  breakRemaining = breakSeconds;
  breakStartTime = Date.now();
  state          = STATE.BREAK;
  intervalId     = setInterval(tick, 1000);
  render();
}

function skipBreak() {
  clearInterval(intervalId);
  intervalId           = null;
  accumulatedBreak     = breakRemaining; // el sobrante se lleva a la siguiente sesión
  breakEarnedStartTime = null;
  returnToIdle();
}

// Vuelve a IDLE limpiando el estado de sesión
function returnToIdle() {
  clearInterval(intervalId);
  intervalId           = null;
  breakEarnedStartTime = null;
  workSeconds          = 0;
  segmentStartSeconds  = 0;
  bonusEarned          = 0;
  state                = STATE.IDLE;
  render();
}

// Reanuda el trabajo sin descansar; reinicia el contador de bonus del segmento
function continueWork() {
  clearInterval(intervalId);
  intervalId           = null;
  recordPauseIfNeeded();
  currentInterruptions = []; // nuevo segmento: interrupciones anteriores ya en historial
  segmentStartSeconds  = workSeconds; // el bonus vuelve a cero para este nuevo segmento
  workStartTime        = Date.now();
  state                = STATE.WORKING;
  intervalId           = setInterval(tick, 1000);
  render();
}

// Resetea toda la sesión (la configuración se mantiene intacta)
function resetAll() {
  clearInterval(intervalId);
  intervalId           = null;
  workSeconds          = 0;
  segmentStartSeconds  = 0;
  breakEarned          = 0;
  bonusEarned          = 0;
  breakSeconds         = 0;
  breakRemaining       = 0;
  breakDuration        = 0;
  workStartTime        = null;
  breakStartTime       = null;
  breakEarnedStartTime = null;
  interruptStartTime   = null;
  currentInterruptions = [];
  accumulatedBreak     = 0;
  state                = STATE.IDLE;
  localStorage.removeItem('flowmodoro_bonus_base_seconds'); // clave legacy
  localStorage.removeItem(LS_CURRENT_ENTRY);
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  // Nota: fm_sessions NO se borra; el historial persiste entre resets
}

// ── Listeners de eventos ───────────────────────────────────────────────────

// Botón principal: dispatch table en lugar de cadena if/else
btnEl.addEventListener('click', () => {
  const actions = {
    [STATE.IDLE]:         startWork,
    [STATE.WORKING]:      stopWork,
    [STATE.BREAK_EARNED]: startBreak,
    [STATE.BREAK]:        skipBreak,
    [STATE.INTERRUPTED]:  resumeFromInterrupt,
  };
  actions[state]?.();
});

// Botón de interrupción ⚡ (solo visible en WORKING)
btnInterruptEl.addEventListener('click', () => {
  if (state === STATE.WORKING) startInterrupt();
});

btn2El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) { accumulatedBreak = 0; returnToIdle(); }
});

btn3El.addEventListener('click', () => {
  if (state === STATE.BREAK_EARNED) continueWork();
});

// Mensajes del shell: configuración actualizada, historial abierto, reset confirmado
window.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'cfg-update')    reloadCfg();
  if (e.data.type === 'open-history')  { if (historyPanel.hidden) openHistoryPanel(); else closeHistoryPanel(); }
  if (e.data.type === 'reset-confirm') { resetAll(); render(); }
});

// Al volver a la pestaña recalcular inmediatamente
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && intervalId !== null) tick();
});

// ── Historial — eventos (F2) ───────────────────────────────────────────────

historyCloseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  closeHistoryPanel();
});

historyPanel.addEventListener('click', e => e.stopPropagation());

historyClearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  historyClearBtn.hidden     = true;
  historyClearConfirm.hidden = false;
});

historyClearYesBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  localStorage.removeItem(LS_HISTORY);
  localStorage.removeItem(LS_CURRENT_ENTRY);
  renderHistoryList();
  historyClearConfirm.hidden = true;
  historyClearBtn.hidden     = false;
});

historyClearNoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  historyClearConfirm.hidden = true;
  historyClearBtn.hidden     = false;
});

// ── Historial — Export/Import (F5) ─────────────────────────────────────────

const historyExportBtn       = document.getElementById('history-export-btn');
const historyImportInput     = document.getElementById('history-import-input');
const historyImportConfirm   = document.getElementById('history-import-confirm');
const historyImportMsg       = document.getElementById('history-import-msg');
const historyImportMergeBtn  = document.getElementById('history-import-merge-btn');
const historyImportReplaceBtn = document.getElementById('history-import-replace-btn');
const historyImportCancelBtn = document.getElementById('history-import-cancel-btn');
const historyImportError     = document.getElementById('history-import-error');

let pendingImport = null; // datos pendientes de confirmación

function exportHistory() {
  const raw = localStorage.getItem(LS_HISTORY);
  if (!raw || raw === '[]') return;
  const today = new Date().toLocaleDateString('sv-SE');
  const blob  = new Blob([raw], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `flowmodoro-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function validateImport(parsed) {
  return Array.isArray(parsed)
    && parsed.every(s => s && typeof s.id === 'string' && typeof s.date === 'string' && typeof s.workSeconds === 'number');
}

function showImportConfirm(imported) {
  pendingImport              = imported;
  historyImportError.hidden  = true;
  historyImportMsg.textContent = `${imported.length} sesiones encontradas. ¿Combinar con los datos actuales o reemplazar?`;
  historyImportConfirm.hidden = false;
}

function hideImportConfirm() {
  historyImportConfirm.hidden = true;
  pendingImport = null;
  historyImportInput.value = '';
}

historyExportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportHistory(); });

historyImportInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  historyImportError.hidden = true;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!validateImport(parsed)) {
        historyImportError.textContent = 'El archivo no tiene el formato esperado.';
        historyImportError.hidden      = false;
        historyImportInput.value       = '';
        return;
      }
      showImportConfirm(parsed);
    } catch (_) {
      historyImportError.textContent = 'No se pudo leer el archivo JSON.';
      historyImportError.hidden      = false;
      historyImportInput.value       = '';
    }
  };
  reader.readAsText(file);
});

historyImportMergeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!pendingImport) return;
  const existing    = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
  const existingIds = new Set(existing.map(s => s.id));
  const merged      = [...existing, ...pendingImport.filter(s => !existingIds.has(s.id))];
  merged.sort((a, b) => a.startTs - b.startTs);
  if (merged.length > 500) merged.splice(0, merged.length - 500);
  localStorage.setItem(LS_HISTORY, JSON.stringify(merged));
  hideImportConfirm();
  renderHistoryList();
});

historyImportReplaceBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!pendingImport) return;
  const sorted = [...pendingImport].sort((a, b) => a.startTs - b.startTs);
  const limited = sorted.slice(-500);
  localStorage.setItem(LS_HISTORY, JSON.stringify(limited));
  hideImportConfirm();
  renderHistoryList();
});

historyImportCancelBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  hideImportConfirm();
});

// ── Inicio ─────────────────────────────────────────────────────────────────
restoreSession();
render();
