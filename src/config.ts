
// ============================================================================
//  SECTION 1 — Pollinations AI (text generation + image generation)
//  Docs: https://gen.pollinations.ai/docs
// ============================================================================

/** SECRET — API key. Get one: https://enter.pollinations.ai/keys */
export const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY ?? "";

/** Base URL of the OpenAI-compatible Pollinations API. */
export const POLLINATIONS_BASE_URL = "https://gen.pollinations.ai";

/** TEXT model for contract analysis (POST /v1/chat/completions).
 *  Full list: https://gen.pollinations.ai/v1/models */
export const POLLINATIONS_MODEL = "openai/gpt-5.4-nano";

/** IMAGE model for fantasy illustrations (POST /v1/images/generations).
 *  Full list: https://gen.pollinations.ai/image/models */
export const POLLINATIONS_MODEL_IMAGE = "black-forest-labs/flux.1-schnell";

// ============================================================================
//  SECTION 2 — The Graph (subgraph discovery)
// ============================================================================

/** SECRET — API key. Get one: https://thegraph.com/en/ */
export const THEGRAPH_API_KEY = process.env.THEGRAPH_API_KEY ?? "";

/** Graph network gateway used for discovery queries. */
export const THEGRAPH_GATEWAY_URL = "https://gateway.thegraph.com/api";

/** The Graph Network Subgraph — the index we query to find deployments that
 *  index the user's contract. */
export const GRAPH_NETWORK_SUBGRAPH_ID =
  "QmdKXcBUHR3UyURqVRQHu1oV6VUkBrhi2vNvMx3bNDnUCc";

// ============================================================================
//  SECTION 3 — IPFS (manifest & GraphQL schema fetching)
// ============================================================================

/** Gateway used to fetch GraphQL schemas by hash. */
export const IPFS_GATEWAY_URL = "https://ipfs.thegraph.com/ipfs";

// ============================================================================
//  SECTION 4 — Pipeline limits
// ============================================================================

/** How many top subgraphs to fetch per role: by curation signal AND by query
 *  fees. Unique deployments from both lists (deduplicated) are analyzed,
 *  displayed and sent to AI — the end count is between TOP_SUBGRAPHS and
 *  2×TOP_SUBGRAPHS. */
export const TOP_SUBGRAPHS = 5;
