// ── Identificador de instancia ─────────────────────────────────────────────
// Cada widget tiene su propio ID (un timestamp) para poder tener múltiples
// cuentas atrás independientes con sus propias claves de localStorage.
const COUNTDOWN_ID = new URLSearchParams(window.location.search).get('id') || '0';
const IS_NEW       = new URLSearchParams(window.location.search).get('new') === '1';

// ── Claves de localStorage (todas prefijadas con el ID del widget) ──────────
// Agruparlas aquí hace que deleteCountdown() limpie todo automáticamente
// y que añadir una nueva clave sea un cambio de un solo lugar.
const LS = {
  state:           `countdown_${COUNTDOWN_ID}_state`,
  title:           `countdown_${COUNTDOWN_ID}_title`,
  target:          `countdown_${COUNTDOWN_ID}_target`,          // ms timestamp de fin
  collapsed:       `countdown_${COUNTDOWN_ID}_collapsed`,
  showtime:        `countdown_${COUNTDOWN_ID}_showtime`,        // '1' = restante, '0' = hora fin
  mode:            `countdown_${COUNTDOWN_ID}_mode`,            // 'time' | 'duration'
  input:           `countdown_${COUNTDOWN_ID}_input`,           // input del modo activo
  altInput:        `countdown_${COUNTDOWN_ID}_alt_input`,       // input del modo inactivo
  pausedRemaining: `countdown_${COUNTDOWN_ID}_paused_remaining`,
};

// ── Máquina de estados ─────────────────────────────────────────────────────
const CD = {
  IDLE:    'IDLE',    // sin cuenta activa, mostrando el formulario de configuración
  RUNNING: 'RUNNING', // cuenta corriendo
  PAUSED:  'PAUSED',  // cuenta congelada (se puede reanudar)
  DONE:    'DONE',    // llegó a cero
};

// ── Variables de estado ────────────────────────────────────────────────────
let cdState           = CD.IDLE;
let cdTitle           = '';
let cdTarget          = 0;    // Date.now() en ms cuando termina la cuenta
let cdRemaining       = 0;    // segundos restantes (se recalcula en cada tick)
let cdPausedRemaining = 0;    // segundos restantes en el momento de pausar
let cdInterval        = null;
let cdMode            = localStorage.getItem(LS.mode) || 'time'; // 'time' | 'duration'

// Guardan el valor del input de cada modo al cambiar, para restaurarlo al volver
let timeInputVal = ''; // valor del input cuando el modo activo era 'time'
let durInputVal  = '00:00:00'; // valor del input cuando el modo activo era 'duration'

const savedCollapsed = localStorage.getItem(LS.collapsed);
let isCollapsed   = savedCollapsed !== null ? savedCollapsed === '1' : !IS_NEW;
let showRemaining = localStorage.getItem(LS.showtime) !== '0'; // true = restante, false = hora fin

// ── Referencias al DOM ─────────────────────────────────────────────────────
const collapseBtn       = document.getElementById('collapse-btn');
const collapseArrow     = document.getElementById('collapse-arrow');
const headerLabel       = document.getElementById('header-label');
const headerTime        = document.getElementById('header-time');
const headerDoneDeleteBtn = document.getElementById('header-done-delete-btn');
const moduleContent     = document.getElementById('module-content');
const setupPanel        = document.getElementById('setup');
const runningPanel      = document.getElementById('running');
const titleInput        = document.getElementById('title-input');
const targetInput       = document.getElementById('target-input');
const timeLabelEl       = document.getElementById('time-label');
const tomorrowNote      = document.getElementById('tomorrow-note');
const clearBtn          = document.getElementById('clear-btn');
const startBtn          = document.getElementById('start-btn');
const deleteBtn         = document.getElementById('delete-btn');
const titleDisplay      = document.getElementById('title-display');
const timerEl           = document.getElementById('timer');
const cancelBtn         = document.getElementById('cancel-btn');
const doneDeleteBtn     = document.getElementById('done-delete-btn');
const endTimeLabelEl    = document.getElementById('end-time-label');
const modeTimeBtnEl     = document.getElementById('mode-time-btn');
const modeDurBtnEl      = document.getElementById('mode-dur-btn');

// ── Helpers ────────────────────────────────────────────────────────────────

// Segundos que quedan hasta cdTarget calculados en tiempo real
function getSecondsRemaining() {
  return Math.max(0, Math.floor((cdTarget - Date.now()) / 1000));
}

// Convierte ms timestamp a "HH:MM"
function formatEndTime() {
  const d = new Date(cdTarget);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Acepta MM, H:MM o H:MM:SS (formato del input type=time con step=1 o step=60)
// y devuelve segundos totales. Solo se usa en modo duración.
function parseDuration(val) {
  const parts = val.trim().split(':').map(Number);
  if (!parts.length || parts.some(isNaN)) return 0;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// ── Tick scheduling ────────────────────────────────────────────────────────
// En vez de setInterval(1000), calculamos el delay hasta el próximo segundo exacto
// del reloj real. Así todos los widgets se actualizan sincronizados y no hay drift.
function scheduleNextTick() {
  const msUntilNextSecond = 1000 - (Date.now() % 1000);
  cdInterval = setTimeout(() => {
    tick();
    if (cdState === CD.RUNNING) scheduleNextTick();
  }, msUntilNextSecond);
}

// ── Persistencia de sesión ─────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(LS.state,           cdState);
  localStorage.setItem(LS.title,           cdTitle);
  localStorage.setItem(LS.target,          cdTarget);
  localStorage.setItem(LS.collapsed,       isCollapsed   ? '1' : '0');
  localStorage.setItem(LS.showtime,        showRemaining ? '1' : '0');
  localStorage.setItem(LS.mode,            cdMode);
  localStorage.setItem(LS.pausedRemaining, cdPausedRemaining);

  // Guardamos los dos modos por separado para que persistan aunque se cambie de modo
  if (cdMode === 'time') {
    localStorage.setItem(LS.input,    targetInput.value);
    localStorage.setItem(LS.altInput, durInputVal);
  } else {
    localStorage.setItem(LS.input,    targetInput.value);
    localStorage.setItem(LS.altInput, timeInputVal);
  }
}

function restoreSession() {
  cdTitle  = localStorage.getItem(LS.title)  || '';
  cdTarget = parseInt(localStorage.getItem(LS.target) || '0', 10);

  titleInput.value = cdTitle;

  // Restauramos los valores guardados de cada modo
  const savedActiveInput = localStorage.getItem(LS.input)    || '';
  const savedAltInput    = localStorage.getItem(LS.altInput) || '';
  if (cdMode === 'time') {
    timeInputVal = savedActiveInput;
    durInputVal  = savedAltInput || '00:00:00';
  } else {
    durInputVal  = savedActiveInput || '00:00:00';
    timeInputVal = savedAltInput;
  }

  // type="time" ya está en el HTML; solo ajustamos el step según el modo
  // (step=60 → HH:MM para hora fin · step=1 → HH:MM:SS para duración)
  // IMPORTANTE: step debe ponerse antes que value, o el browser rechaza el formato
  targetInput.step  = cdMode === 'duration' ? '1' : '60';
  targetInput.value = cdMode === 'time' ? timeInputVal : durInputVal;

  // En modo hora, si el target guardado ya pasó, avisamos con "mañana a las HH:MM"
  if (cdMode === 'time' && timeInputVal && cdTarget > 0 && cdTarget <= Date.now()) {
    tomorrowNote.textContent = `mañana a las ${timeInputVal}`;
    tomorrowNote.hidden      = false;
  }

  const savedState = localStorage.getItem(LS.state);
  if (!savedState || savedState === CD.IDLE) return;

  cdPausedRemaining = parseInt(localStorage.getItem(LS.pausedRemaining) || '0', 10);

  if (savedState === CD.RUNNING) {
    cdRemaining = getSecondsRemaining();
    if (cdRemaining <= 0) {
      // El tiempo pasó mientras la pestaña estaba cerrada → mostrar DONE directamente
      cdState     = CD.DONE;
      cdRemaining = 0;
    } else {
      cdState = CD.RUNNING;
      scheduleNextTick();
    }
  } else if (savedState === CD.PAUSED) {
    cdState     = CD.PAUSED;
    cdRemaining = cdPausedRemaining; // el timer está congelado en este valor
  } else if (savedState === CD.DONE) {
    cdState     = CD.DONE;
    cdRemaining = 0;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
// Lee el estado global y actualiza TODOS los nodos del DOM. Nunca se escribe
// al DOM fuera de esta función.
function render() {
  const isExpanded = !isCollapsed;

  collapseBtn.setAttribute('aria-expanded', isExpanded);
  collapseArrow.textContent = isExpanded ? '▼' : '▶';
  moduleContent.hidden      = !isExpanded;

  // El header siempre muestra el título (o el nombre por defecto)
  headerLabel.textContent = cdTitle || 'Cuenta atrás';

  // — Header en modo colapsado —
  const showHeaderTime = isCollapsed && cdState !== CD.IDLE;
  headerTime.hidden             = !showHeaderTime;
  headerDoneDeleteBtn.hidden    = !(isCollapsed && cdState === CD.DONE);

  if (showHeaderTime) {
    if (cdState === CD.DONE) {
      headerTime.textContent = '· ¡Tiempo!';
      headerTime.className   = 'done';
      headerTime.title       = '';
    } else if (cdState === CD.PAUSED) {
      headerTime.textContent = '· ' + formatShortTime(cdPausedRemaining);
      headerTime.className   = 'paused';
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
  }

  // — Contenido expandido —
  if (isExpanded) {
    setupPanel.hidden   = cdState !== CD.IDLE;
    runningPanel.hidden = cdState === CD.IDLE;

    // El título ya aparece en el header; nunca duplicarlo dentro del panel
    titleDisplay.hidden = true;

    if (cdState === CD.IDLE) {
      // Botones de modo activo/inactivo
      modeTimeBtnEl.className = cdMode === 'time'     ? 'active' : '';
      modeDurBtnEl.className  = cdMode === 'duration' ? 'active' : '';
      // Ajustar label y step según el modo
      if (cdMode === 'time') {
        targetInput.step        = '60';
        timeLabelEl.textContent = '¿Hasta qué hora?';
      } else {
        targetInput.step        = '1';
        timeLabelEl.textContent = '¿Cuánto tiempo?';
      }
    }

    if (cdState !== CD.IDLE) {
      // El timer muestra el valor congelado si está pausado, el en-vivo si corre
      const displaySeconds    = cdState === CD.PAUSED ? cdPausedRemaining : cdRemaining;
      timerEl.textContent     = formatShortTime(displaySeconds);
      timerEl.className       = cdState === CD.RUNNING ? 'running'
                              : cdState === CD.PAUSED  ? 'paused'
                              :                          'done';

      // El botón de acción cambia según el estado
      cancelBtn.textContent   = cdState === CD.RUNNING ? '⏸ Pausar'
                              : cdState === CD.PAUSED  ? '▶ Reanudar'
                              :                          '↺ Reiniciar';

      // El botón de eliminar en el panel solo aparece cuando la cuenta ha terminado
      doneDeleteBtn.hidden    = cdState !== CD.DONE;

      // La hora de fin solo tiene sentido mientras corre (no cuando está pausado o terminado)
      endTimeLabelEl.hidden      = cdState !== CD.RUNNING;
      endTimeLabelEl.textContent = cdState === CD.RUNNING ? formatEndTime() : '';
    } else {
      endTimeLabelEl.hidden = true;
    }
  }

  saveSession();
  reportHeight();
}

// Notifica al iframe padre cuánto mide este widget para que redimensione el iframe
function reportHeight() {
  window.parent.postMessage(
    { type: 'countdown-resize', id: COUNTDOWN_ID, height: document.body.scrollHeight },
    '*'
  );
}

// ── Tick ───────────────────────────────────────────────────────────────────
function tick() {
  cdRemaining = getSecondsRemaining();
  if (cdRemaining <= 0) {
    clearTimeout(cdInterval);
    cdInterval  = null;
    cdState     = CD.DONE;
    cdRemaining = 0;
    playEndSound(660, 1.5); // tono más grave y más largo que el de Flowmodoro
  }
  render();
}

// ── Transiciones de estado ─────────────────────────────────────────────────
function startCountdown() {
  const val = targetInput.value.trim();
  if (!val) return;

  if (cdMode === 'duration') {
    const totalSecs = parseDuration(val);
    if (totalSecs <= 0) return;
    cdTarget = Date.now() + totalSecs * 1000;
  } else {
    // Modo hora fin: si la hora ya pasó hoy, la programamos para mañana
    const parts  = val.split(':').map(Number);
    const target = new Date();
    target.setHours(parts[0], parts[1], 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    cdTarget = target.getTime();
  }

  cdRemaining         = getSecondsRemaining();
  cdTitle             = titleInput.value.trim();
  cdState             = CD.RUNNING;
  tomorrowNote.hidden = true;
  scheduleNextTick();
  render();
}

function pauseCountdown() {
  clearTimeout(cdInterval);
  cdInterval        = null;
  cdPausedRemaining = getSecondsRemaining(); // captura el valor exacto en el momento de pausar
  cdState           = CD.PAUSED;
  render();
}

function resumeCountdown() {
  // Recalculamos el target desde el tiempo congelado para que la hora fin sea correcta
  cdTarget    = Date.now() + cdPausedRemaining * 1000;
  cdRemaining = cdPausedRemaining;
  cdState     = CD.RUNNING;
  scheduleNextTick();
  render();
}

// Cancela la cuenta y vuelve a IDLE, conservando el título e input para reiniciar fácilmente
function resetCountdown() {
  clearTimeout(cdInterval);
  cdInterval        = null;
  cdState           = CD.IDLE;
  cdRemaining       = 0;
  cdPausedRemaining = 0;
  tomorrowNote.hidden = true;
  render();
}

// Borra el título y los inputs de ambos modos
function clearCountdown() {
  titleInput.value  = '';
  targetInput.value = cdMode === 'duration' ? '00:00:00' : '';
  cdTitle           = '';
  cdTarget          = 0;
  timeInputVal      = '';
  durInputVal       = '00:00:00';
  tomorrowNote.hidden = true;
  localStorage.removeItem(LS.title);
  localStorage.removeItem(LS.target);
  localStorage.removeItem(LS.input);
  localStorage.removeItem(LS.altInput);
  render();
}

// Elimina el widget por completo: borra sus datos y avisa al iframe padre
function deleteCountdown() {
  if (cdInterval) clearTimeout(cdInterval);
  // Object.values(LS) incluye todas las claves, así que añadir una nueva clave al objeto LS
  // es suficiente para que deleteCountdown() la limpie automáticamente
  Object.values(LS).forEach(k => localStorage.removeItem(k));
  window.parent.postMessage({ type: 'countdown-remove', id: COUNTDOWN_ID }, '*');
}

// ── Listeners de eventos ───────────────────────────────────────────────────
collapseBtn.addEventListener('click', () => {
  isCollapsed = !isCollapsed;
  render();
});

// Click en el tiempo del header (colapsado) alterna entre restante y hora fin
headerTime.addEventListener('click', e => {
  if (!isCollapsed || cdState === CD.IDLE || cdState === CD.PAUSED) return;
  e.stopPropagation();
  showRemaining = !showRemaining;
  render();
});

// Cambio a modo hora fin: guarda el input de duración, restaura el de hora fin
modeTimeBtnEl.addEventListener('click', () => {
  if (cdMode === 'time') return;
  durInputVal       = targetInput.value;
  cdMode            = 'time';
  targetInput.step  = '60'; // step debe ir antes que value
  targetInput.value = timeInputVal;
  tomorrowNote.hidden = true;
  render();
});

// Cambio a modo duración: guarda el input de hora fin, restaura el de duración
modeDurBtnEl.addEventListener('click', () => {
  if (cdMode === 'duration') return;
  timeInputVal      = targetInput.value;
  cdMode            = 'duration';
  targetInput.step  = '1'; // step debe ir antes que value
  targetInput.value = durInputVal;
  tomorrowNote.hidden = true;
  render();
});

titleInput.addEventListener('blur',    () => { cdTitle = titleInput.value.trim(); render(); });
titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { cdTitle = titleInput.value.trim(); render(); } });

startBtn.addEventListener('click',  startCountdown);
clearBtn.addEventListener('click',  clearCountdown);

// El mismo botón sirve para pausar, reanudar o reiniciar según el estado
cancelBtn.addEventListener('click', () => {
  if      (cdState === CD.RUNNING) pauseCountdown();
  else if (cdState === CD.PAUSED)  resumeCountdown();
  else if (cdState === CD.DONE)    resetCountdown();
});

// Botones de eliminar: en el panel expandido (DONE) y en el header colapsado (DONE)
deleteBtn.addEventListener('click',           deleteCountdown);
doneDeleteBtn.addEventListener('click',       deleteCountdown);
headerDoneDeleteBtn.addEventListener('click', deleteCountdown);

// Preview en tiempo real del "mañana" o de la hora de fin
targetInput.addEventListener('input', () => {
  const val = targetInput.value.trim();
  if (!val) { tomorrowNote.hidden = true; return; }

  if (cdMode === 'duration') {
    const totalSecs = parseDuration(val);
    if (totalSecs > 0) {
      const endDate = new Date(Date.now() + totalSecs * 1000);
      tomorrowNote.textContent = `termina a las ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
      tomorrowNote.hidden      = false;
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
    tomorrowNote.textContent = target <= new Date() ? `mañana a las ${val}` : '';
    tomorrowNote.hidden      = target > new Date();
  }
});

// Al volver a la pestaña, recalcular inmediatamente por si había throttling
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cdState === CD.RUNNING) tick();
});

// ── Inicio ─────────────────────────────────────────────────────────────────
restoreSession();
render();
