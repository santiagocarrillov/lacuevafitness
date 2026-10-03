import { redirect } from "next/navigation";

// /laboratorio has no screen of its own — the Atrás button lands here from a
// lab screen when there's no history, so send it to the ficha.
export default async function LaboratorioIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/socios/${id}`);
}
