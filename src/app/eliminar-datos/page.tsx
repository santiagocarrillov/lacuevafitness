import Link from "next/link";

export const metadata = {
  title: "Eliminación de datos · La Cueva",
  description: "Cómo solicitar la eliminación de tus datos personales en La Cueva Xtreme S.A.S.",
};

// Public page — used as the "User data deletion instructions" URL for Meta.
export default function EliminarDatosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-relaxed text-zinc-800">
      <h1 className="text-3xl font-bold text-zinc-900">Eliminación de tus datos</h1>
      <p className="mt-2 text-sm text-zinc-500">Última actualización: 10 de julio de 2026</p>

      <p className="mt-6">
        En <strong>La Cueva Xtreme S.A.S.</strong> respetamos tu derecho a eliminar tus datos
        personales. Puedes solicitar la eliminación de la información que tenemos sobre ti,
        incluidos tus datos de contacto, de membresía, de salud y tus conversaciones por WhatsApp.
      </p>

      <section className="mt-8 space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900">Cómo solicitarlo</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Escríbenos a{" "}
            <a className="text-blue-700 underline" href="mailto:lacuevafitness@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos">
              lacuevafitness@gmail.com
            </a>{" "}
            con el asunto <em>&ldquo;Solicitud de eliminación de datos&rdquo;</em>.
          </li>
          <li>Indícanos tu nombre completo y el teléfono o correo con el que estás registrado, para verificar tu identidad.</li>
          <li>Procesaremos tu solicitud y eliminaremos o anonimizaremos tus datos en un plazo razonable, salvo la información que debamos conservar por obligaciones legales o contables.</li>
        </ol>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900">Qué eliminamos</h2>
        <p>
          Eliminamos tus datos personales de nuestros sistemas. Cierta información puede
          conservarse de forma limitada cuando la ley lo exige (por ejemplo, comprobantes de pago).
        </p>
      </section>

      <p className="mt-8 text-sm text-zinc-500">
        Consulta también nuestra{" "}
        <Link className="text-blue-700 underline" href="/privacidad">
          Política de Privacidad
        </Link>.
      </p>
    </main>
  );
}
