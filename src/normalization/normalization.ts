import type { SubgraphAnalysis, SemanticConcept, Evidence } from "../../shared/types.js";

/**
 * Deduplicate semantic concepts across subgraphs.
 * Different subgraphs may use different names for the same concept.
 * We use deterministic matching for obvious overlaps and leave
 * finer normalization to the AI step.
 */
export function deduplicateConcepts(analyses: SubgraphAnalysis[]): SemanticConcept[] {
  const concepts: SemanticConcept[] = [];
  const seen = new Map<string, SemanticConcept>();

  for (const analysis of analyses) {
    const sgName = analysis.discovery.name;

    // Extract concepts from entities
    if (analysis.schema?.entities) {
      for (const entity of analysis.schema.entities) {
        const conceptKey = normalizeKey(entity.name);
        const evidence: Evidence[] = [
          { type: "entity", source: sgName, value: entity.name },
        ];

        // Add field evidence
        for (const field of entity.fields.slice(0, 5)) {
          evidence.push({
            type: "field",
            source: sgName,
            value: `${entity.name}.${field.name}: ${field.type}`,
          });
        }

        if (seen.has(conceptKey)) {
          const existing = seen.get(conceptKey)!;
          existing.evidence.push(...evidence);
        } else {
          const concept: SemanticConcept = {
            concept: entity.name,
            confidence: "medium",
            evidence,
          };
          concepts.push(concept);
          seen.set(conceptKey, concept);
        }
      }
    }

    // Extract concepts from events
    if (analysis.manifest?.eventHandlers) {
      for (const handler of analysis.manifest.eventHandlers) {
        if (!handler.event) continue;
        const conceptKey = normalizeKey(extractEventName(handler.event));
        const evidence: Evidence[] = [
          { type: "event", source: sgName, value: handler.event },
        ];

        if (seen.has(conceptKey)) {
          seen.get(conceptKey)!.evidence.push(...evidence);
        } else {
          const concept: SemanticConcept = {
            concept: extractEventName(handler.event),
            confidence: "low",
            evidence,
          };
          concepts.push(concept);
          seen.set(conceptKey, concept);
        }
      }
    }
  }

  // Boost confidence for concepts that appear across multiple subgraphs
  for (const concept of concepts) {
    const sources = new Set(concept.evidence.map((e) => e.source));
    if (sources.size >= 3) concept.confidence = "high";
    else if (sources.size >= 2) concept.confidence = "medium";
  }

  return concepts;
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, "");
}

/** ABI aliases that are standard token/ERC interfaces or token contracts — not protocols. */
const GENERIC_ABI_NAMES = new Set([
  "erc20", "erc20namebytes", "erc20symbolbytes", "erc721", "erc721metadata", "erc1155",
  "erc165", "erc777", "ierc20", "ierc20metadata", "ierc721", "ierc1155",
  "bep20", "bep21", "token", "tokens", "standardtoken", "tokeninterface",
  "weth", "weth9", "wethinterface", "bytes32bytes", "context", "ownable",
]);

/** Generic token-ish ABI names: ERC/BEP standards, interfaces and common token contracts. */
const GENERIC_ABI_RE = /^(erc|bep)\d+|^i[a-z]*erc\d+|token$|usdt$|usdc$|dai$|weth$|wbtc$/;

export function isGenericAbiName(name: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return GENERIC_ABI_NAMES.has(n) || GENERIC_ABI_RE.test(n);
}

/**
 * Extract protocol names from dataSources, skipping generic/standard ABIs
 * (ERC20, Token, TetherToken, BEP20USDT, ...). The dataSource ABI name for a
 * token contract is just an interface alias, not a protocol.
 */
export function extractProtocols(analyses: SubgraphAnalysis[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of analyses) {
    for (const d of a.manifest?.dataSources ?? []) {
      const name = d.abi || d.name;
      if (!name || isGenericAbiName(name)) continue;
      const key = normalizeKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

function extractEventName(signature: string): string {
  // Extract event name from signature like "Transfer(address,address,uint256)"
  const match = signature.match(/^(\w+)\s*\(/);
  return match ? match[1] : signature;
}
