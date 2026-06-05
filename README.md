# Flowmodoro Timer App

## Descripción
Cronómetro de trabajo sin límite de tiempo. Al parar, calcula un descanso proporcional al tiempo trabajado. El descanso sobrante se acumula para la siguiente sesión.
Abre con doble clic en `index.html` (sin instalación).

## Estructura
```
Flowmodoro/
  index.html                   ← shell: iframe de Flowmodoro + widgets de cuenta atrás
  shell.css                    ← estilos del shell
  shell.js                     ← lógica del shell
  utils.js                     ← helpers compartidos (pad, formatTime, formatShortTime, playEndSound)
  flowmodoro/
    index.html                 ← app principal
    app.js                     ← lógica completa (máquina de estados, timers, localStorage)
    style.css                  ← estilos del módulo
  countdown/
    index.html                 ← widget de cuenta atrás
    app.js                     ← lógica completa
    style.css                  ← estilos del módulo
  docs/
    FUNCIONALIDADES.md
    PENDING_FEATURES.md
    pendientes.md
```

## Fórmula
```
breakEarned  = floor(workSeconds * breakRatio / ratio)
breakSeconds = breakEarned + bonusEarned + accumulatedBreak
```
Donde `ratio` = minutos de trabajo por ciclo y `breakRatio` = minutos de descanso por ciclo (defaults: 25 y 5).

## Máquina de estados — Flowmodoro

| Estado | Timer | Color | Acciones |
|---|---|---|---|
| IDLE | último trabajo | blanco | ▶ Iniciar |
| WORKING | sube | azul | ⏸ Pausar |
| BREAK_EARNED | Pausa | amarillo | ▶ Iniciar descanso · Continuar → |
| BREAK | cuenta regresiva | verde | ⏭ Saltar descanso |

## Máquina de estados — Countdown

| Estado | Timer | Acción |
|---|---|---|
| IDLE | — | ▶ Iniciar |
| RUNNING | cuenta atrás | ⏸ Pausar |
| PAUSED | congelado | ▶ Reanudar |
| DONE | 0, ¡Tiempo! | ↺ Reiniciar · 🗑 Eliminar |

## Lo que está implementado

### Timer de trabajo
- Reloj de pared (wall-clock anchor): `workSeconds = segmentStart + floor((Date.now() - workStartTime) / 1000)`. Evita drift y throttling del browser.
- Al parar: calcula `breakEarned`, `bonusEarned`, `breakSeconds` y pasa a BREAK_EARNED.

### Estado BREAK_EARNED
- Muestra desglose: descanso ganado, bonus (si aplica), acumulado (si aplica).
- **▶ Iniciar descanso** → lanza countdown (BREAK).
- **Continuar →** → reanuda WORKING; reinicia el contador de bonus para el nuevo segmento.

### Countdown de descanso
- Mismo patrón wall-clock: `breakRemaining = breakDuration - floor((Date.now() - breakStartTime) / 1000)`.
- Al llegar a 0: pitido vía Web Audio API, `accumulatedBreak = 0`, vuelve a IDLE.
- **⏭ Saltar descanso** → `accumulatedBreak = breakRemaining`, vuelve a IDLE.

### Acumulación de descanso sobrante
- Al saltar el descanso, el tiempo restante se guarda en `accumulatedBreak`.
- En IDLE se muestra "⏳ descanso acumulado: X" si hay sobrante.
- El acumulado se suma al siguiente descanso ganado.

### Panel de configuración (⚙)
- **Ratio**: minutos de descanso (y) por cada minutos de trabajo (x). Defaults: 5 y 25.
- **Bonus**: minutos extra (y) por cada minutos seguidos (x). Defaults: 10 y 60. Si `y = 0`, el bonus queda desactivado.
- **Mostrar tiempo en título**: checkbox que actualiza la pestaña del navegador en tiempo real.
- Los ajustes se guardan en tiempo real y sobreviven al reset completo.
- Ratio y bonus se ocultan mientras se trabaja (para no cambiarlos a mitad de sesión).
- Primera vez sin configuración guardada: panel visible automáticamente.

### Bonus por trabajo continuado
- Durante WORKING se muestra el progreso: `objetivo: MM:SS / MM:SS`.
- Si hay ciclos completados: `★ ×N · MM:SS / MM:SS`.
- El bonus se reinicia al pulsar **Continuar →** (solo premia esfuerzo continuo sin interrupciones).

### Tiempo en el título de la pestaña
- El app corre en un `<iframe>`; usa `postMessage` al documento padre para actualizar la pestaña real del navegador.
- WORKING: `▶ HH:MM:SS — Flowmodoro`
- BREAK_EARNED: `⏸ HH:MM:SS — Flowmodoro`
- BREAK: `☕ HH:MM:SS — Flowmodoro`
- IDLE: `Flowmodoro`

### Widgets de cuenta atrás
- Múltiples instancias independientes, cada una con su propio ID y claves en `localStorage`.
- **Modo hora fin** (`HH:MM`): si la hora ya pasó hoy, cuenta hasta mañana. Muestra "mañana a las HH:MM".
- **Modo duración** (`HH:MM:SS`): muestra "termina a las HH:MM" como preview.
- Inputs de ambos modos persisten aunque se cambie de modo.
- Pausa real: congela el tiempo restante; al reanudar recalcula el target desde el tiempo congelado.
- Al terminar (DONE): botón 🗑 Eliminar visible en el panel expandido y en el header colapsado.
- Colapsar/expandir: solo muestra el header con el tiempo restante en color.

### Persistencia de sesión
- Al refrescar, el estado se restaura automáticamente en todos los módulos.
- WORKING al cerrar → reabre en BREAK_EARNED con el tiempo real transcurrido calculado.
- BREAK al cerrar → restaura el countdown exacto; si ya expiró, va directo a IDLE.

### Reset completo
- Botón `↺` en el encabezado.
- Confirmación inline: "¿Reiniciar? Sí / No".
- **Sí**: limpia toda la sesión pero mantiene la configuración (ratios, bonus, checkbox).

### Estilo
- Fuente `JetBrains Mono` weight 100 (Google Fonts).
- Glow suave por estado. Animación de respiración en WORKING.
- Colores: azul `#74b3f0` (working), amarillo `#f9c74f` (break earned), verde `#7ee8a2` (break), naranja `#f4a261` (countdown running).

# Ideas y bugs
