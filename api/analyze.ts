import type { AnalysisResult, Contract, SubgraphAnalysis } from "../shared/types.js";
import { discoverSubgraphs, rankSubgraphs } from "../src/discovery/discovery.js";
import { analyzeSubgraph } from "../src/manifest/manifest.js";
import { deduplicateConcepts } from "../src/normalization/normalization.js";
import { buildAIContext, callAI, debugPrompt } from "../src/ai/ai.js";
import { fetchABIFunctions } from "../src/manifest/manifest.js";
import { buildGraph } from "../src/graph/builder.js";
import type { VercelRequest, VercelResponse } from "./vercel-types.js";

export const config = { maxDuration: 60 };

/**
 * Promise.allSettled with a concurrency limit: at most `limit` tasks in
 * flight at once. Results keep input order, same shape as allSettled.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const address = (req.body?.address || "").trim();
  if (!isValidAddress(address)) {
    return res.status(400).json({ error: "Invalid contract address. Please enter a valid 0x-prefixed Ethereum address." });
  }

  try {
    const result = await runAnalysis(address);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Analysis failed:", err);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}

function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

async function runAnalysis(address: string): Promise<AnalysisResult> {
  const started = Date.now();
  const log = (step: string, extra?: unknown) =>
    console.log(`[analyze] ${step} +${Date.now() - started}ms`, extra ?? "");
  const contract: Contract = { address };

  // Step 1: Discover subgraphs via The Graph decentralized network
  log("discover:start", { address });
  let discovered: Awaited<ReturnType<typeof discoverSubgraphs>>;
  try {
    discovered = await discoverSubgraphs(address);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("discover:failed", msg);
    return emptyResult(
      contract,
      0,
      ["Subgraph discovery failed - please retry in a moment"],
      "Subgraph discovery failed - " + msg
    );
  }
  if (discovered.length === 0) {
    return emptyResult(
      contract,
      0,
      [],
      "No subgraphs found indexing this contract in The Graph network top listings."
    );
  }

  // Step 2: Analyze all unique candidates — discovery gathers the top N by
  // curation signal AND the top N by query fees, merged and deduplicated by
  // deployment id, so the end count lands between TOP_SUBGRAPHS and 2× it
  // (duplicates at the intersection shrink it). Limited concurrency keeps
  // the gateways happy (10 parallel schema fetches = instant 429s).
  const top = rankSubgraphs(discovered);
  log("discover:done", { found: discovered.length, analyzing: top.length });
  log("subgraph:top", top.map((s) => ({ id: s.id, name: s.name, network: s.network, ipfsHash: s.ipfsHash })));

  const settled = await mapWithConcurrency(top, 3, (sg) => analyzeSubgraph(sg, address));
  const successful: SubgraphAnalysis[] = [];
  const errors: string[] = [];
  let failedSubgraphs = 0;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") successful.push(r.value);
    else {
      failedSubgraphs++;
      log("manifest:failed", { name: top[i]?.name, reason: r.reason instanceof Error ? r.reason.message : r.reason });
      errors.push(`Failed to analyze subgraph ${top[i]?.name}`);
    }
  });

  // Drop subgraphs whose manifest parsed fine but contains no dataSources
  // targeting the contract (the address can still appear in the manifest text
  // via templates/context/comments — such subgraphs don't index the contract).
  const relevant = successful.filter((a) => !a.manifest || a.manifest.dataSources.length > 0);
  const filteredOut = successful.length - relevant.length;
  if (filteredOut > 0) {
    log("manifest:filtered-out", {
      count: filteredOut,
      names: successful.filter((a) => a.manifest && a.manifest.dataSources.length === 0).map((a) => a.discovery.name),
    });
  }
  const analyzedList = relevant;
  if (analyzedList.length === 0) {
    return emptyResult(contract, discovered.length, errors.length ? errors : ["All top subgraphs failed to analyze"]);
  }
  log("manifest:done", analyzedList.map((a) => ({
    name: a.discovery.name,
    dataSources: a.manifest?.dataSources.length ?? 0,
    events: a.manifest?.eventHandlers.length ?? 0,
    entities: a.schema?.entities.length ?? 0,
    schemaHash: a.schemaHash,
    errors: a.errors,
  })));
  for (const a of analyzedList) errors.push(...a.errors);

  // Step 4: Deduplicate and build semantic layer
  const concepts = deduplicateConcepts(analyzedList);
  log("concepts:done", { count: concepts.length });

  // Step 5: Build AI context (incl. merged/common ABI from subgraph manifests) and call AI.
  // Collect ABI from ALL subgraphs — different subgraphs may have different (incomplete)
  // ABI references for the same contract. fetchABIFunctions deduplicates by file hash
  // and fetches in parallel for speed.
  const allAbis = analyzedList.flatMap((a) => a.abis || []);
  log("abi:fetch:start", { abiSources: allAbis.length });
  const abiFunctions = await fetchABIFunctions(allAbis);
  log("abi:done", { count: abiFunctions.length });

  const aiContext = buildAIContext(contract, analyzedList, abiFunctions);
  const prompt = debugPrompt(aiContext);
  log("ai:prompt", { chars: prompt.length });
  console.log("[analyze] AI prompt >>>\n" + prompt + "\n<<< AI prompt");

  let aiError: string | undefined;
  if (!process.env.POLLINATIONS_API_KEY) {
    aiError = "AI is not configured: set POLLINATIONS_API_KEY in the environment.";
  }
  const aiAnalysis = await callAI(aiContext).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    log("ai:failed", msg);
    aiError = "AI request failed — " + msg;
    return undefined;
  });
  log("ai:done", { hasSummary: Boolean(aiAnalysis?.story || aiAnalysis?.whatIsIt), aiError });

  // No hardcoded fallback: everything user-facing comes from generation.
  // If the AI call fails, aiAnalysis stays undefined and the REAL error text
  // travels to the UI via aiError (no fake "owl is napping" content).
  const { nodes, edges } = buildGraph(contract, analyzedList, concepts, aiAnalysis);
  log("graph:done", { nodes: nodes.length, edges: edges.length });

  return {
    contract,
    subgraphs: analyzedList.map(stripDiscovery).map((a) => ({
      ...a,
      manifest: a.manifest
        ? {
            dataSources: a.manifest.dataSources
              .filter((d) => d.address?.toLowerCase() === address.toLowerCase())
              .slice(0, 1),
            entities: a.manifest.entities,
            eventHandlers: a.manifest.eventHandlers.slice(0, 3).map((h) => ({
              event: h.event.split("(")[0],
              handler: "",
            })),
          }
        : undefined,
      schema: a.schema
        ? {
            entities: a.schema.entities.map((e) => ({
              name: e.name,
              description: e.description,
              fields: e.fields.map((f) => ({ name: f.name, type: f.type, description: f.description })),
            })),
          }
        : undefined,
    })),
    concepts: concepts.slice(0, 5).map((c) => ({ concept: c.concept, confidence: c.confidence, evidence: c.evidence.slice(0, 2) })),
    aiAnalysis,
    aiError,
    nodes,
    edges,
    errors,
    stats: {
      totalDiscovered: discovered.length,
      analyzed: analyzedList.length,
      failed: failedSubgraphs,
      filteredOut,
      ...buildStats(analyzedList),
    },
  };
}

/** Graph statistics: subgraphs, entities, networks. */
function buildStats(analyses: SubgraphAnalysis[]) {
  const networks = new Set<string>();
  let entities = 0;
  for (const a of analyses) {
    if (a.discovery.network) networks.add(a.discovery.network);
    // Count entities from the GraphQL schema when available, otherwise fall
    // back to the manifest-declared entity names (schema IPFS fetch can fail).
    const schemaCount = a.schema?.entities?.length ?? 0;
    entities += schemaCount > 0 ? schemaCount : (a.manifest?.entities?.length ?? 0);
  }
  return {
    subgraphs: analyses.length,
    entities,
    networks: networks.size,
  };
}

/** Strip heavy fields (manifestText) before sending to frontend. */
function stripDiscovery(a: SubgraphAnalysis): SubgraphAnalysis {
  const { manifestText: _drop, ...rest } = a.discovery;
  return { ...a, discovery: rest };
}

function emptyResult(
  contract: Contract,
  totalDiscovered = 0,
  errors: string[] = [],
  aiError?: string
): AnalysisResult {
  return {
    contract,
    subgraphs: [],
    concepts: [],
    nodes: [{ id: contract.address, type: "contract", label: contract.address.slice(0, 8) + "…" }],
    edges: [],
    errors,
    aiError,
    stats: { totalDiscovered, analyzed: 0, failed: errors.length, filteredOut: 0, subgraphs: 0, entities: 0, networks: 0 },
  };
}
