// Member, nutrition and lead-cadence templates to submit to Meta (pure — client-safe).
// The text here IS what gets submitted, and once approved it must not change:
// Meta only sends the exact approved body. Variables {{n}} go in order; the
// examples are what Meta's reviewer sees. URL buttons carry their own {{1}}
// (the booking token), independent of the body variables.
// Texts approved by Santiago with his edits (5 oct 2026). docs/whatsapp-templates.md
// lead_dia7 / lead_dia14 (16 oct 2026): drafts for Santiago to approve before
// submitting from WhatsApp › Plantillas; until Meta approves them the day-7 and
// day-14 touches are canceled, not sent (sequences.ts).

export type CatalogTemplate = {
  name: string;
  category: "UTILITY" | "MARKETING";
  /** Short Spanish label for staff screens. */
  label: string;
  /** When the app sends it. */
  when: string;
  body: string;
  /** What each body variable is, in order. */
  variables: string[];
  example: string[];
  button?: { text: string; url: string; example: string };
};

export const BOOKING_URL = "https://www.lacuevasrxfit.com/cita/{{1}}";
const BOOKING_EXAMPLE = "https://www.lacuevasrxfit.com/cita/k3m9q2";

export const TEMPLATE_CATALOG: CatalogTemplate[] = [
  {
    name: "lead_dia7",
    category: "MARKETING",
    label: "Lead: ¿qué te frena?",
    when: "Lead que no contesta hace 7 días (cadencia de seguimiento; se corta si contesta o agenda).",
    body: "¡Hola {{1}}! 👋 Hace unos días hablamos de tus dos semanas de evaluación en La Cueva por $9. ¿Qué es lo que más te frena para empezar: el horario, el precio u otra cosa? Respóndeme y lo resolvemos juntos. 💪",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  {
    name: "lead_dia14",
    category: "MARKETING",
    label: "Lead: ¿ya lo descartaste?",
    when: "Lead que no contesta hace 14 días: último toque de la cadencia, permite decir que no.",
    body: "¡Hola {{1}}! ¿Ya descartaste la idea de empezar a entrenar? 🙂 Si es así, no hay problema y no te escribo más por ahora. Y si solo ha sido falta de tiempo, respóndeme y te ayudo a encontrar un horario que te quede.",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  // No-show rescue, touches 2 and 3 (22 oct 2026; trial-attendance.ts). The first
  // one is noshow_recuperacion (approved 21 sep). Until Meta approves these, the
  // day-3 and day-7 touches wait PENDING instead of being canceled (sequences.ts).
  {
    name: "noshow_dia3",
    category: "MARKETING",
    label: "No-show: ¿fue el horario?",
    when: "3 días después de faltar a su primera sesión, si no contestó el primer mensaje (se corta si contesta o reagenda).",
    body: "¡Hola {{1}}! 👋 Te escribo de La Cueva. A veces el día se complica y no se llega a la primera sesión. ¿Fue por el horario? Dime qué día y a qué hora te queda mejor y te aparto un cupo; tus dos semanas por $9 siguen en pie. 💪",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  {
    name: "noshow_dia7",
    category: "MARKETING",
    label: "No-show: ¿lo dejamos para después?",
    when: "7 días después de faltar a su primera sesión: último mensaje; ese día recepción recibe una tarea para llamarle.",
    body: "¡Hola {{1}}! ¿Prefieres dejar tus dos semanas de evaluación en La Cueva para más adelante? 🙂 Si es así, no hay problema: respóndeme con la fecha y te escribo ese día. Y si quieres arrancar esta semana, dime qué horario te queda y te agendo.",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  // The $9 trial, first session to close (plan Fase 2, 20 oct 2026; trial-touches.ts).
  // Drafts for Santiago to approve before submitting: once Meta approves, the text is frozen.
  {
    name: "prueba_checkin",
    category: "UTILITY",
    label: "Prueba: ¿cómo te has sentido?",
    when: "Día 3 de las dos semanas de evaluación ($9): check-in (aviso PRUEBA_DIA3).",
    body: "¡Hola {{1}}! 👋 ¿Cómo te has sentido en tus primeros días de evaluación en La Cueva? Cuéntanos si algo te molestó o si te está costando cuadrar el horario, y lo resolvemos con tu coach. 💪",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  {
    name: "prueba_mitad",
    category: "UTILITY",
    label: "Prueba: vas por la mitad",
    when: "Día 7 de las dos semanas de evaluación: entrenamientos hasta hoy y meta de 3 por semana (aviso PRUEBA_DIA7).",
    body: "¡Hola {{1}}! Ya vas por la mitad de tus dos semanas de evaluación en La Cueva. Entrenamientos registrados hasta hoy: {{2}}. Para que tu evaluación salga completa, lo ideal es venir al menos 3 veces por semana. ¿Qué días te quedan mejor esta semana?",
    variables: ["nombre", "entrenamientos registrados"],
    example: ["Andrea", "3"],
  },
  {
    name: "prueba_cierre",
    category: "MARKETING",
    label: "Prueba: cierre a la mensualidad",
    when: "3 días antes de que terminen las dos semanas de evaluación: ver resultados con el coach y elegir plan (aviso PRUEBA_CIERRE).",
    body: "¡Hola {{1}}! 🎯 Tus dos semanas de evaluación en La Cueva terminan el {{2}}. Antes de esa fecha, siéntate 10 minutos con tu coach: te mostramos tus resultados y eliges cómo seguir. Si te inscribes al terminar tu prueba, tu mensualidad queda en $50 (o desde $40 con débito automático y prepago) en vez de $60. ¿Qué día te queda mejor?",
    variables: ["nombre", "último día de la prueba"],
    example: ["Andrea", "jueves 23 de octubre"],
  },
  {
    name: "socio_ausencia",
    category: "UTILITY",
    label: "Días sin venir",
    when: "Socio activo que perdió 2 de sus sesiones habituales según su ritmo (una vez por ausencia).",
    body: "¡Hola {{1}}! 👋 Esperamos que estés muy bien. Llevas {{2}} días sin venir a entrenar a La Cueva. Te extrañamos. Si necesitas ayuda o podemos ser de servicio para que puedas retomar, respóndenos y será un placer. 💪",
    variables: ["nombre", "días sin venir"],
    example: ["Andrea", "3"],
  },
  {
    name: "socio_frecuencia_baja",
    category: "UTILITY",
    label: "Viene menos de 3 veces por semana",
    when: "Socio activo que en las últimas 2 semanas promedia menos de 3 visitas por semana (máximo una vez al mes).",
    body: "¡Hola {{1}}! Estas dos últimas semanas entrenaste {{2}} veces por semana en promedio. Si bien es algo motivante, tus resultados serán mucho mejores si llegas al menos a 3 sesiones semanales. Cuéntanos si te podemos ayudar en algo para lograrlo. Respóndenos y lo vemos juntos. 💪",
    variables: ["nombre", "visitas por semana"],
    example: ["Andrea", "2"],
  },
  {
    name: "socio_cumpleanos",
    category: "MARKETING",
    label: "Feliz cumpleaños",
    when: "El día del cumpleaños de cada socio activo, a media mañana.",
    body: "¡Feliz cumpleaños, {{1}}! 🎉 Todo el equipo de La Cueva te desea lo mejor de lo mejor: un gran año lleno de salud, metas cumplidas y bendiciones. ¡Gracias por entrenar con nosotros! 💪🎂",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  {
    name: "socio_tests_pendientes",
    category: "UTILITY",
    label: "Faltan tus tests SRXFIT",
    when: "Solo después de que el admin de la sede intentó hacerle los tests y no pudo (lo marca en la tarea).",
    body: "¡Hola {{1}}! Confiamos en que estés de lo mejor. Te escribimos porque no tenemos registrados tus tests SRXFIT de este ciclo. Sin ellos no puedes ver tu progreso en la app ni podemos ajustar bien tu entrenamiento. ¿Qué día de esta semana puedes hacerlos con tu coach? Respóndenos y lo coordinamos.",
    variables: ["nombre"],
    example: ["Andrea"],
  },
  {
    name: "nutricion_agenda_cita",
    category: "UTILITY",
    label: "Agenda tu cita nutricional",
    when: "Socio con cita nutricional pendiente de agendar (la nutricionista lo envía desde su panel).",
    body: "¡Hola {{1}}! 🥗 Es hora de tu cita con la nutricionista. Entendemos que a veces se nos complica por tiempos, pero medirte y revisar tu alimentación es clave para tu progreso, salud y longevidad. Elige el día y la hora que mejor te queden con el botón de abajo; toma menos de un minuto.",
    variables: ["nombre"],
    example: ["Andrea"],
    button: { text: "Elegir horario", url: BOOKING_URL, example: BOOKING_EXAMPLE },
  },
  {
    name: "nutricion_evaluacion_trial",
    category: "UTILITY",
    label: "Cita nutricional del trial",
    when: "Al pagar las dos semanas de evaluación ($9): agenda la cita antes de la fecha límite.",
    body: "¡Hola {{1}}! Tus dos semanas de evaluación en La Cueva incluyen una cita con nuestra nutricionista: medimos tu composición corporal y revisamos tu alimentación. Agéndala antes del {{2}} con el botón de abajo. 🥗",
    variables: ["nombre", "fecha límite"],
    example: ["Andrea", "jueves 9 de octubre"],
    button: { text: "Elegir horario", url: BOOKING_URL, example: BOOKING_EXAMPLE },
  },
  {
    name: "nutricion_recordatorio_cita",
    category: "UTILITY",
    label: "Recordatorio de cita nutricional",
    when: "El día anterior a la cita, junto con la notificación de la app.",
    body: "¡Hola {{1}}! Te recordamos tu cita con la nutricionista {{2}} a las {{3}} en {{4}}. Si no puedes asistir, respóndenos para cambiarla. 🥗",
    variables: ["nombre", "día", "hora", "sede (la de la cita)"],
    example: ["Andrea", "mañana jueves 9 de octubre", "17:30", "La Cueva Fitness Center"],
  },
  {
    name: "socio_medicion_pendiente",
    category: "UTILITY",
    label: "Hace tiempo que no te medimos",
    when: "Socio activo sin mediciones en dos ciclos SRXFIT (18 semanas).",
    body: "¡Hola {{1}}! Hace más de {{2}} semanas que no registramos tus medidas en La Cueva, y sin ellas la app no puede mostrarte tu progreso. Agenda un pesaje rápido con la nutricionista con el botón de abajo. 📏",
    variables: ["nombre", "semanas"],
    example: ["Andrea", "18"],
    button: { text: "Elegir horario", url: BOOKING_URL, example: BOOKING_EXAMPLE },
  },
];

/** The Graph API payload for POST /{waba}/message_templates. */
export function metaPayload(t: CatalogTemplate) {
  const components: Record<string, unknown>[] = [
    { type: "BODY", text: t.body, ...(t.example.length ? { example: { body_text: [t.example] } } : {}) },
  ];
  if (t.button) {
    components.push({ type: "BUTTONS", buttons: [{ type: "URL", text: t.button.text, url: t.button.url, example: [t.button.example] }] });
  }
  return { name: t.name, language: "es", category: t.category, components };
}
