# Templates de WhatsApp para aprobación (Meta)

> Se someten en **WhatsApp Manager → Account tools → Message templates → Create**.
> Idioma: **Español (es)**. Aprobación: ~1–2 días. Variables `{{n}}` deben ir en orden.
> El código las envía con `sendTemplate(to, name, "es", [var1, var2, ...])` — el ORDEN de
> las variables abajo es el que el código pasa. No cambies el orden sin avisar.

Estas son las que usa el motor de secuencias del agente (recordatorios + recuperación).
Cobranza y reactivación se hicieron manualmente → no se incluyen aquí.

---

## 1. `recordatorio_eval_24h` — Categoría: **Utility**
Recordatorio 24h antes de la evaluación agendada.

**Body:**
```
¡Hola {{1}}! 👋 Te recordamos tu evaluación en {{2}} mañana a las {{3}}. Llega 15 min antes para recibirte con calma. ¿Confirmas que vienes? 💪
```
**Variables (orden):** `{{1}}` = nombre · `{{2}}` = sede (ej. "La Cueva Xtreme") · `{{3}}` = hora (ej. "7:00")
**Ejemplo para el review:** Andrea · La Cueva Xtreme · 7:00

---

## 2. `recordatorio_eval_2h` — Categoría: **Utility**
Recordatorio 2h antes.

**Body:**
```
¡Hola {{1}}! En un par de horas es tu evaluación en {{2}} ({{3}}). ¡Te esperamos! 📍💪
```
**Variables:** `{{1}}` = nombre · `{{2}}` = sede · `{{3}}` = hora
**Ejemplo:** Andrea · La Cueva Xtreme · 7:00

---

## 3. `noshow_recuperacion` — Categoría: **Marketing**
Se envía cuando el lead no asistió a su evaluación (reofertar).

**Body:**
```
¡Hola {{1}}! 😊 Vimos que no pudiste venir a tu evaluación. ¿La reagendamos? Tenemos cupos esta semana. Recuerda: por $9 tienes 2 semanas de entrenamiento + tu evaluación de condición física. ¿Qué día te queda mejor?
```
**Variables:** `{{1}}` = nombre
**Ejemplo:** Andrea

---

## 4. `reengagement_no_reply` — Categoría: **Marketing**
Reabrir una conversación que quedó fría fuera de la ventana de 24h.

**Body:**
```
¡Hola {{1}}! 😊 ¿Seguimos con tu evaluación en La Cueva? Por $9 tienes 2 semanas de entrenamiento + una evaluación de condición física para armarte un plan a tu medida. Cuéntame qué día te queda mejor y lo agendamos. 💪
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
- **Categoría correcta = aprobación más rápida.** Los recordatorios (1, 2) son transaccionales sobre una cita que el lead agendó → **Utility**. Los que llevan la oferta $9 (3, 4) son promocionales → **Marketing**.
- **Sin botones por ahora:** el cliente (`sendTemplate`) hoy solo mete variables en el body. Si más adelante queremos botones "Sí, confirmo / Reagendar", se amplía el cliente y se re-somete la template.
- **Números de teléfono / links** en el body pueden ralentizar la aprobación; por eso los mantengo fuera.
- Tras aprobación, el motor de secuencias (`sequences.ts`) las usará automáticamente para envíos fuera de la ventana de 24h (hoy esos marcan FAILED a la espera de estas templates).
