/** Only in-app paths are accepted as the return target (?volver=). */
export const safeBack = (v: string | undefined, fallback: string) => (v && /^\/dashboard(\/|$|\?)/.test(v) ? v : fallback);
