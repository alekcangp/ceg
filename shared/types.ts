// Shared data model types used by both frontend and backend

export interface Contract {
  address: string;
  network?: string;
}

export interface SubgraphDiscovery {
  id: string;
  name: string;
  description?: string;
  network?: string;
  repository?: string;
  ipfsHash?: string;
  queryCount?: number;
  signalAmount?: number;
  rank?: number;
}

export interface DataSource {
  name: string;
  address?: string;
  abi?: string;
  startBlock?: number;
  network?: string;
}

export interface EventHandler {
  event: string;
  handler: string;
}

export interface Field {
  name: string;
  type: string;
  description?: string;
}

export interface Entity {
  name: string;
  description?: string;
  fields: Field[];
}

export interface SubgraphAnalysis {
  discovery: SubgraphDiscovery;
  manifest?: {
    dataSources: DataSource[];
    entities: string[];
    eventHandlers: EventHandler[];
  };
  schema?: {
    entities: Entity[];
  };
  errors: string[];
}

export interface Evidence {
  type: "event" | "entity" | "field" | "datasource";
  source: string;
  value: string;
}

export interface SemanticConcept {
  concept: string;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
}

export type NodeType = "contract" | "network" | "subgraph" | "protocol" | "role" | "concept" | "entity";

export interface EcosystemNode {
  id: string;
  type: NodeType;
  label: string;
  metadata?: Record<string, unknown>;
}

export interface EcosystemEdge {
  source: string;
  target: string;
  label?: string;
}

export interface AIRole {
  role: string;
  confidence: "high" | "medium" | "low";
}

export interface AIAnalysis {
  summary: string;
  roles: AIRole[];
  concepts: SemanticConcept[];
}

export interface AnalysisResult {
  contract: Contract;
  subgraphs: SubgraphAnalysis[];
  concepts: SemanticConcept[];
  aiAnalysis?: AIAnalysis;
  nodes: EcosystemNode[];
  edges: EcosystemEdge[];
  errors: string[];
  stats: {
    totalDiscovered: number;
    analyzed: number;
    failed: number;
  };
}

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}
