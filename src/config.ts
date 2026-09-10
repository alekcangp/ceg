/** Single place for tunable pipeline limits. Override via env. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** How many top subgraphs to analyze, display and send to AI. */
export const TOP_SUBGRAPHS = envInt("TOP_SUBGRAPHS", 5);
