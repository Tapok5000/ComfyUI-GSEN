// Face of MyNode_FaceProcessing: the whole node is this DOM, laid out 1:1 from MyNode.svg (face.css).
import { app } from "../../../scripts/app.js"
import { api } from "../../../scripts/api.js"
import { canvasControls, comboValues, el, hideWidgets, menu, nodeByExecId, txt } from "../shared/ui.js"
import { cropEditor } from "./crop.js"

const NODE = "MyNode_FaceProcessing"
const SIZE = [1890.6, 745]

// [label, widget, top, left, width] px from MyNode.svg; a row with a left is one of its short pills
const ROWS = [
  ["LLM", "ai_prompt", 369.9, 62, 147.7], ["ref_boost", "ref_boost", 369.6, 222.9, 218.4],
  ["grounding_px", "grounding_px", 369.6, 448.1, 247.7], ["Resize", "resolution_source", 432.3, 62, 147.7],
  ["W", "custom_width", 432.3, 385, 147.7], ["H", "custom_height", 432.3, 548.2, 147.7],
  ["", "aspect_ratio", 432.3, 385, 310.9], // a preset's pill, in W and H's place (not in MyNode.svg)
  ["seed", "seed", 488.9], ["steps", "steps", 527.9], ["sampler", "sampler_name", 579.5], ["scheduler", "scheduler", 617.1],
]
const SETTINGS = [
  ["MODEL", "unet_name", 78], ["LoRa", "lora_name", 121], ["CLIP", "clip_name", 167], ["VAE", "vae_name", 211],
  ["LLM", "llm_name", 281.4], ["System", "system_file", 325, 25.9, 282.8],
  ["Crop", "manual_crop", 403.3, 27.3, 147.7], ["FaceCrop", "face_crop", 404.4, 182.9, 194.1],
  ["SAVE", "save_to", 484.1, 27.3, 282.8], ["Sound", "sound", 548.6, 27.3, 282.8], // no widget: node properties
  // not in MyNode.svg: kept in its free right column
  ["max_resolution", "max_resolution", 403.3, 451.4, 282.8],
  ["seed mode", "control_after_generate", 484.1, 451.4, 282.8], // ComfyUI's own seed control: fixed / randomize / …
]
// a loaded .txt: prompts split by lines of dashes (---) if it has any, else by blank lines (assets/node.py: _prompts)
const DASHES = /^[ \t]*-{3,}[ \t]*$/m
const countPrompts = (t) => t.split(DASHES.test(t) ? DASHES : /\n\s*\n/).filter((p) => p.trim()).length

const ICON = {
  clock: `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.6 1.8M3.8 6.2 7 3.6M20.2 6.2 17 3.6M7.2 19.6l-1.6 2M16.8 19.6l1.6 2"/></svg>`,
  open: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="#111" stroke-width="2"><path d="M1 1h20v20H1zM7 15 18 4M11 4h7v7"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#161a0a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 13.5V20h16v-6.5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#777" stroke-width="2.6" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>`,
  plus: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M11 6v10M6 11h10"/></svg>`,
  cross: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m7 7 8 8m0-8-8 8"/></svg>`,
  // MyNode.svg's 🔍 (a glyph there, mirrored), outlined: the Gallery's Filter Images...
  find: `<svg viewBox="0 0 14.5 14.54" width="14.5" height="14.54" fill="currentColor"><path transform="scale(-1 1)" d="m-12.938,5.744q0,-0.869 0.325,-1.622 0.325,-0.760 0.898,-1.332 0.579,-0.572 1.332,-0.898 0.760,-0.325 1.622,-0.325 0.861,0 1.615,0.325 0.760,0.325 1.332,0.898 0.579,0.572 0.905,1.332 0.325,0.753 0.325,1.622 0,0.861 -0.325,1.622 -0.325,0.753 -0.905,1.332 -0.572,0.572 -1.332,0.898 -0.753,0.318 -1.615,0.318 -0.861,0 -1.622,-0.318 -0.753,-0.325 -1.332,-0.898 -0.572,-0.579 -0.898,-1.332 -0.325,-0.760 -0.325,-1.622zm6.445,-2.230q-0.21,-0.376 -0.564,-0.521 -0.354,-0.152 -0.630,0.01 -0.282,0.166 -0.333,0.550 -0.043,0.376 0.173,0.746 0.217,0.376 0.564,0.528 0.354,0.144 0.637,-0.014 0.282,-0.159 0.326,-0.536 0.043,-0.383 -0.173,-0.760zm-8.010,2.230q0,-1.187 0.441,-2.230 0.449,-1.042 1.238,-1.832 0.789,-0.789 1.832,-1.231 1.042,-0.449 2.230,-0.449 1.187,0 2.230,0.449 1.042,0.441 1.832,1.231 0.789,0.789 1.231,1.832 0.449,1.042 0.449,2.230 0,0.912 -0.275,1.745 -0.268,0.825 -0.746,1.520 0.470,-0.101 0.948,0.029 0.485,0.130 0.854,0.499l1.658,1.658q0.383,0.383 0.507,0.890 0.130,0.499 0,0.999 -0.123,0.499 -0.507,0.883 -0.383,0.376 -0.883,0.507 -0.499,0.130 -0.999,0 -0.499,-0.130 -0.883,-0.507l-1.658,-1.665q-0.376,-0.369 -0.507,-0.854 -0.130,-0.485 -0.022,-0.963 -0.688,0.470 -1.513,0.738 -0.818,0.260 -1.716,0.260 -1.187,0 -2.230,-0.449 -1.042,-0.449 -1.832,-1.238 -0.789,-0.789 -1.238,-1.825 -0.441,-1.042 -0.441,-2.230zm10.443,0q0,-0.977 -0.369,-1.825 -0.362,-0.854 -1.013,-1.499 -0.644,-0.644 -1.499,-1.006 -0.847,-0.369 -1.817,-0.369 -0.970,0 -1.825,0.369 -0.854,0.362 -1.499,1.006 -0.644,0.644 -1.014,1.499 -0.362,0.847 -0.362,1.825 0,0.970 0.362,1.825 0.369,0.847 1.014,1.499 0.644,0.644 1.499,1.006 0.854,0.362 1.825,0.362 0.970,0 1.817,-0.362 0.854,-0.362 1.499,-1.006 0.651,-0.651 1.013,-1.499 0.369,-0.854 0.369,-1.825z"/></svg>`,
  // MyNode.svg's 🔊 and 🔇 (font glyphs there), outlined: one box, the speaker in the same place in both
  on: `<svg viewBox="0 0 21.03 16.69" width="21.03" height="16.69" fill="currentColor"><path d="m4.508,13.687h-3.145q-0.562,0 -0.958,-0.416 -0.395,-0.416 -0.395,-1.010v-7.666q0,-0.593 0.395,-1.010 0.395,-0.416 0.958,-0.416h3.156v0.010l6.041,-2.833q0.416,-0.197 0.937,-0.135 0.531,0.052 0.916,0.333 0.385,0.281 0.385,0.75v4.864q0.927,0.020 1.572,0.687 0.656,0.666 0.656,1.604 0,0.927 -0.656,1.593 -0.645,0.666 -1.572,0.697v4.677q0,0.468 -0.281,0.791 -0.281,0.333 -0.698,0.437 -0.416,0.114 -0.843,-0.083zm6.791,-11.989q-0.01,0 -0.021,0 0,0 0,0 -0.052,0 -0.083,0l-0.01,0.010 -5.166,2.427v8.572l5.281,2.343zm5.312,3.031q1.291,1.427 1.354,3.364 0.073,2.270 -1.531,3.874 -0.083,0.072 -0.156,0.145 -0.239,0.218 -0.531,0.197 -0.291,-0.020 -0.510,-0.218 -0.208,-0.208 -0.208,-0.531 0,-0.333 0.229,-0.552 0.562,-0.520 0.885,-1.229 0.322,-0.708 0.322,-1.531 0,-0.812 -0.322,-1.520 -0.323,-0.718 -0.885,-1.229 -0.229,-0.218 -0.229,-0.531v-0.020q0,-0.333 0.208,-0.531 0.218,-0.208 0.510,-0.218 0.291,-0.020 0.531,0.197 0.166,0.145 0.333,0.333zm-0.458,-2.322q0.854,0.489 1.541,1.218 0.875,0.927 1.343,2.114 0.479,1.177 0.489,2.437 0.01,1.375 -0.5,2.635 -0.510,1.25 -1.479,2.218 -0.635,0.635 -1.395,1.072 -0.375,0.218 -0.375,0.656 0,0.427 0.375,0.645 0.375,0.218 0.75,0 1.239,-0.718 2.166,-1.802 0.927,-1.093 1.437,-2.458 0.520,-1.364 0.520,-2.895 0,-1.520 -0.520,-2.885 -0.510,-1.364 -1.437,-2.458 -0.927,-1.093 -2.166,-1.802 -0.375,-0.218 -0.75,0 -0.375,0.208 -0.375,0.645 0,0.427 0.375,0.656z"/></svg>`,
  off: `<svg viewBox="0 0 21.03 16.69" width="21.03" height="16.69" fill="currentColor"><path d="m12.799,11.967v3.447q0,0.468 -0.281,0.791 -0.281,0.333 -0.697,0.437 -0.416,0.114 -0.843,-0.083l-6.468,-2.874h-3.145q-0.562,0 -0.958,-0.416 -0.395,-0.416 -0.395,-1.010v-7.666q0,-0.593 0.395,-1.010 0.395,-0.416 0.958,-0.416h2.635l-1.625,-1.625q-0.260,-0.260 -0.260,-0.625 0,-0.375 0.260,-0.635 0.260,-0.260 0.625,-0.260 0.375,0 0.635,0.260l14.885,14.874q0.260,0.270 0.260,0.645 0,0.364 -0.260,0.624 -0.260,0.260 -0.635,0.260 -0.364,0 -0.625,-0.260zm-1.5,-1.5 -5.281,-5.281v7.520l5.281,2.343zm3.729,-2.020q0,-0.937 -0.656,-1.604 -0.645,-0.666 -1.572,-0.687v-4.864q0,-0.468 -0.385,-0.75 -0.385,-0.281 -0.916,-0.333 -0.520,-0.062 -0.937,0.135l-3.364,1.572 1.135,1.135 2.854,-1.343h0.01q0.021,-0.010 0.083,-0.010 0,0 0,0 0.01,0 0.021,0v4.322l3.468,3.468q0.260,-0.489 0.260,-1.041z"/></svg>`,
}
// GSEN in MyNode.svg's Sci-Fi font, outlined (158.29 x 29.46): the Settings header's logo, the boxes' watermark, the
// middle's background tiles
const GSEN = "m34.766,19.738q0,1.835 -0.566,3.455 -0.566,1.600 -1.620,2.811 -1.034,1.190 -2.518,1.893 -1.464,0.683 -3.162,0.683h-18.078q-1.581,0 -3.689,-1.112 -2.108,-1.112 -3.631,-2.947 -1.503,-1.835 -1.503,-3.846v-12.611q0,-1.542 1.190,-3.299 1.190,-1.776 3.104,-2.967 1.932,-1.210 3.943,-1.210h25.653v6.559h-21.065q-1.190,0 -2.245,0.585 -1.054,0.566 -1.698,1.464 -0.644,0.898 -0.644,1.835v6.188q0,1.444 0.644,2.537 0.644,1.073 1.757,1.659 1.112,0.566 2.518,0.566h10.737q1.112,0 1.893,-0.566 0.800,-0.585 0.800,-1.581 0,-0.995 -0.663,-1.503 -0.663,-0.507 -1.425,-0.507h-7.906v-6.559h9.995q0.136,0.019 1.542,0.312 1.405,0.292 2.909,1.151 1.522,0.839 2.616,2.577 1.112,1.718 1.112,4.431zm39.514,4.529q0,1.757 -1.034,3.045 -1.015,1.269 -2.869,1.269h-32.388v-6.872h25.985q0.683,0 1.444,-0.488 0.761,-0.507 0.761,-1.522 0,-0.546 -0.331,-1.034 -0.312,-0.488 -0.956,-0.780 -0.644,-0.292 -1.405,-0.292h-19.659q-1.405,0 -2.518,-0.702 -1.093,-0.722 -1.698,-1.659 -0.585,-0.956 -0.585,-1.561v-9.078q0,-1.171 1.288,-2.577 1.308,-1.425 3.358,-1.425h29.089v6.637h-24.013q-0.741,0 -1.190,0.624 -0.449,0.624 -0.449,1.308 0,0.624 0.605,1.327 0.624,0.702 1.757,0.702h19.698q2.616,0 3.865,1.347 1.249,1.347 1.249,3.533zm41.506,-10.913q0,1.874 -0.995,3.162 -0.995,1.268 -3.318,1.268l-25.555,-0.039v1.366q0,1.054 0.800,1.971 0.82,0.898 1.757,0.898h26.883v6.598h-28.386q-2.830,0 -4.900,-1.483 -2.069,-1.503 -3.143,-3.494 -1.073,-1.991 -1.073,-3.260v-12.143q0,-1.405 0.761,-2.772 0.781,-1.386 2.05,-2.498 1.269,-1.112 2.655,-1.737 1.405,-0.644 2.596,-0.644h23.193q0.995,0 2.225,0.624 1.229,0.605 2.225,1.522 0.995,0.917 1.600,1.952 0.624,1.034 0.624,1.952zm-7.867,-4.119q0,-0.878 -0.741,-1.425 -0.741,-0.546 -1.659,-0.546l-16.789,-0.039q-1.073,0 -1.952,0.937 -0.859,0.937 -0.859,2.030v1.151h21.963zm50.369,13.236q0,1.210 -0.761,2.869 -0.741,1.639 -2.440,2.889 -1.679,1.229 -4.275,1.229 -2.674,0 -3.963,-0.741 -1.288,-0.722 -2.752,-2.694l-13.588,-16.399q-0.644,-0.859 -1.034,-1.093 -0.371,-0.253 -0.937,-0.253 -0.371,0 -0.761,0.292 -0.390,0.273 -0.390,0.780v19.191h-7.926v-22.275q0,-0.585 0.370,-1.581 0.390,-1.015 1.269,-2.088 0.878,-1.093 2.323,-1.835 1.464,-0.761 3.514,-0.761 2.596,0 4.060,0.878 1.483,0.859 2.381,1.874l13.685,16.106q0.644,0.878 1.093,1.132 0.449,0.234 1.054,0.234 0.702,0 0.859,-0.409 0.175,-0.429 0.175,-1.190v-18.039h8.043z"
const svgUrl = (attrs, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`)}")`
// face.css takes them as --mn-mark (the boxes' watermark, white at 3%) and --mn-tile: black GSENs at 5%, turned 45°,
// where MyNode.svg's pattern5 falls on the middle panel
const MARK = svgUrl('viewBox="0 0 158.293 29.4603" preserveAspectRatio="none"', `<path d="${GSEN}" fill="#fff" fill-opacity=".03"/>`)
const TILE = svgUrl("", `<defs><pattern id="g" width="190.031" height="76.629" patternUnits="userSpaceOnUse"
  patternTransform="matrix(.423226 .423631 -.423374 .423483 -264.622 802.567)"><path d="${GSEN}"/></pattern></defs>
  <rect width="100%" height="100%" fill="url(#g)" opacity=".05"/>`)
// a box's faint word in its top left, as MyNode.svg has it: Arial 20, white at 5%; face.css takes it as --mn-cap
const capUrl = (word) => svgUrl('width="120" height="40"',
  `<text x="8.9" y="25.7" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#fff" fill-opacity=".05">${word}</text>`)
const CAPS = { PROMT: capUrl("PROMT"), RU: capUrl("RU"), EN: capUrl("EN") }

// Settings → Sound: the files in assets/Sound (common.py), played when a Run is done
let sounds = []
const fetchSounds = () => api.fetchApi("/mynode/sounds").then((r) => r.json()).then((l) => (sounds = l)).catch(() => sounds)
const play = (name) => {
  const a = new Audio(api.apiURL(`/mynode/sound?name=${encodeURIComponent(name)}`))
  a.volume = 0.5 // as LC Notify, where these sounds come from, plays them
  a.play().catch(() => {}) // a page nobody has clicked yet may not play
}

const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")
const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1)
const view = (filename, subfolder, type) =>
  api.apiURL(`/view?type=${type}&filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder ?? "")}`)
const thumb = (name, v) => api.apiURL(`/mynode/thumb?s=320&name=${encodeURIComponent(name)}&v=${v ?? 0}`)
const clock = (ms) => new Date(ms).toISOString().slice(14, 19)

// Model rows show a dot for the model's kind instead of the emoji marks in names (🟡 encoders, 🔴 VAE): drawn by
// the node, it sits in the same place in every row, also where a name has no mark
const KIND = { unet_name: "#b06cff", lora_name: "#35d07f", clip_name: "#ffd23f", vae_name: "#ff4d4d", llm_name: "#ffd23f" }
const DEFAULTS = {} // per model input, the node def's default: Python's pick of the newest file of that family
const plain = (s) => String(s ?? "").replace(/[\p{Extended_Pictographic}️‍]/gu, "")
const baseName = (s) => String(s ?? "").split(/[\\/]/).pop()
const fileOf = (s) => baseName(s).toLowerCase()

// a model row's value: the dot, the name without its marks (whole in the tooltip); red when the file isn't there
function modelValue(sv, color, value, files) {
  const dot = el("i", "mn-kind"), label = el("span")
  dot.style.setProperty("--c", color)
  sv.classList.add("kind")
  sv.append(dot, label)
  return () => {
    const v = value() ?? ""
    label.textContent = plain(v)
    sv.title = v
    sv.classList.toggle("missing", !files().includes(v))
  }
}

// ◀ number ▶; put() keeps a value, live() takes it while typing, so Ctrl+Enter right away runs it
function numberField(get, put, live, { min = -Infinity, max = Infinity, precision = 0, step = 1 }) {
  const l = el("div", "mn-tri l"), inp = el("input", "mn-val"), r = el("div", "mn-tri r")
  const show = () => { inp.value = Number(get()).toFixed(precision) }
  const fit = (x) => +Math.min(max, Math.max(min, x)).toFixed(precision)
  const typed = () => parseFloat(inp.value.replace(",", "."))
  const commit = (x) => {
    if (Number.isFinite(x)) put(fit(x))
    show()
  }
  inp.spellcheck = false
  inp.inputMode = "decimal"
  // click, type: the new number replaces the old one. The click itself drops the caret, so select on the
  // click that focused the field; later clicks place the caret as usual.
  let fresh = false
  inp.onpointerdown = () => { fresh = document.activeElement !== inp }
  inp.onclick = () => { if (fresh) inp.select() }
  inp.onfocus = () => { inp.select() } // Tab
  inp.oninput = () => { if (Number.isFinite(typed())) live(fit(typed())) }
  inp.onchange = () => { commit(typed()) }
  inp.onkeydown = (e) => { if (e.key === "Enter") inp.blur() }
  l.onclick = () => { commit(get() - step) }
  r.onclick = () => { commit(get() + step) }
  show()
  return { inp, show, nodes: [l, inp, r] }
}

function build(node) {
  const W = (n) => node.widgets?.find((w) => w.name === n)
  hideWidgets(node)
  // the LLM tab's own: kept in the workflow, left out of the photo's Run, so its checks and cache never see them
  for (const k of ["llm_save_to", "llm_system_file"]) if (W(k)) W(k).options.serialize = false
  const binds = [] // functions that copy widget values onto the face; refresh() runs them all
  const set = (n, v) => {
    const w = W(n)
    if (!w || v === undefined) return
    w.value = v
    w.callback?.(v)
    node.setDirtyCanvas(true, true)
    refresh()
  }
  const off = new AbortController()
  const root = el("div", "mn")

  const head = el("div", "mn-head")
  const time = txt("div", "mn-time", "00:00"), track = el("div", "mn-track"), fill = el("div", "mn-fill")
  const pct = txt("div", "mn-pct", "0%"), openB = el("div", "mn-open", ICON.open), dims = el("div", "mn-dims")
  const run = txt("div", "mn-run", "Run")
  openB.title = "Settings"
  run.title = "Run this node"
  openB.dataset.click = run.dataset.click = ""
  run.onclick = () => {
    app.canvas.selectNode(node) // the command queues the selected output nodes, so: only this one
    app.extensionManager.command.execute("Comfy.QueueSelectedOutputNodes")
  }
  track.append(fill)
  head.append(el("div", "mn-pill t"), el("div", "mn-pill p"), el("div", "mn-clock", ICON.clock), time, track, pct, run, openB, dims)

  const left = el("div", "mn-left")
  const pick = el("div", "mn-pick"), pName = el("div", "mn-pname"), pIdx = el("div", "mn-pidx")
  pick.append(pName, pIdx, el("div", "mn-pbtn"))
  const up = el("div", "mn-upload", ICON.upload + "Upload"), file = picker((name) => {
    const list = W("image").options.values
    if (Array.isArray(list) && !list.includes(name)) list.push(name), list.sort()
    set("image", name)
  })
  const prev = el("div", "mn-prev"), pDims = el("div", "mn-pdims"), pBox = el("div", "mn-pbox"), pWrap = el("div", "mn-pwrap")
  const pImg = el("img"), crop = el("div", "mn-crop"), la = el("div", "mn-arrow l"), ra = el("div", "mn-arrow r")
  pImg.draggable = false
  pWrap.append(pImg, crop)
  pBox.append(pWrap)
  prev.append(pDims, pBox, la, ra)
  left.append(pick, up, file, prev)

  // Crop on: the preview becomes its editor (crop.js). A crop belongs to its picture: another one starts whole
  const readCrop = () => {
    try {
      const c = JSON.parse(W("crop")?.value || "null")
      return c?.image === W("image")?.value ? c : null
    } catch {
      return null
    }
  }
  const ed = cropEditor(pImg, readCrop, (c) => set("crop", JSON.stringify({ image: W("image")?.value, ...c })))
  const cropReset = txt("div", "mn-lbl mn-txt mn-cropreset", "RESET")
  cropReset.onclick = () => set("crop", "")
  pBox.append(ed.canvas)
  prev.append(ed.label, cropReset)
  binds.push(() => {
    const on = !!W("manual_crop")?.value
    pWrap.hidden = on
    ed.canvas.hidden = ed.label.hidden = cropReset.hidden = !on
    if (on) ed.draw()
  })

  // output aspect: the image itself, a preset "… - WxH", or custom W/H
  const targetAspect = () => {
    if (!W("resolution_source")?.value) return pImg.naturalWidth ? pImg.naturalWidth / pImg.naturalHeight : 0
    const f = String(W("aspect_ratio")?.value ?? "custom"), m = f.match(/(\d+)\s*x\s*(\d+)\s*$/)
    return f !== "custom" && m ? m[1] / m[2] : W("custom_width").value / W("custom_height").value
  }
  // lime frame = the part of the input the output aspect covers; the rest is dimmed
  const updateCrop = () => {
    const ai = pImg.naturalWidth / pImg.naturalHeight, at = targetAspect()
    crop.hidden = !(ai && at)
    if (crop.hidden) return
    const w = at >= ai ? 100 : (100 * at) / ai, h = at >= ai ? (100 * ai) / at : 100
    Object.assign(crop.style, { width: w + "%", height: h + "%", left: (100 - w) / 2 + "%", top: (100 - h) / 2 + "%" })
  }
  pImg.onload = () => {
    pDims.textContent = `${pImg.naturalWidth}×${pImg.naturalHeight}`
    updateCrop()
    refreshFrame()
    ed.draw()
  }
  const stepImage = (d) => {
    const list = comboValues(W("image"))
    if (list.length) set("image", list[(list.indexOf(W("image").value) + d + list.length) % list.length])
  }
  la.onclick = () => stepImage(-1)
  ra.onclick = () => stepImage(1)
  up.onclick = () => file.click()

  // on* handlers are blocks on purpose: one that returns false cancels its event (that once ate every key)
  const row = ([label, name, top, left, width], cls) => {
    const w = W(name), r = el("div", cls)
    r.style.top = top + "px"
    r.dataset.w = name
    if (left !== undefined) {
      r.classList.add("c")
      Object.assign(r.style, { left: left + "px", width: width + "px" })
    }
    r.append(txt("div", "k", label))
    if (!w) return r
    const v = el("div", "v")
    if (typeof w.value === "boolean") {
      const t = el("span")
      r.classList.add("tog")
      v.append(t, el("div", "mn-dot"))
      r.onclick = () => { set(name, !w.value) }
      binds.push(() => {
        t.textContent = w.value ? w.options.on ?? "on" : w.options.off ?? "off"
        r.classList.toggle("on", !!w.value)
      })
    } else if (w.type === "combo" && cls === "mn-srow") {
      const sv = el("div", "sv")
      r.classList.add("combo")
      r.onclick = (e) => { menu(e, node, comboValues(w), (x) => set(name, x)) }
      binds.push(KIND[name] ? modelValue(sv, KIND[name], () => w.value, () => comboValues(w))
        : () => { sv.textContent = sv.title = w.value ?? "" })
      r.append(sv)
      return r
    } else if (w.type === "combo") {
      const l = el("div", "mn-tri l"), val = el("div", "mn-val"), rr = el("div", "mn-tri r")
      const step = (d) => {
        const o = comboValues(w)
        if (o.length) set(name, o[(o.indexOf(w.value) + d + o.length) % o.length])
      }
      l.onclick = () => { step(-1) }
      rr.onclick = () => { step(1) }
      val.onclick = (e) => { menu(e, node, comboValues(w), (x) => set(name, x)) }
      binds.push(() => { val.textContent = w.value ?? "" })
      v.append(l, val, rr)
    } else if (typeof w.value === "string") {
      const sv = el("div", "sv"), inp = el("input", "mn-sval")
      inp.spellcheck = false
      inp.placeholder = "preview only"
      inp.oninput = () => { w.value = inp.value } // live: Ctrl+Enter right away saves there
      inp.onchange = () => { set(name, inp.value.trim()) }
      inp.onkeydown = (e) => { if (e.key === "Enter") inp.blur() }
      binds.push(() => { if (document.activeElement !== inp) inp.value = w.value ?? "" })
      sv.append(inp)
      r.append(sv)
      return r
    } else {
      const { min, max, precision, step2: step } = w.options
      const f = numberField(() => w.value, (x) => set(name, x), (x) => { w.value = x }, { min, max, precision, step })
      binds.push(() => { if (document.activeElement !== f.inp) f.show() })
      v.append(...f.nodes)
    }
    r.append(v)
    return r
  }

  const mid = el("div", "mn-mid")
  const prompt = el("textarea", "mn-box"), ru = el("div", "mn-box")
  prompt.dataset.scroll = ru.dataset.scroll = ""
  prompt.spellcheck = false
  Object.assign(prompt.style, { left: "21px", top: "15.3px" }) // the two boxes don't line up in MyNode.svg either
  Object.assign(ru.style, { left: "19.7px", top: "208.9px" })
  prompt.oninput = () => {
    W("text").value = prompt.value
    W("text").callback?.(prompt.value)
  }
  // PROMT and RU are the boxes' background, faint under their text like MyNode.svg draws them; a loaded .txt says its
  // name and count in small lime over the prompt box
  const lp = el("div", "mn-lbl on"), lr = el("div", "mn-lang")
  Object.assign(lp.style, { left: "22.6px", top: "2px" })
  prompt.style.setProperty("--mn-cap", CAPS.PROMT)
  // the box shows the RU translation; a click on its word switches to EN, the prompt the sampler got
  let shot = { RU: "", EN: "" }, lang = "RU"
  const paintLang = () => {
    ru.style.setProperty("--mn-cap", CAPS[lang])
    ru.textContent = shot[lang]
  }
  paintLang()
  lr.title = "RU / EN"
  lr.onclick = () => {
    lang = lang === "RU" ? "EN" : "RU"
    paintLang()
  }
  // LOAD TXT keeps the file's text in the hidden "prompts" widget; while it is there, Run makes an image per
  // prompt and the box shows them read-only. CLOSE TXT goes back to the box's own prompt.
  const lt = txt("div", "mn-ltxt"), txtIn = el("input"), snd = el("div", "mn-snd")
  const loaded = () => W("prompts")?.value ?? ""
  snd.title = "Sound when a Run is done: on / off"
  txtIn.type = "file"
  txtIn.accept = ".txt,text/plain"
  txtIn.hidden = true
  lt.onclick = () => {
    if (loaded().trim()) {
      set("prompt_file", "")
      set("prompts", "")
    } else txtIn.click()
  }
  txtIn.onchange = async () => {
    const f = txtIn.files[0]
    txtIn.value = ""
    if (!f) return
    set("prompt_file", f.name)
    set("prompts", (await f.text()).replace(/\r\n?/g, "\n"))
  }
  binds.push(() => {
    const on = !!loaded().trim(), n = countPrompts(loaded())
    lp.textContent = on ? `${W("prompt_file")?.value || "prompts"} · ${n} prompt${n === 1 ? "" : "s"}` : ""
    lt.textContent = on ? "CLOSE TXT" : "LOAD TXT"
    prompt.readOnly = on
  })
  // custom / preset: aspect_ratio "custom" is W × H; a preset shows its own pill in their place
  const presets = () => comboValues(W("aspect_ratio")).filter((p) => p !== "custom")
  let preset = null // the one custom goes back to
  const mode = row(["", "", 432.3, 222.9, 147.7], "mn-row tog mn-mode")
  mode.firstChild.append(txt("span", "cu", "custom /"), " ", txt("span", "pr", "preset"))
  mode.onclick = () => {
    const v = W("aspect_ratio")?.value
    if (v !== "custom") preset = v
    set("aspect_ratio", v !== "custom" ? "custom" : presets().includes(preset) ? preset : presets()[0])
  }
  binds.push(() => { mid.classList.toggle("preset", W("aspect_ratio")?.value !== "custom") })
  mid.append(lp, lt, txtIn, prompt, lr, ru, snd, mode, ...ROWS.map((s) => row(s, "mn-row")))

  const right = el("div", "mn-right"), rbox = el("div", "mn-rbox"), frame = el("div", "mn-frame"), rImg = el("img")
  const rPrev = el("div", "mn-arrow l"), rNext = el("div", "mn-arrow r"), rNum = el("div", "mn-rnum")
  // A/B compare as in ausboss Image Compare A/B: A = the input, B = the result; A lies over B, cut at the line
  const stage = el("div", "mn-stage"), aImg = el("img"), seam = el("div", "mn-seam")
  stage.append(aImg, seam)
  frame.append(rImg, stage, ...["tl", "tr", "bl", "br"].map((c) => el("i", c)), rPrev, rNext, rNum)
  rbox.append(frame)
  const cmp = el("div", "mn-cmp"), modes = [["slide", "Slide"], ["a", "A"], ["b", "B"]].map(([m, label]) => {
    const b = txt("div", "mn-cbtn", label)
    b.dataset.m = m
    b.onclick = () => {
      node.setProperty("mn_compare", m) // the mode saves with the workflow
      paintCompare()
    }
    return b
  })
  cmp.append(...modes)
  right.append(rbox, cmp)
  let split = 0 // Slide: the share of the width A covers; 0 = the result
  const paintCompare = () => {
    const m = node.properties?.mn_compare ?? "slide"
    const f = !aImg.getAttribute("src") ? 0 : m === "a" ? 1 : m === "b" ? 0 : split
    // a picture covered whole isn't drawn and one shown whole isn't cut: a cut between pixels leaves a hairline
    aImg.style.visibility = f > 0 ? "visible" : "hidden"
    aImg.style.clipPath = f >= 1 ? "none" : `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0)`
    rImg.style.visibility = f >= 1 ? "hidden" : ""
    seam.hidden = !(f > 0 && f < 1)
    seam.style.left = `${(f * 100).toFixed(2)}%`
    modes.forEach((b) => b.classList.toggle("on", b.dataset.m === m))
  }
  const setA = (src) => {
    if (src) aImg.src = src
    else aImg.removeAttribute("src")
    paintCompare()
  }
  frame.addEventListener("pointermove", (e) => {
    if ((node.properties?.mn_compare ?? "slide") !== "slide") return
    const r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width
    split = x < 0 || x > 1 || x <= 0.06 ? 0 : x >= 0.94 ? 1 : x // off the picture (the arrows): the result; edges land whole
    paintCompare()
  })
  frame.addEventListener("pointerleave", () => {
    split = 0 // the pointer gone, the result is back
    paintCompare()
  })
  const refreshFrame = () => {
    const ar = rImg.naturalWidth ? rImg.naturalWidth / rImg.naturalHeight : targetAspect()
    if (ar) frame.style.setProperty("--ar", ar)
  }
  rImg.onload = () => {
    dims.textContent = `${rImg.naturalWidth} × ${rImg.naturalHeight}`
    refreshFrame()
    paintCompare()
  }
  // the results of the last run (a .txt makes one per line): ◀ ▶ flip through them, RU/EN go along
  let shots = [], shotsOf = null, at = 0
  const showShot = (i) => {
    at = (i + shots.length) % shots.length
    shot = shots[at]
    rImg.src = shot.src
    setA(shot.a)
    paintLang()
    rNum.textContent = `${at + 1}/${shots.length}`
    frame.classList.toggle("many", shots.length > 1)
  }
  rPrev.onclick = () => { showShot(at - 1) }
  rNext.onclick = () => { showShot(at + 1) }

  // Settings: a panel over the middle with tabs, as in MyNode.svg; its header also holds Update and the LLM tab's Run
  const setP = el("div", "mn-set"), shead = el("div", "mn-shead"), det = el("div", "mn-det")
  const upB = txt("div", "mn-up", "Update"), lRun = txt("div", "mn-run mn-lrun", "Run")
  const panes = { Settings: el("div", "mn-pane"), Gallery: el("div", "mn-pane"), LLM: el("div", "mn-pane") }
  panes.Settings.dataset.scroll = "" // scrolls once added LoRAs push the rows past the bottom
  let tab = "Settings"
  const tabs = Object.keys(panes).map((t) => {
    const b = txt("div", "mn-tab", t)
    b.onclick = () => { showTab(t) }
    return b
  })
  const showTab = (t) => {
    tab = t
    tabs.forEach((b) => b.classList.toggle("on", b.textContent === t))
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== t
    lRun.hidden = t !== "LLM"
    logo.hidden = upB.hidden = t !== "Settings" // MyNode.svg has them on the Settings board only; on LLM, Run sits there
    det.hidden = true
    if (t === "Gallery") loadGallery()
    // the tab's scroll area takes the focus, so the wheel scrolls it in Nodes 2.0 too
    if (setP.classList.contains("open")) (panes[t].querySelector("[data-scroll]") ?? panes[t]).focus({ preventScroll: true })
  }
  const logo = el("div", "mn-logo", `<svg viewBox="0 0 158.293 29.4603" preserveAspectRatio="none" fill="currentColor"><path d="${GSEN}"/></svg>`)
  shead.append(...tabs, logo, lRun, upB)
  const sRow = Object.fromEntries(SETTINGS.map((s) => [s[1], row(s, "mn-srow")]))

  // Update: this pack against the newest on GitHub (update.py); a click checks again and gets the newer one
  const paintUp = (s) => {
    upB.textContent = s?.available ? `Update ${s.latest}` : "Update"
    upB.title = updateText(s)
  }
  ;(updateInfo ?? checkUpdate()).then(paintUp)
  upB.onclick = async () => {
    upB.textContent = "checking…"
    const s = await checkUpdate()
    paintUp(s)
    if (s?.mode === "dev") return toast("This PC holds the development copy: it is the source, nothing to update.")
    if (!s?.available) return toast(s?.error ?? `GSEN ${s?.version} is the newest.`, s?.error ? "warn" : "info")
    upB.textContent = "updating…"
    const r = await api.fetchApi("/mynode/update", { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }))
    upB.textContent = r.ok ? "Restart" : "Update"
    toast(r.ok ? `GSEN ${r.version} is in. Restart ComfyUI, then Ctrl+F5.` : r.error ?? r.log, r.ok ? "success" : "error", 15000)
  }

  // more LoRAs: rows right under the LoRa row; the hidden "loras" widget keeps them as [[file, strength], ...]
  const GAP = 44, LORA_TOP = SETTINGS.find((s) => s[1] === "lora_name")[2]
  const END = Math.max(...SETTINGS.map((s) => s[2])) + GAP
  const loraFiles = () => comboValues(W("lora_name"))
  const loras = () => { try { return JSON.parse(W("loras")?.value || "[]") } catch { return [] } }
  const putLoras = (list) => { set("loras", JSON.stringify(list)) }
  const extra = el("div"), sEnd = el("div", "mn-send"), add = el("div", "mn-x add", ICON.plus)
  add.title = "Add LoRA"
  add.onclick = (e) => {
    e.stopPropagation() // the row under it opens lora_name's own menu
    menu(e, node, loraFiles(), (f) => putLoras([...loras(), [f, 1]]))
  }
  sRow.lora_name?.append(add)
  let shown = null // the "loras" value the rows were drawn from
  const loraRow = (list, i) => {
    const r = el("div", "mn-srow mn-lora"), v = el("div", "v"), x = el("div", "mn-x", ICON.cross), sv = el("div", "sv")
    r.style.top = LORA_TOP + GAP * (i + 1) + "px"
    modelValue(sv, KIND.lora_name, () => list[i][0], loraFiles)()
    sv.onclick = (e) => { menu(e, node, loraFiles(), (f) => { list[i][0] = f; putLoras(list) }) }
    x.title = "Remove LoRA"
    x.onclick = () => { list.splice(i, 1); putLoras(list) }
    const f = numberField(() => list[i][1], (s) => { list[i][1] = s; putLoras(list) },
      (s) => { list[i][1] = s; W("loras").value = shown = JSON.stringify(list) }, { min: -100, max: 100, precision: 2, step: 0.05 })
    v.append(...f.nodes)
    r.append(txt("div", "k", `LoRa ${i + 2}`), v, x, sv)
    return r
  }
  binds.push(() => {
    const value = W("loras")?.value ?? "[]"
    if (value === shown) return
    shown = value
    const list = loras(), shift = GAP * list.length
    extra.replaceChildren(...list.map((_, i) => loraRow(list, i)))
    for (const [, name, top] of SETTINGS) if (top > LORA_TOP) sRow[name].style.top = top + shift + "px"
    sEnd.style.top = END + shift + "px"
  })
  panes.Settings.append(...Object.values(sRow), extra, sEnd)

  // Sound: 🔊 / 🔇 on the middle and in Settings switch it, its field picks the file; both save with the workflow
  const sIcon = el("div", "mn-snd"), sName = el("div", "sv")
  sRow.sound.classList.add("mn-sound")
  sRow.sound.append(sIcon, sName)
  const muted = () => !!node.properties?.mn_mute
  const soundName = () => (sounds.includes(node.properties?.mn_sound) ? node.properties.mn_sound : sounds[0] ?? "")
  let shownMute = null
  const paintSound = () => {
    if (muted() !== shownMute) snd.innerHTML = sIcon.innerHTML = (shownMute = muted()) ? ICON.off : ICON.on
    sName.textContent = sName.title = soundName()
  }
  snd.onclick = sRow.sound.onclick = async (e) => {
    if (!e.target.closest(".sv")) {
      node.setProperty("mn_mute", !muted())
      return paintSound()
    }
    menu(e, node, await fetchSounds(), (f) => {
      node.setProperty("mn_sound", f)
      paintSound()
      play(f) // a name says little: picking one plays it
    })
  }
  binds.push(paintSound)
  fetchSounds().then(paintSound)

  // Gallery: Generated = what this node made since the page opened, Last = everything in SAVE (common.py:
  // /mynode/results); newest first. A card opens over them with its picture, size, sampling settings and prompt.
  // Items: {id, thumb, src, info: () => Promise of what the PNG keeps}
  const grid = el("div", "mn-resgrid"), subBar = el("div", "mn-sub"), folder = () => String(W("save_to")?.value ?? "")
  const resultRoute = (r, q = "") => `/mynode/result?folder=${encodeURIComponent(folder())}&name=${encodeURIComponent(r.name)}&v=${r.mtime}${q}`
  const corners = () => ["tl", "tr", "bl", "br"].map((c) => el("i", c))
  const made = [] // show() puts each new result first
  let sub = "Generated"
  const subs = ["Generated", "Last"].map((s) => {
    const b = txt("div", "mn-subtab", s)
    b.onclick = () => {
      sub = s
      grid.scrollTop = 0
      loadGallery()
    }
    return b
  })
  subBar.append(...subs)
  // Filter Images...: the open sub-tab's cards whose ID number has what is typed (Egor: by ID only)
  const find = el("div", "mn-gfind", ICON.find), findIn = el("input")
  findIn.placeholder = "Filter Images..."
  findIn.spellcheck = false
  find.append(findIn)
  grid.dataset.scroll = "" // the cards scroll on their own, under the bar
  panes.Gallery.append(subBar, find, grid)
  const saved = (r) => ({ id: r.id, thumb: api.apiURL(resultRoute(r, "&s=320")), src: api.apiURL(resultRoute(r)),
    info: () => api.fetchApi(resultRoute(r, "&info=1")).then((x) => x.json()).catch(() => ({})) })
  let items = [] // the open sub-tab's results, before the filter
  const renderGrid = () => {
    const q = findIn.value.trim().toLowerCase().replace(/^id_?/, "")
    const list = q ? items.filter((r) => String(r.id ?? "").includes(q)) : items
    grid.replaceChildren(...list.map((r) => {
      const c = el("div", "mn-rescard"), box = el("div", "mn-resimg"), im = el("img")
      im.loading = "lazy"
      im.decoding = "async"
      im.draggable = false
      im.src = r.thumb
      box.append(im)
      c.append(box, ...corners(), txt("div", "mn-resid", r.id ? `ID_${r.id}` : "—"))
      c.onclick = () => { openResult(r) }
      return c
    }))
    if (!list.length) {
      grid.append(txt("div", "mn-resnone", q ? `No ID with ${q}` : sub === "Generated" ? "Nothing made since the page opened"
        : folder().trim() ? `No results in ${folder()} yet` : "SAVE is empty: results aren't kept"))
    }
  }
  findIn.oninput = () => { renderGrid() }
  // shortcut: every card at once (thumbnails load lazily); page the list if a SAVE folder grows past a few thousand
  const loadGallery = async () => {
    const want = sub
    subs.forEach((b) => b.classList.toggle("on", b.textContent === want))
    const list = want === "Generated" ? made
      : (await api.fetchApi(`/mynode/results?folder=${encodeURIComponent(folder())}`).then((r) => r.json()).catch(() => [])).map(saved)
    if (want !== sub) return // switched while the list was on its way
    items = list
    renderGrid()
  }
  const big = el("div", "mn-resbig"), bBox = el("div", "mn-resimg"), bImg = el("img"), bSize = el("div", "mn-ressize")
  const bId = el("div", "mn-resid"), par = el("div", "mn-respar"), said = el("div", "mn-resprompt")
  bImg.draggable = false
  said.dataset.scroll = ""
  bBox.append(bImg, bSize)
  big.append(bBox, ...corners(), bId)
  det.append(big, par, said)
  det.onclick = (e) => { if (e.target === det) det.hidden = true } // the dark around the card: back to the cards
  bImg.onload = () => { bSize.textContent = `${bImg.naturalWidth}x${bImg.naturalHeight}` }
  let opened = null
  const openResult = async (r) => {
    opened = r
    det.hidden = false
    bSize.textContent = said.textContent = ""
    bImg.src = r.src
    bId.textContent = r.id ? `ID_${r.id}` : "—"
    par.replaceChildren()
    const info = await r.info()
    if (opened !== r) return // another card was opened meanwhile
    par.replaceChildren(...[["seed", info.seed], ["step", info.steps], ["sampler", info.sampler], ["scheduler", info.scheduler]]
      .flatMap(([k, v]) => [txt("span", "k", k), txt("span", "v", String(v ?? "—"))]))
    said.textContent = info.en ?? ""
  }

  // LLM: the AI step alone (MyNode_LLM): a picture, the same LLM as Settings, its own System (picture → prompt, from
  // assets/prompts/img_to_text) and SAVE; Run queues just that, and the prompt the LLM writes comes back here (setup(): LLM_RUNS)
  const lBox = el("div", "mn-lbox"), lImg = el("img"), lUp = el("div", "mn-upload mn-lup", ICON.upload + "Upload")
  const lOut = el("div", "mn-lout"), lFile = picker((name) => {
    node.setProperty("mn_llm_image", name) // saves with the workflow; the node's own image is untouched
    refresh()
  })
  const llmImage = () => node.properties?.mn_llm_image || W("image")?.value || "" // none uploaded: the node's input
  lImg.draggable = false
  lOut.dataset.scroll = ""
  lBox.append(lImg, ...corners())
  lUp.onclick = () => lFile.click()
  panes.LLM.append(lBox, lUp, lFile, lOut, ...[["LLM", "llm_name", 611.5], ["System", "llm_system_file", 655.1], ["SAVE", "llm_save_to", 698.6]]
    .map(([label, name, top]) => row([label, name, top, 74.7, 282.8], "mn-srow")))
  binds.push(() => {
    const name = llmImage(), src = name ? view(baseOf(name), dirOf(name), "input") : ""
    if (lImg.dataset.src === src) return
    lImg.dataset.src = src
    if (src) lImg.src = src
    else lImg.removeAttribute("src")
  })
  lRun.onclick = async () => {
    const image = llmImage()
    if (!image) return toast("Upload a picture first.", "warn")
    lOut.textContent = ""
    lOut.className = "mn-lout busy"
    const prompt = { mynode_llm: { class_type: "MyNode_LLM", inputs: { image, llm_name: W("llm_name")?.value ?? "",
      system_file: W("llm_system_file")?.value ?? "", save_to: String(W("llm_save_to")?.value ?? "") } } }
    const r = await api.fetchApi("/prompt", { method: "POST", body: JSON.stringify({ prompt, client_id: api.clientId ?? api.initialClientId }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) return LLM_RUNS.set(d.prompt_id, node)
    lOut.classList.remove("busy")
    const why = Object.values(d.node_errors ?? {}).flatMap((n) => n.errors?.map((e) => e.details || e.message) ?? [])
    toast(`LLM: ${why.join("; ") || d.error?.message || r.statusText}`, "error", 8000)
  }

  setP.append(shead, ...Object.values(panes), det)
  showTab(tab)
  openB.onclick = () => { if (setP.classList.toggle("open")) showTab(tab) } // ↗ sits right of the panel: it also closes it

  const gal = el("div", "mn-gal"), gfil = el("div", "mn-gfil", ICON.search), gIn = el("input")
  const gDirs = el("div", "mn-gdirs"), gHead = el("div", "mn-ghead"), gList = el("div", "mn-glist")
  gDirs.dataset.scroll = gList.dataset.scroll = ""
  gIn.placeholder = "Filter Images..."
  gIn.spellcheck = false
  gfil.append(gIn)
  gal.append(gfil, gDirs, gHead, gList)
  let dir = "All", mtimes = {}
  const renderGal = () => {
    const all = comboValues(W("image")), cur = W("image")?.value, q = gIn.value.trim().toLowerCase()
    const dirs = ["All", "root", ...[...new Set(all.map(dirOf).filter(Boolean))].sort()]
    if (!dirs.includes(dir)) dir = "All"
    gDirs.replaceChildren(...dirs.map((d) => {
      const b = txt("div", "mn-gdir" + (d === dir ? " on" : ""), d)
      b.onclick = () => { dir = d; renderGal() }
      return b
    }))
    const items = all.filter((p) => (dir === "All" || (dirOf(p) || "root") === dir) && p.toLowerCase().includes(q))
    gHead.replaceChildren(txt("span", null, dir.toUpperCase()), txt("b", null, String(items.length)))
    gList.replaceChildren(...items.map((p) => {
      const it = el("div", "mn-gitem" + (p === cur ? " on" : "")), im = el("img")
      im.loading = "lazy"
      im.decoding = "async"
      im.draggable = false
      im.src = thumb(p, mtimes[p])
      it.title = p
      it.append(im, txt("span", null, baseOf(p)))
      it.onclick = () => { set("image", p); gal.classList.remove("open") }
      return it
    }))
  }
  gIn.oninput = renderGal
  pick.onclick = async () => {
    gal.classList.add("open")
    try { // fresh list: files added to input/ since the page loaded show up too
      const r = await api.fetchApi("/mynode/images")
      const list = W("image").options.values
      if (r.ok) mtimes = await r.json()
      if (r.ok && Array.isArray(list)) list.splice(0, list.length, ...Object.keys(mtimes))
    } catch {}
    renderGal()
    gList.querySelector(".on")?.scrollIntoView({ block: "center" })
    gIn.focus()
  }

  root.append(head, left, mid, right, setP, gal)

  canvasControls(node, root, head)
  root.addEventListener("pointerdown", (e) => {
    if (gal.classList.contains("open") && !gal.contains(e.target)) gal.classList.remove("open")
  }, true)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return
    gal.classList.remove("open")
    if (!det.hidden) det.hidden = true // an open card first, then the panel
    else setP.classList.remove("open")
  }, { signal: off.signal })

  const refresh = () => {
    binds.forEach((f) => f())
    if (document.activeElement !== prompt) prompt.value = loaded().trim() ? loaded() : W("text")?.value ?? ""
    const name = W("image")?.value ?? "", list = comboValues(W("image"))
    pName.textContent = baseOf(name)
    pIdx.textContent = `${list.indexOf(name) + 1}/${list.length}`
    const src = name ? view(baseOf(name), dirOf(name), "input") : ""
    if (pImg.dataset.src !== src) {
      pImg.dataset.src = src
      pDims.textContent = ""
      if (src) pImg.src = src
      else pImg.removeAttribute("src")
      if (!shots.length) setA(src) // no result yet: A is the input as it is now
    }
    updateCrop()
    refreshFrame()
  }

  let t0 = 0, tick = null
  node._mn = {
    refresh,
    start: () => {
      refresh()
      t0 = Date.now()
      time.textContent = "00:00"
      fill.style.width = "0"
      pct.textContent = "0%"
      clearInterval(tick)
      tick = setInterval(() => { time.textContent = clock(Date.now() - t0) }, 250)
    },
    stop: () => clearInterval(tick),
    progress: (v, max) => {
      const p = Math.round((100 * v) / max)
      fill.style.width = p + "%"
      pct.textContent = p + "%"
    },
    show: (out, promptId) => {
      const im = out?.mn_images?.[0]
      if (!im) return
      if (promptId !== shotsOf) { // a new run starts its own list; until its first image the last one stays
        shots = []
        shotsOf = promptId
      }
      shots.push({ src: view(im.filename, im.subfolder, im.type) + `&t=${Date.now()}`, RU: out.ru?.[0] ?? "", EN: out.en?.[0] ?? "",
        a: pImg.getAttribute("src") }) // each result keeps the input it was made from
      showShot(shots.length - 1)
      const src = shots[shots.length - 1].src, info = out.mn_info?.[0] ?? { en: out.en?.[0] }
      made.unshift({ id: im.mn_id, thumb: src, src, info: async () => info }) // Settings → Gallery → Generated
      if (setP.classList.contains("open") && tab === "Gallery" && det.hidden) loadGallery()
    },
    llm: (text) => {
      lOut.textContent = text.trim() ? text : ""
      lOut.className = lOut.textContent ? "mn-lout" : "mn-lout none" // ran, wrote nothing: "no prompt" (not run yet: "Prompt")
    },
    ding: () => { if (!muted() && soundName()) play(soundName()) },
  }

  // hideInPanel: the right Parameters panel sets widget.width to its own width, and the canvas sizes this face by it
  const dw = node.addDOMWidget("mn_ui", "mn_ui", root, {
    serialize: false, hideOnZoom: false, margin: 0, getMinHeight: () => SIZE[1], hideInPanel: true,
  })
  dw.serialize = false
  const onRemoved = node.onRemoved
  node.onRemoved = function () {
    clearInterval(tick)
    off.abort()
    return onRemoved?.apply(this, arguments)
  }
  refresh()
}

const toast = (detail, severity = "info", life = 6000) => app.extensionManager.toast.add({ severity, summary: "GSEN", detail, life })

// a hidden file input for pictures: the chosen file goes to ComfyUI's input/, put() gets its name there
function picker(put) {
  const inp = el("input")
  inp.type = "file"
  inp.accept = "image/*"
  inp.hidden = true
  inp.onchange = async () => {
    const f = inp.files[0]
    inp.value = ""
    if (!f) return
    const body = new FormData()
    body.append("image", f)
    const r = await api.fetchApi("/upload/image", { method: "POST", body })
    if (r.status !== 200) return toast(`Upload: ${r.statusText}`, "error", 3000)
    const d = await r.json()
    put(d.subfolder ? `${d.subfolder}/${d.name}` : d.name)
  }
  return inp
}

const LLM_RUNS = new Map() // prompt id of a Settings → LLM run -> its node; the run isn't part of the graph

// Settings → Update: GET /mynode/update (update.py), once per page and again on each click
let updateInfo = null
const checkUpdate = () => (updateInfo = api.fetchApi("/mynode/update").then((r) => r.json()).catch(() => null))
const updateText = (s) => !s ? "no answer" : s.mode === "dev" ? `${s.version} · dev` // the dev copy has no update
  : `${s.version}${s.available ? ` → ${s.latest}` : s.latest ? " · latest" : s.error ? " · offline" : ""}`

// A workflow from another PC names its models by that PC's folders: take the same file from anywhere in this
// ComfyUI's models, else this node's default of the family; what is still missing stays red in Settings
function relink(node) {
  const W = (n) => node.widgets?.find((w) => w.name === n)
  const found = [], swapped = [], missing = []
  const pick = (v, files, fallback) => {
    const same = files.find((f) => fileOf(f) === fileOf(v))
    if (same) found.push(plain(same))
    else if (files.includes(fallback)) swapped.push(`${plain(baseName(v))} → ${plain(fallback)}`)
    else missing.push(plain(v))
    return same ?? (files.includes(fallback) ? fallback : v)
  }
  for (const name of Object.keys(KIND)) {
    const w = W(name)
    if (w && !comboValues(w).includes(w.value)) w.value = pick(w.value, comboValues(w), DEFAULTS[name])
  }
  const lw = W("loras"), files = comboValues(W("lora_name"))
  let list = []
  try { list = JSON.parse(lw?.value || "[]") } catch { /* an unreadable list stays as it is */ }
  if (list.some((entry) => !files.includes(entry[0]))) {
    lw.value = JSON.stringify(list.map(([f, s]) => [files.includes(f) ? f : pick(f, files, null), s]))
  }
  if (found.length) toast(`Krea2 One took models from other folders: ${found.join("; ")}`, "info", 12000)
  if (swapped.length) toast(`Krea2 One: not found, the default is used: ${swapped.join("; ")}`, "warn", 15000)
  if (missing.length) toast(`Krea2 One: not in this ComfyUI's models: ${missing.join("; ")}. Pick them in Settings.`, "warn", 20000)
}

const ours = (id) => {
  const n = id != null ? nodeByExecId(id) : null
  return n?.comfyClass === NODE ? n : null
}

app.registerExtension({
  name: "MyNode.FaceProcessing",

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE) return
    for (const name of Object.keys(KIND)) DEFAULTS[name] = nodeData.input?.required?.[name]?.[1]?.default
    nodeType.title_mode = LiteGraph.NO_TITLE // the lime header is the title; no LiteGraph bar above it
    nodeType.collapsable = false
  },

  async nodeCreated(node) {
    if (node.comfyClass !== NODE) return
    node.widgets_start_y = 0
    node.resizable = false
    const ctl = node.widgets?.find((w) => w.name === "control_after_generate")
    if (ctl) ctl.value = "fixed" // the workflow kept its seed; saved workflows override this on load
    build(node)
    node.setSize([...SIZE])
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE) return
    while (node.outputs?.length) node.removeOutput(node.outputs.length - 1) // RU/Result sockets of the first version
    const sys = node.widgets?.find((w) => w.name === "system_file"), lsys = node.widgets?.find((w) => w.name === "llm_system_file")
    // until 1.17.0 the LLM tab shared System: a picture → prompt one found there is the LLM tab's choice
    if (sys && lsys && !comboValues(sys).includes(sys.value) && comboValues(lsys).includes(sys.value)) lsys.value = sys.value
    // 1.9.0 saved "" or a file from anywhere, and a renamed prompt is gone: take the first one there is
    for (const w of [sys, lsys]) if (w && !comboValues(w).includes(w.value)) w.value = comboValues(w)[0] ?? ""
    relink(node)
    node.setSize([...SIZE])
    node._mn?.refresh()
  },

  async setup() {
    const css = el("link")
    css.rel = "stylesheet"
    css.href = new URL("./face.css", import.meta.url)
    document.head.append(css, txt("style", null, `.mn{--mn-mark:${MARK};--mn-tile:${TILE}}`))
    ;(updateInfo ?? checkUpdate()).then((s) => {
      if (s?.problems?.length) {
        toast(`This ComfyUI changed what Krea2 One is built from: ${s.problems.join("; ")}. Run may fail; Settings → Update brings a fixed version.`, "warn", 20000)
      }
    })

    // the browser tab's icon: a lime square, AusBoss's teal one's shape, with a dark dot while a prompt runs. ComfyUI's
    // progress frames and AusBoss set it on their own events, so whatever they put there is swapped back at once
    let busy = false
    const ICONS = [false, true].map((dot) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="14" fill="#c7f400"/>${dot ? '<circle cx="46" cy="18" r="10" fill="#161a0a"/>' : ""}</svg>`)}`)
    const keepIcon = () => {
      for (const l of document.querySelectorAll("link[rel~='icon']")) if (l.getAttribute("href") !== ICONS[+busy]) l.setAttribute("href", ICONS[+busy])
    }
    new MutationObserver(keepIcon).observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] })
    api.addEventListener("execution_start", () => { busy = true; keepIcon() })
    for (const ev of ["execution_success", "execution_error", "execution_interrupted"]) api.addEventListener(ev, () => { busy = false; keepIcon() })
    keepIcon()

    let running = null
    const stop = () => { running?._mn.stop(); running = null }
    api.addEventListener("executing", ({ detail }) => {
      const n = ours(detail && typeof detail === "object" ? detail.display_node ?? detail.node : detail)
      if (n === running) return
      stop()
      if (n) { running = n; n._mn.start() }
    })
    for (const ev of ["execution_success", "execution_error", "execution_interrupted"]) api.addEventListener(ev, stop)
    api.addEventListener("progress", ({ detail }) => running?._mn.progress(detail.value, detail.max))
    const DONE = new Map() // prompt id -> the Krea2 One that made something in it: it chimes once, when all of it is done
    api.addEventListener("executed", ({ detail }) => {
      const n = ours(detail.display_node ?? detail.node), l = detail.output?.mn_llm && LLM_RUNS.get(detail.prompt_id)
      n?._mn.show(detail.output, detail.prompt_id)
      l?._mn.llm(detail.output.mn_llm[0])
      if (n || l) DONE.set(detail.prompt_id, n || l)
    })
    api.addEventListener("execution_success", ({ detail }) => DONE.get(detail?.prompt_id)?._mn.ding())
    for (const ev of ["execution_error", "execution_interrupted"]) { // ComfyUI shows the error itself
      api.addEventListener(ev, ({ detail }) => LLM_RUNS.get(detail?.prompt_id)?._mn.llm(""))
    }
    for (const ev of ["execution_success", "execution_error", "execution_interrupted"]) {
      api.addEventListener(ev, ({ detail }) => DONE.delete(detail?.prompt_id))
    }
    api.addEventListener("mynode.toast", ({ detail }) => {
      app.extensionManager.toast.add({ severity: "warn", summary: "Krea2 One", detail: detail.text, life: 8000 })
    })
    api.addEventListener("promptQueued", () => app.graph?.nodes.forEach((n) => n.comfyClass === NODE && n._mn?.refresh()))
  },
})
