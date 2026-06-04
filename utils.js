// ── Utilidades compartidas — cargado por todos los módulos ─────────────────

// ── Formato de tiempo ──────────────────────────────────────────────────────

// Rellena con un cero a la izquierda si hace falta: 5 → "05"
function pad(n) {
  return String(n).padStart(2, '0');
}

// Siempre HH:MM:SS — para timers que pueden pasar de una hora
function formatTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// MM:SS cuando es menos de una hora, HH:MM:SS en caso contrario
function formatShortTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  return s >= 3600 ? formatTime(s) : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

// ── Audio ──────────────────────────────────────────────────────────────────

// Reproduce un pitido corto usando la Web Audio API.
// frequency: tono en Hz · duration: duración en segundos
function playEndSound(frequency = 880, duration = 0.8) {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

// ── localStorage helpers ───────────────────────────────────────────────────
// Centralizados aquí para no repetir parseInt / null-checks en cada módulo.

// Lee una clave numérica; devuelve defaultVal si no existe o no es número
function lsInt(key, defaultVal = 0) {
  const n = parseInt(localStorage.getItem(key), 10);
  return isNaN(n) ? defaultVal : n;
}

// Lee una clave booleana guardada como '1' / '0'
function lsBool(key) {
  return localStorage.getItem(key) === '1';
}

// Lee una clave de texto; devuelve defaultVal si no existe
function lsStr(key, defaultVal = '') {
  return localStorage.getItem(key) ?? defaultVal;
}
