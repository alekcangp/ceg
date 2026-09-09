import { parse as parseYaml } from "yaml";
import type { SubgraphDiscovery, SubgraphAnalysis, DataSource, Entity, Field } from "../../shared/types.js";

const IPFS_GATEWAY = process.env.IPFS_GATEWAY_URL || "https://ipfs.io/ipfs";
const cache = new Map<string, string>();

/**
 * Analyze a single subgraph: fetch its manifest from IPFS, parse it,
 * then fetch and parse its GraphQL schema.
 */
export async function analyzeSubgraph(sg: SubgraphDiscovery, contractAddress: string): Promise<SubgraphAnalysis> {
  const errors: string[] = [];

  let manifest: ParsedManifest | undefined;
  let schemaEntities: Entity[] | undefined;

  try {
    if (!sg.ipfsHash) throw new Error("No IPFS hash available");
    const manifestYaml = await fetchFromIPFS(sg.ipfsHash);
    manifest = parseManifest(manifestYaml, contractAddress);
  } catch (err) {
    errors.push(`Manifest: ${err instanceof Error ? err.message : "parse failed"}`);
  }

  if (manifest?.schemaHash) {
    try {
      const schemaText = await fetchFromIPFS(manifest.schemaHash);
      schemaEntities = parseSchema(schemaText, manifest.entities);
    } catch (err) {
      errors.push(`Schema: ${err instanceof Error ? err.message : "parse failed"}`);
    }
  }

  return {
    discovery: sg,
    manifest: manifest
      ? {
          dataSources: manifest.dataSources,
          entities: manifest.entities,
          eventHandlers: manifest.eventHandlers,
        }
      : undefined,
    schema: schemaEntities ? { entities: schemaEntities } : undefined,
    errors,
  };
}

interface ParsedManifest {
  dataSources: DataSource[];
  entities: string[];
  eventHandlers: { event: string; handler: string }[];
  schemaHash?: string;
}

async function fetchFromIPFS(hash: string): Promise<string> {
  if (cache.has(hash)) return cache.get(hash)!;

  const url = `${IPFS_GATEWAY}/${hash}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!resp.ok) throw new Error(`IPFS fetch failed: ${resp.status}`);

  const text = await resp.text();
  if (text.length > 500_000) throw new Error("Response too large");

  cache.set(hash, text);
  return text;
}

/**
 * Parse a subgraph.yaml manifest. Uses the `yaml` package to parse
 * the YAML structure and extract dataSources, entities, event handlers,
 * and the schema file reference.
 */
function parseManifest(yamlText: string, _contractAddress: string): ParsedManifest {
  let doc: Record<string, unknown>;

  try {
    doc = parseYaml(yamlText) as Record<string, unknown>;
  } catch {
    throw new Error("Malformed YAML");
  }

  if (!doc || typeof doc !== "object") throw new Error("Invalid manifest structure");

  const dataSources: DataSource[] = [];
  const entities: string[] = [];
  const eventHandlers: { event: string; handler: string }[] = [];

  // Extract schema file reference (may be IPFS hash or path)
  let schemaHash: string | undefined;
  const schema = doc.schema as Record<string, unknown> | undefined;
  if (schema?.file) {
    const fileVal = schema.file;
    if (typeof fileVal === "string") {
      schemaHash = extractIPFSHash(fileVal);
    } else if (fileVal && typeof fileVal === "object") {
      // IPLD link format: { "/": "Qm..." }
      const link = fileVal as Record<string, string>;
      if (link["/"]) schemaHash = link["/"];
    }
  }

  // Parse dataSources array
  const rawSources = Array.isArray(doc.dataSources) ? doc.dataSources : [];
  for (const ds of rawSources) {
    if (!ds || typeof ds !== "object") continue;
    const source = ds as Record<string, unknown>;

    const dsName = String(source.name || "Unknown");
    const srcBlock = source.source as Record<string, unknown> | undefined;
    const mapping = source.mapping as Record<string, unknown> | undefined;

    const dsEntry: DataSource = {
      name: dsName,
      address: srcBlock?.address ? String(srcBlock.address) : undefined,
      abi: srcBlock?.abi ? String(srcBlock.abi) : undefined,
      startBlock: srcBlock?.startBlock ? Number(srcBlock.startBlock) : undefined,
      network: source.network ? String(source.network) : undefined,
    };
    dataSources.push(dsEntry);

    // Extract entities from mapping
    if (mapping?.entities && Array.isArray(mapping.entities)) {
      for (const ent of mapping.entities) {
        const entName = String(ent);
        if (!entities.includes(entName)) entities.push(entName);
      }
    }

    // Extract event handlers
    if (mapping?.eventHandlers && Array.isArray(mapping.eventHandlers)) {
      for (const handler of mapping.eventHandlers) {
        if (!handler || typeof handler !== "object") continue;
        const h = handler as Record<string, unknown>;
        eventHandlers.push({
          event: String(h.event || ""),
          handler: String(h.handler || ""),
        });
      }
    }
  }

  return { dataSources, entities, eventHandlers, schemaHash };
}

function extractIPFSHash(path: string): string | undefined {
  // If it's already an IPFS hash (starts with Qm or bafy)
  if (/^(Qm|bafy|bafk|bafz)/.test(path)) return path;
  // Try to extract from a path like ./schema.graphql or /ipfs/Qm...
  const match = path.match(/(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]{52})/);
  return match ? match[1] : undefined;
}

/**
 * Parse a GraphQL schema file. Extracts entity definitions,
 * their fields, types, and descriptions (from GraphQL comments).
 * Only includes entities that are listed in the manifest's mapping entities.
 */
function parseSchema(schemaText: string, manifestEntities: string[]): Entity[] {
  const entities: Entity[] = [];

  // Match type definitions with optional preceding descriptions
  // Format: """description""" or # description followed by type Name {
  const typeRegex = /(?:(?:"""([\s\S]*?)""")|(?:#\s*(.*)\n))*type\s+(\w+)\s*\{([\s\S]*?)\}/g;

  let match: RegExpExecArray | null;
  while ((match = typeRegex.exec(schemaText)) !== null) {
    const typeName = match[3];
    const body = match[4];

    // Only include if this entity is in the manifest's entity list
    // (or if manifest has no entities, include all)
    if (manifestEntities.length > 0 && !manifestEntities.includes(typeName)) continue;

    const description = match[1]?.trim() || undefined;
    const fields = parseFields(body);

    entities.push({ name: typeName, description, fields });
  }

  return entities;
}

function parseFields(body: string): Field[] {
  const fields: Field[] = [];
  const lines = body.split("\n");

  let currentDesc: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();

    // Capture description comments
    const descMatch = trimmed.match(/^#\s*(.*)$/);
    if (descMatch) {
      currentDesc = descMatch[1].trim();
      continue;
    }

    // Match field definitions: fieldName: Type!
    const fieldMatch = trimmed.match(/^(\w+)\s*:\s*([^\s]+)(.*)$/);
    if (fieldMatch) {
      const name = fieldMatch[1];
      const type = fieldMatch[2].replace(/[!\[\]]/g, "");
      fields.push({ name, type, description: currentDesc });
      currentDesc = undefined;
    }
  }

  return fields;
}

