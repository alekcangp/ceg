import type { AnalysisResult, Contract, SubgraphAnalysis } from "../shared/types.js";
import { discoverSubgraphs, rankSubgraphs } from "../src/discovery/discovery.js";
import { analyzeSubgraph } from "../src/manifest/manifest.js";
import { deduplicateConcepts } from "../src/normalization/normalization.js";
import { buildAIContext, callCloudflareAI } from "../src/ai/ai.js";
import { buildGraph } from "../src/graph/builder.js";
import type { VercelRequest, VercelResponse } from "./vercel-types.js";

export const config = { maxDuration: 60 };

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
  const contract: Contract = { address };

  // Step 1: Discover subgraphs via The Graph decentralized network
  const discovered = await discoverSubgraphs(address);
  if (discovered.length === 0) {
    return emptyResult(contract);
  }

  // Step 2: Rank and select top 10
  const top10 = rankSubgraphs(discovered, address).slice(0, 10);

  // Step 3: Parse manifests and schemas in parallel
  const analyses = await Promise.allSettled(
    top10.map((sg) => analyzeSubgraph(sg, address))
  );

  const successful: SubgraphAnalysis[] = [];
  const errors: string[] = [];
  analyses.forEach((r, i) => {
    if (r.status === "fulfilled") successful.push(r.value);
    else errors.push(`Failed to analyze subgraph ${top10[i].name}`);
  });

  // Step 4: Deduplicate and build semantic layer
  const concepts = deduplicateConcepts(successful);

  // Step 5: Build compact context and call AI
  const aiContext = buildAIContext(contract, successful);
  const aiAnalysis = await callCloudflareAI(aiContext).catch(() => undefined);

  // Step 6: Build graph
  const { nodes, edges } = buildGraph(contract, successful, concepts, aiAnalysis);

  return {
    contract,
    subgraphs: successful,
    concepts,
    aiAnalysis,
    nodes,
    edges,
    errors,
    stats: {
      totalDiscovered: discovered.length,
      analyzed: successful.length,
      failed: errors.length,
    },
  };
}

function emptyResult(contract: Contract): AnalysisResult {
  return {
    contract,
    subgraphs: [],
    concepts: [],
    nodes: [{ id: contract.address, type: "contract", label: contract.address.slice(0, 8) + "…" }],
    edges: [],
    errors: [],
    stats: { totalDiscovered: 0, analyzed: 0, failed: 0 },
  };
}
