import type { EcosystemNode, EcosystemEdge } from "../../shared/types.js";

interface PositionedNode extends EcosystemNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const TYPE_COLORS: Record<string, string> = {
  contract: "#00d4ff",
  subgraph: "#00ff9d",
  entity: "#8b96bd",
};

const TYPE_SHAPES: Record<string, "circle" | "hex" | "diamond"> = {
  contract: "circle",
  subgraph: "hex",
  entity: "circle",
};

export class GraphRenderer {
  private svg: SVGSVGElement;
  private nodes: PositionedNode[] = [];
  private edges: EcosystemEdge[] = [];
  private nodeMap = new Map<string, PositionedNode>();
  private width = 0;
  private height = 0;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private dragNode: PositionedNode | null = null;
  private dragStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private hoveredNode: string | null = null;
  /** Entity whose popup is pinned visible (until another node is activated or reset). */
  private pinnedNodeId: string | null = null;
  private selectedNode: string | null = null;
  private selectedEdge: { source: string; target: string } | null = null;
  private tooltip: HTMLDivElement;
  private onNodeClick: ((node: EcosystemNode) => void) | null = null;
  private animationFrame: number | null = null;
  private edgeGroup: SVGGElement;
  private nodeGroup: SVGGElement;
  private mainGroup: SVGGElement;
  private settleFrames = 0;

  constructor(svg: SVGSVGElement, tooltip: HTMLDivElement) {
    this.svg = svg;
    this.tooltip = tooltip;
    const ns = "http://www.w3.org/2000/svg";
    this.mainGroup = document.createElementNS(ns, "g");
    this.edgeGroup = document.createElementNS(ns, "g");
    this.nodeGroup = document.createElementNS(ns, "g");
    this.mainGroup.appendChild(this.edgeGroup);
    this.mainGroup.appendChild(this.nodeGroup);
    svg.appendChild(this.mainGroup);
    this.setupInteraction();
  }

  setData(nodes: EcosystemNode[], edges: EcosystemEdge[]) {
    this.clear();
    this.edges = edges;
    const rect = this.svg.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const cx = this.width / 2;
    const cy = this.height / 2;

    // Position contract at center, others in a radial layout
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      let x = cx, y = cy;
      let radius = 8;

      if (node.type === "contract") {
        x = cx;
        y = cy;
        radius = 22;
      } else {
        const angle = (i / nodes.length) * Math.PI * 2;
        const dist = node.type === "entity" ? 200 : 150;
        x = cx + Math.cos(angle) * dist;
        y = cy + Math.sin(angle) * dist;
        radius = node.type === "entity" ? 6 : node.type === "subgraph" ? 10 : 8;
      }

      const pn: PositionedNode = { ...node, x, y, vx: 0, vy: 0, radius };
      this.nodes.push(pn);
      this.nodeMap.set(node.id, pn);
    }

    this.updatePositions();
    this.startForceLayout();
  }

  setOnNodeClick(cb: (node: EcosystemNode) => void) {
    this.onNodeClick = cb;
  }

  clear() {
    this.nodes = [];
    this.edges = [];
    this.nodeMap.clear();
    this.edgeGroup.innerHTML = "";
    this.nodeGroup.innerHTML = "";
    this.settleFrames = 0;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private startForceLayout() {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.settleFrames = 150;
    const tick = () => {
      if (this.settleFrames > 0) {
        this.applyForces();
        this.updatePositions();
        this.settleFrames--;
        this.animationFrame = requestAnimationFrame(tick);
      } else {
        this.updatePositions();
        this.animationFrame = null;
      }
    };
    tick();
  }

  private applyForces() {
    const cx = this.width / 2;
    const cy = this.height / 2;

    for (const node of this.nodes) {
      if (node.type === "contract") {
        node.x = cx;
        node.y = cy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      // Repulsion from other nodes
      for (const other of this.nodes) {
        if (other.id === node.id) continue;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 800 / (dist * dist);
        node.vx += (dx / dist) * force;
        node.vy += (dy / dist) * force;
      }

      // Attraction along edges
      for (const edge of this.edges) {
        if (edge.source === node.id || edge.target === node.id) {
          const otherId = edge.source === node.id ? edge.target : edge.source;
          const other = this.nodeMap.get(otherId);
          if (!other) continue;
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 120;
          const force = (dist - targetDist) * 0.01;
          node.vx += (dx / dist) * force;
          node.vy += (dy / dist) * force;
        }
      }

      // Gentle pull toward center
      node.vx += (cx - node.x) * 0.002;
      node.vy += (cy - node.y) * 0.002;

      // Damping
      node.vx *= 0.85;
      node.vy *= 0.85;

      // Apply velocity
      node.x += node.vx;
      node.y += node.vy;

      // Keep in bounds
      const margin = 40;
      node.x = Math.max(margin, Math.min(this.width - margin, node.x));
      node.y = Math.max(margin, Math.min(this.height - margin, node.y));
    }
  }

  private updatePositions() {
    const ns = "http://www.w3.org/2000/svg";

    // Update edges
    this.edgeGroup.innerHTML = "";
    for (const edge of this.edges) {
      const source = this.nodeMap.get(edge.source);
      const target = this.nodeMap.get(edge.target);
      if (!source || !target) continue;

      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(source.x));
      line.setAttribute("y1", String(source.y));
      line.setAttribute("x2", String(target.x));
      line.setAttribute("y2", String(target.y));
      line.setAttribute("class", "graph-edge");
      line.dataset.source = edge.source;
      line.dataset.target = edge.target;

      const isSelected =
        this.selectedEdge !== null &&
        ((this.selectedEdge.source === edge.source && this.selectedEdge.target === edge.target) ||
          (this.selectedEdge.source === edge.target && this.selectedEdge.target === edge.source));

      if (isSelected) {
        // The active edge pops out; the rest stay exactly as they were.
        line.setAttribute("class", "graph-edge edge-selected");
        line.setAttribute("stroke", "#ffffff");
        line.setAttribute("stroke-width", "3");
        line.setAttribute("stroke-opacity", "1");
      } else {
        line.setAttribute("stroke", TYPE_COLORS[target.type] || "#1a2035");
        line.setAttribute("stroke-width", "1");
        line.setAttribute("stroke-opacity", "0.55");
        // Only dim edges for node hover/selection — never for edge selection.
        if (this.hoveredNode || this.selectedNode) {
          const active = this.hoveredNode || this.selectedNode;
          if (edge.source !== active && edge.target !== active) {
            line.classList.add("dimmed");
          }
        }
      }

      // Edge click → activate this edge (highlight it), others are left alone.
      line.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectedEdge = isSelected ? null : { source: edge.source, target: edge.target };
        this.updatePositions();
      });

      this.edgeGroup.appendChild(line);
    }

    // Update nodes
    this.nodeGroup.innerHTML = "";
    for (const node of this.nodes) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("transform", `translate(${node.x}, ${node.y})`);
      g.setAttribute("class", "graph-node");
      g.dataset.id = node.id;

      const color = TYPE_COLORS[node.type] || "#6b7494";
      const shape = TYPE_SHAPES[node.type] || "circle";

      let shapeEl: SVGElement;
      if (shape === "hex") {
        shapeEl = this.createHexagon(node.radius);
      } else if (shape === "diamond") {
        shapeEl = this.createDiamond(node.radius);
      } else {
        shapeEl = document.createElementNS(ns, "circle");
        shapeEl.setAttribute("r", String(node.radius));
      }

      shapeEl.setAttribute("fill", `${color}20`);
      shapeEl.setAttribute("stroke", color);
      shapeEl.setAttribute("stroke-width", node.type === "contract" ? "2" : "1.5");

      if (node.type === "contract") {
        shapeEl.setAttribute("filter", "url(#glow)");
        this.ensureGlowFilter();
      }

      if (this.hoveredNode || this.selectedNode) {
        const active = this.hoveredNode || this.selectedNode;
        if (node.id !== active && active !== null && !this.isConnected(node.id, active)) {
          g.classList.add("dimmed");
        } else {
          g.classList.add("highlighted");
        }
      }

      g.appendChild(shapeEl);

      // Label
      const label = document.createElementNS(ns, "text");
      label.setAttribute("class", "node-label");
      label.setAttribute("y", String(node.radius + 14));
      label.textContent = node.label;
      g.appendChild(label);

      g.addEventListener("mouseenter", (e) => this.onHover(node.id, e));
      g.addEventListener("mouseleave", () => this.onHoverEnd());
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectedNode = node.id;
        this.pinnedNodeId = node.id;
        this.onNodeClick?.(node);
        this.showTooltipFor(node);
        this.updatePositions();
      });

      this.nodeGroup.appendChild(g);
    }
  }

  private isConnected(a: string, b: string): boolean {
    return this.edges.some(
      (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
    );
  }

  private createHexagon(r: number): SVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      points.push(`${Math.cos(angle) * r},${Math.sin(angle) * r}`);
    }
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", points.join(" "));
    return poly;
  }

  private createDiamond(r: number): SVGElement {
    const ns = "http://www.w3.org/2000/svg";
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", `0,${-r} ${r},0 0,${r} ${-r},0`);
    return poly;
  }

  private ensureGlowFilter() {
    if (this.svg.querySelector("#glow")) return;
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    const filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", "glow");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");
    const blur = document.createElementNS(ns, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "4");
    blur.setAttribute("result", "blur");
    const merge = document.createElementNS(ns, "feMerge");
    const m1 = document.createElementNS(ns, "feMergeNode");
    m1.setAttribute("in", "blur");
    const m2 = document.createElementNS(ns, "feMergeNode");
    m2.setAttribute("in", "SourceGraphic");
    merge.appendChild(m1);
    merge.appendChild(m2);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    this.svg.insertBefore(defs, this.svg.firstChild);
  }

  private onHover(id: string, e: MouseEvent) {
    this.hoveredNode = id;
    const node = this.nodeMap.get(id);
    if (!node) return;
    this.showTooltipFor(node);
    this.updatePositions();
  }

  private onHoverEnd() {
    this.hoveredNode = null;
    // If an entity is pinned active, keep its popup visible instead of hiding it.
    if (this.pinnedNodeId) {
      const node = this.nodeMap.get(this.pinnedNodeId);
      if (node) {
        this.showTooltipFor(node);
        this.updatePositions();
        return;
      }
    }
    this.tooltip.classList.add("hidden");
    this.updatePositions();
  }

  /** Render the popup for a node and position it, clamped inside the visible area. */
  private showTooltipFor(node: PositionedNode) {
    this.tooltip.innerHTML = this.buildTooltip(node);
    this.tooltip.classList.remove("hidden");

    // Node positions are in the SVG/container space; scale/pan shift them on screen.
    const rect = this.svg.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    let tx = node.x * this.scale + this.panX + 15;
    let ty = node.y * this.scale + this.panY + 15;

    // Keep the popup fully inside the visible view so it is never cut off.
    const tipW = this.tooltip.offsetWidth || 230;
    const tipH = this.tooltip.offsetHeight || 120;
    tx = Math.max(4, Math.min(cw - tipW - 4, tx));
    ty = Math.max(4, Math.min(ch - tipH - 4, ty));
    this.tooltip.style.left = `${tx}px`;
    this.tooltip.style.top = `${ty}px`;
  }

  private buildTooltip(node: PositionedNode): string {
    const meta = node.metadata || {};
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

    // Contract popup: only the full address.
    if (node.type === "contract") {
      return `<div class="tooltip-meta tooltip-ipfs">${esc(meta.address || node.label)}</div>`;
    }

    // Subgraph popup: full IPFS hash + network.
    if (node.type === "subgraph") {
      let html = `<div class="tooltip-meta tooltip-ipfs">${esc(meta.fullIpfsHash || node.label)}</div>`;
      if (meta.network) html += `<div class="tooltip-meta">${esc(meta.network)}</div>`;
      return html;
    }

    // Entity popup: entity name + field names (no types), one per line.
    let html = `<div class="tooltip-label">${esc(node.label)}</div>`;
    const fields = (meta.fields as Array<{ name: string; type?: string }> | undefined) || [];
    if (fields.length) {
      html += `<div class="tooltip-meta tooltip-fields">${fields
        .map((f) => esc(f.name || ""))
        .join("<br>")}</div>`;
    }
    return html;
  }

  private setupInteraction() {
    let panning = false;

    this.svg.addEventListener("mousedown", (e) => {
      const target = e.target as Element;
      const nodeEl = target.closest(".graph-node");
      if (nodeEl) {
        const id = nodeEl.getAttribute("data-id");
        if (id) {
          this.dragNode = this.nodeMap.get(id) || null;
          this.dragStart = { x: e.clientX, y: e.clientY };
        }
      } else {
        panning = true;
        // Clicking empty space always closes the popup and clears any active selection.
        this.selectedEdge = null;
        this.selectedNode = null;
        this.pinnedNodeId = null;
        this.tooltip.classList.add("hidden");
        this.updatePositions();
        this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      }
      this.isDragging = true;
    });

    this.svg.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      if (this.dragNode && this.dragNode.type !== "contract") {
        const rect = this.svg.getBoundingClientRect();
        this.dragNode.x = e.clientX - rect.left;
        this.dragNode.y = e.clientY - rect.top;
        this.dragNode.vx = 0;
        this.dragNode.vy = 0;
        this.settleFrames = 60;
      } else if (panning) {
        this.panX = e.clientX - this.panStart.x;
        this.panY = e.clientY - this.panStart.y;
        this.mainGroup.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
      }
    });

    this.svg.addEventListener("mouseup", () => {
      this.isDragging = false;
      this.dragNode = null;
      panning = false;
    });

    this.svg.addEventListener("mouseleave", () => {
      this.isDragging = false;
      this.dragNode = null;
      panning = false;
    });

    // Zoom with wheel
    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.scale = Math.max(0.3, Math.min(3, this.scale * delta));
      this.mainGroup.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
    });

    // Touch support
    let touchStart: { x: number; y: number } | null = null;
    this.svg.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX - this.panX, y: e.touches[0].clientY - this.panY };
      }
    });
    this.svg.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1 && touchStart) {
        e.preventDefault();
        this.panX = e.touches[0].clientX - touchStart.x;
        this.panY = e.touches[0].clientY - touchStart.y;
        this.mainGroup.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
      }
    });
  }

  zoomIn() {
    this.scale = Math.min(3, this.scale * 1.2);
    this.mainGroup.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
  }

  zoomOut() {
    this.scale = Math.max(0.3, this.scale * 0.8);
    this.mainGroup.setAttribute("transform", `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
  }

  resetView() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.pinnedNodeId = null;
    this.tooltip.classList.add("hidden");
    this.mainGroup.setAttribute("transform", "translate(0, 0) scale(1)");
    this.updatePositions();
  }

  /** Programmatically clear current edge/node selection (e.g. from a reset button). */
  resetSelection() {
    this.selectedNode = null;
    this.selectedEdge = null;
    this.hoveredNode = null;
    this.pinnedNodeId = null;
    this.tooltip.classList.add("hidden");
    this.updatePositions();
  }
}
