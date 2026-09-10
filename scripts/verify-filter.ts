/**
 * Verify entity filtering against a real subgraph manifest.
 * Run: npx tsx scripts/verify-filter.ts
 *
 * Checks that analyzeSubgraph only keeps entities relevant to the
 * queried contract address (USDT: 0xdac17f958d2ee523a2206206994597c13d831ec7)
 * for subgraph manifest QmNfruESLYFgxfuk3KtZsMmUAn3dHSmtj4Fht42AZkuex1.
 */
import { analyzeSubgraph } from "../src/manifest/manifest.js";
import { buildGraph } from "../src/graph/builder.js";
import type { SubgraphDiscovery } from "../shared/types.js";

const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const SG_HASH = "QmNfruESLYFgxfuk3KtZsMmUAn3dHSmtj4Fht42AZkuex1";

const sg: SubgraphDiscovery = {
  id: SG_HASH,
  name: "clipper-blade (real manifest)",
  network: "mainnet",
  ipfsHash: SG_HASH,
};

const analysis = await analyzeSubgraph(sg, USDT);

console.log("=== errors ===", analysis.errors);
console.log("=== manifest.dataSources (после фильтра по адресу) ===");
console.log(analysis.manifest?.dataSources ?? []);
console.log("=== manifest.entities (из отфильтрованных dataSources) ===");
console.log(analysis.manifest?.entities ?? []);
console.log("=== schema.entities (то, что реально попадает на граф) ===");
console.log((analysis.schema?.entities ?? []).map((e) => e.name));

const { nodes } = buildGraph({ address: USDT }, [analysis], []);
const entityNodes = nodes.filter((n) => n.type === "entity");
console.log("=== entity nodes на графе:", entityNodes.length, "===");
console.log(entityNodes.map((n) => n.metadata?.name));
console.log("=== всего узлов на графе:", nodes.length, "(порог сообщения 'knows a lot of people' — >20) ===");
