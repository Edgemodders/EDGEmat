// The New Material page's script, in the webview: words or an image file, takes, the chosen take tiled
// 3 × 3, the material's settings, and Add to Project. It asks the extension for everything that needs
// the network, a key or the disk.

import { texturePrompt, type DetailSize, type ImageModel, type Quality, type ServiceId } from "../core/imageServices";
import type { MaterialPageData, MaterialRequest, Take } from "../materialPage";

interface State { tab?: "words" | "file"; words?: string; detail?: DetailSize; prompt?: string; promptEdited?: boolean; service?: ServiceId; repeat?: number; bumps?: number; shine?: string; metal?: boolean }

declare function acquireVsCodeApi(): { postMessage(m: unknown): void; getState(): State | undefined; setState(s: State): void };
const vscode = acquireVsCodeApi();
const data = JSON.parse(document.getElementById("data")!.textContent!) as MaterialPageData;
const state: State = { tab: "words", detail: "medium", service: data.service, repeat: 4, bumps: 1, shine: "satin", metal: false, ...vscode.getState() };
const save = () => vscode.setState(state);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | undefined)[]) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === "class" ? (e.className = v) : e.setAttribute(k, v);
  for (const kid of kids) if (kid !== undefined) e.append(kid);
  return e;
};

// ---- talking to the extension ----------------------------------------------------------------------

let nextId = 1;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
function ask<T>(req: MaterialRequest): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    vscode.postMessage({ type: "op", id, req });
  });
}
let target = data.target;
window.addEventListener("message", (e) => {
  const m = e.data as { type: string; id?: number; ok?: boolean; result?: unknown; error?: string; target?: MaterialPageData["target"] };
  if (m.type === "result" && m.id !== undefined) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.ok) p?.resolve(m.result);
    else p?.reject(new Error(m.error ?? "The request failed."));
  } else if (m.type === "target") {
    target = m.target;
    showTarget();
  }
});

// ---- the page ----------------------------------------------------------------------------------------

const status = el("p", { class: "status", role: "status" });
const say = (text: string, error = false) => {
  status.textContent = text;
  status.classList.toggle("error", error);
};

document.body.append(
  el("header", {}, el("div", { class: "crumb" }, "Generate · a material from words or an image"), el("h1", {}, "New Material")),
);

// Where it goes.
const targetBox = el("section");
function showTarget(): void {
  targetBox.replaceChildren(el("h2", {}, "Where it goes"));
  if (target?.targets.length) {
    const meshes = target.targets.map((t) => t.mesh.split("\\").pop()).join(", ");
    targetBox.append(
      el("div", { class: "target" }, el("strong", {}, target.targets[0].material), ` on ${meshes}`),
      el("p", { class: "help" }, `${target.label}. On a garment the repeat goes into the texture, and the garment keeps its own folds.`),
    );
  } else {
    targetBox.append(el("p", { class: "help" }, "Not on a mesh yet: the material is written into your project for you to use. To put it on a garment, find it in Find, then right-click a material › New Material Here."));
  }
}
showTarget();

// 1. The image.
const imageSection = el("section", {}, el("h2", {}, "1. The image"));
const tabWords = el("button", { type: "button" }, "From words (AI)");
const tabFile = el("button", { type: "button" }, "From an image file");
const wordsPane = el("div");
const filePane = el("div");
const showTab = () => {
  tabWords.classList.toggle("on", state.tab === "words");
  tabFile.classList.toggle("on", state.tab === "file");
  wordsPane.hidden = state.tab !== "words";
  filePane.hidden = state.tab !== "file";
};
tabWords.onclick = () => { state.tab = "words"; save(); showTab(); };
tabFile.onclick = () => { state.tab = "file"; save(); showTab(); };
imageSection.append(el("div", { class: "tabs" }, tabWords, tabFile), wordsPane, filePane);

const words = el("textarea", { rows: "3", placeholder: "Such as: worn brown leather with fine creases", "aria-label": "Describe the material" }) as HTMLTextAreaElement;
words.value = state.words ?? "";
const detail = el("select", { "aria-label": "Detail size" }) as HTMLSelectElement;
for (const [v, t] of [["fine", "Fine detail"], ["medium", "Medium detail"], ["coarse", "Coarse detail"]]) detail.append(new Option(t, v));
detail.value = state.detail ?? "medium";
const service = el("select", { "aria-label": "Service" }) as HTMLSelectElement;
for (const s of data.services) service.append(new Option(s.name, s.id));
service.value = state.service ?? data.service;
const model = el("select", { "aria-label": "Model" }) as HTMLSelectElement;
const listModels = el("button", { type: "button", title: "Ask the service which image models your key can use" }, "List models");
const quality = el("select", { "aria-label": "Quality" }) as HTMLSelectElement;
for (const q of ["low", "medium", "high"]) quality.append(new Option(`${q[0].toUpperCase()}${q.slice(1)} quality`, q));
quality.value = data.quality;
const keyNote = el("p", { class: "note" });
const prompt = el("textarea", { rows: "5", "aria-label": "The words sent" }) as HTMLTextAreaElement;
const resetPrompt = el("button", { type: "button" }, "Back to the standard words");
const generate = el("button", { type: "button", class: "primary" }, "Generate");
const cancel = el("button", { type: "button", hidden: "" }, "Cancel");

const models: Partial<Record<ServiceId, ImageModel[]>> = { ...data.models };
function fillModels(): void {
  const s = service.value as ServiceId;
  const chosen = data.model[s];
  model.replaceChildren(new Option(models[s]?.length ? "Newest the key can use" : "Newest (listed when you generate)", ""));
  for (const m of models[s] ?? []) model.append(new Option(m.name === m.id ? m.id : `${m.name} (${m.id})`, m.id));
  if (chosen && Array.from(model.options).some((o) => o.value === chosen)) model.value = chosen;
  quality.hidden = s !== "openai";
  const info = data.services.find((x) => x.id === s)!;
  keyNote.textContent = `Each Generate spends your ${info.name} credits. ${info.hasKey ? "Your key is in VS Code's secret storage." : "EDGEmat asks for your API key the first time, and keeps it in VS Code's secret storage."} Nothing is sent until you press Generate or List models. ${s === "gemini" ? "Google marks its images with SynthID." : ""}`;
}
function fillPrompt(): void {
  if (!state.promptEdited) prompt.value = words.value.trim() ? texturePrompt(words.value, detail.value as DetailSize) : "";
  resetPrompt.hidden = !state.promptEdited;
}
if (state.promptEdited && state.prompt) prompt.value = state.prompt;
words.oninput = () => { state.words = words.value; save(); fillPrompt(); };
detail.onchange = () => { state.detail = detail.value as DetailSize; save(); fillPrompt(); };
prompt.oninput = () => { state.promptEdited = true; state.prompt = prompt.value; save(); resetPrompt.hidden = false; };
resetPrompt.onclick = () => { state.promptEdited = false; save(); fillPrompt(); };
service.onchange = () => { state.service = service.value as ServiceId; save(); fillModels(); };
listModels.onclick = () => void run(listModels, "Listing models...", async () => {
  const s = service.value as ServiceId;
  const r = await ask<{ models: ImageModel[] }>({ op: "models", service: s });
  models[s] = r.models;
  data.services.find((x) => x.id === s)!.hasKey = true;
  fillModels();
  say(`${r.models.length} image model${r.models.length === 1 ? "" : "s"} for this key.`);
});
wordsPane.append(
  words,
  el("div", { class: "row" }, detail, service, model, listModels, quality),
  el("details", {}, el("summary", {}, "The words sent (edit them if you like)"), prompt, el("div", { class: "row" }, resetPrompt)),
  keyNote,
  el("div", { class: "row" }, generate, cancel),
);
const fromFile = el("button", { type: "button", class: "primary" }, "Choose an image...");
filePane.append(el("p", { class: "help" }, "A photo or texture of your own: PNG, JPG, TGA, DDS, BMP or TIFF. No service and no key. EDGEmat makes it square and seamless."), el("div", { class: "row" }, fromFile));
imageSection.append(status);

// Takes, newest first, and the chosen one.
const takesSection = el("section", { hidden: "" }, el("h2", {}, "2. Takes"), el("p", { class: "help" }, "Pick one. It shows tiled 3 × 3 below, made seamless, so seams and repeats show before you add it."));
const takes = el("div", { class: "takes" });
const tiled = el("div", { class: "tiled" });
const chosenAbout = el("p", { class: "note" });
takesSection.append(takes);

let chosen: Take | undefined;
function choose(t: Take, button: HTMLElement): void {
  chosen = t;
  for (const b of Array.from(takes.querySelectorAll(".take"))) b.classList.toggle("on", b === button);
  tiled.style.backgroundImage = `url("${t.seamless}")`;
  chosenAbout.textContent = t.about;
  if (!nameBox.value.trim() || nameBox.dataset.auto === "1") {
    nameBox.value = t.name.trim().split(/\s+/).slice(0, 4).join(" ");
    nameBox.dataset.auto = "1";
  }
  settings.hidden = false;
}
function addTake(t: Take): void {
  const b = el("button", { type: "button", class: "take", title: t.about }, el("img", { src: t.image, alt: t.about }), el("span", {}, t.about));
  b.onclick = () => choose(t, b);
  takes.prepend(b);
  takesSection.hidden = false;
  choose(t, b);
}

// 3. The material.
const settings = el("section", { hidden: "" }, el("h2", {}, "3. The material"));
const nameBox = el("input", { type: "text", "aria-label": "Name" }) as HTMLInputElement;
nameBox.oninput = () => (nameBox.dataset.auto = "0");
const repeatBox = el("input", { type: "number", min: "1", max: "32", step: "1", "aria-label": "Repeat" }) as HTMLInputElement;
repeatBox.value = String(state.repeat ?? 4);
const bumps = el("select", { "aria-label": "Bumps" }) as HTMLSelectElement;
for (const [v, t] of [["0", "Flat"], ["0.5", "Light"], ["1", "Moderate"], ["2", "Strong"]]) bumps.append(new Option(t, v));
bumps.value = String(state.bumps ?? 1);
const shine = el("select", { "aria-label": "Shine" }) as HTMLSelectElement;
for (const [v, t] of [["matte", "Matte"], ["satin", "Satin"], ["glossy", "Glossy"]]) shine.append(new Option(t, v));
shine.value = state.shine ?? "satin";
const metal = el("input", { type: "checkbox" }) as HTMLInputElement;
metal.checked = !!state.metal;
const add = el("button", { type: "button", class: "primary" }, "Add to Project");
const done = el("div");
for (const c of [repeatBox, bumps, shine, metal]) c.addEventListener("change", () => {
  state.repeat = Number(repeatBox.value) || 4;
  state.bumps = Number(bumps.value);
  state.shine = shine.value;
  state.metal = metal.checked;
  save();
});
settings.append(
  el("div", { class: "chosen" },
    el("div", {}, tiled, chosenAbout),
    el("div", {},
      el("dl", {},
        el("dt", {}, "Name"), el("dd", {}, nameBox),
        el("dt", {}, "Repeat"), el("dd", {}, repeatBox, el("span", { class: "help" }, "times across the garment or object; more is finer")),
        el("dt", {}, "Bumps"), el("dd", {}, bumps, el("span", { class: "help" }, "made from the image's light and dark")),
        el("dt", {}, "Shine"), el("dd", {}, shine),
        el("dt", {}, "Metal"), el("dd", {}, el("label", {}, metal, "Metal")),
      ),
      el("p", { class: "help" }, "Add to Project writes the textures and the material into your project (REDcode's open one, or one you pick), puts it where it goes, and keeps the image and how it was made beside it, in source\\raw."),
      el("div", { class: "row" }, add),
      done,
    ),
  ),
);

document.body.append(targetBox, imageSection, takesSection, settings);

// ---- actions -------------------------------------------------------------------------------------------

let busy = false;
async function run(button: HTMLButtonElement, working: string, f: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  button.disabled = true;
  document.body.style.cursor = "progress";
  say(working);
  try {
    await f();
  } catch (e) {
    say((e as Error).message, true);
  } finally {
    busy = false;
    button.disabled = false;
    document.body.style.cursor = "";
  }
}

let takeCount = 0;
generate.onclick = () => {
  if (!prompt.value.trim()) return say("Describe the material first.", true);
  const s = service.value as ServiceId;
  cancel.hidden = false;
  void run(generate, `Generating with ${data.services.find((x) => x.id === s)!.name}: this can take up to a minute...`, async () => {
    const r = await ask<Take & { models?: ImageModel[]; model: string }>({ op: "generate", service: s, model: model.value, prompt: prompt.value, words: words.value, detail: detail.value as DetailSize, quality: quality.value as Quality });
    if (r.models) models[s] = r.models;
    data.model[s] = r.model;
    data.services.find((x) => x.id === s)!.hasKey = true;
    fillModels();
    addTake({ ...r, about: `Take ${++takeCount} · ${r.about}` });
    generate.textContent = "Generate again";
    say(`Take ${takeCount} is ready. Look at it tiled below, then Add to Project, or change the words and generate again.`);
  }).finally(() => (cancel.hidden = true));
};
cancel.onclick = () => void ask({ op: "cancel" });
fromFile.onclick = () => void run(fromFile, "Reading the image...", async () => {
  const r = await ask<Take & { cancelled?: boolean }>({ op: "fromFile" });
  if (r.cancelled) return say("");
  addTake({ ...r, about: `Take ${++takeCount} · ${r.about}` });
  say(`Take ${takeCount} is ready.`);
});
add.onclick = () => {
  if (!chosen) return say("Pick a take first.", true);
  if (!nameBox.value.trim()) return say("Give the material a name.", true);
  const t = chosen;
  void run(add, "Writing the material into your project...", async () => {
    const r = await ask<{ cancelled?: boolean; folder: string; mi: string; applied: { mesh: string; material: string; how: string }[]; written: number; project: string }>({
      op: "add", take: t.take, name: nameBox.value.trim(), repeat: Math.min(32, Math.max(1, Number(repeatBox.value) || 4)), bumps: Number(bumps.value), shine: shine.value as "matte" | "satin" | "glossy", metal: metal.checked,
    });
    if (r.cancelled) return say("");
    done.replaceChildren(el("div", { class: "done" },
      el("p", {}, `Saved into ${r.project}: ${r.written} files in `, el("code", {}, r.folder), "."),
      ...r.applied.map((a) => el("p", { class: "help" }, `${a.mesh.split("\\").pop()} › ${a.material}: ${a.how === "LayerTile" ? "repeats through the material" : "repeat in the texture, garment folds kept"}`)),
      el("p", { class: "help" }, "Next: REDcode's Pack and Try (or Pack and Install with the game closed), then look at it in the game."),
    ));
    say("Added.");
  });
};

fillModels();
fillPrompt();
showTab();
