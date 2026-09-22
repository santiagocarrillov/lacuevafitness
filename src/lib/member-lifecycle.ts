/**
 * Cuándo cambia el estado de un socio — y quién lo decide.
 *
 * Complemento de [`member-status.ts`], que define qué significa cada estado.
 * Aquí está la otra mitad: **el estado lo decide lo que la persona compró, no lo
 * que alguien tecleó en un formulario.**
 *
 * El 22 sep 2026 encontramos a cinco personas marcadas como socios activos cuya
 * única membresía eran las dos semanas de evaluación de $9. No fue descuido de
 * nadie: `assignMembership` ponía `ACTIVE` sin mirar el plan, y el KPI de socios
 * activos —el que dice si el negocio crece— los contaba.
 *
 * El criterio de Santiago: **los $9 NO son una venta.** Las dos semanas son un
 * lead magnet al precio de los gimnasios del sector ($20/mes) para que la gente
 * vea el proceso y entienda por qué La Cueva cobra más. Activo es quien paga la
 * mensualidad. Quien no pasa de evaluación a activo vino solo por precio, y esa
 * tasa de paso es el número que dirá si el trabajo se hizo bien.
 *
 * Por eso manda el ciclo de facturación del plan:
 *   TRIAL                  → socio en evaluación
 *   MONTHLY/QUARTERLY/…    → socio activo
 *   ONE_TIME (pase diario) → no promueve a nadie
 *
 * Lo del pase diario es deliberado: quien cae un día suelto no es socio, y
 * marcarlo activo inflaría el mismo KPI por otra puerta.
 */

import { phoneKey } from "@/lib/whatsapp/contact";
import { SQL_ACCENTS_FROM, SQL_ACCENTS_TO, foldText } from "@/lib/whatsapp/search";
import type { BillingCycle, LeadStage, MemberStatus, Prisma } from "@/generated/prisma/client";

/** Estado que implica este plan, o null si el plan no cambia el estado de nadie. */
export function memberStatusForPlan(cycle: BillingCycle): MemberStatus | null {
  if (cycle === "TRIAL") return "TRIAL";
  if (cycle === "ONE_TIME") return null;
  return "ACTIVE";
}

/**
 * Etapa del embudo que corresponde a un estado de socio. La traducción entre las
 * dos tablas vive en un solo sitio a propósito: el 22 sep el lead de Denisse
 * decía "negociando con Fitness Center" mientras ella ya entrenaba en Xtreme.
 */
export function leadStageForMemberStatus(status: MemberStatus): LeadStage | null {
  if (status === "TRIAL") return "TRIAL_ATTENDED"; // se lee "En evaluación"
  if (status === "ACTIVE") return "CONVERTED"; // "Socio activo": paga mensualidad
  return null;
}

/**
 * Ata el socio a su lead, si hay uno que sea inequívocamente la misma persona.
 *
 * Esta es la enfermedad de fondo: **1437 de 1441 socios tenían `leadId` en
 * null**, así que el embudo no se enteraba de nada de lo que pasaba en el
 * gimnasio.
 *
 * **Teléfono Y nombre, nunca solo teléfono.** Los celulares se comparten en
 * familia: el 0984505143 está en la ficha de socio de Santiago Carrillo y
 * también en el lead de *Emilia* Carrillo. Atar por número habría fusionado a
 * dos personas distintas, que es mucho peor que no atar nada. Por eso se exige
 * que el primer nombre coincida (sin tildes ni mayúsculas).
 *
 * Es deliberadamente conservador: "Verito" no se ata a "Veronica" y hay que
 * hacerlo a mano. Un vínculo que falta se arregla; uno equivocado corrompe el
 * historial de dos personas y nadie se entera.
 *
 * El teléfono se compara por los últimos 9 dígitos porque el mismo celular vive
 * como "0986615931" en la ficha y como "593986615931" en WhatsApp.
 */
export async function linkMemberToLead(
  tx: Prisma.TransactionClient,
  memberId: string,
): Promise<string | null> {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { id: true, leadId: true, phone: true, firstName: true },
  });
  if (!member) return null;
  if (member.leadId) return member.leadId;

  const key = phoneKey(member.phone);
  if (!key) return null;
  const first = foldName(member.firstName);
  if (!first) return null;

  // Un lead que ya tomó otro socio no se roba: Lead ↔ Member es 1:1.
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT l.id
    FROM "Lead" l
    LEFT JOIN "Member" m ON m."leadId" = l.id
    WHERE m.id IS NULL
      AND length(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g')) >= 9
      AND right(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), 9) = ${key}
      AND translate(lower(split_part(btrim(coalesce(l."firstName", '')), ' ', 1)),
                    ${SQL_ACCENTS_FROM}, ${SQL_ACCENTS_TO}) = ${first}
    ORDER BY l."createdAt" DESC
    LIMIT 1
  `;
  const leadId = rows[0]?.id;
  if (!leadId) return null;

  await tx.member.update({ where: { id: member.id }, data: { leadId } });
  return leadId;
}

/**
 * Primer nombre, sin tildes ni mayúsculas, para comparar socio contra lead.
 * Exportada para poder fijar en una prueba los casos reales que importan.
 */
export function foldName(name: string | null): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? foldText(first) : null;
}

/**
 * Deja el embudo diciendo lo mismo que el gimnasio.
 *
 * Solo avanza: a un socio activo no se le devuelve a "en evaluación" por
 * registrarle otra cosa, y una etapa de salida no se pisa sin querer.
 */
export async function syncLeadFromMember(
  tx: Prisma.TransactionClient,
  memberId: string,
): Promise<void> {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { leadId: true, status: true },
  });
  if (!member?.leadId) return;

  const target = leadStageForMemberStatus(member.status);
  if (!target) return;

  const lead = await tx.lead.findUnique({
    where: { id: member.leadId },
    select: { stage: true, convertedAt: true },
  });
  if (!lead || lead.stage === target) return;
  if (lead.stage === "CONVERTED" && target === "TRIAL_ATTENDED") return;

  await tx.lead.update({
    where: { id: member.leadId },
    data: {
      stage: target,
      // convertedAt marca cuándo empezó a pagar mensualidad; no se reescribe.
      ...(target === "CONVERTED" && !lead.convertedAt ? { convertedAt: new Date() } : {}),
      ...(target === "TRIAL_ATTENDED" ? { trialAttended: true } : {}),
    },
  });
}

/**
 * Lo que hay que hacer cada vez que alguien compra: poner al socio en el estado
 * que implica su plan, atarlo a su lead y mover el embudo.
 *
 * Un solo sitio para que ningún camino de alta se olvide de una de las tres. El
 * 21 sep Majo hizo bien su parte —creó a los socios y les cobró— y el sistema
 * igual mostró cero: el alta guardaba la venta pero no tocaba el embudo.
 */
export async function applyPlanToMember(
  tx: Prisma.TransactionClient,
  memberId: string,
  cycle: BillingCycle,
): Promise<void> {
  const status = memberStatusForPlan(cycle);
  if (status) {
    const current = await tx.member.findUnique({
      where: { id: memberId },
      select: { status: true },
    });
    // Un trial no degrada a quien ya es socio activo.
    if (!(status === "TRIAL" && current?.status === "ACTIVE")) {
      await tx.member.update({ where: { id: memberId }, data: { status } });
    }
  }
  await linkMemberToLead(tx, memberId);
  await syncLeadFromMember(tx, memberId);
}
