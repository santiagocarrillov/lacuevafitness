import Link from "next/link";

export const metadata = {
  title: "Política de Privacidad · La Cueva",
  description: "Política de privacidad de La Cueva Xtreme S.A.S.",
};

// Public page (not behind auth) — used as the app's Privacy Policy URL for Meta
// and the member portal. Plain, self-contained styling so it renders cleanly.
export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-relaxed text-zinc-800">
      <h1 className="text-3xl font-bold text-zinc-900">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-zinc-500">Última actualización: 10 de julio de 2026</p>

      <Section title="1. Responsable del tratamiento">
        <p>
          <strong>La Cueva Xtreme S.A.S.</strong> (&ldquo;La Cueva&rdquo;, &ldquo;nosotros&rdquo;),
          con sedes en Sangolquí, Ecuador, es responsable del tratamiento de los datos
          personales descritos en esta política. Para cualquier consulta sobre privacidad o
          para ejercer tus derechos, escríbenos a{" "}
          <a className="text-blue-700 underline" href="mailto:lacuevafitness@gmail.com">
            lacuevafitness@gmail.com
          </a>.
        </p>
      </Section>

      <Section title="2. Qué datos recopilamos">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Identificación y contacto:</strong> nombre, teléfono, correo electrónico, dirección, fecha de nacimiento y contacto de emergencia.</li>
          <li><strong>Datos de salud y condición física (datos sensibles):</strong> composición corporal, marcadores clínicos, resultados de tests físicos, objetivos y planes de entrenamiento y nutrición.</li>
          <li><strong>Datos de membresía y pagos:</strong> plan contratado, historial de pagos, método de pago y datos de la transacción.</li>
          <li><strong>Asistencia:</strong> registro de tus visitas y clases.</li>
          <li><strong>Comunicaciones:</strong> los mensajes que intercambias con nosotros por WhatsApp u otros canales.</li>
        </ul>
      </Section>

      <Section title="3. Para qué usamos tus datos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Gestionar tu membresía, asistencia y pagos.</li>
          <li>Prescribir y hacer seguimiento de tu entrenamiento (método SRXFIT) y de tu plan nutricional.</li>
          <li>Comunicarnos contigo, agendar tu evaluación y darte atención y seguimiento, incluyendo el uso de un <strong>asistente automatizado (inteligencia artificial)</strong> que puede responder tus mensajes de WhatsApp.</li>
          <li>Cumplir obligaciones legales y mejorar nuestros servicios.</li>
        </ul>
        <p className="mt-2">
          Tratamos tus datos con base en tu <strong>consentimiento</strong>, en la ejecución de
          tu relación como socio y en nuestras obligaciones legales. Los datos de salud se
          tratan con tu consentimiento explícito y con acceso restringido al personal autorizado.
        </p>
      </Section>

      <Section title="4. WhatsApp y comunicación automatizada">
        <p>
          Nuestra comunicación por WhatsApp se realiza a través de la plataforma{" "}
          <strong>WhatsApp Business (Meta Platforms)</strong>. Al escribirnos, tus mensajes son
          procesados para atenderte, y parte de las respuestas pueden ser generadas por un
          asistente automatizado. En cualquier momento puedes pedir hablar con una persona.
        </p>
      </Section>

      <Section title="5. Con quién compartimos datos">
        <p>No vendemos tus datos personales. Los compartimos únicamente con proveedores que nos ayudan a operar, bajo obligaciones de confidencialidad:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Proveedores de infraestructura y hosting</strong> (bases de datos y almacenamiento seguro).</li>
          <li><strong>Proveedores de mensajería</strong> (WhatsApp / Meta) para la comunicación.</li>
          <li><strong>Proveedores de inteligencia artificial</strong> que procesan los mensajes para generar respuestas del asistente.</li>
          <li>Autoridades, cuando la ley lo exija.</li>
        </ul>
      </Section>

      <Section title="6. Conservación">
        <p>
          Conservamos tus datos mientras seas socio y durante el tiempo necesario para cumplir
          fines legales, contables y de seguimiento. Luego los eliminamos o anonimizamos.
        </p>
      </Section>

      <Section title="7. Seguridad">
        <p>
          Aplicamos medidas técnicas y organizativas razonables para proteger tus datos. El
          acceso a datos de salud y clínicos está restringido al personal autorizado.
        </p>
      </Section>

      <Section title="8. Tus derechos">
        <p>
          De acuerdo con la Ley Orgánica de Protección de Datos Personales del Ecuador, tienes
          derecho a acceder, rectificar, actualizar, eliminar tus datos, oponerte a su
          tratamiento y retirar tu consentimiento. Para ejercerlos, escríbenos a{" "}
          <a className="text-blue-700 underline" href="mailto:lacuevafitness@gmail.com">
            lacuevafitness@gmail.com
          </a>{" "}
          o revisa cómo{" "}
          <Link className="text-blue-700 underline" href="/eliminar-datos">
            eliminar tus datos
          </Link>.
        </p>
      </Section>

      <Section title="9. Menores de edad">
        <p>
          El tratamiento de datos de menores de edad se realiza con el consentimiento y bajo la
          responsabilidad de su padre, madre o representante legal.
        </p>
      </Section>

      <Section title="10. Cambios a esta política">
        <p>
          Podemos actualizar esta política. Publicaremos la versión vigente en esta página con su
          fecha de actualización.
        </p>
      </Section>

      <Section title="11. Contacto">
        <p>
          La Cueva Xtreme S.A.S. — Sangolquí, Ecuador.{" "}
          <a className="text-blue-700 underline" href="mailto:lacuevafitness@gmail.com">
            lacuevafitness@gmail.com
          </a>
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 space-y-2">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}
