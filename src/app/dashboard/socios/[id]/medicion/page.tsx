import { redirect } from "next/navigation";

// /medicion has no screen of its own — the Atrás button lands here from a
// measurement screen when there's no history, so send it to the ficha.
export default async function MedicionIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/socios/${id}`);
}
