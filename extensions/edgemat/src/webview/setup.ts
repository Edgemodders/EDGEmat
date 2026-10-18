// The setup editor's page script, in the webview: the layers in plain words, the color map in texture
// space, and where the selected layer shows. Read-only in M2. Bundled for the browser by esbuild.

import type { LayerInfo, SetupInfo } from "../core/setup";

export type SetupPageData =
  | { kind: "loading"; title: string; origin: string }
  | { kind: "error"; title: string; origin: string; message: string }
  | {
      kind: "setup";
      title: string;
      origin: string;
      path: string;
      info: SetupInfo;
      mask?: { name: string; from: "given" | "beside" | "material"; path: string; images: string[]; choices: number };
      maskError?: string;
      map?: { image: string; pick: number[] };
      surfaceThumbs: Record<string, string | undefined>;
    };

interface State { selected?: number; raw?: boolean; hideUnused?: boolean; view?: "all" | "layer" }

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): State | undefined; setState(s: State): void };
const vscode = acquireVsCodeApi();
const data = JSON.parse(document.getElementById("data")!.textContent!) as SetupPageData;
const state: State = { hideUnused: true, view: "all", ...vscode.getState() };
const save = () => vscode.setState(state);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | undefined | false)[]) => {
  const e = document.createElement(tag);
  // style through the CSSOM: the page's CSP blocks style attributes.
  for (const [k, v] of Object.entries(attrs)) k === "class" ? (e.className = v) : k === "style" ? (e.style.cssText = v) : e.setAttribute(k, v);
  for (const kid of kids) if (kid !== undefined && kid !== false) e.append(kid);
  return e;
};
const button = (label: string, onclick: () => void, cls = "", title = "") => {
  const b = el("button", { class: cls, title }, label);
  b.onclick = (ev) => { ev.stopPropagation(); onclick(); };
  return b;
};
const copy = (text: string, label = "Copy") => button(label, () => vscode.postMessage({ type: "copy", text }), "copy", `Copy ${text}`);
const raw = (text: string) => el("span", { class: "rawcol raw-inline" }, text);
const r3 = (v: number) => String(Math.round(v * 1000) / 1000);
const pct = (v: number) => (v >= 0.995 ? "100%" : v < 0.001 ? "0%" : v < 0.01 ? "under 1%" : `${Math.round(v * 100)}%`);

function header(title: string, origin: string, path?: string): HTMLElement {
  const h = el("header", {}, el("div", { class: "crumb" }, `Setup · ${origin}`), el("div", { class: "title-row" }, el("h1", {}, title)));
  if (path) h.append(el("div", { class: "path" }, el("code", {}, path), copy(path, "Copy path")));
  return h;
}

if (data.kind === "loading") {
  document.body.append(header(data.title, data.origin), el("div", { class: "center" }, "Reading the setup and its masks..."));
} else if (data.kind === "error") {
  document.body.append(header(data.title, data.origin), el("div", { class: "warnings" }, data.message), button("Try again", () => vscode.postMessage({ type: "reload" })));
} else {
  render(data);
}

function render(d: Extract<SetupPageData, { kind: "setup" }>): void {
  const info = d.info;
  const head = header(d.title, d.origin, d.path);
  const rawBox = el("input", { type: "checkbox" }) as HTMLInputElement;
  rawBox.checked = !!state.raw;
  document.body.classList.toggle("raw", !!state.raw);
  rawBox.onchange = () => { state.raw = rawBox.checked; document.body.classList.toggle("raw", rawBox.checked); save(); };
  const hideBox = el("input", { type: "checkbox" }) as HTMLInputElement;
  hideBox.checked = state.hideUnused !== false;
  hideBox.onchange = () => { state.hideUnused = hideBox.checked; save(); renderLayers(); };
  head.querySelector(".title-row")!.append(el("div", { class: "actions" },
    el("label", { class: "toggle", title: "Hide the empty slots (unused.mltemplate)" }, hideBox, "Hide unused slots"),
    el("label", { class: "toggle", title: "Show the game's names and values" }, rawBox, "Raw values")));
  const unusedCount = info.layers.filter((l) => l.surface.unused || !l.surface.path).length;
  head.append(el("div", { class: "meta" },
    `${info.shownCount} of ${info.layers.length} layers show`,
    unusedCount ? ` · ${unusedCount} unused slot${unusedCount === 1 ? "" : "s"}` : "",
    ` · ratio ${Math.round(info.ratio * 1000) / 1000}`,
    raw(`useNormal ${info.useNormal} · WolvenKit JSON ${info.jsonVersion}`)));
  document.body.append(head);
  if (info.warnings.length) document.body.append(el("div", { class: "warnings" }, ...info.warnings.map((w) => el("div", {}, w))));

  // ---- the map --------------------------------------------------------------------------------------
  const map = el("div", { class: "map", title: "Click to select the layer that shows there" });
  const segAll = button("All layers", () => setView("all"));
  const segOne = button("Selected layer", () => setView("layer"));
  const setView = (v: "all" | "layer") => { state.view = v; save(); paintMap(); };
  const maskLine = d.mask
    ? el("div", { class: "note" }, `Mask set: `, el("code", {}, d.mask.name), d.mask.from === "beside" ? " (found beside the setup)" : d.mask.from === "material" ? " (named by the mesh's material)" : " (chosen)", " ", button("Change", () => vscode.postMessage({ type: "chooseMask" }), "small"))
    : el("div", { class: "note warn" }, d.maskError ?? "No mask set.", " ", button("Choose a mask set", () => vscode.postMessage({ type: "chooseMask" }), "small"));

  const paintMap = () => {
    segAll.classList.toggle("on", state.view !== "layer");
    segOne.classList.toggle("on", state.view === "layer");
    map.replaceChildren();
    if (!d.map) {
      map.append(el("div", { class: "none" }, "The color map needs the mask set."));
      return;
    }
    const sel = state.selected;
    const maskImg = sel !== undefined ? d.mask?.images[sel] : undefined;
    if (state.view === "layer" && maskImg) {
      // The layer's mask, lit in the accent color over the dimmed map.
      const lit = el("div", { class: "lit" });
      lit.style.setProperty("mask-image", `url("${maskImg}")`);
      lit.style.setProperty("-webkit-mask-image", `url("${maskImg}")`);
      map.append(el("img", { src: d.map.image, class: "dim", alt: "" }), lit);
    } else {
      map.append(el("img", { src: d.map.image, alt: "The setup's colors in texture space" }));
    }
  };
  map.onclick = (ev) => {
    if (!d.map) return;
    const r = map.getBoundingClientRect();
    const side = Math.round(Math.sqrt(d.map.pick.length));
    const x = Math.min(side - 1, Math.floor(((ev.clientX - r.left) / r.width) * side));
    const y = Math.min(side - 1, Math.floor(((ev.clientY - r.top) / r.height) * side));
    const i = d.map.pick[y * side + x];
    if (i >= 0) select(i, true);
  };

  const side = el("div", { class: "side" },
    map,
    el("div", { class: "row" }, el("span", { class: "seg" }, segAll, segOne)),
    maskLine,
    el("p", { class: "note" }, "Flat colors laid out on the garment's texture, the way its masks divide it: where each layer goes, not how it looks in the game. Click a spot to find its layer."),
  );

  // ---- the layers -----------------------------------------------------------------------------------
  const list = el("div", { class: "layers" });
  const maxShare = Math.max(0.0001, ...info.layers.map((l) => l.share ?? 0));

  const select = (i: number, scroll = false) => {
    state.selected = state.selected === i && !scroll ? undefined : i;
    if (scroll && state.view !== "layer") state.view = "layer";
    save();
    renderLayers();
    paintMap();
    if (scroll) list.querySelector(".layer.selected")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const detail = (l: LayerInfo) => {
    const row = (label: string, ...value: (Node | string | undefined | false)[]) => el("tr", {}, el("td", {}, label), el("td", {}, ...value));
    const p = (x?: { plain: string; name: string; raw: string; isDefault: boolean }) =>
      x ? [x.plain, x.isDefault ? " (the surface's default)" : "", raw(`${x.name}${x.raw ? ": " + x.raw : ""}`)] : ["-"];
    const thumb = d.surfaceThumbs[l.surface.path];
    const mb = l.microblend;
    return el("div", { class: "details" },
      el("table", {},
        row("Surface", thumb ? el("img", { src: thumb, class: "chip", style: "display:inline-block;vertical-align:middle;margin-right:6px" }) : undefined,
          l.surface.title, l.surface.category ? ` (${l.surface.category})` : "", " ",
          l.surface.found ? button("Open", () => vscode.postMessage({ type: "surface", path: l.surface.path }), "small", "Open the surface page") : undefined,
          raw(l.surface.path || "(empty)")),
        row("Color", l.color ? el("span", { class: "chip", style: `display:inline-block;vertical-align:middle;margin-right:6px;background:${l.color.hex}` }) : undefined,
          l.color?.plain ?? "-", l.color ? raw(`${l.color.name}: ${l.color.rgb.map((v) => v.toFixed(3)).join(", ")}`) : undefined),
        row("Roughness", ...p(l.roughness)),
        row("Roughness contrast", ...p(l.roughnessContrast)),
        row("Metal", ...p(l.metal)),
        row("Metal contrast", ...p(l.metalContrast)),
        row("Bumps", ...p(l.bumps)),
        row("Tiling", `×${l.tiling}`, raw(`matTile ${l.raw.matTile} × the surface's ${Math.round((l.tiling / (l.raw.matTile || 1)) * 1000) / 1000}`)),
        row("Offset", l.raw.offsetU || l.raw.offsetV ? `${l.raw.offsetU}, ${l.raw.offsetV}` : "none"),
        row("Opacity", l.opacity, raw(String(l.raw.opacity))),
        row("Microblend", mb.plain ? "plain (the default)" : mb.name, " ",
          mb.path ? button("Open", () => vscode.postMessage({ type: "microblend", path: mb.path }), "small", "Open the microblend page") : undefined,
          el("div", { class: "line2" }, `tiled ×${r3(mb.tile)}, contrast ${r3(mb.contrast)}, bumps ${r3(mb.normalStrength)}`),
          raw(`${mb.path || "(empty)"}; offset ${l.raw.microblendOffsetU}, ${l.raw.microblendOffsetV}`)),
        row("Shows on", l.share !== undefined ? `${pct(l.share)} of the texture` : "unknown without the mask set", l.hidden ? ` (not shown: ${l.hidden})` : ""),
        l.raw.overrides !== "None" ? row("Overrides", el("code", {}, l.raw.overrides), " (meaning unknown)") : undefined,
      ),
      ...l.warnings.map((w) => el("div", { class: "warn" }, `⚠ ${w}`)),
    );
  };

  const renderLayers = () => {
    list.replaceChildren(
      ...info.layers
        .filter((l) => !(state.hideUnused !== false && (l.surface.unused || !l.surface.path)) || l.index === state.selected)
        .map((l) => {
          const thumb = d.surfaceThumbs[l.surface.path];
          const words = l.hidden
            ? `not shown: ${l.hidden}`
            : [l.roughness?.plain, l.metal?.plain, l.bumps?.plain].filter(Boolean).join(", ") + (l.microblend.plain ? "" : ` · ${l.microblend.name}`);
          const item = el("div", { class: "layer" + (l.index === state.selected ? " selected" : "") + (l.shown ? "" : " hidden") },
            el("div", { class: "row" },
              el("span", { class: "idx" }, String(l.index)),
              el("span", { class: "chip", style: `background:${l.color?.hex ?? "transparent"}`, title: l.color?.plain ?? "" }),
              thumb ? el("img", { src: thumb, class: "chip thumb", alt: "", title: l.surface.title }) : el("span", { class: "chip" }),
              el("div", { class: "grow" },
                el("div", { class: "line1" }, l.surface.title, l.color ? ` · ${l.color.plain}` : "", l.warnings.length ? el("span", { class: "warn", title: l.warnings.join("\n") }, " ⚠") : undefined),
                el("div", { class: "line2" }, words)),
              l.share !== undefined
                ? el("div", { class: "share", title: "Share of the texture where this layer is what shows" }, pct(l.share), el("div", { class: "bar", style: `width:${Math.max(2, (l.share / maxShare) * 60)}px` }))
                : undefined),
            l.index === state.selected ? detail(l) : undefined);
          item.onclick = () => select(l.index);
          item.querySelector(".details")?.addEventListener("click", (ev) => ev.stopPropagation());
          return item;
        }),
    );
  };

  document.body.append(el("div", { class: "layout" }, side, el("div", {}, el("h2", {}, "Layers"),
    el("p", { class: "note" }, "From the base (0) up; each draws over the ones below where its mask allows. Click a layer for its details."), list)));
  renderLayers();
  paintMap();
}
