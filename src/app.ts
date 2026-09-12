import type { AnalysisResult, EcosystemNode, ProgressStep } from "../shared/types.js";
import { GraphRenderer } from "./graph/renderer.js";

const LOADING_MESSAGES = [
  "🧙 Polishing the crystal ball...",
  "🐉 Waking up the contract-dragon...",
  "🧚 Bribing pixies with candy for gossip...",
  "🍓 Watering the strawberries so the map grows...",
  "🦄 Chasing a unicorn that stole an ABI...",
  "🔮 The stars say: ecosystem almost revealed!",
];

const EMPTY_MESSAGES = [
  "No ecosystem drama detected.",
  "This contract appears to be living a quiet life.",
];

let renderer: GraphRenderer | null = null;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("search-form") as HTMLFormElement;
  const input = document.getElementById("address-input") as HTMLInputElement;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const addr = input.value.trim();
    if (addr) analyze(addr);
  });

  const svg = document.getElementById("ecosystem-graph") as unknown as SVGSVGElement;
  const tooltip = document.getElementById("graph-tooltip") as HTMLDivElement;
  renderer = new GraphRenderer(svg, tooltip);
  renderer.setOnNodeClick((node) => showInfoPanel(node, currentResult));
  renderer.setData([], []);

  document.getElementById("zoom-in")?.addEventListener("click", () => renderer?.zoomIn());
  document.getElementById("zoom-out")?.addEventListener("click", () => renderer?.zoomOut());
  document.getElementById("zoom-reset")?.addEventListener("click", () => renderer?.resetView());

  input.focus();

  // Fireflies sparkle in the enchanted sky
  const ff = document.getElementById("fireflies");
  if (ff) {
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("i");
      s.style.left = Math.random() * 100 + "%";
      s.style.top = 20 + Math.random() * 70 + "%";
      s.style.animationDelay = (-Math.random() * 7).toFixed(1) + "s";
      ff.appendChild(s);
    }
  }

  // Friendly sample spells
  document.querySelectorAll<HTMLButtonElement>(".tip-chip").forEach((b) => {
    b.addEventListener("click", () => {
      input.value = b.dataset.sample || "";
      if (input.value) analyze(input.value);
    });
  });

  // Auto-analyze when an address is passed in the URL (?address=0x…)
  const urlAddr = new URLSearchParams(window.location.search).get("address");
  if (urlAddr) {
    input.value = urlAddr;
    analyze(urlAddr);
  }
});

/** Build an `.info-section` row with a label and plain-text value (XSS-safe). */
function infoRow(label: string, value: string, mono = false): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "info-section";
  const l = document.createElement("div");
  l.className = "info-label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "info-value";
  v.textContent = value;
  if (mono) {
    v.style.fontFamily = "var(--mono)";
    v.style.fontSize = "0.8rem";
  }
  div.appendChild(l);
  div.appendChild(v);
  return div;
}

function infoLabel(label: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "info-section";
  const l = document.createElement("div");
  l.className = "info-label";
  l.textContent = label;
  div.appendChild(l);
  return div;
}

let loadingTimer: number | null = null;

function stopLoadingAnimation() {
  if (loadingTimer !== null) {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

let currentResult: AnalysisResult | null = null;

async function analyze(address: string) {
  const form = document.getElementById("search-form") as HTMLFormElement;
  const input = document.getElementById("address-input") as HTMLInputElement;
  const btn = form.querySelector("button") as HTMLButtonElement;
  btn.disabled = true;
  input.disabled = true;

  showLoading();
  hideError();
  hideResults();
  hideEmpty();

  console.log("[app] analyze:start", { address });
  const t0 = Date.now();
  try {
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    console.log("[app] analyze:response", { status: resp.status, ms: Date.now() - t0 });

    let data: AnalysisResult | { error: string };
    try {
      data = await resp.json();
    } catch {
      console.error("[app] analyze:bad-json", { status: resp.status });
      showError(`Server returned ${resp.status}. Is the API running? (vite proxy -> :3001, or vercel dev)`);
      return;
    }
    console.log("[app] analyze:payload", {
      ok: resp.ok,
      keys: Object.keys(data),
      stats: (data as AnalysisResult).stats,
      nodes: (data as AnalysisResult).nodes?.length,
      bytes: JSON.stringify(data).length,
    });

    if (!resp.ok || "error" in data) {
      showError("error" in data ? data.error : "Analysis failed. Please try again.");
      return;
    }

    currentResult = data;
    showResults(data);
  } catch (err) {
    console.error("[app] analyze:fetch-failed", err);
    showError("Network error. API unreachable — run `vercel dev` or local API on :3001.");
  } finally {
    btn.disabled = false;
    input.disabled = false;
  }
}

function showLoading() {
  const section = document.getElementById("loading-section")!;
  section.classList.remove("hidden");
  section.innerHTML = "";

  const steps: ProgressStep[] = [
    { id: "discover", label: "🗺️ Hunting pixie-subgraphs in the forest...", status: "pending" },
    { id: "manifest", label: "📜 Reading ancient scrolls (manifests)...", status: "pending" },
    { id: "ai", label: "🧙 Asking the wise oracle-AI...", status: "pending" },
  ];

  for (const step of steps) {
    const div = document.createElement("div");
    div.className = "progress-step";
    div.id = `step-${step.id}`;
    const icon = document.createElement("span");
    icon.className = "step-icon";
    icon.textContent = "○";
    div.appendChild(icon);
    div.appendChild(document.createTextNode(` ${step.label}`));
    section.appendChild(div);
  }

  const msg = document.createElement("div");
  msg.className = "loading-message";
  msg.id = "loading-message";
  msg.textContent = LOADING_MESSAGES[0];
  section.appendChild(msg);

  // Animate steps progressively
  let stepIdx = 0;
  loadingTimer = window.setInterval(() => {
    if (stepIdx >= steps.length) {
      stopLoadingAnimation();
      return;
    }
    if (stepIdx > 0) {
      const prev = document.getElementById(`step-${steps[stepIdx - 1].id}`);
      if (prev) {
        prev.classList.remove("active");
        prev.classList.add("done");
        prev.querySelector(".step-icon")!.textContent = "✓";
      }
    }
    const current = document.getElementById(`step-${steps[stepIdx].id}`);
    if (current) {
      current.classList.add("active");
      current.querySelector(".step-icon")!.textContent = "●";
      current.querySelector(".step-icon")!.classList.add("active");
    }
    const msgEl = document.getElementById("loading-message");
    if (msgEl) msgEl.textContent = LOADING_MESSAGES[stepIdx % LOADING_MESSAGES.length];
    stepIdx++;
  }, 800);
}

function showResults(result: AnalysisResult) {
  stopLoadingAnimation();
  document.getElementById("loading-section")?.classList.add("hidden");
  document.getElementById("empty-state")?.classList.add("hidden");

  const section = document.getElementById("results-section")!;
  section.classList.remove("hidden");

  // Render graph
  renderer?.setData(result.nodes, result.edges);

  // Stats bar
  renderStats(result);

  // Ecosystem overview: networks, roles by name
  renderOverview(result);

  // AI analysis
  renderAI(result);

  // Sources
  renderSources(result);
}

function renderStats(result: AnalysisResult) {
  const bar = document.getElementById("stats-bar")!;
  bar.innerHTML = "";
  const s = result.stats;
  const items: Array<[string, number, string]> = [
    ["🧚 Pixie Subgraphs", s.subgraphs, "gossiping pixies found"],
    ["💎 Treasure Chests", s.entities, "entities / treasures"],
    ["🌍 Magic Kingdoms", s.networks, "networks / kingdoms"],
  ];
  for (const [label, value, title] of items) {
    const chip = document.createElement("div");
    chip.className = "stat-chip";
    chip.title = title;
    const v = document.createElement("div");
    v.className = "stat-value";
    v.textContent = String(value);
    const l = document.createElement("div");
    l.className = "stat-label";
    l.textContent = label;
    chip.appendChild(v);
    chip.appendChild(l);
    bar.appendChild(chip);
  }
}

/**
 * Show the actual NAMES of networks and roles (not just counts).
 * Networks are derived from the analyzed subgraphs; roles come from AI.
 */
function renderOverview(result: AnalysisResult) {
  const box = document.getElementById("overview-section");
  if (!box) return;
  box.innerHTML = "";

  const networks = [...new Set(result.subgraphs.map((s) => s.discovery.network).filter((v): v is string => Boolean(v)))];
  if (networks.length) {
    const grid = document.createElement("div");
    grid.className = "overview-grid";

    const row = (label: string, emoji: string, items: (string | { label: string; title?: string })[], color: string) => {
      if (!items.length) return;
      const cell = document.createElement("div");
      cell.className = "overview-cell";
      const head = document.createElement("div");
      head.className = "overview-label";
      head.textContent = `${emoji} ${label}`;
      cell.appendChild(head);
      const chips = document.createElement("div");
      chips.className = "overview-chips";
      for (const item of items) {
        const c = document.createElement("span");
        c.className = "overview-chip";
        c.style.borderColor = color;
        c.style.color = color === "var(--cyan)" ? "var(--cyan)" : color;
        if (typeof item === "string") c.textContent = item;
        else {
          c.textContent = item.label;
          if (item.title) c.title = item.title;
        }
        chips.appendChild(c);
      }
      cell.appendChild(chips);
      grid.appendChild(cell);
    };

    row("Magic Kingdoms", "🌍", networks, "var(--gold)");

    box.appendChild(grid);
  }
}

function renderAI(result: AnalysisResult) {
  const section = document.getElementById("ai-section")!;
  section.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.textContent = "🔮 Tales from the Oracle";
  const oracleSub = document.createElement("p");
  oracleSub.className = "oracle-sub";
  oracleSub.textContent = "🦉 the wise owl read the stars, the scrolls & the pixie gossip — just for you!";
  section.appendChild(heading);
  section.appendChild(oracleSub);

  // No hardcoded fallback content — everything comes from generation.
  // When the AI layer fails, show the REAL error text, whatever it is.
  if (result.aiError) {
    const why = document.createElement("p");
    why.className = "loading-message";
    why.textContent = result.aiError;
    section.appendChild(why);
  }
  if (!result.aiAnalysis) return;

  const ai = result.aiAnalysis;

  // 📖 Owl parable — the moral, not a retelling
  if (ai.parable) {
    const tale = document.createElement("div");
    tale.className = "ai-block ai-story";
    const t = document.createElement("div");
    t.className = "ai-block-title";
    t.textContent = "🦉 The Owl's Parable — one line of tavern wisdom";
    const p = document.createElement("p");
    p.className = "ai-block-text ai-story-text";
    p.textContent = ai.parable;
    tale.appendChild(t);
    tale.appendChild(p);
    section.appendChild(tale);
  }

  const blocks: Array<[string, string]> = [
    ["🐉 What beast be this? — the contract, plainly", ai.whatIsIt],
    ["⚠️ Dragon warnings! — fine print, kindly (risks)", ai.riskyBusiness],
  ];
  for (let i = 0; i < blocks.length; i++) {
    const [title, text] = blocks[i];
    if (!text) continue;
    const block = document.createElement("div");
    block.className = "ai-block";
    const t = document.createElement("div");
    t.className = "ai-block-title";
    t.textContent = title;
    const p = document.createElement("p");
    p.className = "ai-block-text";
    p.textContent = text;
    block.appendChild(t);
    block.appendChild(p);
    section.appendChild(block);

    // 📖 The Tale — 3rd place: after "What beast be this?" and before "Dragon warnings"
    if (i === 0 && ai.story) {
      const tale = document.createElement("div");
      tale.className = "ai-block";
      const tt = document.createElement("div");
      tt.className = "ai-block-title";
      tt.textContent = "📖 The Tale — where the beast lives";
      const pp = document.createElement("p");
      pp.className = "ai-block-text";
      pp.textContent = ai.story;
      tale.appendChild(tt);
      tale.appendChild(pp);
      section.appendChild(tale);
    }
  }
}

/** Format raw token amounts (wei, 1e18) into human-readable GRT values. */
function formatTokens(raw: number | undefined): string {
  if (raw === undefined || raw === null || Number.isNaN(raw)) return "";
  const tokens = raw / 1e18;
  if (tokens >= 1000) return Math.round(tokens).toLocaleString("en-US");
  if (tokens >= 1) return tokens.toFixed(1);
  if (tokens > 0) return tokens.toPrecision(2);
  return "0";
}

function renderSources(result: AnalysisResult) {
  const section = document.getElementById("sources-section")!;
  section.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.textContent = `Top ${result.subgraphs.length} Sources`;
  section.appendChild(heading);

  const table = document.createElement("table");
  table.className = "sources-table";

  const thead = document.createElement("thead");
  const thr = document.createElement("tr");
  for (const h of ["IPFS", "Network", "Description", "Signal (GRT)", "Query fees (GRT)"]) {
    const th = document.createElement("th");
    th.textContent = h;
    thr.appendChild(th);
  }
  thead.appendChild(thr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const sg of result.subgraphs) {
    const tr = document.createElement("tr");

    const ipfs = document.createElement("td");
    ipfs.className = "mono";
    ipfs.textContent = sg.discovery.ipfsHash ?? "";
    tr.appendChild(ipfs);

    const net = document.createElement("td");
    net.textContent = sg.discovery.network ?? "";
    tr.appendChild(net);

    const desc = document.createElement("td");
    desc.textContent = sg.discovery.description ?? "";
    tr.appendChild(desc);

    const signal = document.createElement("td");
    signal.textContent = formatTokens(sg.discovery.signalAmount);
    tr.appendChild(signal);

    const queries = document.createElement("td");
    queries.textContent = formatTokens(sg.discovery.queryFeesAmount ? Number(sg.discovery.queryFeesAmount) : undefined);
    tr.appendChild(queries);

    if (sg.errors.length > 0) tr.title = `${sg.errors.length} warnings`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  section.appendChild(table);
}

function showInfoPanel(node: EcosystemNode, result: AnalysisResult | null) {
  const panel = document.getElementById("info-panel")!;
  panel.classList.remove("hidden");
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "info-panel-header";
  const title = document.createElement("div");
  title.className = "info-panel-title";
  title.textContent = node.label;
  header.appendChild(title);
  const closeBtn = document.createElement("button");
  closeBtn.className = "info-panel-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close panel");
  closeBtn.onclick = () => panel.classList.add("hidden");
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const meta = node.metadata || {};

  if (node.type === "role" || node.type === "concept") {
    const conf = typeof meta.confidence === "string" ? meta.confidence : "UNKNOWN";
    const confDiv = infoRow("Confidence", conf.toUpperCase());
    confDiv.querySelector(".info-value")?.classList.add(`confidence-${conf}`);
    panel.appendChild(confDiv);

    // Find matching concept in results
    const concept = result?.concepts.find((c) => c.concept === node.label);
    if (concept && concept.evidence.length > 0) {
      const evDiv = infoLabel("Evidence");
      const ul = document.createElement("ul");
      ul.className = "evidence-list";
      for (const e of concept.evidence.slice(0, 10)) {
        const li = document.createElement("li");
        li.className = "evidence-item";
        const type = document.createElement("span");
        type.className = "evidence-type";
        type.textContent = e.type;
        li.appendChild(type);
        li.appendChild(document.createTextNode(` — ${e.source}: ${e.value}`));
        ul.appendChild(li);
      }
      evDiv.appendChild(ul);
      panel.appendChild(evDiv);
    }

    const sources = meta.sources as string[] | undefined;
    if (sources) {
      panel.appendChild(infoRow("Sources", `${sources.length} subgraphs`));
    }
  } else if (node.type === "subgraph") {
    if (meta.network) {
      panel.appendChild(infoRow("Network", String(meta.network)));
    }
    if (meta.description) {
      panel.appendChild(infoRow("Description", String(meta.description).slice(0, 200)));
    }
    if (meta.repository) {
      const repoStr = String(meta.repository);
      const repoDiv = infoLabel("Repository");
      const v = document.createElement("div");
      v.className = "info-value";
      if (/^https?:\/\//i.test(repoStr)) {
        const a = document.createElement("a");
        a.href = repoStr;
        a.target = "_blank";
        a.rel = "noopener";
        a.style.color = "var(--purple)";
        a.textContent = repoStr;
        v.appendChild(a);
      } else {
        v.textContent = repoStr;
      }
      repoDiv.appendChild(v);
      panel.appendChild(repoDiv);
    }
    if (meta.queryCount !== undefined) {
      panel.appendChild(infoRow("Query Count", String(meta.queryCount)));
    }
  } else if (node.type === "entity") {
    if (meta.description) {
      panel.appendChild(infoRow("Description", String(meta.description).slice(0, 200)));
    }
    const fields = meta.fields as Array<{ name: string; type: string }> | undefined;
    if (fields && fields.length > 0) {
      const fieldsDiv = infoLabel("Fields");
      const ul = document.createElement("ul");
      ul.className = "evidence-list";
      for (const f of fields) {
        const li = document.createElement("li");
        li.className = "evidence-item";
        const name = document.createElement("span");
        name.className = "evidence-type";
        name.textContent = f.name;
        li.appendChild(name);
        li.appendChild(document.createTextNode(` — ${f.type}`));
        ul.appendChild(li);
      }
      fieldsDiv.appendChild(ul);
      panel.appendChild(fieldsDiv);
    }
    if (meta.subgraph) {
      panel.appendChild(infoRow("From Subgraph", String(meta.subgraph)));
    }
  } else if (node.type === "contract") {
    panel.appendChild(infoRow("Address", String(meta.address || node.label), true));
  } else if (node.type === "network") {
    panel.appendChild(infoRow("Network", node.label));
  }
}

function showError(msg: string) {
  stopLoadingAnimation();
  document.getElementById("loading-section")?.classList.add("hidden");
  const section = document.getElementById("error-section")!;
  section.classList.remove("hidden");
  section.textContent = msg;
}

function hideError() {
  document.getElementById("error-section")?.classList.add("hidden");
}

function hideResults() {
  document.getElementById("results-section")?.classList.add("hidden");
}

function hideEmpty() {
  document.getElementById("empty-state")?.classList.add("hidden");
}
