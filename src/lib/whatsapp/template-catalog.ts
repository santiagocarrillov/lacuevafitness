// Member and nutrition templates to submit to Meta (pure — client-safe).
// The text here IS what gets submitted, and once approved it must not change:
// Meta only sends the exact approved body. Variables {{n}} go in order; the
// examples are what Meta's reviewer sees. URL buttons carry their own {{1}}
// (the booking token), independent of the body variables.
// Texts approved by Santiago with his edits (5 oct 2026). docs/whatsapp-templates.md

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
    name: "socio_ausencia",
    category: "UTILITY",
    label: "Días sin venir",
    when: "Socio activo que lleva 3 días seguidos sin asistir (una vez por ausencia).",
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
