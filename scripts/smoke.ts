/**
 * Offline smoke test of the pipeline (no network).
 * Run: npx tsx scripts/smoke.ts
 */
import { discoverSubgraphs, rankSubgraphs } from "../src/discovery/discovery.js";
import { buildAIContext, buildPrompt, parseAIResponse } from "../src/ai/ai.js";
import { buildGraph } from "../src/graph/builder.js";
import type { SubgraphAnalysis, SubgraphDiscovery } from "../shared/types.js";

let failures = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, extra ?? ""); }
};

// --- 1. rankSubgraphs: stable sort + no mutation of input
{
  const input = [
    { id: "a", name: "a" }, { id: "b", name: "b", manifestText: "m" },
  ] as SubgraphDiscovery[];
  const ranked = rankSubgraphs(input);
  check("rankSubgraphs: не мутирует вход", input[0].id === "a");
  check("rankSubgraphs: манифест раньше", ranked[0].id === "b");
}

// --- 2. buildAIContext + buildPrompt: no limits on entities/fields/descriptions
{
  const sg = (i: number): SubgraphAnalysis => ({
    discovery: { id: `Qm${i}`, name: `sub${i}`, network: `net${i % 2 === 0 ? "mainnet" : "polygon"}`, ipfsHash: `Qm${i}`, signalAmount: 1000 * (i + 1) },
    schema: {
      entities: Array.from({ length: 12 }, (_, ei) => ({
        name: `Entity${ei}`,
        description: `Description of entity ${ei}`,
        fields: Array.from({ length: 15 }, (_, fi) => ({
          name: `field${fi}`,
          type: "Bytes!",
          description: `desc for field ${fi}`,
        })),
      })),
    },
    manifest: { dataSources: [], entities: ["M1", "M2"], eventHandlers: [] },
    errors: [],
  });
  const analyses = [sg(0), sg(1)];
  const ctx = buildAIContext({ address: "0xabc" }, analyses, [{ name: "transfer", inputs: [], outputs: [] }]);
  check("context: все 12 сущностей сабграфа 0", (ctx.subgraphs[0] as any).entities.length === 12);
  check("context: все 15 полей", (ctx.subgraphs[0] as any).entities[0].fields.length === 15);
  check("context: описание поля сохранено", (ctx.subgraphs[0] as any).entities[11].fields[14].description === "desc for field 14");

  const prompt = buildPrompt(ctx);
  check("prompt: содержит описание последнего поля", prompt.includes("desc for field 14"), prompt.slice(0, 0));
  check("prompt: содержит последнюю сущность", prompt.includes("Entity11"));
  check("prompt: обе сети видны", prompt.includes("mainnet") && prompt.includes("polygon"));

  // Пустые данные — не должно падать
  const emptyCtx = buildAIContext({ address: "0xabc" }, [{ discovery: { id: "x", name: "x" }, errors: [] } as SubgraphAnalysis]);
  const emptyPrompt = buildPrompt(emptyCtx);
  check("prompt: пустой контекст не падает", typeof emptyPrompt === "string" && emptyPrompt.length > 0);
}

// --- 2b. AI prompt: без protocols, риски с FINE-PRINT SCAN
{
  const protoPrompt = buildPrompt(buildAIContext({ address: "0xabc" }, []));
  check(
    "protocols: удалены из промпта",
    !protoPrompt.includes('"protocols"') && !protoPrompt.includes("IS USED BY"),
    protoPrompt.slice(0, 200),
  );
  check(
    "risks: промпт требует FINE-PRINT SCAN с именами функций",
    protoPrompt.includes("FINE-PRINT SCAN") && protoPrompt.includes("destroyBlackFunds") && protoPrompt.includes("BY NAME"),
  );
}

// --- 3. buildGraph: все сущности, дедуп по id
{
  const sg: SubgraphAnalysis = {
    discovery: { id: "QmX", name: "sub", network: "mainnet" },
    schema: { entities: Array.from({ length: 7 }, (_, i) => ({ name: `E${i}`, description: `d${i}`, fields: [{ name: "f1", type: "ID" }] })) },
    errors: [],
  };
  const { nodes, edges } = buildGraph({ address: "0xabc" }, [sg, sg], []);
  // 1 contract + 1 subgraph (дедуп) + 7 entities
  check("graph: дедуп узлов сабграфа", nodes.filter((n) => n.type === "subgraph").length === 1);
  check("graph: все 7 сущностей", nodes.filter((n) => n.type === "entity").length === 7);
  check("graph: edges = 8 (1 контракт + 7 сущностей)", edges.length === 8);
  const meta = nodes.find((n) => n.type === "entity")!.metadata as any;
  check("graph: поля в metadata без обрезки", meta.fields.length === 1 && meta.description === "d0");
}

// --- 4. parseAIResponse: notices + устойчивость к мусору
{
  const ok = parseAIResponse(JSON.stringify({ whatIsIt: "x", whatItCanDo: "", ecosystemTracking: "", riskyBusiness: "", bottomLine: "b", roles: [], notices: ["n1"], concepts: [] }));
  check("parse: notices распарсены", ok?.notices?.[0] === "n1");
  check("parse: мусор не падает", parseAIResponse("!!!garbage!!!") !== undefined);
}

// --- 5. discoverSubgraphs: без сети просто возвращает [] (не падает)
{
  const res = await discoverSubgraphs("0x0000000000000000000000000000000000000001");
  check("discover: отсутствие сети → [] (2 retry, ~13s)", Array.isArray(res));
}

console.log(failures === 0 ? "\nALL SMOKE TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
