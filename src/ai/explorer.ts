import type { ABIFunction } from "../../shared/types.js";

const EXPLORER_API_URL = process.env.EXPLORER_API_URL || "https://api.etherscan.io/v2/api";
const EXPLORER_API_KEY = process.env.EXPLORER_API_KEY || "";
const EXPLORER_CHAIN_ID = process.env.EXPLORER_CHAIN_ID || "1";

/**
 * Fallback ABI source: pull the contract's own ABI from an explorer
 * (e.g. Etherscan). Subgraph manifests usually reference ABIs by relative
 * path (./abis/X.json) that ISN'T an IPFS hash, so the manifest-based fetch
 * often comes back empty. The explorer always has the source-verified ABI.
 */
export async function fetchExplorerABI(contractAddress: string): Promise<ABIFunction[] | undefined> {
  if (!EXPLORER_API_KEY || !contractAddress) return undefined;

  const url = `${EXPLORER_API_URL}?module=contract&action=getabi&address=${contractAddress.toLowerCase()}&chainid=${EXPLORER_CHAIN_ID}&apikey=${EXPLORER_API_KEY}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`Explorer responded ${resp.status}`);
    const data = await resp.json();
    const result = data?.result;
    if (!result || (typeof result === "string" && (result === "Max rate limit reached" || result.trim().startsWith("Contract source code not verified")))) {
      console.warn("[explorer] ABI not available:", typeof result === "string" ? result.slice(0, 80) : "no result");
      return undefined;
    }
    let abiText: string;
    if (typeof result === "string") {
      // Etherscan wraps the JSON array in a string
      abiText = result;
    } else {
      abiText = JSON.stringify(result);
    }
    const abiJson = JSON.parse(abiText);
    if (!Array.isArray(abiJson)) return undefined;

    const functions: ABIFunction[] = [];
    const seen = new Set<string>();
    for (const item of abiJson) {
      if (item?.type !== "function") continue;
      const name = String(item.name || "");
      if (!name || name.startsWith("_")) continue;
      const inputs = (item.inputs as Array<{ name: string; type: string }> | undefined) || [];
      const outputs = (item.outputs as Array<{ name: string; type: string }> | undefined) || [];
      const signature = `${name}(${inputs.map((i) => i.type).join(",")})`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      functions.push({
        name,
        inputs: inputs.slice(0, 5).map((i) => ({ name: i.name || "", type: i.type })),
        outputs: outputs.slice(0, 3).map((o) => ({ name: o.name || "", type: o.type })),
        stateMutability: item.stateMutability ? String(item.stateMutability) : undefined,
      });
    }
    return functions;
  } catch (err) {
    console.warn("[explorer] ABI fetch failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}