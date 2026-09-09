import type { AnalysisResult, EcosystemNode, ProgressStep } from "../shared/types.js";
import { GraphRenderer } from "./graph/renderer.js";

const LOADING_MESSAGES = [
  "Interrogating the blockchain...",
  "Reading contract fingerprints...",
  "Connecting the dots... literally.",
  "Apparently, this contract has friends.",
  "The graph has opinions.",
  "Ecosystem reconstructed. Nobody was harmed.",
];

const EMPTY_MESSAGES = [
  "No ecosystem drama detected.",
  "This contract appears to be living a quiet life.",
];

const MANY_CONNECTIONS_MSG = "Okay... this contract knows a lot of people.";

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
});

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

  try {
    const resp = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });

    const data: AnalysisResult | { error: string } = await resp.json();

    if (!resp.ok || "error" in data) {
      showError("error" in data ? data.error : "Analysis failed. Please try again.");
      return;
    }

    currentResult = data;
    showResults(data);
  } catch (err) {
    showError("Network error. Please check your connection and try again.");
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
    { id: "discover", label: "Finding subgraphs...", status: "pending" },
    { id: "rank", label: "Selecting top 10...", status: "pending" },
    { id: "manifest", label: "Analyzing manifests...", status: "pending" },
    { id: "schema", label: "Reading schemas...", status: "pending" },
    { id: "ai", label: "Building ecosystem...", status: "pending" },
  ];

  for (const step of steps) {
    const div = document.createElement("div");
    div.className = "progress-step";
    div.id = `step-${step.id}`;
    div.innerHTML = `<span class="step-icon">○</span> ${step.label}`;
    section.appendChild(div);
  }

  const msg = document.createElement("div");
  msg.className = "loading-message";
  msg.id = "loading-message";
  msg.textContent = LOADING_MESSAGES[0];
  section.appendChild(msg);

  // Animate steps progressively
  let stepIdx = 0;
  const interval = setInterval(() => {
    if (stepIdx >= steps.length) {
      clearInterval(interval);
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
  document.getElementById("loading-section")?.classList.add("hidden");
  document.getElementById("empty-state")?.classList.add("hidden");

  const section = document.getElementById("results-section")!;
  section.classList.remove("hidden");

  // Render graph
  renderer?.setData(result.nodes, result.edges);

  // AI analysis
  renderAI(result);

  // Sources
  renderSources(result);

  // Partial failure notice
  if (result.errors.length > 0 && result.subgraphs.length > 0) {
    const notice = document.createElement("div");
    notice.className = "loading-message";
    notice.style.color = "var(--amber)";
    notice.style.marginBottom = "16px";
    notice.textContent = `Some sources could not be analyzed. ${result.stats.analyzed} of ${result.stats.analyzed + result.stats.failed} subgraphs were successfully processed.`;
    section.insertBefore(notice, document.getElementById("ai-section"));
  }

  // Many connections humor
  if (result.nodes.length > 20) {
    const humor = document.createElement("div");
    humor.className = "loading-message";
    humor.textContent = MANY_CONNECTIONS_MSG;
    humor.style.marginBottom = "16px";
    section.insertBefore(humor, document.getElementById("ai-section"));
  }
}

function renderAI(result: AnalysisResult) {
  const section = document.getElementById("ai-section")!;
  section.innerHTML = "";

  if (!result.aiAnalysis) {
    section.innerHTML = `<div class="section-heading">Analysis</div><p class="ai-summary">AI analysis unavailable. Showing deterministic results below.</p>`;
    return;
  }

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.textContent = "Analysis";
  section.appendChild(heading);

  const summary = document.createElement("p");
  summary.className = "ai-summary";
  summary.textContent = result.aiAnalysis.summary;
  section.appendChild(summary);

  if (result.aiAnalysis.roles.length > 0) {
    const rolesHeading = document.createElement("div");
    rolesHeading.className = "section-heading";
    rolesHeading.textContent = "Key Roles";
    rolesHeading.style.marginTop = "20px";
    section.appendChild(rolesHeading);

    const rolesDiv = document.createElement("div");
    rolesDiv.className = "ai-roles";
    for (const role of result.aiAnalysis.roles) {
      const badge = document.createElement("div");
      badge.className = "role-badge";
      badge.innerHTML = `<span class="role-name">${role.role}</span><span class="role-confidence confidence-${role.confidence}">${role.confidence}</span>`;
      rolesDiv.appendChild(badge);
    }
    section.appendChild(rolesDiv);
  }
}

function renderSources(result: AnalysisResult) {
  const section = document.getElementById("sources-section")!;
  section.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.textContent = `Top ${result.subgraphs.length} Sources`;
  section.appendChild(heading);

  const list = document.createElement("div");
  list.className = "source-list";

  for (const sg of result.subgraphs) {
    const card = document.createElement("div");
    card.className = "source-card";

    const name = document.createElement("div");
    name.className = "source-name";
    name.textContent = sg.discovery.name;
    card.appendChild(name);

    if (sg.discovery.network) {
      const net = document.createElement("div");
      net.className = "source-network";
      net.textContent = sg.discovery.network;
      card.appendChild(net);
    }

    if (sg.discovery.description) {
      const desc = document.createElement("div");
      desc.className = "source-desc";
      desc.textContent = sg.discovery.description.slice(0, 120);
      card.appendChild(desc);
    }

    const meta = document.createElement("div");
    meta.className = "source-meta";
    if (sg.discovery.repository) {
      const link = document.createElement("a");
      link.href = sg.discovery.repository;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "GitHub";
      meta.appendChild(link);
    }
    if (sg.discovery.queryCount !== undefined) {
      const qc = document.createElement("span");
      qc.textContent = `${sg.discovery.queryCount} queries`;
      meta.appendChild(qc);
    }
    if (sg.errors.length > 0) {
      const err = document.createElement("span");
      err.style.color = "var(--amber)";
      err.textContent = `${sg.errors.length} warnings`;
      meta.appendChild(err);
    }
    card.appendChild(meta);

    list.appendChild(card);
  }

  section.appendChild(list);
}

function showInfoPanel(node: EcosystemNode, result: AnalysisResult | null) {
  const panel = document.getElementById("info-panel")!;
  panel.classList.remove("hidden");
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "info-panel-header";
  header.innerHTML = `<div class="info-panel-title">${node.label}</div>`;
  const closeBtn = document.createElement("button");
  closeBtn.className = "info-panel-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close panel");
  closeBtn.onclick = () => panel.classList.add("hidden");
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const meta = node.metadata || {};

  if (node.type === "role" || node.type === "concept") {
    const confDiv = document.createElement("div");
    confDiv.className = "info-section";
    confDiv.innerHTML = `<div class="info-label">Confidence</div><div class="info-value confidence-${meta.confidence}">${(meta.confidence as string)?.toUpperCase() || "UNKNOWN"}</div>`;
    panel.appendChild(confDiv);

    // Find matching concept in results
    const concept = result?.concepts.find((c) => c.concept === node.label);
    if (concept && concept.evidence.length > 0) {
      const evDiv = document.createElement("div");
      evDiv.className = "info-section";
      evDiv.innerHTML = `<div class="info-label">Evidence</div>`;
      const ul = document.createElement("ul");
      ul.className = "evidence-list";
      for (const e of concept.evidence.slice(0, 10)) {
        const li = document.createElement("li");
        li.className = "evidence-item";
        li.innerHTML = `<span class="evidence-type">${e.type}</span> — ${e.source}: ${e.value}`;
        ul.appendChild(li);
      }
      evDiv.appendChild(ul);
      panel.appendChild(evDiv);
    }

    const sources = meta.sources as string[] | undefined;
    if (sources) {
      const srcDiv = document.createElement("div");
      srcDiv.className = "info-section";
      srcDiv.innerHTML = `<div class="info-label">Sources</div><div class="info-value">${sources.length} subgraphs</div>`;
      panel.appendChild(srcDiv);
    }
  } else if (node.type === "subgraph") {
    if (meta.network) {
      const netDiv = document.createElement("div");
      netDiv.className = "info-section";
      netDiv.innerHTML = `<div class="info-label">Network</div><div class="info-value">${meta.network}</div>`;
      panel.appendChild(netDiv);
    }
    if (meta.description) {
      const descDiv = document.createElement("div");
      descDiv.className = "info-section";
      descDiv.innerHTML = `<div class="info-label">Description</div><div class="info-value">${String(meta.description).slice(0, 200)}</div>`;
      panel.appendChild(descDiv);
    }
    if (meta.repository) {
      const repoDiv = document.createElement("div");
      repoDiv.className = "info-section";
      repoDiv.innerHTML = `<div class="info-label">Repository</div><div class="info-value"><a href="${meta.repository}" target="_blank" rel="noopener" style="color: var(--purple)">${meta.repository}</a></div>`;
      panel.appendChild(repoDiv);
    }
    if (meta.queryCount !== undefined) {
      const qcDiv = document.createElement("div");
      qcDiv.className = "info-section";
      qcDiv.innerHTML = `<div class="info-label">Query Count</div><div class="info-value">${meta.queryCount}</div>`;
      panel.appendChild(qcDiv);
    }
  } else if (node.type === "entity") {
    if (meta.description) {
      const descDiv = document.createElement("div");
      descDiv.className = "info-section";
      descDiv.innerHTML = `<div class="info-label">Description</div><div class="info-value">${String(meta.description).slice(0, 200)}</div>`;
      panel.appendChild(descDiv);
    }
    const fields = meta.fields as Array<{ name: string; type: string }> | undefined;
    if (fields && fields.length > 0) {
      const fieldsDiv = document.createElement("div");
      fieldsDiv.className = "info-section";
      fieldsDiv.innerHTML = `<div class="info-label">Fields</div>`;
      const ul = document.createElement("ul");
      ul.className = "evidence-list";
      for (const f of fields) {
        const li = document.createElement("li");
        li.className = "evidence-item";
        li.innerHTML = `<span class="evidence-type">${f.name}</span> — ${f.type}`;
        ul.appendChild(li);
      }
      fieldsDiv.appendChild(ul);
      panel.appendChild(fieldsDiv);
    }
    if (meta.subgraph) {
      const sgDiv = document.createElement("div");
      sgDiv.className = "info-section";
      sgDiv.innerHTML = `<div class="info-label">From Subgraph</div><div class="info-value">${meta.subgraph}</div>`;
      panel.appendChild(sgDiv);
    }
  } else if (node.type === "contract") {
    const addrDiv = document.createElement("div");
    addrDiv.className = "info-section";
    addrDiv.innerHTML = `<div class="info-label">Address</div><div class="info-value" style="font-family: var(--mono); font-size: 0.8rem">${meta.address || node.label}</div>`;
    panel.appendChild(addrDiv);
  } else if (node.type === "network") {
    const netDiv = document.createElement("div");
    netDiv.className = "info-section";
    netDiv.innerHTML = `<div class="info-label">Network</div><div class="info-value">${node.label}</div>`;
    panel.appendChild(netDiv);
  }
}

function showError(msg: string) {
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
