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

function extractEventName(signature: string): string {
  // Extract event name from signature like "Transfer(address,address,uint256)"
  const match = signature.match(/^(\w+)\s*\(/);
  return match ? match[1] : signature;
}
