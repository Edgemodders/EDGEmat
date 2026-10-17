// The surface page's script, in the webview: renders a surface or a microblend from the data the
// extension puts in the page, and handles the swatches, filter, "closest to", raw values and copying.
// Bundled for the browser by esbuild; it shares the color code with the core.

import { colorDistance, parseColor, type Rgb } from "../core/colors";
import type { ColorInfo, PresetInfo, SurfaceInfo, TextureInfo } from "../core/surface";

export type PageData =
  | { kind: "surface"; info: SurfaceInfo; image?: string; textures: Partial<Record<TextureInfo["kind"], string>>; texturesDone: boolean; note?: string; kept: boolean }
  | { kind: "microblend"; name: string; path: string; image?: string; note?: string; kept: boolean };

interface State { selected?: string; filter?: string; near?: string; raw?: boolean; tint?: boolean }

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): State | undefined; setState(s: State): void };
const vscode = acquireVsCodeApi();
const data = JSON.parse(document.getElementById("data")!.textContent!) as PageData;
const state: State = { tint: true, ...vscode.getState() };
const save = () => vscode.setState(state);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | undefined)[]) => {
  const e = document.createElement(tag);
  // style through the CSSOM: the page's CSP blocks style attributes.
  for (const [k, v] of Object.entries(attrs)) k === "class" ? (e.className = v) : k === "style" ? (e.style.cssText = v) : e.setAttribute(k, v);
  for (const kid of kids) if (kid !== undefined) e.append(kid);
  return e;
};
const copyButton = (text: string, label = "Copy") => {
  const b = el("button", { class: "copy", title: `Copy ${text}` }, label);
  b.onclick = () => vscode.postMessage({ type: "copy", text });
  return b;
};
const badge = (text: string, cls = "badge") => el("span", { class: cls }, text);
const r3 = (v: number) => String(Math.round(v * 1000) / 1000);
const rgbText = (rgb: Rgb) => rgb.map((v) => v.toFixed(3)).join(", ");

function header(title: string, crumb: string, path: string): HTMLElement {
  const actions = el("div", { class: "actions" });
  if (data.kind === "surface") {
    const raw = el("label", { class: "toggle", title: "Show the game's preset names and values" }, el("input", { type: "checkbox" }), "Raw values");
    const box = raw.querySelector("input")!;
    box.checked = !!state.raw;
    document.body.classList.toggle("raw", !!state.raw);
    box.onchange = () => { state.raw = box.checked; document.body.classList.toggle("raw", box.checked); save(); };
    actions.append(raw);
  }
  if (!data.kept) {
    const keep = el("button", { title: "Keep this page open; the next surface you click opens in a new tab" }, "Keep open");
    keep.onclick = () => { vscode.postMessage({ type: "keep" }); keep.remove(); };
    actions.append(keep);
  }
  return el("header", {}, el("div", { class: "crumb" }, crumb), el("div", { class: "title-row" }, el("h1", {}, title), actions), el("div", { class: "path" }, el("code", {}, path), copyButton(path, "Copy path")));
}

// ---- surface -------------------------------------------------------------------------------------

function renderSurface(d: Extract<PageData, { kind: "surface" }>): void {
  const info = d.info;
  const byName = new Map(info.colors.map((c) => [c.name, c]));
  let selected: ColorInfo | undefined = byName.get(state.selected ?? "") ?? info.defaultColor ?? info.colors[0];

  document.body.append(header(info.title, `Surface · ${info.category}${info.group ? " › " + info.group : ""}`, info.path));

  // The image, tinted with the selected color.
  const tint = el("div", { class: "tint" });
  const hero = el("div", { class: "hero" }, d.image ? el("img", { src: d.image, alt: info.title }) : el("div", { class: "noimage" }, d.note ?? "No image"), tint);
  const tintBox = el("input", { type: "checkbox" }) as HTMLInputElement;
  tintBox.checked = state.tint !== false;
  tintBox.onchange = () => { state.tint = tintBox.checked; save(); paintTint(); };
  const detail = el("div", { class: "detail" });
  const side = el("div", { class: "side" }, hero, el("label", { class: "toggle" }, tintBox, "Tint with the selected color"), el("p", { class: "note" }, "The surface's detail map tinted with the color: a rough idea, not the game's look. The real preview comes later."), detail);

  const paintTint = () => {
    tint.style.background = selected && tintBox.checked ? selected.hex : "transparent";
  };

  const showDetail = () => {
    detail.replaceChildren();
    if (!selected) return;
    const c = selected;
    detail.append(
      el("div", { class: "big-swatch", style: `background:${c.hex}` }, c.bright ? badge("brighter than shown", "bright") : undefined),
      el("div", { class: "detail-name" }, c.plain, c.isDefault ? badge("default") : undefined),
      el("dl", {},
        el("dt", {}, "Preset"), el("dd", {}, el("code", {}, c.name), copyButton(c.name)),
        el("dt", {}, "RGB"), el("dd", {}, el("code", {}, rgbText(c.rgb)), copyButton(rgbText(c.rgb))),
        el("dt", {}, "Swatch"), el("dd", {}, el("code", {}, c.hex), copyButton(c.hex))),
    );
  };

  // Colors: a filter by words, "closest to" a typed or picked color, and the swatch grid.
  const filter = el("input", { type: "search", placeholder: "Filter: red, dark blue, grey", value: state.filter ?? "" }) as HTMLInputElement;
  const nearText = el("input", { type: "text", placeholder: "Closest to: dark red, #a03030", value: state.near ?? "" }) as HTMLInputElement;
  const picker = el("input", { type: "color", title: "Pick a color to find the closest presets" }) as HTMLInputElement;
  const count = el("span", { class: "count" });
  const grid = el("div", { class: "swatches" });

  const renderGrid = () => {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    const target = nearText.value.trim() ? parseColor(nearText.value) : undefined;
    nearText.classList.toggle("bad", !!nearText.value.trim() && !target);
    let list = info.colors.filter((c) => words.every((w) => c.plain.includes(w) || c.name.toLowerCase().includes(w)));
    if (target) list = list.map((c) => ({ c, d: colorDistance(c.rgb, target) })).sort((a, b) => a.d - b.d).map((x) => x.c);
    count.textContent = list.length === info.colors.length ? `${info.colors.length} colors` : `${list.length} of ${info.colors.length} colors`;
    grid.replaceChildren(
      ...list.map((c) => {
        const s = el("button", { class: "swatch" + (c === selected ? " selected" : "") + (c.isDefault ? " default" : "") + (c.bright ? " is-bright" : ""), style: `background:${c.hex}`, title: `${c.plain}${c.isDefault ? " (default)" : ""}\n${c.name}` });
        s.onclick = () => {
          selected = c;
          state.selected = c.name;
          save();
          grid.querySelector(".selected")?.classList.remove("selected");
          s.classList.add("selected");
          showDetail();
          paintTint();
        };
        return s;
      }),
    );
  };
  filter.oninput = () => { state.filter = filter.value; save(); renderGrid(); };
  nearText.oninput = () => { state.near = nearText.value; save(); renderGrid(); };
  picker.oninput = () => { nearText.value = picker.value; state.near = picker.value; save(); renderGrid(); };

  const colors = el("section", {}, el("h2", {}, "Colors ", count), el("div", { class: "tools" }, filter, nearText, picker), grid,
    el("p", { class: "note" }, "A layer can only use a color its surface offers. Swatches show the game's values as screen colors; a + marks one brighter than a screen shows."));

  const presetList = (title: string, help: string, list: PresetInfo[]) =>
    el("section", {}, el("h2", {}, title), el("p", { class: "help" }, help),
      el("table", {}, ...list.map((p) => el("tr", {}, el("td", {}, p.plain, p.isDefault ? badge("default") : undefined), el("td", { class: "rawcol" }, el("code", {}, p.name)), el("td", { class: "rawcol" }, el("code", {}, p.raw))))));

  const textureCard = (t: TextureInfo) => {
    const src = d.textures[t.kind];
    const label = { color: "Detail (diffuse)", normal: "Bumps (normal)", roughness: "Roughness", metalness: "Metalness" }[t.kind];
    return el("figure", {},
      src ? el("img", { src, alt: label }) : el("div", { class: "noimage small" }, t.isDefault ? "Shared default: none of its own" : d.texturesDone ? "One flat tone" : "Making the image..."),
      el("figcaption", {}, el("b", {}, label), t.path ? el("div", { class: "path" }, el("code", {}, t.path), copyButton(t.path)) : undefined));
  };

  const main = el("div", { class: "main" },
    colors,
    presetList("Roughness", "How shiny the surface is. A layer picks one.", info.roughness),
    presetList("Roughness contrast", "How much of the roughness map's detail is used before the finish above applies.", info.roughnessContrast),
    presetList("Metal", "How metallic the surface is.", info.metal),
    presetList("Bumps", "How strong the surface's relief is.", info.bumps),
    el("section", {}, el("h2", {}, "Textures"), el("div", { class: "textures" }, ...info.textures.map(textureCard)),
      el("p", { class: "note" }, `Tiling ×${info.tiling} on top of each layer's own tiling. Images are scaled and their contrast stretched to show detail.`),
      info.colorMaskLevels ? el("p", { class: "note rawcol" }, `Color mask levels: in ${info.colorMaskLevels.in.map(r3).join(", ")}; out ${info.colorMaskLevels.out.map(r3).join(", ")} (meaning unknown)`) : undefined),
  );

  document.body.append(el("div", { class: "layout" }, side, main));
  renderGrid();
  showDetail();
  paintTint();
}

// ---- microblend ----------------------------------------------------------------------------------

function renderMicroblend(d: Extract<PageData, { kind: "microblend" }>): void {
  document.body.append(header(d.name.replace(/_/g, " "), "Microblend", d.path));
  document.body.append(el("div", { class: "layout" },
    el("div", { class: "side" }, el("div", { class: "hero" }, d.image ? el("img", { src: d.image, alt: d.name }) : el("div", { class: "noimage" }, d.note ?? "No image"))),
    el("div", { class: "main" }, el("section", {}, el("h2", {}, "What it does"),
      el("p", {}, "A microblend is a small mask that breaks up the edge where one layer meets the next, with dirt, scratches, wear or a pattern. Each layer picks one, with its own tiling and contrast. Tiled large, some act as prints or logos."),
      el("p", { class: "note" }, "The image is the microblend's mask (its alpha), with its contrast stretched."))),
  ));
}

if (data.kind === "surface") renderSurface(data);
else renderMicroblend(data);
