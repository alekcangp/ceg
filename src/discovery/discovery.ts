import type { SubgraphDiscovery } from "../../shared/types.js";

const THEGRAPH_GATEWAY = process.env.THEGRAPH_GATEWAY_URL || "https://gateway.thegraph.com/api";
const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY || "";

/**
 * Discover subgraphs that reference a given contract address.
 * Uses The Graph's decentralized network API to search for subgraphs
 * that index the target contract.
 *
 * The Graph exposes a subgraph search API at the gateway endpoint.
 * We query for subgraphs whose data sources include the contract address.
 */
export async function discoverSubgraphs(contractAddress: string): Promise<SubgraphDiscovery[]> {
  const normalizedAddr = contractAddress.toLowerCase();

  try {
    // The Graph decentralized network has a subgraph search endpoint
    // We query the gateway's search API for subgraphs matching the contract
    const results = await querySubgraphSearch(normalizedAddr);

    return results;
  } catch (err) {
    console.error("Subgraph discovery failed:", err);
    // Fallback: try alternative discovery method via The Graph Explorer API
    try {
      return await queryGraphExplorer(normalizedAddr);
    } catch (err2) {
      console.error("Fallback discovery also failed:", err2);
      return [];
    }
  }
}

/**
 * Query The Graph's decentralized network for subgraphs that index
 * the given contract address. The Graph Network's subgraph API
 * allows searching by contract address through the gateway.
 */
async function querySubgraphSearch(address: string): Promise<SubgraphDiscovery[]> {
  // The Graph decentralized network exposes a GraphQL endpoint for subgraph metadata
  // We can query the "subgraphs" API for subgraphs that reference this contract
  const query = `
    {
      subgraphs(
        where: { dataSources_contains: ["${address}"] }
        orderBy: queryCount
        orderDirection: desc
        first: 50
      ) {
        id
        name
        description
        network
        repository
        ipfsHash
        queryCount
        signalAmount
      }
    }
  `;

  const url = `${THEGRAPH_GATEWAY}/${THEGRAPH_API_KEY}/subgraphs/search`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) throw new Error(`Gateway responded ${resp.status}`);

  const data = await resp.json();
  const subgraphs = data?.data?.subgraphs || [];

  return subgraphs.map((sg: Record<string, unknown>) => ({
    id: String(sg.id || ""),
    name: String(sg.name || "Unknown"),
    description: sg.description ? String(sg.description) : undefined,
    network: sg.network ? String(sg.network) : undefined,
    repository: sg.repository ? String(sg.repository) : undefined,
    ipfsHash: sg.ipfsHash ? String(sg.ipfsHash) : undefined,
    queryCount: sg.queryCount ? Number(sg.queryCount) : undefined,
    signalAmount: sg.signalAmount ? Number(sg.signalAmount) : undefined,
  }));
}

/**
 * Fallback: Query The Graph Explorer API for subgraphs.
 */
async function queryGraphExplorer(address: string): Promise<SubgraphDiscovery[]> {
  // Try the Graph Explorer search API
  const url = `https://subgraph-search.thegraph.com/api/search?contract=${address}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!resp.ok) throw new Error(`Explorer responded ${resp.status}`);

  const data = await resp.json();
  const items = data?.results || [];

  return items.map((item: Record<string, unknown>) => ({
    id: String(item.id || item.ipfsHash || ""),
    name: String(item.name || item.displayName || "Unknown"),
    description: item.description ? String(item.description) : undefined,
    network: item.network ? String(item.network) : undefined,
    repository: item.repository ? String(item.repository) : undefined,
    ipfsHash: item.ipfsHash ? String(item.ipfsHash) : undefined,
    queryCount: item.queryCount ? Number(item.queryCount) : undefined,
    signalAmount: item.signalAmount ? Number(item.signalAmount) : undefined,
  }));
}

/**
 * Rank subgraphs by relevance to the contract address.
 * Uses available evidence signals without fabricating scores.
 */
export function rankSubgraphs(subgraphs: SubgraphDiscovery[], contractAddress: string): SubgraphDiscovery[] {
  const addr = contractAddress.toLowerCase();

  return [...subgraphs]
    .map((sg) => {
      let score = 0;
      // Higher query count = more relevance signal
      if (sg.queryCount && sg.queryCount > 0) score += Math.min(sg.queryCount / 100, 10);
      // Signal amount is a stake-based relevance metric
      if (sg.signalAmount && sg.signalAmount > 0) score += Math.min(sg.signalAmount / 1000, 5);
      // Has IPFS hash = can retrieve manifest
      if (sg.ipfsHash) score += 2;
      // Has repository = more metadata available
      if (sg.repository) score += 1;
      return { sg, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.sg);
}
