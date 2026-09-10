import type { SubgraphDiscovery } from "../../shared/types.js";

const GATEWAY = process.env.THEGRAPH_GATEWAY_URL || "https://gateway.thegraph.com/api";
const API_KEY = process.env.THEGRAPH_API_KEY || "";
const NETWORK_ID =
  process.env.GRAPH_NETWORK_SUBGRAPH_ID || "QmdKXcBUHR3UyURqVRQHu1oV6VUkBrhi2vNvMx3bNDnUCc";

/**
 * Discover subgraph deployments indexing a contract address.
 * Queries the Graph Network Subgraph (reference: contractc/stages/stage1-top-graphs.js),
 * filters out denied deployments, returns manifest text inline (no extra IPFS fetch).
 */
export async function discoverSubgraphs(contractAddress: string): Promise<SubgraphDiscovery[]> {
  const address = contractAddress.toLowerCase();

  const query = `query TopDeployments($contractAddress: String!) {
    subgraphDeployments(
      where: { manifest_: { manifest_contains_nocase: $contractAddress } }
      orderBy: signalAmount
      orderDirection: desc
      first: 20
    ) {
      id
      ipfsHash
      manifest { network manifest }
      deniedAt
      signalledTokens
      queryFeesAmount
      signalAmount
    }
  }`;

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(`${GATEWAY}/${API_KEY}/deployments/id/${NETWORK_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { contractAddress: address } }),
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) throw new Error(`Gateway responded ${resp.status}`);
      const data = await resp.json();
      if (data?.errors?.length) throw new Error(`GraphQL: ${data.errors[0]?.message || "unknown"}`);
      const rows = data?.data?.subgraphDeployments || [];
      return rows
        .filter((d: Record<string, unknown>) => !d.deniedAt)
        .map((d: Record<string, unknown>) => {
          const manifest = d.manifest as Record<string, unknown> | undefined;
          const ipfsHash = d.ipfsHash ? String(d.ipfsHash) : String(d.id || "");
          return {
            id: String(d.id || ipfsHash),
            name: ipfsHash.slice(0, 12),
            description: manifest?.description ? String(manifest.description).trim() : undefined,
            network: manifest?.network ? String(manifest.network) : undefined,
            ipfsHash,
            manifestText: manifest?.manifest ? String(manifest.manifest) : undefined,
            signalAmount: d.signalAmount ? Number(d.signalAmount) : undefined,
            queryFeesAmount: d.queryFeesAmount ? String(d.queryFeesAmount) : undefined,
            signalledTokens: d.signalledTokens ? String(d.signalledTokens) : undefined,
          } as SubgraphDiscovery;
        });
    } catch (err) {
      lastErr = err;
      console.error(`Discovery attempt ${attempt} failed:`, err);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error("Subgraph discovery failed:", lastErr);
  return [];
}

/**
 * Rank subgraphs by relevance to the contract address.
 * Uses available evidence signals without fabricating scores.
 */
export function rankSubgraphs(subgraphs: SubgraphDiscovery[]): SubgraphDiscovery[] {
  return [...subgraphs]
    .map((sg) => {
      let score = 0;
      if (sg.manifestText) score += 5;
      if (sg.queryCount && sg.queryCount > 0) score += Math.min(sg.queryCount / 100, 10);
      if (sg.signalAmount && sg.signalAmount > 0) score += Math.min(sg.signalAmount / 1000, 5);
      if (sg.ipfsHash) score += 2;
      if (sg.repository) score += 1;
      return { sg, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.sg);
}
