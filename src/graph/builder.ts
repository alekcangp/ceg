import type { Contract, SubgraphAnalysis, SemanticConcept, AIAnalysis, EcosystemNode, EcosystemEdge } from "../../shared/types.js";

/**
 * Build the ecosystem graph nodes and edges from analysis results.
 * Topology: contract <-> subgraph <-> entity.
 * No duplicate edges: entities attach ONLY to their subgraph,
 * never to the contract.
 * AI-detected roles/concepts are NOT rendered as graph nodes
 * (they stay in the concepts[]/aiAnalysis payload only).
 */
export function buildGraph(
  contract: Contract,
  subgraphs: SubgraphAnalysis[],
  concepts: SemanticConcept[],
  _aiAnalysis?: AIAnalysis
): { nodes: EcosystemNode[]; edges: EcosystemEdge[] } {
  const nodes: EcosystemNode[] = [];
  const edges: EcosystemEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeKeys = new Set<string>();

  const addNode = (node: EcosystemNode) => {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  };

  const addEdge = (source: string, target: string, label?: string) => {
    const key = `${source}>${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, label });
  };

  // Central contract node
  const contractId = `contract:${contract.address}`;
  addNode({
    id: contractId,
    type: "contract",
    label: `${contract.address.slice(0, 6)}…${contract.address.slice(-4)}`,
    metadata: { address: contract.address },
  });

  // Add subgraph nodes
  for (const sg of subgraphs) {
    const sgId = `subgraph:${sg.discovery.id}`;
    addNode({
      id: sgId,
      type: "subgraph",
      label: sg.discovery.name.slice(0, 20),
      metadata: {
        name: sg.discovery.name,
        fullIpfsHash: sg.discovery.ipfsHash,
        ipfsHash: sg.discovery.ipfsHash,
        network: sg.discovery.network,
        description: sg.discovery.description,
        repository: sg.discovery.repository,
        queryCount: sg.discovery.queryCount,
        signalAmount: sg.discovery.signalAmount,
      },
    });
    addEdge(sgId, contractId);

    // Add entity nodes connected to subgraph.
    // Prefer the richer GraphQL schema when available; fall back to the
    // manifest's entity names (fields empty) when the schema IPFS fetch failed,
    // so entity nodes still appear on the graph.
    const schemaEntities = sg.schema?.entities;
    if (schemaEntities?.length) {
      for (const entity of schemaEntities) {
        const entityId = `entity:${sg.discovery.id}:${entity.name}`;
        addNode({
          id: entityId,
          type: "entity",
          label: entity.name.slice(0, 15),
          metadata: {
            name: entity.name,
            description: entity.description,
            fields: entity.fields,
            subgraph: sg.discovery.name,
          },
        });
        addEdge(entityId, sgId);
      }
    } else if (sg.manifest?.entities?.length) {
      for (const name of sg.manifest.entities) {
        const entityId = `entity:${sg.discovery.id}:${name}`;
        addNode({
          id: entityId,
          type: "entity",
          label: name.slice(0, 15),
          metadata: {
            name,
            description: undefined,
            fields: [],
            subgraph: sg.discovery.name,
          },
        });
        addEdge(entityId, sgId);
      }
    }
  }

  return { nodes, edges };
}
