// ── Identificador de instancia ─────────────────────────────────────────────
// Cada widget tiene su propio ID (timestamp) para tener múltiples
// cuentas atrás independientes con sus propias claves de localStorage.
const COUNTDOWN_ID = new URLSearchParams(window.location.search).get('id') || '0';
const IS_NEW       = new URLSearchParams(window.location.search).get('new') === '1';

// ── Claves de localStorage (todas prefijadas con el ID del widget) ──────────
// Añadir una clave aquí es suficiente para que deleteCountdown() la limpie automáticamente.
const LS = {
  state:    `countdown_${COUNTDOWN_ID}_state`,
  title:    `countdown_${COUNTDOWN_ID}_title`,
  target:   `countdown_${COUNTDOWN_ID}_target`,    // ms timestamp de fin
  collapsed:`countdown_${COUNTDOWN_ID}_collapsed`,
  showtime: `countdown_${COUNTDOWN_ID}_showtime`,  // '1' = restante, '0' = hora fin
  mode:     `countdown_${COUNTDOWN_ID}_mode`,      // MODE_TIME | MODE_DURATION
  input:    `countdown_${COUNTDOWN_ID}_input`,     // input del modo activo
  altInput: `countdown_${COUNTDOWN_ID}_alt_input`, // input del modo inactivo
  notify:   `countdown_${COUNTDOWN_ID}_notify`,    // '1' = notificación activa
};

// ── Clave global (no por widget) para el preset personalizado ──────────────
const LS_PRESET_CUSTOM = 'countdown_preset_custom';

// ── Máquina de estados ─────────────────────────────────────────────────────
const CD = {
  IDLE:    'IDLE',     // sin cuenta activa, mostrando el formulario de configuración
  RUNNING: 'RUNNING',  // cuenta corriendo
  DONE:    'DONE',     // llegó a cero
};

const MODE_TIME     = 'time';
const MODE_DURATION = 'duration';
const DUR_ZERO      = '00:00:00';
const CSS_FLASH     = 'flash-error';
const CSS_ACTIVE    = 'active';

// ── Variables de estado ────────────────────────────────────────────────────
let cdState     = CD.IDLE;
let cdTitle     = '';
let cdTarget    = 0;    // Date.now() en ms cuando termina la cuenta
let cdRemaining = 0;    // segundos restantes (se recalcula en cada tick)
let cdInterval  = null;
let cdMode      = lsStr(LS.mode, MODE_TIME); // MODE_TIME | MODE_DURATION

// Valores del input de cada modo; se guardan al cambiar para restaurar al volver
let timeInputVal = '';
let durInputVal  = DUR_ZERO;

const savedCollapsed = localStorage.getItem(LS.collapsed);
let isCollapsed   = savedCollapsed !== null ? savedCollapsed === '1' : !IS_NEW;
let showRemaining = localStorage.getItem(LS.showtime) !== '0'; // true = restante, false = hora fin
let notifyEnabled = lsBool(LS.notify);

// ── Referencias al DOM ─────────────────────────────────────────────────────
const collapseBtn         = document.getElementById('collapse-btn');
const collapseArrow       = document.getElementById('collapse-arrow');
const headerLabel         = document.getElementById('header-label');
const headerTime          = document.getElementById('header-time');
const headerDoneDeleteBtn = document.getElementById('header-done-delete-btn');
const moduleContent       = document.getElementById('module-content');
const setupPanel          = document.getElementById('setup');
const runningPanel        = document.getElementById('running');
const titleInput          = document.getElementById('title-input');
const targetInput         = document.getElementById('target-input');
const timeLabelEl         = document.getElementById('time-label');
const tomorrowNote        = document.getElementById('tomorrow-note');
const clearBtn            = document.getElementById('clear-btn');
const startBtn            = document.getElementById('start-btn');
const deleteBtn           = document.getElementById('delete-btn');
const titleDisplay        = document.getElementById('title-display');
const timerEl             = document.getElementById('timer');
const cancelBtn           = document.getElementById('cancel-btn');
const restartBtn          = document.getElementById('restart-btn');
const doneDeleteBtn       = document.getElementById('done-delete-btn');
const endTimeLabelEl      = document.getElementById('end-time-label');
const modeTimeBtnEl       = document.getElementById('mode-time-btn');
const modeDurBtnEl        = document.getElementById('mode-dur-btn');
const durationPresetsEl   = document.getElementById('duration-presets');
const presetCustomBtn     = document.getElementById('preset-custom-btn');
const presetSaveBtn       = document.getElementById('preset-save-btn');
const notifyLabel         = document.getElementById('notify-label');
const notifyCheck         = document.getElementById('notify-check');
const notifyDeniedNote    = document.getElementById('notify-denied-note');

// ── Helpers ────────────────────────────────────────────────────────────────

// Segundos restantes hasta cdTarget, calculados en tiempo real
const getSecondsRemaining = () =>
  Math.max(0, Math.floor((cdTarget - Date.now()) / 1000));

// Ms timestamp → "HH:MM"
const formatEndTime = () => {
  const d = new Date(cdTarget);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Parsea HH:MM:SS (o subformatos) a segundos totales. Solo se usa en modo duración.
function parseDuration(val) {
  const parts = val.trim().split(':').map(Number);
  if (!parts.length || parts.some(isNaN)) return 0;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// Formatea segundos como HH:MM:SS para los inputs de duración
function formatDurationInput(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Formatea segundos del preset personalizado para mostrar en el botón (ej: "45'" o "1h30'")
function formatPresetLabel(totalSeconds) {
  if (totalSeconds <= 0) return '?';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0 && m === 0 && s === 0) return `${h}h`;
  if (h > 0 && s === 0) return `${h}h${m}'`;
  if (h > 0) return `${h}h${m}'${s}"`;
  if (s === 0) return `${m}'`;
  return `${m}'${s}"`;
}

// ── Tick scheduling ────────────────────────────────────────────────────────
// setTimeout al próximo segundo exacto del reloj: sin drift y todos los
// widgets actualizados en sincronía.
function scheduleNextTick() {
  const msUntilNextSecond = 1000 - (Date.now() % 1000);
  cdInterval = setTimeout(() => {
    tick();
    if (cdState === CD.RUNNING) scheduleNextTick();
  }, msUntilNextSecond);
}

// ── Persistencia de sesión ─────────────────────────────────────────────────
function saveSession() {
  localStorage.setItem(LS.state,     cdState);
  localStorage.setItem(LS.title,     cdTitle);
  localStorage.setItem(LS.target,    cdTarget);
  localStorage.setItem(LS.collapsed, isCollapsed   ? '1' : '0');
  localStorage.setItem(LS.showtime,  showRemaining ? '1' : '0');
  localStorage.setItem(LS.mode,      cdMode);
  localStorage.setItem(LS.notify,    notifyEnabled ? '1' : '0');

  // Guardamos ambos modos por separado para que persistan al cambiar de modo
  if (cdMode === MODE_TIME) {
    localStorage.setItem(LS.input,    targetInput.value);
    localStorage.setItem(LS.altInput, durInputVal);
  } else {
    localStorage.setItem(LS.input,    targetInput.value);
    localStorage.setItem(LS.altInput, timeInputVal);
  }
}

function restoreSession() {
  cdTitle  = lsStr(LS.title);
  cdTarget = lsInt(LS.target);
  notifyEnabled = lsBool(LS.notify);

  titleInput.value = cdTitle;

  // Restauramos los valores de cada modo por separado
  const savedActiveInput = lsStr(LS.input);
  const savedAltInput    = lsStr(LS.altInput);
  if (cdMode === MODE_TIME) {
    timeInputVal = savedActiveInput;
    durInputVal  = savedAltInput || DUR_ZERO;
  } else {
    durInputVal  = savedActiveInput || DUR_ZERO;
    timeInputVal = savedAltInput;
  }

  // IMPORTANTE: step debe ponerse antes que value, o el browser rechaza el formato
  targetInput.step  = cdMode === MODE_DURATION ? '1' : '60';
  targetInput.value = cdMode === MODE_TIME ? timeInputVal : durInputVal;

  // En modo hora, si el target guardado ya pasó, avisamos con "mañana a las HH:MM"
  if (cdMode === MODE_TIME && timeInputVal && cdTarget > 0 && cdTarget <= Date.now()) {
    tomorrowNote.textContent = `mañana a las ${timeInputVal}`;
    tomorrowNote.hidden      = false;
  }

  const savedState = lsStr(LS.state);
  if (!savedState || savedState === CD.IDLE) return;

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
  } else if (savedState === CD.DONE) {
    cdState     = CD.DONE;
    cdRemaining = 0;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
// Lee el estado global y actualiza TODOS los nodos del DOM. No hay escrituras
// al DOM fuera de esta función.
function render() {
  const isExpanded = !isCollapsed;

  collapseBtn.setAttribute('aria-expanded', isExpanded);
  collapseArrow.textContent = isExpanded ? '▼' : '▶';
  moduleContent.hidden      = !isExpanded;

  headerLabel.textContent = cdTitle || 'Cuenta atrás';

  // — Header colapsado —
  const showHeaderTime = isCollapsed && cdState !== CD.IDLE;
  headerTime.hidden          = !showHeaderTime;
  headerDoneDeleteBtn.hidden = !(isCollapsed && cdState === CD.DONE);

  if (showHeaderTime) {
    if (cdState === CD.DONE) {
      headerTime.textContent = '· ¡Tiempo!';
      headerTime.className   = 'done';
      headerTime.title       = '';
    } else if (showRemaining) {
      headerTime.textContent = `· ${formatShortTime(cdRemaining)}`;
      headerTime.className   = 'running';
      headerTime.title       = 'Ver hora fin';
    } else {
      headerTime.textContent = `· ${formatEndTime()}`;
      headerTime.className   = 'endtime';
      headerTime.title       = 'Ver tiempo restante';
    }
  }

  // — Contenido expandido —
  if (isExpanded) {
    setupPanel.hidden   = cdState !== CD.IDLE;
    runningPanel.hidden = cdState === CD.IDLE;
    titleDisplay.hidden = true;

    if (cdState === CD.IDLE) {
      notifyLabel.hidden      = false;
      notifyDeniedNote.hidden = true;
      notifyCheck.checked     = notifyEnabled;
      notifyLabel.className   = notifyEnabled ? CSS_ACTIVE : '';

      modeTimeBtnEl.className = cdMode === MODE_TIME     ? CSS_ACTIVE : '';
      modeDurBtnEl.className  = cdMode === MODE_DURATION ? CSS_ACTIVE : '';
      timeLabelEl.textContent = cdMode === MODE_TIME ? '¿Hasta qué hora?' : '¿Cuánto tiempo?';

      // UX4: presets visibles solo en modo duración
      durationPresetsEl.hidden = cdMode !== MODE_DURATION;
      if (cdMode === MODE_DURATION) renderPresets();
    }

    if (cdState !== CD.IDLE) {
      timerEl.textContent = formatShortTime(cdRemaining);
      timerEl.className   = cdState === CD.RUNNING ? 'running' : 'done';

      cancelBtn.textContent = '✎ Editar';
      cancelBtn.className   = '';

      restartBtn.hidden    = cdState !== CD.DONE;
      doneDeleteBtn.hidden  = cdState !== CD.DONE;
      endTimeLabelEl.hidden = cdState !== CD.RUNNING;
      if (cdState === CD.RUNNING) endTimeLabelEl.textContent = formatEndTime();
    } else {
      endTimeLabelEl.hidden = true;
    }
  }

  saveSession();
  reportHeight();
}

// ── UX4: Renderizar presets ────────────────────────────────────────────────
function renderPresets() {
  const customVal  = localStorage.getItem(LS_PRESET_CUSTOM);
  const currentVal = targetInput.value.trim();
  const currentSec = parseDuration(currentVal);

  // Actualizar botón custom
  if (customVal) {
    const customSec = parseInt(customVal, 10);
    presetCustomBtn.textContent = formatPresetLabel(customSec);
    presetCustomBtn.title       = 'Preset personalizado';
    presetCustomBtn.className   = (currentSec > 0 && currentSec === customSec) ? CSS_ACTIVE : '';
  } else {
    presetCustomBtn.textContent = '+';
    presetCustomBtn.title       = 'Guardar preset personalizado';
    presetCustomBtn.className   = '';
  }

  // Marcar preset fijo activo
  document.querySelectorAll('.preset-btn').forEach(btn => {
    const sec = parseInt(btn.dataset.seconds, 10);
    btn.className = (currentSec > 0 && currentSec === sec) ? 'preset-btn active' : 'preset-btn';
  });

  // Mostrar "Guardar ★" si el valor del input difiere del preset guardado (y es válido)
  const showSave = currentSec > 0 && currentVal !== '' &&
                   (!customVal || currentSec !== parseInt(customVal, 10));
  presetSaveBtn.hidden = !showSave;
}

// ── Notificaciones (UX5) ───────────────────────────────────────────────────
function triggerNotification() {
  if (!notifyEnabled) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const title = cdTitle || 'Cuenta atrás';
  try {
    new Notification(title, {
      body: '¡El tiempo ha llegado a 0!',
      icon: '',
    });
  } catch (_) {}

  // Auto-expandir si estaba colapsado (render() lo llamará tick() justo después)
  if (isCollapsed) {
    isCollapsed = false;
  }
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
  if (cdRemaining <= 0 && cdState === CD.RUNNING) {
    clearTimeout(cdInterval);
    cdInterval  = null;
    cdState     = CD.DONE;
    cdRemaining = 0;
    playEndSound(660, 1.5);
    triggerNotification();
  }
  render();
}

// ── Transiciones de estado ─────────────────────────────────────────────────
function startCountdown() {
  const val = targetInput.value.trim();
  if (!val) {
    // UX2: flash de error sin texto ni alert
    targetInput.classList.remove(CSS_FLASH);
    // Forzar reflow para reiniciar la animación si ya estaba
    void targetInput.offsetWidth;
    targetInput.classList.add(CSS_FLASH);
    targetInput.addEventListener('animationend', () => {
      targetInput.classList.remove(CSS_FLASH);
    }, { once: true });
    return;
  }

  if (cdMode === MODE_DURATION) {
    const totalSecs = parseDuration(val);
    if (totalSecs <= 0) {
      targetInput.classList.remove(CSS_FLASH);
      void targetInput.offsetWidth;
      targetInput.classList.add(CSS_FLASH);
      targetInput.addEventListener('animationend', () => {
        targetInput.classList.remove(CSS_FLASH);
      }, { once: true });
      return;
    }
    cdTarget    = Date.now() + totalSecs * 1000;
    durInputVal = val; // guardar para precargarlo al editar y poder reiniciar
  } else {
    // Modo hora fin: si la hora ya pasó hoy, la programamos para mañana
    const parts  = val.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      targetInput.classList.remove(CSS_FLASH);
      void targetInput.offsetWidth;
      targetInput.classList.add(CSS_FLASH);
      targetInput.addEventListener('animationend', () => {
        targetInput.classList.remove(CSS_FLASH);
      }, { once: true });
      return;
    }
    const target = new Date();
    target.setHours(parts[0], parts[1], 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    cdTarget     = target.getTime();
    timeInputVal = val; // guardar para precargarlo al editar
  }

  cdRemaining         = getSecondsRemaining();
  cdTitle             = titleInput.value.trim();
  cdState             = CD.RUNNING;
  tomorrowNote.hidden = true;
  scheduleNextTick();
  render();
}

// Vuelve a IDLE desde RUNNING con los campos prerrellenados (C3)
// Modo duración: precarga el tiempo restante. Modo hora fin: precarga la hora original.
function editToIdle() {
  clearTimeout(cdInterval);
  cdInterval = null;

  if (cdMode === MODE_DURATION) {
    const remaining   = getSecondsRemaining();
    targetInput.step  = '1';
    targetInput.value = formatDurationInput(remaining);
    durInputVal       = targetInput.value;
    // Mostrar preview de hora fin con el tiempo prerrellenado
    if (remaining > 0) {
      const endDate = new Date(Date.now() + remaining * 1000);
      tomorrowNote.textContent = `termina a las ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
      tomorrowNote.hidden      = false;
    } else {
      tomorrowNote.hidden = true;
    }
  } else {
    targetInput.step  = '60';
    targetInput.value = timeInputVal;
    tomorrowNote.hidden = true;
  }

  cdState     = CD.IDLE;
  cdRemaining = 0;
  cdTarget    = 0;
  render();
}

// Cancela la cuenta y vuelve a IDLE, conservando título e input para reiniciar fácilmente
function resetCountdown() {
  clearTimeout(cdInterval);
  cdInterval  = null;
  cdState     = CD.IDLE;
  cdRemaining = 0;
  tomorrowNote.hidden = true;
  render();
}

// DONE → RUNNING directamente, reutilizando los mismos parámetros originales
function restartCountdown() {
  clearTimeout(cdInterval);
  cdInterval = null;

  if (cdMode === MODE_DURATION) {
    const totalSecs = parseDuration(durInputVal);
    if (totalSecs <= 0) return;
    cdTarget = Date.now() + totalSecs * 1000;
  } else {
    const parts = timeInputVal.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;
    const target = new Date();
    target.setHours(parts[0], parts[1], 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    cdTarget = target.getTime();
  }

  cdRemaining         = getSecondsRemaining();
  cdState             = CD.RUNNING;
  tomorrowNote.hidden = true;
  scheduleNextTick();
  render();
}

// Borra el título y los inputs de ambos modos
function clearCountdown() {
  titleInput.value  = '';
  targetInput.value = cdMode === MODE_DURATION ? DUR_ZERO : '';
  cdTitle           = '';
  cdTarget          = 0;
  timeInputVal      = '';
  durInputVal       = DUR_ZERO;
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
  if (!isCollapsed || cdState === CD.IDLE) return;
  e.stopPropagation();
  showRemaining = !showRemaining;
  render();
});

// Cambio a modo hora fin: guarda el input de duración, restaura el de hora fin
modeTimeBtnEl.addEventListener('click', () => {
  if (cdMode === MODE_TIME) return;
  durInputVal         = targetInput.value;
  cdMode              = MODE_TIME;
  targetInput.step    = '60'; // step debe ir antes que value
  targetInput.value   = timeInputVal;
  tomorrowNote.hidden = true;
  render();
});

// Cambio a modo duración: guarda el input de hora fin, restaura el de duración
modeDurBtnEl.addEventListener('click', () => {
  if (cdMode === MODE_DURATION) return;
  timeInputVal        = targetInput.value;
  cdMode              = MODE_DURATION;
  targetInput.step    = '1'; // step debe ir antes que value
  targetInput.value   = durInputVal;
  tomorrowNote.hidden = true;
  render();
});

titleInput.addEventListener('blur',    () => { cdTitle = titleInput.value.trim(); render(); });
titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { cdTitle = titleInput.value.trim(); render(); } });

startBtn.addEventListener('click', startCountdown);
clearBtn.addEventListener('click', clearCountdown);

// Botón de acción principal: dispatch según estado
cancelBtn.addEventListener('click', () => {
  if (cdState === CD.RUNNING) editToIdle();
  else if (cdState === CD.DONE) resetCountdown();
});

restartBtn.addEventListener('click', restartCountdown);

// Botones de eliminar: en el panel expandido (DONE) y en el header colapsado (DONE)
deleteBtn.addEventListener('click',           deleteCountdown);
doneDeleteBtn.addEventListener('click',       deleteCountdown);
headerDoneDeleteBtn.addEventListener('click', deleteCountdown);

// Preview en tiempo real de "mañana" o de la hora de fin
targetInput.addEventListener('input', () => {
  const val = targetInput.value.trim();
  if (!val) { tomorrowNote.hidden = true; return; }

  if (cdMode === MODE_DURATION) {
    const totalSecs = parseDuration(val);
    if (totalSecs > 0) {
      const endDate = new Date(Date.now() + totalSecs * 1000);
      tomorrowNote.textContent = `termina a las ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
      tomorrowNote.hidden      = false;
    } else {
      tomorrowNote.hidden = true;
    }
    // UX4: actualizar estado activo de presets al escribir
    if (cdState === CD.IDLE) renderPresets();
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

// ── UX4: Presets de duración ───────────────────────────────────────────────

// Presets fijos
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sec = parseInt(btn.dataset.seconds, 10);
    targetInput.step  = '1';
    targetInput.value = formatDurationInput(sec);
    durInputVal       = targetInput.value;
    tomorrowNote.hidden = true;
    // Mostrar preview hora fin
    const endDate = new Date(Date.now() + sec * 1000);
    tomorrowNote.textContent = `termina a las ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
    tomorrowNote.hidden      = false;
    renderPresets();
  });
});

// Botón preset personalizado
presetCustomBtn.addEventListener('click', () => {
  const customVal = localStorage.getItem(LS_PRESET_CUSTOM);
  if (customVal) {
    const sec         = parseInt(customVal, 10);
    targetInput.step  = '1';
    targetInput.value = formatDurationInput(sec);
    durInputVal       = targetInput.value;
    tomorrowNote.hidden = true;
    const endDate = new Date(Date.now() + sec * 1000);
    tomorrowNote.textContent = `termina a las ${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
    tomorrowNote.hidden      = false;
    renderPresets();
  } else {
    // Sin valor guardado: poner foco en el input
    targetInput.focus();
  }
});

// Botón guardar como preset ★
presetSaveBtn.addEventListener('click', () => {
  const val = targetInput.value.trim();
  const sec = parseDuration(val);
  if (sec <= 0) return;
  localStorage.setItem(LS_PRESET_CUSTOM, String(sec));
  renderPresets();
});

// ── UX5: Notificación del navegador ───────────────────────────────────────
notifyCheck.addEventListener('change', async () => {
  if (notifyCheck.checked) {
    if (typeof Notification === 'undefined') {
      notifyCheck.checked = false;
      notifyDeniedNote.hidden = false;
      notifyEnabled = false;
      render();
      return;
    }
    if (Notification.permission === 'granted') {
      notifyEnabled = true;
      notifyLabel.className = CSS_ACTIVE;
      notifyDeniedNote.hidden = true;
    } else if (Notification.permission === 'denied') {
      notifyCheck.checked = false;
      notifyEnabled = false;
      notifyLabel.className = '';
      notifyDeniedNote.hidden = false;
    } else {
      // 'default': pedir permiso
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        notifyEnabled = true;
        notifyLabel.className = CSS_ACTIVE;
        notifyDeniedNote.hidden = true;
      } else {
        notifyCheck.checked = false;
        notifyEnabled = false;
        notifyLabel.className = '';
        notifyDeniedNote.hidden = false;
      }
    }
  } else {
    notifyEnabled = false;
    notifyLabel.className = '';
    notifyDeniedNote.hidden = true;
  }
  saveSession();
  reportHeight();
});

// ── Inicio ─────────────────────────────────────────────────────────────────
restoreSession();
render();
