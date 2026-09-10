/**
 * Live verification of discovery top-selection (signal + query fees, dedup)
 * and filtered-out logic for subgraphs that don't index the contract.
 * Run: node --env-file=.env --import tsx scripts/verify-discovery.ts
 */
import { discoverSubgraphs, rankSubgraphs } from "../src/discovery/discovery.js";
import { analyzeSubgraph } from "../src/manifest/manifest.js";
import { buildGraph } from "../src/graph/builder.js";
import { buildAIContext, buildPrompt } from "../src/ai/ai.js";
import { TOP_SUBGRAPHS } from "../src/config.js";
import type { SubgraphAnalysis } from "../shared/types.js";

const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";

console.log(`TOP_SUBGRAPHS = ${TOP_SUBGRAPHS} → ищем топ ${TOP_SUBGRAPHS} по signal + топ ${TOP_SUBGRAPHS} по queryFees`);
const discovered = await discoverSubgraphs(USDT);
console.log(`\n=== discoverSubgraphs: уникальных кандидатов: ${discovered.length} (дублей быть не должно) ===`);
console.log(discovered.map((d) => ({
  name: d.name,
  network: d.network,
  signal: d.signalAmount,
  queryFees: d.queryFeesAmount ? String(BigInt(d.queryFeesAmount) / 10n ** 15n / 1000n) + " GRT" : undefined,
})));
const ids = discovered.map((d) => d.id);
console.log("дубликаты id:", ids.length - new Set(ids).size);

const top = rankSubgraphs(discovered);
console.log(`\n=== после ранжирования анализируем всех кандидатов: ${top.length} ===`);

const settled = await Promise.allSettled(top.map((sg) => analyzeSubgraph(sg, USDT)));
const successful: SubgraphAnalysis[] = [];
let failed = 0;
for (const r of settled) {
  if (r.status === "fulfilled") successful.push(r.value);
  else failed++;
}

const relevant = successful.filter((a) => !a.manifest || a.manifest.dataSources.length > 0);
const filteredOut = successful.length - relevant.length;
console.log(`\nanalyzed(failed): ${failed}, filteredOut: ${filteredOut}, relevant: ${relevant.length}`);
for (const a of successful) {
  console.log(` - ${a.discovery.name}: dataSources=${a.manifest?.dataSources.length ?? "n/a"}, entities=${a.schema?.entities.length ?? 0}`);
}

const { nodes, edges } = buildGraph({ address: USDT }, relevant, []);
console.log(`\nграф: узлов=${nodes.length}, рёбер=${edges.length}`);

// --- AI: построить контекст/промпт и (если настроено) вызвать модель ---
const abiFunctions = await import("../src/manifest/manifest.js").then((m) => m.fetchABIFunctions(relevant.flatMap((a) => a.abis ?? [])));
const aiContext = buildAIContext({ address: USDT }, relevant, abiFunctions);
const prompt = buildPrompt(aiContext);
console.log(`\n=== prompt: ${prompt.length} chars ===`);
console.log(prompt.split("\n").filter((l) => l.includes("dataSources:")).join("\n"));

if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
  const { callCloudflareAI } = await import("../src/ai/ai.js");
  const ai = await callCloudflareAI(aiContext);
  console.log("\n=== AI result ===");
  console.log(JSON.stringify({ whatIsIt: ai?.whatIsIt, whatItCanDo: ai?.whatItCanDo, ecosystemTracking: ai?.ecosystemTracking, riskyBusiness: ai?.riskyBusiness, roles: ai?.roles, notices: ai?.notices }, null, 2));
} else {
  console.log("\n(CF AI не настроен — пропускаю вызов модели)");
}
