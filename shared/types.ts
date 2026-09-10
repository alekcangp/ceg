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
  manifestText?: string;
  queryFeesAmount?: string;
  signalledTokens?: string;
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

export interface ABIFunction {
  name: string;
  inputs: { name: string; type: string }[];
  outputs: { name: string; type: string }[];
  stateMutability?: string;
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
  schemaHash?: string;
  schemaRefRaw?: string;
  abis?: { name: string; file: string }[];
  abiFunctions?: ABIFunction[];
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

export type NodeType = "contract" | "network" | "subgraph" | "role" | "concept" | "entity";

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
  /** "What is this thing anyway?" — plain-English identity of the contract. */
  whatIsIt: string;
  /** "What can it actually do?" — ABI explained simply. */
  whatItCanDo: string;
  /** "What is the ecosystem tracking behind the scenes?" — subgraph entities explained simply. */
  ecosystemTracking: string;
  /** "The Bottom Line" — short human summary. */
  bottomLine: string;
  /** "Risky business?" — friendly risks & caveats of interacting with it. */
  riskyBusiness: string;
  /** "Once upon a time..." — short fairytale story about the contract, grounded in real analysis data. */
  story: string;
  roles: AIRole[];
  concepts: SemanticConcept[];
  /** Short honest caveats / ambiguity warnings from the AI. */
  notices?: string[];
}

export interface AnalysisResult {
  contract: Contract;
  subgraphs: SubgraphAnalysis[];
  concepts: SemanticConcept[];
  aiAnalysis?: AIAnalysis;
  /** Human-readable reason AI analysis is missing (when aiAnalysis is undefined). */
  aiError?: string;
  nodes: EcosystemNode[];
  edges: EcosystemEdge[];
  errors: string[];
  stats: {
    totalDiscovered: number;
    analyzed: number;
    failed: number;
    /** Subgraphs skipped because their manifest has no dataSources for the contract. */
    filteredOut: number;
    subgraphs: number;
    entities: number;
    networks: number;
  };
}

export interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
  detail?: string;
}
