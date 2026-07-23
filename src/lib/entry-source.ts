/**
 * Prisma `where` fragment for "counts as official data".
 *
 * Socios can self-report weight/measurements and lift PRs from their app. Those
 * entries chart immediately in the socio's own progress, but must NOT move
 * official numbers — body-fat reports, evaluation stats, challenge rankings —
 * until a coach verifies them. Spread this into any query that feeds those.
 *
 * Applies to TestResult and BodyComposition (both carry source + verifiedAt).
 */
export const OFFICIAL_ENTRY_WHERE = {
  OR: [{ source: "STAFF" as const }, { verifiedAt: { not: null } }],
};
