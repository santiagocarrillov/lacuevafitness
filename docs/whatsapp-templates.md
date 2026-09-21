# Templates de WhatsApp para aprobación (Meta)

> **ESTADO (21 sep 2026): las 5 fueron CREADAS y ENVIADAS A REVISIÓN** en la WABA
> 1409189890114741, idioma **Spanish (`es`)**. Antes de esto la cuenta solo tenía
> `hello_world` (inglés) — ninguna se había llegado a crear, y por eso todo envío
> fuera de la ventana de 24h fallaba.
>
> **Pendiente para que sirvan de algo:** `sequences.ts` todavía NO las usa. Hoy un
> followup fuera de ventana se marca `FAILED` con "requiere template aprobada";
> nadie llama a `sendTemplate()`. Ese cableado es trabajo aparte.

> Se someten en **WhatsApp Manager → Account tools → Message templates → Create**.
> Idioma: **Español (es)**. Aprobación: ~1–2 días. Variables `{{n}}` deben ir en orden.
> El código las envía con `sendTemplate(to, name, "es", [var1, var2, ...])` — el ORDEN de
> las variables abajo es el que el código pasa. No cambies el orden sin avisar.

Estas son las que usa el motor de secuencias del agente (recordatorios + recuperación).
Cobranza y reactivación se hicieron manualmente → no se incluyen aquí.

---

## 1. `recordatorio_eval_24h` — Categoría: **Utility**
Recordatorio 24h antes de la primera sesión agendada (arranque de las dos semanas de evaluación).

**Body:**
```
¡Hola {{1}}! 👋 Mañana arrancas tus dos semanas de evaluación en {{2}} a las {{3}}. Llega 15 min antes para recibirte con calma. ¿Confirmas que vienes? 💪
```
**Variables (orden):** `{{1}}` = nombre · `{{2}}` = sede (ej. "La Cueva Xtreme") · `{{3}}` = hora (ej. "7:00")
**Ejemplo para el review:** Andrea · La Cueva Xtreme · 7:00

---

## 2. `recordatorio_eval_1h` — Categoría: **Utility**
Recordatorio **1 hora** antes (era 2h; Santiago lo movió a 1h el 21 sep 2026 —
más cerca del momento en que la persona decide si sale de casa).

**Body:** (idéntico al texto que arma `scheduleTrialReminders`)
```
¡Hola {{1}}! En una hora es tu primera sesión en {{2}} ({{3}}). Llega 15 min antes para tomarte los datos de tu evaluación. ¡Te esperamos! 📍💪
```
**Variables:** `{{1}}` = nombre · `{{2}}` = sede · `{{3}}` = hora
**Ejemplo:** Andrea · La Cueva Xtreme · 7:00

---

## 3. `noshow_recuperacion` — Categoría: **Marketing**
Se envía cuando el lead no asistió a su primera sesión (reofertar).

**Body:**
```
¡Hola {{1}}! 😊 Vimos que no pudiste venir a tu primera sesión. ¿La reagendamos? Tenemos cupos esta semana. Recuerda: entrenas dos semanas por tan solo $9 y aprovechas todo un proceso de evaluación de tu condición física y de salud. ¿Qué día te queda mejor?
```
**Variables:** `{{1}}` = nombre
**Ejemplo:** Andrea

---

## 4. `reengagement_no_reply` — Categoría: **Marketing**
Reabrir una conversación que quedó fría fuera de la ventana de 24h.

**Body:**
```
¡Hola {{1}}! 😊 ¿Arrancamos tus dos semanas en La Cueva? Entrena dos semanas por tan solo $9 y aprovecha todo un proceso de evaluación de tu condición física y de salud con datos científicos para saber cuál es el mejor entrenamiento para ti. Cuéntame qué día te queda mejor y lo agendamos. 💪
```
**Variables:** `{{1}}` = nombre
**Ejemplo:** Andrea

---

## 5. `miembro_inasistencia` — Categoría: **Marketing**
Fase 3 (retención). Se envía a un **miembro activo** que lleva varios días seguidos sin
asistir → abre una conversación de retención. Cuando el miembro responde, el bot conversa
en la ventana de 24h hasta que un admin retome.

**Body:**
```
¡Hola {{1}}! 💪 Te extrañamos en La Cueva estos días. ¿Todo bien? Cuéntanos si necesitas ayuda para retomar tu rutina o reacomodar tus horarios; aquí estamos para ti. 🙌
```
**Variables:** `{{1}}` = nombre
**Ejemplo:** Andrea
**Nota categoría:** es un check-in de retención a un cliente activo; si Meta la rechaza como
Marketing, reintentar como **Utility** (mensaje sobre su membresía/servicio vigente).

---

## Notas
- **Categoría correcta = aprobación más rápida.** Confirmado en la práctica: enviadas el 21 sep, `recordatorio_eval_1h`, `noshow_recuperacion` y `reengagement_no_reply` quedaron aprobadas en minutos. Los recordatorios (1, 2) son transaccionales sobre una cita que el lead agendó → **Utility**. Los que llevan la oferta "$9 por dos semanas de evaluación" (3, 4) son promocionales → **Marketing**.
- **Sin botones por ahora:** el cliente (`sendTemplate`) hoy solo mete variables en el body. Si más adelante queremos botones "Sí, confirmo / Reagendar", se amplía el cliente y se re-somete la template.
- **Números de teléfono / links** en el body pueden ralentizar la aprobación; por eso los mantengo fuera.
- **El cableado sigue pendiente.** `client.ts` ya expone `sendTemplate(to, name, "es", [vars])`, pero `processDueFollowups` no lo llama: fuera de la ventana marca FAILED y punto. Mientras no se conecte, tener las plantillas aprobadas no cambia nada en producción.
- **Gotcha del editor de Meta:** al escribir `{{` el editor inserta la variable completa (`{{1}}`) y deja el cursor después. Escribir `{{1}}` a mano produce `{{1}}}}`, y usar el botón "Add variable" recorta el espacio anterior (`¡Hola{{1}}`). Lo que funciona: escribir el texto de corrido y solo `{{` donde va cada variable.
