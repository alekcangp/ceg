import { parse as parseYaml } from "yaml";
import type { SubgraphDiscovery, SubgraphAnalysis, DataSource, Entity, Field, ABIFunction } from "../../shared/types.js";

const IPFS_GATEWAYS = (process.env.IPFS_GATEWAY_URL
  ? [process.env.IPFS_GATEWAY_URL]
  : ["https://gateway.pinata.cloud/ipfs", "https://ipfs.io/ipfs", "https://cloudflare-ipfs.com/ipfs"]
).map((g) => g.replace(/\/$/, ""));
const cache = new Map<string, string>();

/**
 * Analyze a single subgraph: parse inline manifestText if present
 * (no extra IPFS fetch), otherwise fetch manifest by ipfsHash,
 * then fetch and parse its GraphQL schema.
 */
export async function analyzeSubgraph(sg: SubgraphDiscovery, contractAddress: string): Promise<SubgraphAnalysis> {
  const errors: string[] = [];
  const dbg = (step: string, extra?: unknown) =>
    console.log(`[manifest] ${sg.name} ${step}`, extra ?? "");

  dbg("subgraph:data", {
    id: sg.id,
    ipfsHash: sg.ipfsHash,
    network: sg.network,
    manifestLen: sg.manifestText?.length ?? 0,
    manifestHead: (sg.manifestText || "").slice(0, 200),
  });

  let manifest: ParsedManifest | undefined;
  let schemaEntities: Entity[] | undefined;

  try {
    const manifestYaml = sg.manifestText || (sg.ipfsHash ? await fetchFromIPFS(sg.ipfsHash) : "");
    if (!manifestYaml) throw new Error("No manifest available");
    dbg("manifest:source", { inline: Boolean(sg.manifestText), len: manifestYaml.length });
    manifest = parseManifest(manifestYaml, contractAddress);
  } catch (err) {
    errors.push(`Manifest: ${err instanceof Error ? err.message : "parse failed"}`);
  }

  dbg("manifest:schema-ref", {
    schemaRefRaw: manifest?.schemaRefRaw,
    schemaHash: manifest?.schemaHash,
  });

  if (manifest?.schemaHash) {
    dbg("schema:fetch:start", { hash: manifest.schemaHash });
    try {
      const schemaText = await fetchFromIPFS(manifest.schemaHash);
      dbg("schema:fetch:done", { chars: schemaText.length, head: schemaText.slice(0, 200) });
      schemaEntities = parseSchema(schemaText, manifest.entities);
      dbg("schema:parsed", { entities: schemaEntities.map((e) => e.name) });
    } catch (err) {
      dbg("schema:fetch:failed", err instanceof Error ? err.message : err);
      errors.push(`Schema: ${err instanceof Error ? err.message : "parse failed"}`);
    }
  } else {
    dbg("schema:skipped", { reason: `no IPFS hash, schema.file = ${manifest?.schemaRefRaw ?? "missing"}` });
    if (manifest?.schemaRefRaw) errors.push(`Schema: not on IPFS (schema.file = ${manifest.schemaRefRaw})`);
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
    schemaHash: manifest?.schemaHash,
    schemaRefRaw: manifest?.schemaRefRaw,
    abis: manifest?.abis,
    errors,
  };
}

interface ParsedManifest {
  dataSources: DataSource[];
  entities: string[];
  eventHandlers: { event: string; handler: string }[];
  schemaHash?: string;
  schemaRefRaw?: string;
  abis: { name: string; file: string }[];
}

async function fetchFromIPFS(hash: string): Promise<string> {
  if (cache.has(hash)) return cache.get(hash)!;

  let lastErr: unknown = null;
  for (const gw of IPFS_GATEWAYS) {
    try {
      const resp = await fetch(`${gw}/${hash}`, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`IPFS fetch failed: ${resp.status}`);
      const text = await resp.text();
      if (text.length > 500_000) throw new Error("Response too large");
      cache.set(hash, text);
      return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("IPFS fetch failed");
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

  // Extract schema file reference (may be IPFS hash or relative path)
  let schemaHash: string | undefined;
  let schemaRefRaw: string | undefined;
  const schema = doc.schema as Record<string, unknown> | undefined;
  if (schema?.file) {
    const fileVal = schema.file;
    if (typeof fileVal === "string") {
      schemaRefRaw = fileVal;
      schemaHash = extractIPFSHash(fileVal);
    } else if (fileVal && typeof fileVal === "object") {
      // IPLD link format: { "/": "Qm..." } — value may carry /ipfs/ prefix
      const link = fileVal as Record<string, string>;
      if (link["/"]) {
        schemaRefRaw = `{ "/": "${link["/"]}" }`;
        schemaHash = stripPrefix(link["/"]);
      }
    }
  }

  // Parse dataSources array — filter by contract address
  const rawSources = Array.isArray(doc.dataSources) ? doc.dataSources : [];
  const filteredSources: Record<string, unknown>[] = [];
  const entities: string[] = [];
  const eventHandlers: { event: string; handler: string }[] = [];
  const dataSources: DataSource[] = [];
  const rawAbis: { name: string; file: string }[] = [];

  for (const ds of rawSources) {
    if (!ds || typeof ds !== "object") continue;
    const source = ds as Record<string, unknown>;
    const srcBlock = source.source as Record<string, unknown> | undefined;
    const addr = srcBlock?.address as string | undefined;
    // Only keep dataSources that target our contract address
    if (!addr || addr.toLowerCase() !== _contractAddress.toLowerCase()) continue;
    filteredSources.push(ds);

    // DataSource metadata
    const dsName = String(source.name || "Unknown");
    dataSources.push({
      name: dsName,
      address: addr,
      abi: srcBlock?.abi ? String(srcBlock.abi) : undefined,
      startBlock: typeof srcBlock?.startBlock === "number" ? srcBlock.startBlock : undefined,
      network: source.network ? String(source.network) : undefined,
    });

    // Entities from this data source's mapping
    const mapping = source.mapping as Record<string, unknown> | undefined;
    if (mapping?.entities && Array.isArray(mapping.entities)) {
      for (const ent of mapping.entities) {
        if (typeof ent === "string") entities.push(ent);
      }
    }

    // Event handlers from this data source's mapping
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

    // ABI file references from this data source's mapping
    if (mapping?.abis && Array.isArray(mapping.abis)) {
      for (const abi of mapping.abis) {
        if (!abi || typeof abi !== "object") continue;
        const a = abi as Record<string, unknown>;
        const name = String(a.name || "");
        let file: string | undefined;
        const fileVal = a.file;
        if (typeof fileVal === "string") {
          file = fileVal;
        } else if (fileVal && typeof fileVal === "object") {
          const link = fileVal as Record<string, string>;
          if (link["/"]) file = link["/"];
        }
        if (name && file) rawAbis.push({ name, file });
      }
    }
  }

  return { dataSources, entities, eventHandlers, schemaHash, schemaRefRaw, abis: rawAbis };
}

function extractIPFSHash(path: string): string | undefined {
  // Strip /ipfs/ prefix if present
  const clean = path.replace(/^\/ipfs\//, "").replace(/^ipfs\//, "");
  // IPLD link inside full manifest text: { "/": "Qm..." } or /ipfs/Qm...
  const ipld = clean.match(/"\/ipfs\/([A-Za-z0-9]{40,})"|"\/":\s*"([A-Za-z0-9]{40,})"/);
  if (ipld) return stripPrefix(ipld[1] || ipld[2]);
  if (/^(Qm|bafy|bafk|bafz)/.test(clean)) return clean;
  const match = clean.match(/(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]{52})/);
  return match ? match[1] : undefined;
}

function stripPrefix(h: string): string {
  return h.replace(/^\/ipfs\//, "").replace(/^ipfs\//, "");
}

/**
 * Parse a GraphQL schema file. Extracts entity definitions,
 * their fields, types, and descriptions (from GraphQL comments).
 * Only includes entities that are listed in the manifest's mapping entities.
 */
function parseSchema(schemaText: string, manifestEntities: string[]): Entity[] {
  const entities: Entity[] = [];

  // Match type definitions, allowing directives like @entity: type Name @entity { ... }
  // Optional description above: """...""" or "..." or # ...
  const typeRegex = /(?:(?:"""([\s\S]*?)""")|(?:"([^"]+)")|(?:#[^\n]*\n))*\s*type\s+(\w+)[^\{]*\{([\s\S]*?)\}/g;

  let match: RegExpExecArray | null;
  while ((match = typeRegex.exec(schemaText)) !== null) {
    const typeName = match[3];
    const body = match[4];

    // Only include if this entity is in the manifest's entity list
    // (or if manifest has no entities, include all)
    if (manifestEntities.length > 0 && !manifestEntities.includes(typeName)) continue;

    const desc = (match[1] || match[2] || "").trim() || undefined;
    const fields = parseFields(body);

    entities.push({ name: typeName, description: desc, fields });
  }

  return entities;
}

function parseFields(body: string): Field[] {
  const fields: Field[] = [];
  const lines = body.split("\n");

  let currentDesc: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();

    // Description styles: # comment, """...""", or "..." on its own line
    const hashMatch = trimmed.match(/^#\s*(.*)$/);
    if (hashMatch) {
      currentDesc = hashMatch[1].trim();
      continue;
    }
    const tripleMatch = trimmed.match(/^"""([\s\S]*?)"""$/);
    if (tripleMatch) {
      currentDesc = tripleMatch[1].trim();
      continue;
    }
    const quoteMatch = trimmed.match(/^"([^"]+)"$/);
    if (quoteMatch) {
      currentDesc = quoteMatch[1].trim();
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

/** Fetch ABI JSON from IPFS and extract only function signatures */
async function fetchABIFunctions(
  abis: { name: string; file: string }[],
  gateways: string[],
  cache: Map<string, string>
): Promise<ABIFunction[]> {
  const allFunctions: ABIFunction[] = [];

  for (const abi of abis) {
    const hash = extractIPFSHash(abi.file);
    if (!hash) continue;

    let abiText: string | undefined;
    try {
      abiText = await fetchFromIPFS(hash);
      if (!abiText) continue;
    } catch {
      continue;
    }

    try {
      const abiJson = JSON.parse(abiText);
      if (!Array.isArray(abiJson)) continue;

      for (const item of abiJson) {
        if (item?.type !== "function") continue;
        const func = item as Record<string, unknown>;
        const name = String(func.name || "");
        if (!name || name.startsWith("_")) continue;

        const inputs = (func.inputs as Array<{ name: string; type: string }> | undefined) || [];
        const outputs = (func.outputs as Array<{ name: string; type: string }> | undefined) || [];

        allFunctions.push({
          name,
          inputs: inputs.slice(0, 5).map((inp) => ({ name: inp.name || "", type: inp.type })),
          outputs: outputs.slice(0, 3).map((out) => ({ name: out.name || "", type: out.type })),
          stateMutability: func.stateMutability ? String(func.stateMutability) : undefined,
        });
      }
    } catch {
      // ignore parse errors
    }
  }

  return allFunctions.slice(0, 40);
}

