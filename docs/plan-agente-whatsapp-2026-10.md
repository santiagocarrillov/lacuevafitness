# Plan: agente de ventas de WhatsApp (octubre 2026)

Diagnóstico del 16-oct-2026 (solo lectura, datos de la app). Meta: 110 socios pagando por sede al 31-ene-2027 y 10–20 % de socios nuevos por semana.

## Dónde estamos

- **El agente responde rápido y bien:** mediana de 14 segundos; nadie se queda sin respuesta.
- **El agente casi no hace seguimiento:**
  - De 410 conversaciones abiertas, 364 llevan más de 72 h en silencio y 317 más de 7 días.
  - Solo 84 recibieron algún mensaje programado, y casi todos fueron recordatorios de la prueba.
  - Los seguimientos NO_REPLY (2 h, 1 día, 3 días) existen en el código, pero nada los programa. Solo los crea un script manual.
- **Los leads "calientes" están fríos:**
  - De los 53 en NEGOTIATING, 36 llevan más de 7 días sin cambio.
  - De los 20 con prueba hecha, 13 llevan más de 7 días sin cambio.
  - Hay 297 en CONTACTED, y 218 de ellos tienen entre 8 y 30 días.
- **Los seguimientos que sí salieron funcionan:**
  - 23 % contestó al NO_REPLY_1D.
  - 24 % contestó a la recuperación de no-show.
  - 35 % de los que terminaron la prueba de $9 compró un plan. El cierre después de la prueba es el paso que mejor convierte, y hoy el agente no lo hace.
- **Socios actuales: el agente no hace nada.**
  - Si un socio escribe, el bot se pausa (cambia con el modo socio, ver abajo).
  - Los avisos de socio (ausencia, frecuencia baja, cumpleaños, nutrición) están apagados.
  - No hay recordatorio de renovación.
  - 21 socios vencen en los próximos 14 días, 4 de ellos hoy. 11 no han venido en 14 días.
- **La métrica de "pagando" está inflada:** el 115 cuenta también las pruebas de $9. Socios que pagan de verdad hay 99 (45 FC y 54 Xtreme). La brecha real contra 110 por sede es de unos 65 en FC y 56 en Xtreme.
- **Los pagos no están conciliados:** desde el 8-oct solo hay 1 pago registrado, aunque se crearon 19 membresías pagadas. Mientras no se crucen los bancos con la app, el agente no cobra a nadie.

## Plan por fases

### Fase 0 · Esta semana (prerrequisitos)
1. **Conciliar pagos:** Santiago manda las transferencias de FC y Xtreme, Claude las cruza con la app y se registran los pagos que falten. Sin esto no se encienden las fases 3 y 4.
2. **Corregir la métrica:** "socios pagando" sin las pruebas de $9, en el colector del Command Center y en el Brain.
3. **Plantillas nuevas en Meta:** hoy solo hay 2 para leads. Redactarlas y mandarlas a aprobar (abajo). Fuera de la ventana de 24 h solo se puede escribir con plantilla aprobada.

### Fase 1 · Cadencia automática para leads (lo que más mueve socios)
- **Cadencia para leads que no contestan:**
  - Día 1: texto libre si sigue abierta la ventana de 24 h.
  - Días 3, 7 y 14: plantilla.
  - Se corta sola si el lead contesta, agenda, se convierte o pide que no le escriban.
- **El código programa los NO_REPLY_*:** cuando nuestro mensaje queda sin respuesta, se agendan solos. Ya no dependen del script manual.
- **Orden de la primera tanda:**
  1. NEGOTIATING (53)
  2. Prueba hecha sin compra (20)
  3. No-show (30)
  4. CONTACTED de 8–30 días (218)
- **Tope diario:** pasar el tope de plantillas de 15/día a 25 y después a 40, mirando la calidad del número en Meta y el costo por conversación de marketing.
- **Horario:** se mantiene la ventana de envío de 08:00 a 21:00.

### Fase 2 · La prueba de $9 hasta el cierre
- **Durante la prueba:** check-in el día 3 ("¿cómo te fue en tus primeras clases?") y el día 7 (progreso y horario).
- **Cierre a los días 12–14:** oferta de plan con fecha límite y link de pago. Si no compra, el lead pasa a la cadencia del día 14.
- **Personal:** la tarea automática "trialclose" que hoy va al equipo se queda como respaldo cuando el lead pide hablar con alguien.
- **Hecho (20 oct 2026, `src/lib/whatsapp/trial-touches.ts`):**
  - Tres avisos nuevos en WhatsApp › Avisos, **apagados** hasta que Santiago los prenda:
    - `PRUEBA_DIA3`, plantilla `prueba_checkin`: cómo se ha sentido y qué le impide venir.
    - `PRUEBA_DIA7`, plantilla `prueba_mitad`: entrenamientos registrados y la meta de 3 por semana.
    - `PRUEBA_CIERRE`, plantilla `prueba_cierre`: 3 días antes del final. Sentarse con su coach, ver resultados y elegir plan ($50, o desde $40 con débito y prepago).
  - Uno por prueba, a las 10:00, nunca en domingo. No le llega a quien ya paga mensualidad.
  - El agente de ventas sabe quién está en su prueba: en qué día va, cuándo termina y cuántos entrenamientos lleva. No le vuelve a ofrecer los $9, no agenda «primera sesión», no le cambia la etapa del embudo y no le arranca la cadencia de leads. En los últimos días cierra con la escalera de precio.
  - Cambios frente al plan:
    - No hay link de pago. La inscripción es en recepción, y si la persona quiere pagar por transferencia pasa a una persona.
    - El cierre ya no sale a 2 días o menos del final: ahí manda la tarea «Cierre de trial» del staff.
    - Quien no compra NO entra a la cadencia de leads (esa cadencia ofrece los $9).
  - Prueba: `npm run test:prueba`.

### Fase 3 · Renovaciones (después de la Fase 0)
- **Recordatorio de renovación:** 7 días antes, 3 días antes y el día del vencimiento, con el link de pago o el pago en recepción.
- **Sin datos de pago:** a quien no se le pueda confirmar el pago se le recuerda que su plan vence. No se le trata como moroso.
- **El agente responde a socios:** contesta preguntas simples (horarios, su plan, cómo renovar) en vez de pausarse siempre. Lo que sea de cobros o reclamos va al equipo.

### Fase 4 · Socios en riesgo (después de la Fase 0)
- **Avisos de socio:** encender `socio_ausencia` (más de 10–14 días sin asistir) y `socio_frecuencia_baja`, con las plantillas aprobadas en Meta.
- **Protección:** nada sale a quien tenga un pago sin conciliar.

### Fase 5 · Agente con contexto
- **Qué sabe del lead:** a cada respuesta se le pasa la etapa, los días en silencio, el resultado de la prueba y la sede conocida. Hoy `knownSede` es siempre null, y por eso 264 de los 297 en CONTACTED quedan en FC por defecto.
- **Herramientas:** cupos o horarios reales y el estado de la membresía cuando escribe un socio.

### Medición (desde la Fase 1)
- **Embudo semanal por sede:**
  - leads nuevos → agendados → asistieron → pagaron
  - costo por socio pagado (gasto en Meta ÷ socios nuevos)
- **Respuesta por paso:** % de respuesta y de conversión de cada paso de la cadencia.
- **En el Brain:** el Brain lee este embudo en vez de la cifra actual de "convertidos", que se queda corta.

## Plantillas para aprobar en Meta (borrador de nombres)

| Plantilla | Para qué |
|---|---|
| `lead_dia3` | Recordar la oferta de $9 / 2 semanas, con pregunta abierta |
| `lead_dia7` | Prueba social: resultado de un socio real + invitación |
| `lead_dia14` | Último aviso: "¿te guardo el cupo o lo dejamos para más adelante?" |
| `prueba_checkin` | Check-in del día 3 y del día 7 de la prueba |
| `prueba_cierre` | Oferta de plan al terminar la prueba |
| `renovacion_7d` / `renovacion_hoy` | Renovación con link de pago |

Los textos los aprueba Santiago antes de mandarlos a Meta: tuteo ecuatoriano, sin voseo.

## Decisiones de Santiago
1. ¿Arrancamos por la Fase 1 (leads) mientras se concilian los pagos?
2. ¿Hasta cuántas plantillas por día está dispuesto a pagar? Las conversaciones de marketing tienen costo en Meta.
3. ¿El agente contesta a socios o solo a leads?
4. ¿Hay link de pago para renovación, o la renovación es solo en recepción o por transferencia?

---

## Reglas de seguimiento y skill de ventas (16-oct-2026, tarde)

Pedido de Santiago: seguimiento **siempre** y a tiempo, para leads y para socios, ofreciendo
soluciones; y mensajes basados en la ciencia de ventas. Los principios quedaron en el skill
`ventas-conversacionales` (`~/.claude/skills/ventas-conversacionales/`), reutilizable en otros
agentes (p. ej. Bella). Lo propio de La Cueva sigue en `docs/whatsapp-sales-playbook.md`.

### Leads que no contestan (detalla la Fase 1)
Se cuenta desde **nuestro** último mensaje sin respuesta. Se corta si contesta, agenda, paga,
pide que no le escriban o un humano toma la conversación.

| Cuándo | Vía | Contenido |
|---|---|---|
| +3 h | texto libre (gratis, dentro de la ventana) | Lo escribe el agente con el contexto: pregunta fácil de contestar |
| +20–22 h (antes de que cierre la ventana; si cae de noche, se adelanta a las 20:30) | texto libre | Motivo que rota por conversación (horario concreto, oferta $9, su objetivo, miedo a empezar) o la duda que dejó + pregunta de "no" con sus palabras |
| Día 3 | plantilla `lead_dia3` | Oferta $9 con pregunta abierta |
| Día 7 | plantilla `lead_dia7` | Caso real parecido + invitación |
| Día 14 | plantilla `lead_dia14` | Despedida estilo Voss: "¿Ya descartaste la idea de empezar a entrenar?" |
| Día 45 | plantilla (reactivación) | Algo nuevo: reto, promo de temporada |

Los dos primeros son gratis y los escribe el agente en vivo, retomando lo que el lead dijo
(no texto fijo). Hoy NO_REPLY_2H/1D/3D existen pero nada los programa.

> **Ajuste del 19 oct 2026 (corte de 28 seguimientos, ≈21 % contesta):** si el lead pide que le
> escribamos en otra fecha, la cadencia se corta y queda una tarea de WhatsApp para ese día en
> la sede del lead (`postpone.ts`); el toque de ~22 h rota el motivo y rechaza la fórmula gastada;
> nadie pregunta "¿Fitness o Xtreme?": se pregunta el sector. `npm run test:cadencia`.

### Socios que dejan de venir (detalla la Fase 4)
> **Hecho (16 oct 2026, rama `feat/retencion-socios-whatsapp`):** regla por ritmo en
> `src/lib/whatsapp/absence-rhythm.ts` (`npm run test:ausencia`), modo socio del agente
> (`member-mode.ts`, `member-agent-runner.ts`, `MEMBER_SYSTEM_PROMPT`; `npm run test:modo-socio`)
> detrás de `WHATSAPP_AGENT_SOCIOS=true`, y la escalera 7/14 días en `src/lib/tasks/auto.ts`.
> Corrida en seco: `npx tsx --env-file=.env scripts/ausencia-en-seco.ts`.

- **Disparador: 2 sesiones esperadas perdidas**, según su ritmo de las 4 semanas que terminan
  en su última visita. Quien viene a diario: 2 días hábiles. Quien viene L-M-V: al faltar 2 de
  esos días. Quien tiene más días habituales que visitas (1,5/sem repartidas en L-M-X) se
  pondera: cada día suyo vale lo que suele venir. Nuevos (< 2 semanas): como si vinieran 3
  por semana (3 días hábiles). Menos de 1,5/sem: sin aviso (los cubren las tareas). Solo sale
  en la 2.ª o 3.ª sesión perdida; nunca como aviso atrasado.
- **Mensaje:** plantilla `socio_ausencia` (ya redactada). Si el socio contesta, el agente
  conversa en "modo socio": nombra el problema, ofrece una solución concreta (horario, rutina
  más corta, coach, nutricionista, pausa) y cierra con "¿qué día vuelves?". Lesiones, cobros y
  reclamos pasan a una persona.
- **Escalera:** 7 días sin venir → tarea al admin de la sede; 14 días → llamada.

### Cómo entra el skill al agente
1. Sección nueva en el `SYSTEM_PROMPT` ("Cómo vendes"): una pregunta por mensaje, espejo,
   etiqueta, preguntas calibradas, cierre con dos horarios, despedida estilo Voss, prueba
   social solo real. Corta, para no subir el costo por mensaje.
2. Un modo "seguimiento" para que el agente escriba los toques de +3 h y +21 h.
3. Probar con `npm run test:agent` sobre 20 conversaciones reales antes de prenderlo, y medir
   respuesta por paso contra lo de hoy (23 % al NO_REPLY_1D).
