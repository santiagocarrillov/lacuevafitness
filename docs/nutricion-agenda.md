# Nutrición — portada, horarios y agendamiento propio (5 oct 2026)

**Portada** (`/dashboard/nutricion`, 3 columnas, estilo Practice Better):
- Izquierda: cobertura (al día / con cita / toca control / nunca), calculadora rápida
  (`calculateTarget`), atajos para armar dieta.
- Centro: próximas sesiones de 7 días por día, con atendido / no vino en un clic.
- Derecha: **Por agendar** (`src/lib/nutrition/to-schedule.ts`) y las tareas asignadas a quien mira.
  - **TRIAL**: todo socio en evaluación de $9 (membresía con plan `billingCycle = TRIAL`) sin cita,
    con fecha límite = un día antes de que venza; si cae sábado o domingo, el viernes (`trialDeadline`).
  - **MEDICIÓN**: socio ACTIVO con membresía pagada vigente y sin medición oficial ni consulta
    atendida en 18 semanas (dos ciclos SRXFIT); fecha límite a las 20 semanas.
  - Quien ya tiene una cita futura sale de la lista. Personal que entrena gratis, excluido.
  - "Enviar enlace para agendar": crea el enlace personal y abre WhatsApp desde el teléfono de la
    nutricionista con el mensaje escrito (no necesita plantilla). "Agendar yo" abre la cita a mano.

**Horarios** (`/dashboard/nutricion/horarios`): bloques semanales por sede (`NutritionAvailability`,
duración de cada cita) y días u horas sin atención (`NutritionTimeOff`). Lógica pura de espacios en
`src/lib/nutrition/slots.ts`: dentro del bloque, sin cruzarse con citas de la misma persona (en
cualquier sede), sin días libres, con 2 h de anticipación.

**Agendamiento propio** (`src/lib/nutrition/booking-core.ts`, candado por nutricionista):
- Portal: `/portal/nutricion/agendar` (tarjeta "Agenda tu cita" / "Cambiar horario").
- Enlace sin sesión: `/cita/[código]` (`NutritionBookingInvite`, 10 caracteres, vence a las 2
  semanas o 2 días después de la fecha límite). Es la URL del botón de las plantillas
  `nutricion_agenda_cita`, `nutricion_evaluacion_trial` y `socio_medicion_pendiente`.
- Si el socio ya tenía una cita futura, se mueve (no se duplica). Push al socio y a la nutricionista.

Migración `20261005150000_nutricion_horarios` (aplicada). Pruebas: `npm run test:nutricion-horarios`.
Pendiente: envío automático de las plantillas cuando Meta las apruebe; modo "consulta en vivo" del
editor de dietas.

## Modo consulta (dieta en vivo)

`/dashboard/nutricion/planes/socio/[id]/consulta` (`consult-view.tsx`): la nutricionista arma con el
socio presente su día tipo, comida por comida, sobre el mismo plan de menú del editor completo.
- Marcador fijo legible desde el otro lado del escritorio: anillo de kcal contra la meta, gramos de
  proteína/carbohidratos/grasa contra la meta, reparto de calorías por macro y "te faltan / te pasas".
- Cada cambio muestra el aviso "+124 kcal" (o "−") junto al total.
- Calorías escondidas en un toque (aceite, mantequilla, azúcar, mayonesa, queso, miel, leche, pan):
  usa la base de alimentos si lo tiene, si no valores de referencia.
- −/+ suma o quita una porción igual a la que se agregó; al final, "Usar este día para toda la
  semana", "Personalizar por día" o el editor completo para opciones e indicaciones.
- Se entra desde la portada ("Consulta en vivo"), al crear un plan (casilla) o con el botón del editor.
