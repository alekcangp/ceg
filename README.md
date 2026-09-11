# ✨ Co-Eco-Graph

Discover how a smart contract is used across the indexed Web3 ecosystem.

Paste any contract address and watch its subgraph ecosystem come alive — entities, data sources, event handlers, and AI-powered interpretation, all in one interactive graph.

## ETHOnline 2026 — The Graph Prize

This project is built for [ETHOnline 2026](https://ethglobal.com/events/ethonline2026) and eligible for **The Graph** prize track ($15,000 total).

### Eligible tracks

- **🤖 Best AI Tooling or AI Use Case with The Graph** — Co-Eco-Graph uses The Graph as its live source of blockchain data and layers AI (Cloudflare Workers AI) on top for semantic interpretation of contract ecosystems. It queries the Graph Network subgraph to discover deployments, fetches manifests and schemas from IPFS, then sends structured context to an LLM for analysis.

- **🧩 Best Use of Composable or Standardized Graph Products** — The app composes multiple Graph products: subgraph discovery via the Graph Network subgraph, IPFS manifest fetching, and GraphQL schema parsing. It demonstrates how standardized subgraph data can be queried, deduplicated, and visualized across protocols.

### Key integrations with The Graph

- Queries the **Graph Network Subgraph** to discover subgraph deployments indexing a contract
- Fetches **subgraph manifests** from IPFS (inline or by ipfsHash)
- Parses **GraphQL schemas** from IPFS to extract entities and fields
- Deduplicates semantic concepts across multiple subgraphs
- Sends structured context to AI for cross-subgraph pattern recognition

### Submission requirements

- [x] Public repository
- [x] Consumes live data from The Graph (not mocked/static)
- [x] Uses The Graph as a load-bearing part of the project
- [ ] Demo video (2-4 minutes) — *to be recorded*

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run dev
```

Then open http://localhost:5173

### Run API locally (optional, for development)

```bash
npm run dev:api
```

This starts the analyze endpoint at http://localhost:3001/api/analyze

> **Ports:** Frontend runs on **5173** (Vite), API server on **3001**. Vite proxies `/api` requests to the API server automatically.

## How It Works

1. Enter a smart contract address
2. The app searches The Graph's decentralized network for subgraphs that index that contract
3. It retrieves and parses the top subgraphs.
4. It extracts data sources, event handlers, entities, and fields from sunbgraph`s manifest
5. It retrieves and parses GraphQL schemas from IPFS
6. It sends one compact dataset to Cloudflare Workers AI for semantic interpretation
8. It visualizes the ecosystem as an interactive graph

## Architecture

- **Frontend**: Vanilla TypeScript + SVG graph (no framework)
- **Backend**: Vercel serverless functions (`api/analyze.ts`)
- **AI**: Cloudflare Workers AI (Llama 3.1) — optional, app works without it
- **Data sources**: The Graph decentralized network, IPFS

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:api` | Start local API server for `/api/analyze` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run typecheck` | Run TypeScript type checking |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | No | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | No | Cloudflare Workers AI API token |
| `CF_AI_MODEL` | No | Cloudflare AI model (default: `@cf/meta/llama-3.1-8b-instruct`) |
| `THEGRAPH_API_KEY` | Yes | The Graph API key |
| `GRAPH_NETWORK_SUBGRAPH_ID` | Yes | Graph Network subgraph deployment ID |
| `IPFS_GATEWAY_URL` | No | IPFS gateway URL (default: `https://ipfs.thegraph.com/ipfs`) |
| `TOP_SUBGRAPHS` | No | Top N subgraphs by signal + top N by query fees (default: `5`) |

> **Note**: AI analysis is optional. If Cloudflare credentials are not provided, the app still performs full subgraph discovery, manifest/schema parsing, and graph visualization — just without AI interpretation.


