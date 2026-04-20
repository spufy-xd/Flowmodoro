# Flowmodoro Timer App

## Descripción
Cronómetro de trabajo sin límite de tiempo. Al parar, calcula un descanso proporcional al tiempo trabajado. El descanso sobrante se acumula para la siguiente sesión.
Abre con doble clic en `index.html` (sin instalación).

## Estructura
```
Flowmodoro/
  index.html                   ← redirect automático (futuro menú)
  style.css                    ← estilos base compartidos
  flowmodoro/
    indexFlowmodoro.html       ← app
    appFlowmodoro.js           ← lógica completa (máquina de estados, timers, localStorage)
    styleFlowmodoro.css        ← estilos del módulo
```

## Fórmula
```
breakEarned  = floor(workSeconds * breakRatio / ratio)
breakSeconds = breakEarned + accumulated
```
Donde `ratio` = minutos de trabajo por ciclo y `breakRatio` = minutos de descanso por ciclo (defaults: 25 y 5).

## Máquina de estados

| Estado | Timer | Color | Acciones |
|---|---|---|---|
| IDLE | 00:00:00 | blanco | ▶ Iniciar |
| WORKING | sube | azul | ⏹ Parar |
| BREAK_EARNED | descanso total | amarillo | ▶ Iniciar descanso · Continuar → (btn3) |
| BREAK | cuenta regresiva | verde | ⏭ Saltar descanso |

## Lo que está implementado

### Timer de trabajo
- `setInterval` incrementa `workSeconds` cada segundo en estado WORKING
- Al parar: `breakEarned = floor(workSeconds * breakRatio / ratio)`, `breakSeconds = breakEarned + accumulated`
- Transición a BREAK_EARNED

### Estado BREAK_EARNED (pausa amarilla)
- Muestra "Descanso obtenido: X" y "Descanso acumulado: Y" (si Y > 0)
- El timer grande muestra X + Y
- **▶ Iniciar descanso** → lanza countdown (BREAK)
- **Continuar →** (azul) → reanuda el timer de trabajo sin perder el descanso acumulado

### Countdown de descanso
- `setInterval` decrementa `breakRemaining` cada segundo
- Muestra "descansando… fin a las HH:MM" (hora real de fin)
- Al llegar a 0: beep via Web Audio API, `accumulated = 0`, vuelve a IDLE
- **⏭ Saltar descanso** (azul) → `accumulated = breakRemaining`, vuelve a IDLE

### Acumulación de descanso sobrante
- Al saltar el descanso, el tiempo restante se guarda en `accumulated`
- En IDLE se muestra "⏳ descanso acumulado: X" si hay sobrante
- En la siguiente sesión, el acumulado se suma al descanso ganado

### Ratio configurable
- Dos valores: **minutos de descanso** (y) y **minutos de trabajo** (x). Defaults: 5 y 25.
- Guardados en `localStorage` (`flowmodoro_break_ratio` y `flowmodoro_ratio`)
- Primera vez: panel visible automáticamente
- ⚙ en el título: toggle para mostrar/ocultar el panel
- Se guarda en tiempo real mientras se escribe
- **Solo visible en IDLE y BREAK_EARNED** — durante WORKING el panel oculta los inputs de ratio para evitar recálculos a mitad de sesión. Los cambios en BREAK_EARNED se aplican al continuar trabajando.

### Tiempo en el título de la pestaña
- Checkbox "Mostrar tiempo en título" en el panel de ajustes
- Preferencia guardada en `localStorage` (`flowmodoro_title`)
- Cuando está activo, el `<title>` se actualiza en cada tick:
  - WORKING: `▶ HH:MM:SS — Flowmodoro`
  - BREAK_EARNED: `⏸ HH:MM:SS — Flowmodoro`
  - BREAK: `☕ HH:MM:SS — Flowmodoro`
  - IDLE: `Flowmodoro`

### Persistencia de sesión
- Al refrescar la página, el estado se restaura automáticamente.
- En estado WORKING: al volver se muestra BREAK_EARNED con el descanso calculado, permitiendo decidir si descansar o continuar trabajando.
- En estado BREAK: se restaura el countdown exacto donde se quedó.
- En estado BREAK_EARNED: se restaura directamente.
- `accumulated` también se persiste, por lo que el descanso acumulado sobrevive recargas.

### Reset completo
- Botón `↺` en el encabezado (junto al ⚙)
- Al pulsar muestra confirmación inline: "¿Reiniciar? Sí / No"
- **Sí**: detiene cualquier timer activo, limpia todas las claves de `localStorage` relacionadas y vuelve a IDLE con todo a cero
- **No / clic fuera**: cancela y vuelve a mostrar el botón `↺`

### Estilo del timer
- Fuente `JetBrains Mono` weight 100 (cargada desde Google Fonts)
- Glow suave con el color del estado activo
- En estado WORKING: animación de respiración (opacidad pulsa entre 100% y 65% cada 4s)
- Transición de color suave entre estados (0.6s)

### Colores (código visual de estado destino)
- Azul `#74b3f0` → trabajando / botones que llevan a trabajar
- Amarillo `#f9c74f` → pausa (descanso ganado pero no iniciado)
- Verde `#7ee8a2` → countdown de descanso activo / botón iniciar descanso

