import type { Contract, SubgraphAnalysis, SemanticConcept, AIAnalysis, EcosystemNode, EcosystemEdge } from "../../shared/types.js";

/**
 * Build the ecosystem graph nodes and edges from analysis results.
 * The contract is the central node. Subgraphs, networks, roles, concepts,
 * and entities radiate outward based on real evidence.
 */
export function buildGraph(
  contract: Contract,
  subgraphs: SubgraphAnalysis[],
  concepts: SemanticConcept[],
  aiAnalysis?: AIAnalysis
): { nodes: EcosystemNode[]; edges: EcosystemEdge[] } {
  const nodes: EcosystemNode[] = [];
  const edges: EcosystemEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: EcosystemNode) => {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  };

  const addEdge = (source: string, target: string, label?: string) => {
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

  // Collect networks
  const networks = new Map<string, string>();
  for (const sg of subgraphs) {
    const net = sg.discovery.network || "unknown";
    if (!networks.has(net)) {
      const netId = `network:${net}`;
      networks.set(net, netId);
      addNode({ id: netId, type: "network", label: net });
      addEdge(netId, contractId);
    }
  }

  // Add subgraph nodes
  for (const sg of subgraphs) {
    const sgId = `subgraph:${sg.discovery.id}`;
    addNode({
      id: sgId,
      type: "subgraph",
      label: sg.discovery.name.slice(0, 20),
      metadata: {
        name: sg.discovery.name,
        network: sg.discovery.network,
        description: sg.discovery.description,
        repository: sg.discovery.repository,
        queryCount: sg.discovery.queryCount,
      },
    });
    addEdge(sgId, contractId);

    // Connect subgraph to its network
    const net = sg.discovery.network || "unknown";
    const netId = networks.get(net);
    if (netId) addEdge(sgId, netId);

    // Add entity nodes connected to subgraph
    if (sg.schema?.entities) {
      for (const entity of sg.schema.entities.slice(0, 5)) {
        const entityId = `entity:${sg.discovery.id}:${entity.name}`;
        addNode({
          id: entityId,
          type: "entity",
          label: entity.name.slice(0, 15),
          metadata: {
            name: entity.name,
            description: entity.description,
            fields: entity.fields.slice(0, 5),
            subgraph: sg.discovery.name,
          },
        });
        addEdge(entityId, sgId);
      }
    }
  }

  // Add AI-detected roles as concept nodes
  if (aiAnalysis?.roles) {
    for (const role of aiAnalysis.roles) {
      const roleId = `role:${role.role}`;
      addNode({
        id: roleId,
        type: "role",
        label: role.role,
        metadata: { confidence: role.confidence },
      });
      addEdge(roleId, contractId, role.confidence);
    }
  }

  // Add deduplicated concepts as concept nodes
  for (const concept of concepts.slice(0, 15)) {
    const conceptId = `concept:${concept.concept}`;
    addNode({
      id: conceptId,
      type: "concept",
      label: concept.concept.slice(0, 15),
      metadata: {
        confidence: concept.confidence,
        evidenceCount: concept.evidence.length,
        sources: [...new Set(concept.evidence.map((e) => e.source))],
      },
    });
    addEdge(conceptId, contractId, concept.confidence);
  }

  return { nodes, edges };
}
