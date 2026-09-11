# ✨ Co-Eco-Graph

Discover how a smart contract is used across the indexed Web3 ecosystem.

Paste any contract address and watch its subgraph ecosystem come alive — entities, data sources, event handlers, and AI-powered interpretation, all in one interactive graph.

![Screenshot](Screenshot.png)

## ETHOnline 2026 — The Graph Prize

This project is built for [ETHOnline 2026](https://ethglobal.com/events/ethonline2026).

### Key integrations with The Graph

- Queries the **Graph Network Subgraph** to discover subgraph deployments indexing a contract
- Fetches **subgraph manifests** from IPFS (inline or by ipfsHash)
- Parses **GraphQL schemas** from IPFS to extract entities and fields

> **ℹ️ All data comes exclusively from The Graph** — the Graph Network Subgraph API and
> the IPFS gateway (`ipfs.thegraph.com`). No third-party RPC, block explorer, or
> metadata source is used. AI analysis is built **only** from the indexed subgraphs:
> manifests, entities, data sources, event handlers, and their ABI files. For each
> subgraph only the **primary ABI** of the queried contract is used (matched by
> `source.abi`), so auxiliary token ABIs referenced by the subgraph handlers never
> leak into the analysis.


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

## Deploy to Vercel

This project is configured for one-click deployment to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/alekcangp/ceg)

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
- **AI**: Cloudflare Workers AI (Llama 3.3 70B) — optional, app works without it
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
| `THEGRAPH_API_KEY` | Yes | [Get API key](https://thegraph.com/en/) |
| `GRAPH_NETWORK_SUBGRAPH_ID` | No | Default: `QmdKXcBUHR3UyURqVRQHu1oV6VUkBrhi2vNvMx3bNDnUCc` |
| `CLOUDFLARE_ACCOUNT_ID` | No | [Cloudflare account ID](https://developers.cloudflare.com/workers-ai/) |
| `CLOUDFLARE_API_TOKEN` | No | Cloudflare Workers AI token |
| `CF_AI_MODEL` | No | Default: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `IPFS_GATEWAY_URL` | No | IPFS gateway URL (default: `https://ipfs.thegraph.com/ipfs`) |
| `TOP_SUBGRAPHS` | No | Top N subgraphs by signal + top N by query fees (default: `5`) |

> **Note**: AI analysis is optional. If Cloudflare credentials are not provided, the app still performs full subgraph discovery, manifest/schema parsing, and graph visualization — just without AI interpretation.


