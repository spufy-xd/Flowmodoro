# Funcionalidades — Flowmodoro

Documento de referencia para pruebas y contexto. Cubre todo el comportamiento esperado de la aplicación.

---

## Módulo principal — Flowmodoro

### Estados del timer

| Estado | Timer muestra | Botón principal |
|---|---|---|
| IDLE | Tiempo de la última sesión (o 00:00:00) | ▶ Iniciar |
| WORKING | Tiempo trabajado (cuenta hacia arriba) | ⏸ Pausar |
| PAUSE | Tiempo de descanso ganado | ▶ Iniciar descanso |
| BREAK | Tiempo de descanso restante (cuenta atrás) | ⏭ Saltar descanso |

### Flujo normal

- [ ] **Iniciar** desde IDLE → pasa a WORKING, timer empieza a contar
- [ ] **Parar** desde WORKING → pasa a PAUSE, muestra descanso ganado y tiempo trabajado
- [ ] **Iniciar descanso** desde PAUSE → pasa a BREAK, cuenta atrás del descanso
- [ ] **Descanso termina** (llega a 0) → suena pitido, vuelve a IDLE
- [ ] **Saltar descanso** desde BREAK → el tiempo restante se guarda como carry-over, vuelve a IDLE
- [ ] **Continuar →** desde PAUSE → vuelve a WORKING sin perder el tiempo trabajado

### Descanso acumulado (carry-over)

- [ ] Si se salta el descanso, los segundos restantes se guardan como `accumulatedBreak`
- [ ] En IDLE se muestra "⏳ descanso acumulado: MM:SS" si hay carry-over
- [ ] El carry-over se suma al siguiente descanso ganado
- [ ] El carry-over se almacena si se pulsa **Continuar →** (se elige seguir trabajando)
- [ ] El carry-over se pone a 0 cuando el descanso termina de forma natural

### Bonus por trabajo continuado

- [ ] Si `bonusMinutes > 0`: cada vez que se completan `bonusTarget` min seguidos se suman `bonusMinutes` min extra al descanso
- [ ] Durante WORKING se muestra el progreso: `objetivo: MM:SS / MM:SS`
- [ ] Si hay ciclos completados se muestra: `★ ×N · MM:SS / MM:SS`
- [ ] Al pulsar **Continuar →** el progreso del bonus se resetea para el nuevo segmento (el total de trabajo sigue)
- [ ] En PAUSE el bonus ganado se muestra en verde: `+MM:SS bonus`
- [ ] Si `bonusMinutes = 0` el bonus está desactivado (no se muestra nada)

### Panel de configuración (⚙)

- [ ] Abre/cierra al pulsar el engranaje
- [ ] Se cierra al hacer click fuera del panel
- [ ] **Ratio** `[Y] min de descanso por cada [X] min de trabajo` — mínimo 1, se guarda en tiempo real
- [ ] **Bonus** `[M] min extra por cada [T] min seguidos` — M puede ser 0 (desactiva bonus)
- [ ] **Mostrar tiempo en título** — checkbox; actualiza la pestaña del navegador en tiempo real
- [ ] Los ajustes persisten siempre (no se borran con el reset)
- [ ] El panel se muestra automáticamente la primera vez (sin configuración guardada)
- [ ] El bonus siempre es visible en el panel, independientemente del estado del timer

### Título de la pestaña del navegador

- [ ] IDLE → `Flowmodoro`
- [ ] WORKING → `▶ HH:MM:SS — Flowmodoro`
- [ ] PAUSE → `⏸ HH:MM:SS — Flowmodoro`
- [ ] BREAK → `☕ HH:MM:SS — Flowmodoro`
- [ ] Si el checkbox está desactivado → siempre `Flowmodoro`
- [ ] Funciona correctamente aunque el app corra dentro de un iframe (usa postMessage al documento padre)

### Reset (↺)

- [ ] Primer click → aparece `¿Reiniciar? [Sí] [No]`
- [ ] **Sí** → resetea toda la sesión (timer, carry-over, bonus), vuelve a IDLE
- [ ] **No** → cancela, vuelve al estado anterior
- [ ] Click fuera del confirm → cancela
- [ ] El reset NO borra la configuración (ratios, bonus, checkbox)

### Persistencia entre recargas (Flowmodoro)

- [ ] Cerrar en **WORKING** → al reabrir, recalcula el tiempo real transcurrido y restaura como PAUSE
- [ ] Cerrar en **PAUSE** → restaura PAUSE con los valores correctos
- [ ] Cerrar en **BREAK** → restaura BREAK, reanuda el countdown con el tiempo real restante
- [ ] Si el descanso expiró mientras la pestaña estaba cerrada → va directo a IDLE al reabrir
- [ ] Cerrar en **IDLE** → restaura IDLE con el carry-over (si lo había)

### Precisión del timer (reloj de pared)

- [ ] Al volver a la pestaña activa (`visibilitychange`) el timer se recalcula inmediatamente
- [ ] No hay drift: el tiempo se calcula desde `Date.now()` en cada tick, no acumulando 1 segundo por intervalo

---

## Módulo cuentas atrás (countdown widgets)

### Gestión de widgets

- [ ] Al abrir la app se cargan todos los widgets guardados (mínimo 1)
- [ ] **+ Nueva cuenta atrás** → añade un widget nuevo (expandido por defecto)
- [ ] **🗑 Eliminar** (en el setup) → elimina el widget y borra todos sus datos del localStorage
- [ ] Los widgets se muestran en columna en la esquina superior izquierda

### Colapsar / expandir

- [ ] Click en el header → alterna colapsar/expandir
- [ ] Colapsado: solo muestra el header con el título
- [ ] Colapsado + timer activo: muestra el tiempo en el header (ver sección Header colapsado)
- [ ] El estado colapsado persiste entre recargas

### Configuración del widget (estado IDLE)

- [ ] **Título** — input de texto opcional (se confirma con blur o Enter), máx. 60 caracteres
- [ ] **Modo hora fin** — selector HH:MM (nativo del browser). Si la hora ya pasó hoy, suma un día y muestra `mañana a las HH:MM`
- [ ] **Modo duración** — selector HH:MM:SS. Muestra `termina a las HH:MM` como preview en tiempo real
- [ ] **Cambiar de modo** → guarda el input del modo anterior, restaura el del nuevo modo
- [ ] **✕ Limpiar** → borra título, target e inputs de ambos modos
- [ ] Los inputs de ambos modos persisten entre recargas aunque se cambie de modo

### Estados del countdown

| Estado | Timer | Botón acción |
|---|---|---|
| IDLE | — | ▶ Iniciar |
| RUNNING | Cuenta atrás en naranja | ⏸ Pausar |
| PAUSED | Tiempo congelado (dimmed) | ▶ Reanudar |
| DONE | Tiempo = 0, ¡Tiempo! | ↺ Reiniciar |

- [ ] **Iniciar** → arranca el countdown desde la hora/duración configurada
- [ ] **Pausar** → congela el timer (el tiempo restante se guarda exacto)
- [ ] **Reanudar** → recalcula el target desde el tiempo congelado y continúa
- [ ] **Descanso termina** (llega a 0) → suena pitido, pasa a DONE
- [ ] **Reiniciar** desde DONE → vuelve a IDLE conservando título e input para facilitar un nuevo inicio

### Botones de eliminar en estado DONE

- [ ] En el panel expandido (DONE): aparece botón **🗑 Eliminar** junto a "↺ Reiniciar"
- [ ] En el header colapsado (DONE): aparece botón **🗑** junto a "· ¡Tiempo!"
- [ ] Ambos eliminan el widget completamente

### Header colapsado con timer activo

- [ ] **RUNNING** → muestra tiempo restante en naranja; click en el tiempo alterna a hora de fin y viceversa
- [ ] **PAUSED** → muestra tiempo restante en naranja dimmed; no es clickable
- [ ] **DONE** → muestra `· ¡Tiempo!` en rojo + botón 🗑 para eliminar

### Persistencia entre recargas (countdown)

- [ ] Cerrar en **RUNNING** → al reabrir, calcula el tiempo real restante; si ya expiró → DONE; si no → reanuda
- [ ] Cerrar en **PAUSED** → restaura PAUSED con el tiempo congelado exacto
- [ ] Cerrar en **DONE** → restaura DONE
- [ ] Cerrar en **IDLE** → restaura IDLE con título e inputs de ambos modos intactos
- [ ] El estado colapsado persiste
- [ ] La preferencia "mostrar restante / mostrar hora fin" persiste

### Múltiples instancias

- [ ] Cada widget tiene su propio ID (timestamp) y sus propias claves en localStorage
- [ ] Los widgets son completamente independientes entre sí
- [ ] El orden de los widgets persiste entre recargas
- [ ] Cada widget se redimensiona automáticamente según su contenido (vía `postMessage` al shell)

---

## Comportamiento general

- [ ] La app funciona sin conexión (no hay dependencias externas salvo Google Fonts)
- [ ] No hay build step: los archivos se sirven directamente
- [ ] Todos los datos se guardan en `localStorage` del navegador — no hay backend
- [ ] `utils.js` proporciona helpers compartidos (formato de tiempo, sonido) a todos los módulos
