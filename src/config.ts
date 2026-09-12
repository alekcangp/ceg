/** Single place for tunable pipeline limits. Override via env. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** How many top subgraphs to fetch per role: by curation signal AND by query
 *  fees. Unique deployments from both lists (deduplicated) are analyzed,
 *  displayed and sent to AI — the end count is between TOP_SUBGRAPHS and
 *  2×TOP_SUBGRAPHS. */
export const TOP_SUBGRAPHS = envInt("TOP_SUBGRAPHS", 5);
