import { parse as parseYaml } from "yaml";
import type { SubgraphDiscovery, SubgraphAnalysis, DataSource, Entity, Field, ABIFunction } from "../../shared/types.js";
import { IPFS_GATEWAY_URL } from "../config.js";

const IPFS_GATEWAY = IPFS_GATEWAY_URL;

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

  const enrichedDiscovery = {
    ...sg,
    description: sg.description || manifest?.description || undefined,
    repository: sg.repository || manifest?.repository || undefined,
  };

  return {
    discovery: enrichedDiscovery,
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
  description?: string;
  repository?: string;
}

async function fetchFromIPFS(hash: string): Promise<string> {
  const errors: string[] = [];
  // Один шлюз (ipfs.thegraph.com) + ретраи 429/5xx с экспоненциальным backoff.
  // Публичный шлюз троттлит параллельные запросы — конкурентность ограничена
  // в вызывающем коде (mapWithConcurrency в api/analyze.ts).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const resp = await fetch(`${IPFS_GATEWAY}/${hash}`, { signal: AbortSignal.timeout(8000) });
      if (resp.status === 429 || resp.status >= 500) {
        errors.push(`${resp.status} (attempt ${attempt + 1})`);
        await sleep(800 * 2 ** attempt + Math.random() * 400);
        continue;
      }
      if (!resp.ok) break; // 4xx кроме 429 — CID на шлюзе точно нет
      const text = await resp.text();
      if (text.length > 500_000) throw new Error("Response too large");
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Abort/timeout тоже ретраим
      errors.push(`${msg} (attempt ${attempt + 1})`);
      await sleep(800 * 2 ** attempt + Math.random() * 400);
    }
  }
  throw new Error(`IPFS fetch failed: ${errors.join("; ") || hash}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

  // Top-level manifest metadata (description/repository live here in the YAML,
  // NOT in the GraphQL `manifest {}` object returned by the gateway).
  const description = doc.description ? String(doc.description).trim() : undefined;
  const repository = doc.repository ? String(doc.repository).trim() : undefined;

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

    // ABI file references from this data source's mapping. The data source was
    // already selected by the queried contract address, so prefer ABI files
    // whose alias matches the data source's own ABI (source.abi): auxiliary
    // ABIs (unrelated token templates, libraries) referenced by the same
    // mapping must not contaminate the merged ABI. If no alias matches,
    // keep all files and let the consensus filter decide.
    if (mapping?.abis && Array.isArray(mapping.abis)) {
      const abiAlias = srcBlock?.abi ? String(srcBlock.abi) : "";
      const collected: { name: string; file: string }[] = [];
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
        if (name && file) collected.push({ name, file });
      }
      const matching = collected.filter(
        (c) => c.name.toLowerCase() === abiAlias.toLowerCase(),
      );
      rawAbis.push(...(matching.length > 0 ? matching : collected));
    }
  }

  return { dataSources, entities, eventHandlers, schemaHash, schemaRefRaw, abis: rawAbis, description, repository };
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

    // Only include entities that the manifest's dataSources (already filtered
    // by the queried contract address) actually write to. When the entity list
    // is empty, it means "no dataSources relevant to this contract" — so keep
    // nothing. (Previously an empty list fell through to "include ALL schema
    // entities", which polluted the graph with unrelated entities.)
    if (!manifestEntities.includes(typeName)) continue;

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

/** Fetch ABI JSON from IPFS and extract function signatures with consensus filtering.
 * Fetches in parallel with a concurrency limit to avoid throttling the IPFS gateway.
 *
 * Different subgraphs often reference different (incomplete or wrong) ABI files for
 * the same contract. Strategy:
 *  - Functions present in >=2 distinct ABI files form the CONSENSUS CORE — safe,
 *    corroborated by several subgraphs.
 *  - A complete official ABI (e.g. the full Tether ABI) may be the ONLY file that
 *    carries risk/control functions (pause, blacklist, issue, redeem, ...). Those
 *    are important and MUST NOT be dropped. We therefore also include ALL functions
 *    from the LARGEST ABI file that contains ALL functions of the consensus core
 *    (it is an extension of the common interface, not a mismatched template).
 */
export async function fetchABIFunctions(
  abis: { name: string; file: string }[]
): Promise<ABIFunction[]> {
  // Deduplicate by file hash BEFORE fetching: different subgraphs often
  // reference the very same ABI file. Fewer gateway fetches = fewer 429s
  // from the throttling public IPFS gateway, and identical files must not
  // inflate the consensus "distinct ABI files" count below.
  const byHash = new Map<string, { name: string; file: string }>();
  for (const abi of abis) {
    const hash = extractIPFSHash(abi.file);
    if (hash && !byHash.has(hash)) byHash.set(hash, abi);
  }
  const unique = [...byHash.values()];

  // Fetch each unique ABI file -> list of functions
  const CONCURRENCY = 3;
  const perFile: ABIFunction[][] = [];
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (abi): Promise<ABIFunction[]> => {
        const hash = extractIPFSHash(abi.file)!;
        try {
          return parseAbiJson(await fetchFromIPFS(hash));
        } catch {
          return [];
        }
      })
    );
    perFile.push(...results);
  }

  // Count how many distinct ABI files contain each function signature
  const sigToFunction = new Map<string, ABIFunction>();
  const sigToFileCount = new Map<string, Set<number>>();
  for (let fileIdx = 0; fileIdx < perFile.length; fileIdx++) {
    const seenInFile = new Set<string>();
    for (const fn of perFile[fileIdx]) {
      const sig = `${fn.name}(${fn.inputs.map((i) => i.type).join(",")})`;
      if (seenInFile.has(sig)) continue;
      seenInFile.add(sig);
      if (!sigToFunction.has(sig)) sigToFunction.set(sig, fn);
      const files = sigToFileCount.get(sig) || new Set<number>();
      files.add(fileIdx);
      sigToFileCount.set(sig, files);
    }
  }

  // Consensus core: functions corroborated by >=2 distinct ABI files
  const coreSignatures = new Set<string>();
  for (const [sig, files] of sigToFileCount) {
    if (files.size >= 2) coreSignatures.add(sig);
  }

  // Pick the canonical (complete) ABI: the largest file that contains ALL
  // consensus-core functions, so it is an extension of the common interface
  // rather than a mismatched/unrelated ABI template.
  let canonicalFile: Set<string> | null = null;
  if (coreSignatures.size > 0 && perFile.length > 1) {
    for (const file of perFile) {
      const fileSigs = new Set(file.map((fn) => `${fn.name}(${fn.inputs.map((i) => i.type).join(",")})`));
      let overlap = 0;
      for (const sig of coreSignatures) if (fileSigs.has(sig)) overlap++;
      // Only a file that carries every consensus function is a true extension of
      // the common interface — otherwise it may be an unrelated/mismatched ABI.
      if (overlap !== coreSignatures.size) continue;
      if (!canonicalFile || fileSigs.size > canonicalFile.size) canonicalFile = fileSigs;
    }
  }

  // Result = consensus core (+ canonical ABI's functions, incl. risk/control funcs)
  const signatureSet = new Set<string>(coreSignatures);
  if (canonicalFile) {
    for (const sig of canonicalFile) signatureSet.add(sig);
  }

  const result: ABIFunction[] = [];
  if (signatureSet.size === 0) {
    // Fallback: single ABI file (or no corroboration) -> keep everything
    for (const fn of sigToFunction.values()) result.push(fn);
  } else {
    for (const sig of signatureSet) {
      const fn = sigToFunction.get(sig);
      if (fn) result.push(fn);
    }
  }
  return result;
}

/** Parse ABI JSON text into ABIFunction objects (without deduplication). */
function parseAbiJson(abiText: string): ABIFunction[] {
  const functions: ABIFunction[] = [];
  try {
    const abiJson = JSON.parse(abiText);
    if (!Array.isArray(abiJson)) return [];

    for (const item of abiJson) {
      if (item?.type !== "function") continue;
      const func = item as Record<string, unknown>;
      const name = String(func.name || "");
      if (!name || name.startsWith("_")) continue;

      const inputs = (func.inputs as Array<{ name: string; type: string }> | undefined) || [];
      const outputs = (func.outputs as Array<{ name: string; type: string }> | undefined) || [];

      functions.push({
        name,
        inputs: inputs.slice(0, 5).map((inp) => ({ name: inp.name || "", type: inp.type })),
        outputs: outputs.slice(0, 3).map((out) => ({ name: out.name || "", type: out.type })),
        stateMutability: func.stateMutability ? String(func.stateMutability) : undefined,
      });
    }
  } catch {
    // ignore parse errors for this ABI
  }
  return functions;
}

