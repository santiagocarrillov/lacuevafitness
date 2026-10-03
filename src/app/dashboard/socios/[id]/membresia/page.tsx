import { redirect } from "next/navigation";

// /membresia has no screen of its own — the Atrás button lands here from
// /membresia/nueva when there's no history, so send it to the ficha.
export default async function MembresiaIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/socios/${id}`);
}
