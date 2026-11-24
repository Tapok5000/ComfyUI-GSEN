// Face of MyNode_FaceProcessing: the whole node is this DOM, laid out 1:1 from MyNode.svg (face.css).
import { app } from "../../../scripts/app.js"
import { api } from "../../../scripts/api.js"
import { canvasControls, comboValues, dropTo, el, hideWidgets, menu, nodeByExecId, picker, toast, txt } from "../shared/ui.js"
import { PRESETS, cropEditor } from "./crop.js"

const NODE = "MyNode_FaceProcessing"
const SIZE = [1890.6, 745]
const TWO = 515.47 // 2 IMG (Krea2.svg's Krea2 Two): a second picture's column, everything right of it moved over
// the tabs over the middle (Krea2.svg, QW21.svg) and over Settings' pages (SettingIU.svg): [name, its word's centre] px;
// XXX are places for modes to come. TITLES: the modes a family runs, each one's title (a tab not in it can't be picked)
const MODE_TABS = { "Krea 2": [["EDIT", 43.21], ["2 IMG", 47.93], ["XXX", 46.42], ["XXX", 48.13]],
  "QW 21": [["EDIT", 43.2], ["2 IMG", 47.8], ["UpScale", 46.6], ["BG", 48.4], ["XXX", 46.2]],
  H3: [["CH SHEET", 48.8], ["XXX", 47.93], ["XXX", 46.42], ["XXX", 48.13]] }
const FAMILY_TABS = [["Krea 2", 45.73], ["QW 21", 47.21], ["H3", 46.67]]
const TITLES = { "Krea 2": { EDIT: "Krea2 One", "2 IMG": "Krea2 Two" }, "QW 21": { UpScale: "QW21 UpScale", BG: "QW21 BG" },
  H3: { "CH SHEET": "H3 CH SHEET" } }
const SHEET = 2152 / 1104 // H3 · CH SHEET's result (parts.Sheet of 544 x 960 frames): the frame takes its shape
// QW 21's middle (QW21.svg): its modes' pills, [label, widget, top, left, width] px on the middle; BG's SeedVR2 a row lower
// than drawn, to make room for No Person under No LOGO. Its presets: [name, top, left, width]
const QW_ROWS = {
  UpScale: [["steps", "up_steps", 93.11, 36.97, 140], ["sampler", "up_sampler", 134.97, 38.37, 200],
    ["scheduler", "up_scheduler", 180.33, 38.37, 200], ["SeedVR2", "seedvr2", 129.99, 273.9, 138.91],
    ["Grain", "grain", 180.42, 275.7, 138.91]],
  BG: [["steps", "bg_steps", 169.12, 131.06, 140], ["sampler", "bg_sampler", 210.98, 132.46, 200],
    ["scheduler", "bg_scheduler", 256.35, 132.46, 200], ["Resolution", "qw_resolution", 307.25, 132.46, 200],
    ["SeedVR2", "seedvr2", 340.76, 397.1, 138.91]],
}
const EMPTY = { "Krea 2": new URL("./empty.svg", import.meta.url).href, "QW 21": new URL("./empty-qw.svg", import.meta.url).href,
  H3: new URL("./empty-h3.svg", import.meta.url).href }
const BG_PRESETS = [["BG", 191.06, 395.33, 66.06], ["White", 191.06, 470.32, 66.06], ["No TEXT", 229.04, 414.69, 102.33],
  ["No LOGO", 261.75, 415.39, 102.33], ["No Person", 295.21, 415.39, 102.33]]

// [label, widget, top, left, width] px from MyNode.svg: the middle's two columns of pills under the prompt boxes, all
// moved by .mn-mid (Krea2.svg). Resize lies over Crop's left end and custom / preset over W x H's: the later one is on top
const ROWS = [
  ["LLM", "ai_prompt", 426.9, 50.4, 138.91], ["Ref boost", "ref_boost", 426.9, 209.63, 199.93],
  ["Crop", "manual_crop", 483.19, 156.04, 144.89], ["Resize", "resolution_source", 483.17, 50.47, 138.55],
  ["", "aspect_ratio", 540.18, 152.53, 199.88], // a preset's name, in W x H's place (not in MyNode.svg)
  ["seed", "seed", 426.88, 468.17, 199.89], ["steps", "steps", 504.85, 468.74, 140],
  ["sampler", "sampler_name", 546.71, 470.14, 200], ["scheduler", "scheduler", 592.08, 470.14, 200],
  // H3 · CH SHEET's own sampling in their place: face.css shows the family's set
  ["steps", "h3_steps", 504.85, 468.74, 140], ["sampler", "h3_sampler", 546.71, 470.14, 200],
  ["scheduler", "h3_scheduler", 592.08, 470.14, 200],
]
// under seed: [label, control_after_generate value, left, width]. FIX keeps the seed, RANDOM rolls one after each Run;
// LIST is the seeds kept with + beside seed (MyNode.svg), one picked goes back in and is pinned (FIX)
const SEED_MODES = [["FIX", "fixed", 468.19, 66.06], ["RANDOM", "randomize", 536.39, 98.41], ["LIST", null, 636.94, 66.06]]
const SEED_KEEP = 20 // newest first, no repeats
// Settings' pages (SettingIU.svg). The general one, no family lit: [label, widget, top, left, width] px on the panel; LLM is
// a long row (face.css places it)
const GENERAL = [["Sound", "sound", 151.68, 30.81, 273.11], ["Save", "save_to", 211.17, 30.81, 273.11], // Sound: node properties
  ["LLM", "llm_name", 316.27], ["System", "system_file", 357.98, 31.8, 273.11]]
// a family's page: its models' rows, [label, widget], at ROW_TOPS, H3's two status rows lower (PAGE_SHIFT)
const FAMILY_ROWS = {
  "Krea 2": [["MODEL", "unet_name"], ["LoRa", "lora_name"], ["CLIP", "clip_name"], ["VAE", "vae_name"]],
  "QW 21": [["MODEL", "qw_unet_name"], ["LoRa", "qw_lora_name"], ["CLIP", "qw_clip_name"], ["VAE", "qw_vae_name"]],
  H3: [["MODEL", "h3_unet_name"], ["LoRa", "h3_lora_name"], ["CLIP", "h3_clip_name"], ["VAE Video", "h3_vae_video"],
    ["VAE Audio", "h3_vae_audio"]],
}
const ROW_TOPS = [343.61, 386.27, 432.53, 476.39, 520.23]
// over them, each page's files (assets/models.py) and whether they are here: [label, key, widget], a family's at
// STATUS_TOPS, the general page's at GENERAL_STATUS. H3 has CH SHEET's three LoRAs (INSTALLATION.md): a downloaded
// Realism goes into its LoRA list at its strength there; Polyhedron (Civitai) is put in by hand
const STATUS = {
  "": [["SeedVR2", "SEEDVR2", "seedvr2_name"], ["", "SEEDVR2_VAE", "seedvr2_vae"], ["LLM", "LLM", "llm_name"]],
  "Krea 2": [["MODEL", "MODEL", "unet_name"], ["LORA", "LORA", "lora_name"], ["CLIP", "CLIP", "clip_name"], ["VAE", "VAE", "vae_name"]],
  "QW 21": [["MODEL", "QW_MODEL", "qw_unet_name"], ["LORA", "QW_LORA", "qw_lora_name"], ["CLIP", "QW_CLIP", "qw_clip_name"],
    ["VAE", "QW_VAE", "qw_vae_name"]],
  H3: [["MODEL", "H3_MODEL", "h3_unet_name"], ["LORA", "H3_LORA", "h3_lora_name"], ["LORA", "H3_REALISM", "h3_loras", 0.75],
    ["LORA", "H3_POLYHEDRON", null], ["CLIP", "H3_CLIP", "h3_clip_name"], ["VAE", "H3_VAE_VIDEO", "h3_vae_video"],
    ["VAE", "H3_VAE_AUDIO", "h3_vae_audio"]],
}
const STATUS_TOPS = [149.86, 180.49, 211.47, 245.75, 280.07, 314.39, 348.71]
const PAGE_SHIFT = { H3: 68.64 } // its two more status rows
const GENERAL_STATUS = [159.75, 190.56, 273.23]
// a loaded .txt: prompts split by lines of dashes (---) if it has any, else by blank lines (assets/node.py: _prompts)
const DASHES = /^[ \t]*-{3,}[ \t]*$/m
const countPrompts = (t) => t.split(DASHES.test(t) ? DASHES : /\n\s*\n/).filter((p) => p.trim()).length
// MyNode.svg's 🔊 and 🔇 (font glyphs there), outlined: one box, the speaker in the same place in both, drawn 9.5% wider
// and 10.4% taller than the glyph and with its lower half 20% darker, as MyNode.svg has it (its shadow: face.css)
const speaker = (d) => `<svg viewBox="0 0 21.03 16.69" width="23.02" height="18.43" preserveAspectRatio="none" fill="currentColor">
  <path d="${d}"/><svg y="8.29" width="21.03" height="8.4" viewBox="0 8.29 21.03 8.4"><path d="${d}" fill="#161a0a" fill-opacity=".2"/></svg></svg>`

const ICON = {
  clock: `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.6 1.8M3.8 6.2 7 3.6M20.2 6.2 17 3.6M7.2 19.6l-1.6 2M16.8 19.6l1.6 2"/></svg>`,
  open: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="#111" stroke-width="2"><path d="M1 1h20v20H1zM7 15 18 4M11 4h7v7"/></svg>`,
  // MyNode.svg's ⛶ (its layer Corner): four corners, lighter under the diagonal from top right to bottom left
  full: `<svg viewBox="302.205 -60.551 473.881 455.851" width="23.36" height="22.47"><g fill="#111">
    <path d="m302.205-60.551h204v37c0,23-18,41-41,41h-85v86c0,23-18,40-41,40h-37z"/><path d="m776.086-60.551h-204v37c0,23 18,41 41,41h85v86c0,23 18,40 41,40h37z"/>
    <path d="m302.205 191.301h37c23,0 41,18 41,41v85h85c23,0 41,18 41,41v37h-204z"/><path d="m776.086 191.301h-37c-23,0-41,18-41,41v85h-85c-23,0-41,18-41,41v37h204z"/>
    </g><g fill="#fff" fill-opacity=".1"><path d="m775.649-60.552-80.957,77.985h3.289v86.029c0,23 18.014,39.983 41.014,39.983h37.011v-203.998z"/>
    <path d="m383.346 317.288-80.997,78.025h203.76v-37.011c0-23-18.014-41.014-41.014-41.014z"/>
    <path d="m738.995 191.315h37.011v203.998h-203.998v-37.011c0-23 17.974-41.014 40.974-41.014h84.999v-84.999c0-23 18.014-40.974 41.014-40.974z"/></g></svg>`,
  // Krea2.svg's Upload icon, an arrow into a tray
  upload: `<svg viewBox="-39.96 74.04 5.597 5.848" width="21.14" height="22.1" fill="#161a0a"><path d="m-34.707 76.899c-.058-.001-.114.03-.193.095-.121.098-.125.126-.141 1.043-.014.77-.032.959-.101 1.034-.077.085-.242.093-2.026.093h-1.943l-.082-.117c-.066-.095-.082-.286-.082-.997 0-.762-.012-.894-.092-.987-.143-.166-.418-.193-.577-.068l-.017.118v.975c0 1.062.028 1.199.296 1.466.327.324.478.343 2.661.333 1.637-.008 1.895-.02 2.033-.097.222-.123.429-.353.525-.584.064-.153.082-.407.082-1.145v-.948-.18c-.086-.068-.285-.031-.342-.033z"/><path d="m-37.163 74.04-.726.726-.726.726h.541.541v.994c0 .547.021 1.038.019 1.038h.374.32l.014-1.016.014-1.016h.54.54l-.726-.726z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#777" stroke-width="2.6" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>`,
  plus: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M11 6v10M6 11h10"/></svg>`,
  cross: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m7 7 8 8m0-8-8 8"/></svg>`,
  // MyNode.svg's 🔍 (a glyph there, mirrored), outlined: the Gallery's Filter Images...
  find: `<svg viewBox="0 0 14.5 14.54" width="14.5" height="14.54" fill="currentColor"><path transform="scale(-1 1)" d="m-12.938,5.744q0,-0.869 0.325,-1.622 0.325,-0.760 0.898,-1.332 0.579,-0.572 1.332,-0.898 0.760,-0.325 1.622,-0.325 0.861,0 1.615,0.325 0.760,0.325 1.332,0.898 0.579,0.572 0.905,1.332 0.325,0.753 0.325,1.622 0,0.861 -0.325,1.622 -0.325,0.753 -0.905,1.332 -0.572,0.572 -1.332,0.898 -0.753,0.318 -1.615,0.318 -0.861,0 -1.622,-0.318 -0.753,-0.325 -1.332,-0.898 -0.572,-0.579 -0.898,-1.332 -0.325,-0.760 -0.325,-1.622zm6.445,-2.230q-0.21,-0.376 -0.564,-0.521 -0.354,-0.152 -0.630,0.01 -0.282,0.166 -0.333,0.550 -0.043,0.376 0.173,0.746 0.217,0.376 0.564,0.528 0.354,0.144 0.637,-0.014 0.282,-0.159 0.326,-0.536 0.043,-0.383 -0.173,-0.760zm-8.010,2.230q0,-1.187 0.441,-2.230 0.449,-1.042 1.238,-1.832 0.789,-0.789 1.832,-1.231 1.042,-0.449 2.230,-0.449 1.187,0 2.230,0.449 1.042,0.441 1.832,1.231 0.789,0.789 1.231,1.832 0.449,1.042 0.449,2.230 0,0.912 -0.275,1.745 -0.268,0.825 -0.746,1.520 0.470,-0.101 0.948,0.029 0.485,0.130 0.854,0.499l1.658,1.658q0.383,0.383 0.507,0.890 0.130,0.499 0,0.999 -0.123,0.499 -0.507,0.883 -0.383,0.376 -0.883,0.507 -0.499,0.130 -0.999,0 -0.499,-0.130 -0.883,-0.507l-1.658,-1.665q-0.376,-0.369 -0.507,-0.854 -0.130,-0.485 -0.022,-0.963 -0.688,0.470 -1.513,0.738 -0.818,0.260 -1.716,0.260 -1.187,0 -2.230,-0.449 -1.042,-0.449 -1.832,-1.238 -0.789,-0.789 -1.238,-1.825 -0.441,-1.042 -0.441,-2.230zm10.443,0q0,-0.977 -0.369,-1.825 -0.362,-0.854 -1.013,-1.499 -0.644,-0.644 -1.499,-1.006 -0.847,-0.369 -1.817,-0.369 -0.970,0 -1.825,0.369 -0.854,0.362 -1.499,1.006 -0.644,0.644 -1.014,1.499 -0.362,0.847 -0.362,1.825 0,0.970 0.362,1.825 0.369,0.847 1.014,1.499 0.644,0.644 1.499,1.006 0.854,0.362 1.825,0.362 0.970,0 1.817,-0.362 0.854,-0.362 1.499,-1.006 0.651,-0.651 1.013,-1.499 0.369,-0.854 0.369,-1.825z"/></svg>`,
  on: speaker("m4.508,13.687h-3.145q-0.562,0 -0.958,-0.416 -0.395,-0.416 -0.395,-1.010v-7.666q0,-0.593 0.395,-1.010 0.395,-0.416 0.958,-0.416h3.156v0.010l6.041,-2.833q0.416,-0.197 0.937,-0.135 0.531,0.052 0.916,0.333 0.385,0.281 0.385,0.75v4.864q0.927,0.020 1.572,0.687 0.656,0.666 0.656,1.604 0,0.927 -0.656,1.593 -0.645,0.666 -1.572,0.697v4.677q0,0.468 -0.281,0.791 -0.281,0.333 -0.698,0.437 -0.416,0.114 -0.843,-0.083zm6.791,-11.989q-0.01,0 -0.021,0 0,0 0,0 -0.052,0 -0.083,0l-0.01,0.010 -5.166,2.427v8.572l5.281,2.343zm5.312,3.031q1.291,1.427 1.354,3.364 0.073,2.270 -1.531,3.874 -0.083,0.072 -0.156,0.145 -0.239,0.218 -0.531,0.197 -0.291,-0.020 -0.510,-0.218 -0.208,-0.208 -0.208,-0.531 0,-0.333 0.229,-0.552 0.562,-0.520 0.885,-1.229 0.322,-0.708 0.322,-1.531 0,-0.812 -0.322,-1.520 -0.323,-0.718 -0.885,-1.229 -0.229,-0.218 -0.229,-0.531v-0.020q0,-0.333 0.208,-0.531 0.218,-0.208 0.510,-0.218 0.291,-0.020 0.531,0.197 0.166,0.145 0.333,0.333zm-0.458,-2.322q0.854,0.489 1.541,1.218 0.875,0.927 1.343,2.114 0.479,1.177 0.489,2.437 0.01,1.375 -0.5,2.635 -0.510,1.25 -1.479,2.218 -0.635,0.635 -1.395,1.072 -0.375,0.218 -0.375,0.656 0,0.427 0.375,0.645 0.375,0.218 0.75,0 1.239,-0.718 2.166,-1.802 0.927,-1.093 1.437,-2.458 0.520,-1.364 0.520,-2.895 0,-1.520 -0.520,-2.885 -0.510,-1.364 -1.437,-2.458 -0.927,-1.093 -2.166,-1.802 -0.375,-0.218 -0.75,0 -0.375,0.208 -0.375,0.645 0,0.427 0.375,0.656z"),
  off: speaker("m12.799,11.967v3.447q0,0.468 -0.281,0.791 -0.281,0.333 -0.697,0.437 -0.416,0.114 -0.843,-0.083l-6.468,-2.874h-3.145q-0.562,0 -0.958,-0.416 -0.395,-0.416 -0.395,-1.010v-7.666q0,-0.593 0.395,-1.010 0.395,-0.416 0.958,-0.416h2.635l-1.625,-1.625q-0.260,-0.260 -0.260,-0.625 0,-0.375 0.260,-0.635 0.260,-0.260 0.625,-0.260 0.375,0 0.635,0.260l14.885,14.874q0.260,0.270 0.260,0.645 0,0.364 -0.260,0.624 -0.260,0.260 -0.635,0.260 -0.364,0 -0.625,-0.260zm-1.5,-1.5 -5.281,-5.281v7.520l5.281,2.343zm3.729,-2.020q0,-0.937 -0.656,-1.604 -0.645,-0.666 -1.572,-0.687v-4.864q0,-0.468 -0.385,-0.75 -0.385,-0.281 -0.916,-0.333 -0.520,-0.062 -0.937,0.135l-3.364,1.572 1.135,1.135 2.854,-1.343h0.01q0.021,-0.010 0.083,-0.010 0,0 0,0 0.01,0 0.021,0v4.322l3.468,3.468q0.260,-0.489 0.260,-1.041z"),
  // MyNode.svg's ✅ and ⬇️ (emoji there, white in its fonts), outlined: Settings' model rows
  ok: `<svg viewBox="14.182 20.422 11.636 11.636" width="11.64" height="11.64" fill="currentColor"><path d="m18.5,28.391 .266,.266q.109,.109 .266,.109 .156,0 .266-.109l4.245-4.25q.109-.109 .109-.26 0-.156-.109-.271-.109-.109-.266-.109-.156,0-.266,.109l-3.979,3.984-2.026-2.026q-.109-.115-.266-.115-.156,0-.266,.115-.109,.109-.109,.266 0,.151 .109,.26l2.026,2.031zM16.245,20.609q-.516,0-.943,.255-.427,.25-.682,.677-.25,.427-.25,.943v7.51q0,.516 .25,.943 .255,.427 .682,.677 .427,.255 .943,.255h7.51q.516,0 .943-.255 .427-.25 .677-.677 .255-.427 .255-.943v-7.51q0-.516-.255-.943-.25-.427-.677-.677-.427-.255-.943-.255zm-1.125,1.875q0-.464 .328-.792 .333-.333 .797-.333h7.51q.469,0 .797,.333 .328,.328 .328,.792v7.51q0,.464-.328,.792-.328,.333-.797,.333h-7.51q-.464,0-.797-.333-.328-.328-.328-.792zm-.938,0v7.51q0,.568 .276,1.036 .281,.469 .75,.745 .469,.281 1.036,.281h7.51q.568,0 1.036-.281 .469-.276 .745-.745 .281-.469 .281-1.036v-7.51q0-.568-.281-1.036-.276-.469-.745-.745-.469-.281-1.036-.281h-7.51q-.568,0-1.036,.281-.469,.276-.75,.745-.276,.469-.276,1.036zm.375,0q0-.464 .229-.849 .229-.385 .609-.609 .385-.229 .849-.229h7.51q.469,0 .849,.229 .385,.224 .609,.609 .229,.385 .229,.849v7.51q0,.464-.229,.849-.224,.385-.609,.609-.38,.229-.849,.229h-7.51q-.464,0-.849-.229-.38-.224-.609-.609-.229-.385-.229-.849zm1.688-1.313q-.359,0-.661,.177-.297,.177-.474,.479-.177,.297-.177,.656v7.51q0,.359 .177,.656 .177,.302 .474,.479 .302,.177 .661,.177h7.51q.365,0 .661-.177 .297-.177 .474-.479 .177-.297 .177-.656v-7.51q0-.359-.177-.656-.177-.302-.474-.479-.297-.177-.661-.177zm0,.375h7.51q.391,0 .661,.276 .276,.276 .276,.661v7.51q0,.385-.276,.661-.271,.276-.661,.276h-7.51q-.385,0-.661-.276-.276-.276-.276-.661v-7.51q0-.385 .276-.661 .276-.276 .661-.276zm.094,4.948 1.896,1.896v0l.13,.13 .266,.266q.167,.167 .401,.167 .234,0 .396-.167l4.25-4.245q.161-.167 .161-.396 0-.234-.161-.401-.167-.167-.401-.167-.234,0-.396,.167l-3.849,3.849-1.896-1.896q-.161-.167-.396-.167-.234,0-.401,.167-.161,.167-.161,.401 0,.229 .161,.396zm2.823,1.495 3.984-3.979q.052-.057 .13-.057 .078,0 .135,.057 .052,.052 .052,.13 0,.078-.052,.135l-4.25,4.245q-.052,.057-.13,.057-.078,0-.135-.057L18.766,28.391v0l-.135-.135-2.026-2.026q-.052-.057-.052-.13 0-.078 .052-.135 .057-.057 .135-.057 .078,0 .13,.057l2.026,2.026 .135,.135z"/></svg>`,
  // MyNode.svg's + beside seed: a lime disc with the + cut out, over its dark shadow
  keep: `<svg viewBox="1889.840 -315.641 30.899 33.115" width="27.89" height="29.89"><circle cx="1904.805" cy="-297.492" r="14.965" fill="#161a0a"/><path d="m1905.289-315.641a15.449,15.449 0 0 0-15.449,15.449 15.449,15.449 0 0 0 15.449,15.449 15.449,15.449 0 0 0 15.449-15.449 15.449,15.449 0 0 0-15.449-15.449zm0,7.569c.25,0 .459,.017 .625,.05 .167,.022 .296,.061 .391,.117 .107,.045 .184,.107 .232,.186 .048,.067 .072,.144 .072,.234v6.118h5.87c.095,0 .177,.022 .248,.067 .084,.045 .156,.117 .216,.218 .071,.101 .117,.23 .141,.387 .036,.146 .055,.319 .055,.52 0,.213-.019,.398-.055,.554-.035,.146-.082,.27-.141,.371-.06,.101-.133,.173-.216,.218-.084,.045-.171,.067-.266,.067h-5.851v6.118c0,.09-.025,.167-.072,.234-.047,.056-.125,.106-.232,.151-.095,.045-.225,.085-.391,.119-.167,.022-.375,.032-.625,.032-.238,0-.447-.01-.625-.032-.167-.034-.302-.074-.409-.119-.095-.045-.166-.095-.214-.151-.047-.067-.072-.144-.072-.234v-6.118h-5.851c-.107,0-.201-.022-.284-.067-.071-.045-.138-.117-.198-.218-.06-.101-.106-.225-.141-.371-.036-.157-.055-.342-.055-.554 0-.202 .019-.375 .055-.52 .035-.157 .082-.286 .141-.387 .06-.101 .126-.173 .198-.218 .084-.045 .171-.067 .266-.067h5.87v-6.118c0-.09 .025-.167 .072-.234 .048-.079 .118-.141 .214-.186 .107-.056 .243-.095 .409-.117 .178-.034 .387-.05 .625-.05z" fill="#c7f400"/></svg>`,
  down: `<svg viewBox="92.962 18.262 14.075 14.075" width="14.08" height="14.08" fill="currentColor"><path d="m99.063,21.543v4.577q0,.117-.117,.117h-1.439q-.208,0-.339,.143-.124,.137-.13,.332-.006,.189 .143,.332l2.493,2.402q.137,.13 .326,.13 .189,0 .326-.13l2.493-2.402q.15-.143 .143-.332 0-.195-.13-.332-.124-.143-.339-.143h-1.439q-.117,0-.117-.117V21.543q0-.189-.137-.326-.137-.143-.332-.143h-.937q-.195,0-.332,.143-.137,.137-.137,.326zM95.306,18.262H104.694q.645,0 1.178,.319 .534,.312 .846,.846 .319,.534 .319,1.178v9.388q0,.645-.319,1.178-.312,.534-.846,.846-.534,.319-1.178,.319h-9.388q-.645,0-1.178-.319-.534-.312-.853-.846-.312-.534-.312-1.178v-9.388q0-.645 .312-1.178 .319-.534 .853-.846 .534-.319 1.178-.319zm-1.406,2.344v9.388q0,.579 .41,.99 .417,.417 .996,.417H104.694q.586,0 .996-.417 .41-.41 .41-.99v-9.388q0-.579-.41-.99-.41-.417-.996-.417h-9.388q-.579,0-.996,.417-.41,.41-.41,.99z"/></svg>`,
}
// GSEN in MyNode.svg's Sci-Fi font, outlined (158.29 x 29.46): the Settings header's logo, the boxes' watermark, the
// middle's background tiles
const GSEN = "m34.766,19.738q0,1.835 -0.566,3.455 -0.566,1.600 -1.620,2.811 -1.034,1.190 -2.518,1.893 -1.464,0.683 -3.162,0.683h-18.078q-1.581,0 -3.689,-1.112 -2.108,-1.112 -3.631,-2.947 -1.503,-1.835 -1.503,-3.846v-12.611q0,-1.542 1.190,-3.299 1.190,-1.776 3.104,-2.967 1.932,-1.210 3.943,-1.210h25.653v6.559h-21.065q-1.190,0 -2.245,0.585 -1.054,0.566 -1.698,1.464 -0.644,0.898 -0.644,1.835v6.188q0,1.444 0.644,2.537 0.644,1.073 1.757,1.659 1.112,0.566 2.518,0.566h10.737q1.112,0 1.893,-0.566 0.800,-0.585 0.800,-1.581 0,-0.995 -0.663,-1.503 -0.663,-0.507 -1.425,-0.507h-7.906v-6.559h9.995q0.136,0.019 1.542,0.312 1.405,0.292 2.909,1.151 1.522,0.839 2.616,2.577 1.112,1.718 1.112,4.431zm39.514,4.529q0,1.757 -1.034,3.045 -1.015,1.269 -2.869,1.269h-32.388v-6.872h25.985q0.683,0 1.444,-0.488 0.761,-0.507 0.761,-1.522 0,-0.546 -0.331,-1.034 -0.312,-0.488 -0.956,-0.780 -0.644,-0.292 -1.405,-0.292h-19.659q-1.405,0 -2.518,-0.702 -1.093,-0.722 -1.698,-1.659 -0.585,-0.956 -0.585,-1.561v-9.078q0,-1.171 1.288,-2.577 1.308,-1.425 3.358,-1.425h29.089v6.637h-24.013q-0.741,0 -1.190,0.624 -0.449,0.624 -0.449,1.308 0,0.624 0.605,1.327 0.624,0.702 1.757,0.702h19.698q2.616,0 3.865,1.347 1.249,1.347 1.249,3.533zm41.506,-10.913q0,1.874 -0.995,3.162 -0.995,1.268 -3.318,1.268l-25.555,-0.039v1.366q0,1.054 0.800,1.971 0.82,0.898 1.757,0.898h26.883v6.598h-28.386q-2.830,0 -4.900,-1.483 -2.069,-1.503 -3.143,-3.494 -1.073,-1.991 -1.073,-3.260v-12.143q0,-1.405 0.761,-2.772 0.781,-1.386 2.05,-2.498 1.269,-1.112 2.655,-1.737 1.405,-0.644 2.596,-0.644h23.193q0.995,0 2.225,0.624 1.229,0.605 2.225,1.522 0.995,0.917 1.600,1.952 0.624,1.034 0.624,1.952zm-7.867,-4.119q0,-0.878 -0.741,-1.425 -0.741,-0.546 -1.659,-0.546l-16.789,-0.039q-1.073,0 -1.952,0.937 -0.859,0.937 -0.859,2.030v1.151h21.963zm50.369,13.236q0,1.210 -0.761,2.869 -0.741,1.639 -2.440,2.889 -1.679,1.229 -4.275,1.229 -2.674,0 -3.963,-0.741 -1.288,-0.722 -2.752,-2.694l-13.588,-16.399q-0.644,-0.859 -1.034,-1.093 -0.371,-0.253 -0.937,-0.253 -0.371,0 -0.761,0.292 -0.390,0.273 -0.390,0.780v19.191h-7.926v-22.275q0,-0.585 0.370,-1.581 0.390,-1.015 1.269,-2.088 0.878,-1.093 2.323,-1.835 1.464,-0.761 3.514,-0.761 2.596,0 4.060,0.878 1.483,0.859 2.381,1.874l13.685,16.106q0.644,0.878 1.093,1.132 0.449,0.234 1.054,0.234 0.702,0 0.859,-0.409 0.175,-0.429 0.175,-1.190v-18.039h8.043z"
const svgUrl = (attrs, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`)}")`
// face.css takes them as --mn-mark (the boxes' watermark, white at 3%) and --mn-tile: MyNode.svg's texture, black GSENs
// at 10% turned 45°, on a 320 px square that tiles itself (a word every 80 px along its line, the lines 0.8% closer than
// the mockup's so that 320 repeats exactly), so the texture can run (face.css: mn-drift)
const MARK = svgUrl('viewBox="0 0 158.293 29.4603" preserveAspectRatio="none"', `<path d="${GSEN}" fill="#fff" fill-opacity=".03"/>`)
const TILE = svgUrl('width="320" height="320"', `<defs><pattern id="g" width="190.031" height="76.0124" patternUnits="userSpaceOnUse"
  patternTransform="rotate(45) scale(.595362)"><path d="${GSEN}"/></pattern></defs><rect width="320" height="320" fill="url(#g)" opacity=".1"/>`)
// a box's faint word in its top left, as MyNode.svg has it: Arial 20, white at 5%; face.css takes it as --mn-cap.
// MyNode.svg draws RU's 1.3 px left of PROMT's
const capUrl = (word, x) => svgUrl('width="120" height="40"',
  `<text x="${x}" y="23.83" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#fff" fill-opacity=".05">${word}</text>`)
const CAPS = { PROMT: capUrl("PROMT", 8.81), RU: capUrl("RU", 7.54), EN: capUrl("EN", 7.54) }

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
const KIND = { unet_name: "#b06cff", lora_name: "#35d07f", clip_name: "#ffd23f", vae_name: "#ff4d4d", llm_name: "#ffd23f",
  qw_unet_name: "#b06cff", qw_lora_name: "#35d07f", qw_clip_name: "#ffd23f", qw_vae_name: "#ff4d4d", h3_unet_name: "#b06cff",
  h3_lora_name: "#35d07f", h3_clip_name: "#ffd23f", h3_vae_video: "#ff4d4d", h3_vae_audio: "#ff4d4d", seedvr2_name: "#b06cff",
  seedvr2_vae: "#ff4d4d" }
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

// a value wider than its place between a pill's arrows takes a smaller font, down to 10 px (a random seed has up to 16
// digits, a scheduler sgm_uniform 11 letters: whole there), and past that ends in "…" (face.css): nothing leaves its pill
function fitVal(e) {
  e.style.fontSize = ""
  if (e.scrollWidth <= e.clientWidth) return // a value that fits has scrollWidth = clientWidth, not its own width
  const room = e.clientWidth - 7, need = e.scrollWidth - 6 // 6: the value's padding at its sides; 1 to spare for rounding
  e.style.fontSize = `${Math.max(10, (18 * room) / need)}px`
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
  const fits = [] // the pills' values: fitted after all binds (a preset shows its pill, hides W and H) and once laid out
  const set = (n, v) => {
    const w = W(n)
    if (!w || v === undefined) return
    w.value = v
    w.callback?.(v)
    node.setDirtyCanvas(true, true)
    refresh()
  }
  const off = new AbortController()
  const root = el("div", "mn"), fs = el("div", "mn-fs") // fs: the node's DOM widget, the face in it
  const family = () => (W("family")?.value in TITLES ? W("family").value : "Krea 2")
  const qw = () => family() === "QW 21"
  const h3 = () => family() === "H3"
  const textKey = () => (h3() ? "h3_text" : "text") // the prompt box: CH SHEET's is the person's description
  const wide = () => !qw() && W("mode")?.value === "2 IMG"
  const width = () => SIZE[0] + (wide() ? TWO : 0)

  const head = el("div", "mn-head"), title = el("div", "mn-title"), hr = el("div", "mn-hr") // hr: what 2 IMG moves right
  const time = txt("div", "mn-time", "00:00"), track = el("div", "mn-track"), fill = el("div", "mn-fill")
  const pct = txt("div", "mn-pct", "0%"), openB = el("div", "mn-open", ICON.open), dims = el("div", "mn-dims")
  const run = txt("div", "mn-run", "Run"), fullB = el("div", "mn-full", ICON.full)
  openB.title = "Settings"
  run.title = "Run this node"
  fullB.title = "Full screen (Esc: back)"
  openB.dataset.click = run.dataset.click = fullB.dataset.click = ""
  // ⛶: the face on the whole screen, scaled to fit (face.css); pick lists and toasts open in it (shared/ui.js)
  fullB.onclick = () => { document.fullscreenElement === fs ? document.exitFullscreen() : fs.requestFullscreen() }
  const fitScreen = () => fs.style.setProperty("--k", Math.min(innerWidth / width(), innerHeight / SIZE[1]))
  addEventListener("resize", fitScreen, { signal: off.signal }) // entering full screen resizes the window too
  fitScreen()
  run.onclick = () => {
    app.canvas.selectNode(node) // the command queues the selected output nodes, so: only this one
    app.extensionManager.command.execute("Comfy.QueueSelectedOutputNodes")
  }
  track.append(fill)
  hr.append(el("div", "mn-pill t"), el("div", "mn-pill p"), el("div", "mn-clock", ICON.clock), time, track, pct, run, openB, fullB, dims)
  head.append(title, hr)
  // the mode: the tabs over the middle, a strip per family; 2 IMG widens the node by a second picture's column. QW 21 is
  // purple, H3 blue (face.css .qw, .h3)
  const modeTabs = Object.fromEntries(Object.entries(MODE_TABS).map(([f, tabs]) =>
    [f, tabStrip("mn-modes", tabs, (m) => set("mode", m), (m) => m in TITLES[f])]))
  binds.push(() => {
    const m = W("mode")?.value ?? "EDIT"
    root.classList.toggle("two", wide())
    root.classList.toggle("qw", qw())
    root.classList.toggle("h3", h3()) // blue; CH SHEET's middle is Krea 2's without its picture and size pills
    root.style.setProperty("--two", wide() ? `${TWO}px` : "0px")
    fs.style.setProperty("--w", `${width()}px`)
    title.textContent = TITLES[family()][m] ?? Object.values(TITLES[family()])[0]
    for (const [f, t] of Object.entries(modeTabs)) {
      t.box.hidden = f !== family()
      t.light(m)
    }
    if (Math.abs(node.size[0] - width()) + Math.abs(node.size[1] - SIZE[1]) > 0.01) node.setSize([width(), SIZE[1]]) // a float array
    fitScreen()
  })

  // a picture's column: its picker, Upload and preview (Krea2.svg); 2 IMG's second one takes image_2 from the same folder
  const column = (name, onSrc) => {
    const box = el("div", "mn-left"), pick = el("div", "mn-pick"), pName = el("div", "mn-pname"), pIdx = el("div", "mn-pidx")
    pick.append(pName, pIdx, el("div", "mn-pbtn"))
    const put = (f) => {
      const list = W("image").options.values
      if (Array.isArray(list) && !list.includes(f)) list.push(f), list.sort()
      set(name, f)
    }
    const up = el("div", "mn-upload", ICON.upload + "Upload"), file = picker(put)
    dropTo(box, put)
    const prev = el("div", "mn-prev"), pDims = el("div", "mn-pdims"), pBox = el("div", "mn-pbox"), pWrap = el("div", "mn-pwrap")
    const img = el("img"), crop = el("div", "mn-crop"), la = el("div", "mn-arrow l"), ra = el("div", "mn-arrow r")
    const empty = el("img", "mn-empty") // no picture: the "?" of Krea2.svg, or QW21.svg's
    img.draggable = empty.draggable = false
    pWrap.append(img, crop)
    pBox.append(pWrap)
    prev.append(pDims, empty, pBox, la, ra)
    box.append(pick, up, file, prev)
    img.onload = () => {
      pDims.textContent = `${img.naturalWidth}×${img.naturalHeight}`
      refresh() // the crop's editor and its Format pill: the first refresh came before the picture
    }
    img.onerror = () => { img.removeAttribute("src") } // a file gone from input: the "?"
    const step = (d) => {
      const list = comboValues(W("image"))
      if (list.length) set(name, list[(list.indexOf(W(name)?.value) + d + list.length) % list.length])
    }
    la.onclick = () => step(-1)
    ra.onclick = () => step(1)
    up.onclick = () => file.click()
    pick.onclick = () => { openGal(name, box) }
    binds.push(() => {
      const v = W(name)?.value ?? "", list = comboValues(W("image"))
      if (empty.src !== EMPTY[family()]) empty.src = EMPTY[family()]
      pName.textContent = baseOf(v)
      pIdx.textContent = v ? `${list.indexOf(v) + 1}/${list.length}` : ""
      const src = v ? view(baseOf(v), dirOf(v), "input") : ""
      if (img.dataset.src === src) return
      img.dataset.src = src
      pDims.textContent = ""
      if (src) img.src = src
      else img.removeAttribute("src")
      onSrc?.(src)
    })
    return { box, prev, pBox, pWrap, pDims, img, crop }
  }
  const c1 = column("image", (src) => { if (!shots.length) setA(src) }), c2 = column("image_2") // A: the input, until a result
  const { box: left, prev, pBox, pWrap, pDims, img: pImg } = c1
  c2.box.classList.add("b")
  binds.push(() => { c2.box.hidden = !wide() })

  // Crop on: the preview becomes its editor (crop.js). A crop belongs to its picture: another one starts whole
  const readCrop = () => {
    try {
      const c = JSON.parse(W("crop")?.value || "null")
      return c?.image === W("image")?.value ? c : null
    } catch {
      return null
    }
  }
  const ed = cropEditor(pImg, readCrop, (c) => set("crop", JSON.stringify({ image: W("image")?.value, ...c })), off.signal)
  const cropReset = txt("div", "mn-lbl mn-txt mn-cropreset", "RESET")
  cropReset.onclick = () => set("crop", "")
  // its Format: one pill like the middle's, the list on a click (all of them in a row under the picture were too much)
  const fmt = el("div", "mn-row c mn-fmt"), fv = el("div", "v"), fl = el("div", "mn-tri l"), fval = el("div", "mn-val")
  const fr = el("div", "mn-tri r"), nameOf = (key) => PRESETS.find(([k]) => k === key)?.[1] ?? "Free"
  const stepFmt = (d) => {
    const i = PRESETS.findIndex(([k]) => k === ed.preset())
    ed.choose(PRESETS[(i + d + PRESETS.length) % PRESETS.length][0])
  }
  fmt.dataset.w = "crop_format"
  fv.append(fl, fval, fr)
  fmt.append(txt("div", "k", "Format"), fv)
  fl.onclick = () => { stepFmt(-1) }
  fr.onclick = () => { stepFmt(1) }
  fval.onclick = (e) => {
    menu(e, PRESETS.map(([, n]) => n), (n) => ed.choose(PRESETS.find(([, x]) => x === n)[0]), { title: "Format", current: nameOf(ed.preset()) })
  }
  fits.push(fval)
  // its Mask and the Mask's preview, where MyNode.svg has them: with ⛶ Face, ref_boost acts on the face oval only
  const maskB = txt("div", "mn-cmask", "Mask"), mini = el("div", "mn-cmini"), miniCv = el("canvas")
  maskB.title = "ref_boost on the face oval only, the rest at x1: Format ⛶ Face 1:1 or ⛶ Face 2:3; with Mask set Ref boost 5-6"
  maskB.onclick = () => { set("crop_mask", !W("crop_mask")?.value) }
  mini.append(miniCv)
  pBox.append(ed.canvas)
  prev.append(ed.label, cropReset, fmt, maskB, mini)
  binds.push(() => {
    const on = !!W("manual_crop")?.value && family() === "Krea 2" // QW 21 and H3 take the picture whole
    pWrap.hidden = pDims.hidden = on // the crop's own line takes the input's size's place
    ed.canvas.hidden = ed.label.hidden = cropReset.hidden = fmt.hidden = maskB.hidden = mini.hidden = !on
    if (on) ed.draw()
    fval.textContent = nameOf(ed.preset())
    maskB.classList.toggle("on", !!W("crop_mask")?.value)
    miniCv.hidden = !(on && W("crop_mask")?.value && String(ed.preset()).startsWith("face")) // a mask needs a face
    if (!miniCv.hidden) ed.mini(miniCv, true)
  })

  // output aspect: the image itself (as cropped, with its gray padding: sizes.py takes it so), a preset "… - WxH",
  // or custom W/H
  const targetAspect = () => {
    if (h3()) return SHEET
    const c = !W("resolution_source")?.value && W("manual_crop")?.value && readCrop(), [l, t, r, b] = c?.pad ?? [0, 0, 0, 0]
    if (c?.box) return (c.box[2] + l + r) / (c.box[3] + t + b)
    if (!W("resolution_source")?.value) return pImg.naturalWidth ? pImg.naturalWidth / pImg.naturalHeight : 0
    const f = String(W("aspect_ratio")?.value ?? "custom"), m = f.match(/(\d+)\s*x\s*(\d+)\s*$/)
    return f !== "custom" && m ? m[1] / m[2] : W("custom_width").value / W("custom_height").value
  }
  // lime frame = the part of each input the output keeps, the rest dimmed. Krea2 trims a reference only when the
  // shapes are within 8% (krea2_edit CROP_TOL); a farther one goes in whole, fitted inside, and there is no frame
  const updateCrop = () => {
    for (const { img, crop } of [c1, c2]) {
      const ai = img.naturalWidth / img.naturalHeight, at = targetAspect()
      crop.hidden = h3() || !(ai && at) || Math.min(ai, at) / Math.max(ai, at) < 0.92
      if (crop.hidden) continue
      const w = at >= ai ? 100 : (100 * at) / ai, h = at >= ai ? (100 * ai) / at : 100
      Object.assign(crop.style, { width: w + "%", height: h + "%", left: (100 - w) / 2 + "%", top: (100 - h) / 2 + "%" })
    }
  }

  // a number widget's ◀ value ▶ (numberField); W and H reshape both frames while being typed
  const numberOf = (name) => {
    const w = W(name), { min, max, precision, step2 } = w.options
    const step = name === "ref_boost" ? 0.25 : step2 // its 0.01 is for typing: 1 to 4 by arrows was 300 clicks
    const typed = (x) => {
      w.value = x
      updateCrop()
      refreshFrame()
    }
    const f = numberField(() => w.value, (x) => set(name, x), typed, { min, max, precision, step })
    binds.push(() => { if (document.activeElement !== f.inp) f.show() })
    fits.push(f.inp)
    return f
  }

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
      r.onclick = (e) => { menu(e, comboValues(w), (x) => set(name, x), { title: label, current: w.value }) }
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
      val.onclick = (e) => { menu(e, comboValues(w), (x) => set(name, x), { title: label, current: w.value }) }
      binds.push(() => { val.textContent = val.title = w.value ?? "" })
      fits.push(val)
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
    } else v.append(...numberOf(name).nodes)
    r.append(v)
    return r
  }

  const mid = el("div", "mn-mid")
  const prompt = el("textarea", "mn-box"), ru = el("div", "mn-box ru")
  prompt.dataset.scroll = ru.dataset.scroll = ""
  prompt.spellcheck = false
  Object.assign(prompt.style, { left: "15.01px", top: "25.11px" })
  Object.assign(ru.style, { left: "15.01px", top: "237.42px" })
  prompt.oninput = () => {
    W(textKey()).value = prompt.value
    W(textKey()).callback?.(prompt.value)
  }
  // PROMT and RU are the boxes' background, faint under their text like MyNode.svg draws them; a loaded .txt says its
  // name and count in small lime over the prompt box
  const lp = el("div", "mn-lbl on")
  Object.assign(lp.style, { left: "16.61px", top: "11.81px" })
  prompt.style.setProperty("--mn-cap", CAPS.PROMT)
  // EN / RU: a switch over each prompt view (the RU box, a gallery card, the LLM tab), one choice for all of them, kept
  // with the workflow; RU first, as MyNode.svg lights it. A view without its RU shows the EN
  let shot = { RU: "", EN: "" }, card = null, llmText = { EN: "", RU: "" }
  const lang = () => node.properties?.mn_lang ?? "RU"
  const switches = []
  const enru = (cls) => {
    const b = txt("div", `mn-enru ${cls}`, "EN  RU")
    b.title = "EN / RU"
    b.onclick = (e) => {
      node.setProperty("mn_lang", e.offsetX < b.offsetWidth / 2 ? "EN" : "RU")
      paintLang()
    }
    switches.push(b)
    return b
  }
  const paintLang = () => {
    const l = lang()
    for (const b of switches) b.classList.toggle("en", l === "EN")
    ru.style.setProperty("--mn-cap", CAPS[l])
    ru.textContent = shot[l]
    if (card) said.textContent = card[l.toLowerCase()] || card.en || ""
    if (!lOut.classList.contains("busy")) lOut.textContent = llmText[l] || llmText.EN
  }
  binds.push(paintLang)
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
    prompt.readOnly = on && !h3() // a loaded .txt is Krea 2's
    prompt.placeholder = h3() ? "Who is in the picture (H3's <Subject 1>), or the LLM pill writes it" : ""
  })
  // custom / preset: aspect_ratio "custom" is W x H, one pill with the numbers typed (MyNode.svg has no arrows there);
  // a preset shows its name in that pill's place
  const presets = () => comboValues(W("aspect_ratio")).filter((p) => p !== "custom")
  let preset = null // the one custom goes back to
  const mode = row(["", "", 540.19, 49.91, 147.53], "mn-row tog mn-mode")
  const wh = el("div", "mn-row mn-wh") // not .c: its numbers sit on their own spots, not centred between arrows
  Object.assign(wh.style, { top: "540.18px", left: "152.53px", width: "199.88px" })
  wh.append(numberOf("custom_width").inp, txt("span", "x", "X"), numberOf("custom_height").inp)
  mode.firstChild.append(txt("span", "cu", "custom /"), " ", txt("span", "pr", "preset"))
  mode.onclick = () => {
    const v = W("aspect_ratio")?.value
    if (v !== "custom") preset = v
    set("aspect_ratio", v !== "custom" ? "custom" : presets().includes(preset) ? preset : presets()[0])
  }
  binds.push(() => { mid.classList.toggle("preset", W("aspect_ratio")?.value !== "custom") })
  // the seeds kept with + (LIST), saved with the workflow
  const seeds = () => (Array.isArray(node.properties?.mn_seeds) ? node.properties.mn_seeds : [])
  const seedModes = SEED_MODES.map(([label, value, left, width]) => {
    const b = txt("div", "mn-seedm", label)
    Object.assign(b.style, { left: left + "px", width: width + "px" })
    if (value) {
      b.onclick = () => { set("control_after_generate", value) }
      binds.push(() => { b.classList.toggle("on", W("control_after_generate")?.value === value) })
    } else {
      b.title = "Seeds kept with +"
      b.onclick = (e) => {
        if (!seeds().length) return toast("LIST is empty: + keeps the seed in the box.")
        menu(e, seeds().map(String), (s) => {
          set("control_after_generate", "fixed")
          set("seed", Number(s))
        }, { title: "LIST", current: W("seed")?.value })
      }
    }
    return b
  })
  // + beside seed (MyNode.svg): the seed in the box goes into LIST
  const keep = el("div", "mn-seedadd", ICON.keep)
  keep.title = "Keep this seed in LIST"
  keep.onclick = () => {
    const s = Number(W("seed")?.value)
    if (!Number.isFinite(s)) return
    node.setProperty("mn_seeds", [s, ...seeds().filter((x) => x !== s)].slice(0, SEED_KEEP))
    toast(`Seed ${s} is in LIST.`)
  }
  mid.append(lp, lt, txtIn, prompt, enru("m"), ru, snd, ...ROWS.map((s) => row(s, "mn-row")), wh, mode, ...seedModes, keep)

  // QW 21's middle (QW21.svg): UpScale's and BG's own pills in place of Krea 2's prompt boxes
  const qwPanels = Object.fromEntries(Object.entries(QW_ROWS).map(([m, rows]) => {
    const p = el("div", "mn-qw")
    p.append(...rows.map((s) => row(s, "mn-row")))
    return [m, p]
  }))
  // UpScale's Grain / preset: grain alone, or with a phone camera's look (parts.Look); the word in use is lit
  const grainPick = row(["", "", 180.42, 424.42, 138.91], "mn-row tog mn-gp")
  grainPick.firstChild.append(txt("span", "gr", "Grain /"), " ", txt("span", "pr", "preset"))
  grainPick.onclick = () => { set("grain_preset", !W("grain_preset")?.value) }
  binds.push(() => { grainPick.classList.toggle("on", !!W("grain_preset")?.value) })
  // BG's presets (assets/qw21_bg.json) and its own 🔊, the middle's switch
  const bgSnd = el("div", "mn-snd mn-bgsnd")
  bgSnd.title = "Sound when a Run is done: on / off"
  qwPanels.UpScale.append(grainPick)
  qwPanels.BG.append(txt("div", "mn-qwlbl", "Presets"), bgSnd, ...BG_PRESETS.map(([name, top, left, width]) => {
    const b = txt("div", "mn-seedm mn-bgp", name)
    Object.assign(b.style, { top: top + "px", left: left + "px", width: width + "px" })
    b.onclick = () => { set("bg_preset", name) }
    binds.push(() => { b.classList.toggle("on", W("bg_preset")?.value === name) })
    return b
  }))
  binds.push(() => {
    mid.hidden = qw()
    for (const [m, p] of Object.entries(qwPanels)) p.hidden = !(qw() && W("mode")?.value === m)
  })

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
  // the frame has the next result's shape, a shown result fitted in it; one that has it (sizes round to 8: within 2%)
  // fills it exactly
  const refreshFrame = () => {
    const t = targetAspect(), r = rImg.naturalWidth / rImg.naturalHeight || 0
    const ar = r && (!t || Math.abs(r / t - 1) < 0.02) ? r : t
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
  const upB = txt("div", "mn-up", "Update"), ver = el("div", "mn-ver"), lRun = txt("div", "mn-run mn-lrun", "Run")
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
    logo.hidden = upB.hidden = ver.hidden = t !== "Settings" // MyNode.svg has them on the Settings board only; on LLM, Run
    det.hidden = true
    if (t === "Gallery") loadGallery()
    if (t === "Settings") fetchModels() // fresh each time: files put into the model folders by hand count too
    // the tab's scroll area takes the focus, so the wheel scrolls it in Nodes 2.0 too
    if (setP.classList.contains("open")) (panes[t].querySelector("[data-scroll]") ?? panes[t]).focus({ preventScroll: true })
  }
  const logo = el("div", "mn-logo", `<svg viewBox="0 0 158.293 29.4603" preserveAspectRatio="none" fill="currentColor"><path d="${GSEN}"/></svg>`)
  shead.append(...tabs, logo, lRun, upB, ver)
  // Settings → Settings (SettingIU.svg): a family's tab in the strip shows its models' page and makes the node that
  // family, in a mode it has; the same tab again: the general page
  let page = ""
  const pages = Object.fromEntries(["", ...Object.keys(FAMILY_ROWS)].map((f) => [f, el("div", f ? "mn-page" : "mn-page g")]))
  const fams = tabStrip("mn-fams", FAMILY_TABS, (f) => {
    page = page === f ? "" : f
    if (page && f in TITLES && f !== family()) {
      if (!(W("mode")?.value in TITLES[f])) set("mode", Object.keys(TITLES[f])[0])
      set("family", f)
    }
    showPage()
  })
  const showPage = () => {
    for (const [f, p] of Object.entries(pages)) p.hidden = f !== page
    fams.light(page)
  }
  showPage()
  const sRow = Object.fromEntries(GENERAL.map((s) => [s[1], row(s, "mn-srow")]))
  pages[""].append(...Object.values(sRow))
  for (const [f, rows] of Object.entries(FAMILY_ROWS)) {
    pages[f].append(...rows.map(([label, name], i) => (sRow[name] = row([label, name, ROW_TOPS[i] + (PAGE_SHIFT[f] ?? 0)], "mn-srow"))))
  }

  // zip, in Save's pill: what this node saved and what the LLM tab wrote, the two SAVE folders as one download (common.py)
  const zipB = txt("div", "mn-zip", "zip")
  zipB.title = "SAVE and the LLM tab's SAVE as one .zip"
  zipB.onclick = async () => {
    const q = `save=${encodeURIComponent(W("save_to")?.value ?? "")}&llm=${encodeURIComponent(W("llm_save_to")?.value ?? "")}`
    const r = await api.fetchApi(`/mynode/zip?${q}&check=1`).then((x) => x.json()).catch(() => null)
    if (!r) return toast("No answer from ComfyUI.", "error")
    if (!r.files) return toast("Nothing saved yet in SAVE or the LLM tab's SAVE.", "warn")
    toast(`Packing ${r.files} files, the pictures as JPEG: the download starts once they are in.`)
    const a = el("a")
    a.href = api.apiURL(`/mynode/zip?${q}`)
    a.download = ""
    a.click()
  }
  sRow.save_to.append(zipB)

  // Update: this pack against the newest on GitHub (update.py); a click checks again and gets the newer one. Beside it
  // MyNode.svg's "v 0.0.0": the installed version, or the newer one a click brings
  const paintUp = (s) => {
    upB.textContent = "Update"
    upB.title = ver.title = updateText(s)
    ver.textContent = s?.available ? `→ ${s.latest}` : s?.version ? `v ${s.version}` : ""
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

  // each page's files: ✅ in this ComfyUI's model folders; a missing one's square is ⬇️, which downloads it (models.py),
  // or empty where GSEN has no source for it yet
  const mRows = Object.entries(STATUS).flatMap(([f, list]) => list.map(([label, key], i) => {
    const r = el("div", "mn-mrow"), name = el("div", "n"), mark = el("div", "i")
    r.style.top = (f ? STATUS_TOPS : GENERAL_STATUS)[i] + "px"
    mark.onclick = () => { if (r.matches(".missing.get:not(.busy)")) download(node, key) }
    r.append(txt("div", "k", label), name, mark)
    pages[f].append(r)
    return { key, r, name, mark }
  }))
  const paintModels = () => {
    for (const { key, r, name, mark } of mRows) {
      const m = key ? models.find((x) => x.key === key) : { file: "-", name: "-" } // H3's LoRA: none to have
      r.hidden = !m // until Settings has asked the server
      if (!m) continue
      const busy = m.got != null, p = busy ? Math.floor((100 * m.got) / m.size) : 0
      r.classList.toggle("missing", !m.name)
      r.classList.toggle("get", !!m.get)
      r.classList.toggle("busy", busy)
      r.style.setProperty("--p", p + "%")
      name.textContent = plain(baseName(m.name ?? m.file)).replace(/\.[^.]+$/, "")
      r.title = m.name ?? (busy ? `${p}% of ${gb(m.size)}` : m.get ? `Not in this ComfyUI's models. ⬇️ downloads it: ${gb(m.size)}`
        : "Not in this ComfyUI's models: put it in its folder by hand")
      mark.title = m.name || busy || !m.get ? "" : "Download"
      if (busy) mark.textContent = p + "%"
      else mark.innerHTML = m.name ? ICON.ok : m.get ? ICON.down : ""
    }
  }
  modelEvents.addEventListener("paint", paintModels, { signal: off.signal })
  paintModels()

  // more LoRAs: rows right under a family's LoRa row; a hidden widget keeps them as [[file, strength], ...]
  const loraList = (fam, base, key) => {
    const GAP = 44, rows = FAMILY_ROWS[fam], top = PAGE_SHIFT[fam] ?? 0
    const LORA_TOP = ROW_TOPS[1] + top, END = ROW_TOPS[rows.length - 1] + top + GAP
    const loraFiles = () => comboValues(W(base)).filter((f) => f !== "-") // H3's "-": none, not a file
    const loras = () => { try { return JSON.parse(W(key)?.value || "[]") } catch { return [] } }
    const putLoras = (list) => { set(key, JSON.stringify(list)) }
    const extra = el("div"), sEnd = el("div", "mn-send"), add = el("div", "mn-x add", ICON.plus)
    add.title = "Add LoRA"
    add.onclick = (e) => {
      e.stopPropagation() // the row under it opens the LoRa row's own menu
      menu(e, loraFiles(), (f) => putLoras([...loras(), [f, 1]]), { title: "LoRa" })
    }
    sRow[base]?.append(add)
    let shown = null // the value the rows were drawn from
    const loraRow = (list, i) => {
      const r = el("div", "mn-srow mn-lora"), v = el("div", "v"), x = el("div", "mn-x", ICON.cross), sv = el("div", "sv")
      r.style.top = LORA_TOP + GAP * (i + 1) + "px"
      modelValue(sv, KIND.lora_name, () => list[i][0], loraFiles)()
      sv.onclick = (e) => {
        menu(e, loraFiles(), (f) => { list[i][0] = f; putLoras(list) }, { title: `LoRa ${i + 2}`, current: list[i][0] })
      }
      x.title = "Remove LoRA"
      x.onclick = () => { list.splice(i, 1); putLoras(list) }
      const f = numberField(() => list[i][1], (s) => { list[i][1] = s; putLoras(list) },
        (s) => { list[i][1] = s; W(key).value = shown = JSON.stringify(list) }, { min: -100, max: 100, precision: 2, step: 0.05 })
      v.append(...f.nodes)
      r.append(txt("div", "k", `LoRa ${i + 2}`), v, x, sv)
      return r
    }
    binds.push(() => {
      const value = W(key)?.value ?? "[]"
      if (value === shown) return
      shown = value
      const list = loras(), shift = GAP * list.length
      extra.replaceChildren(...list.map((_, i) => loraRow(list, i)))
      rows.slice(2).forEach(([, name], i) => { sRow[name].style.top = ROW_TOPS[i + 2] + top + shift + "px" })
      sEnd.style.top = END + shift + "px"
    })
    pages[fam].append(extra, sEnd)
  }
  loraList("Krea 2", "lora_name", "loras")
  loraList("H3", "h3_lora_name", "h3_loras")
  panes.Settings.append(...Object.values(pages), fams.box) // the strip over the pages: they span the whole pane

  // Sound: 🔊 / 🔇 on the middle and in Settings switch it, its field picks the file; both save with the workflow
  const sIcon = el("div", "mn-snd"), sName = el("div", "sv")
  sRow.sound.classList.add("mn-sound")
  sRow.sound.append(sIcon, sName)
  const muted = () => !!node.properties?.mn_mute
  const soundName = () => (sounds.includes(node.properties?.mn_sound) ? node.properties.mn_sound : sounds[0] ?? "")
  let shownMute = null
  const paintSound = () => {
    if (muted() !== shownMute) snd.innerHTML = sIcon.innerHTML = bgSnd.innerHTML = (shownMute = muted()) ? ICON.off : ICON.on
    sName.textContent = sName.title = soundName()
  }
  snd.onclick = sRow.sound.onclick = bgSnd.onclick = async (e) => {
    if (!e.target.closest(".sv")) {
      node.setProperty("mn_mute", !muted())
      return paintSound()
    }
    menu(e, await fetchSounds(), (f) => {
      node.setProperty("mn_sound", f)
      paintSound()
      play(f) // a name says little: picking one plays it
    }, { title: "Sound", current: soundName() })
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
  // Filter Images...: the open sub-tab's cards whose ID number has what is typed (by ID only)
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
  det.append(big, par, enru("g"), said)
  det.onclick = (e) => { if (e.target === det) det.hidden = true } // the dark around the card: back to the cards
  bImg.onload = () => { bSize.textContent = `${bImg.naturalWidth}x${bImg.naturalHeight}` }
  let opened = null
  const openResult = async (r) => {
    opened = r
    card = null
    det.hidden = false
    bSize.textContent = said.textContent = ""
    bImg.src = r.src
    bId.textContent = r.id ? `ID_${r.id}` : "—"
    par.replaceChildren()
    const info = await r.info()
    if (opened !== r) return // another card was opened meanwhile
    par.replaceChildren(...[["seed", info.seed], ["step", info.steps], ["sampler", info.sampler], ["scheduler", info.scheduler]]
      .flatMap(([k, v]) => {
        const s = txt("span", "v", String(v ?? "—"))
        s.title = s.textContent // a long sampler's name ends in …
        return [txt("span", "k", k), s]
      }))
    card = info
    paintLang()
  }

  // LLM: the AI step alone (MyNode_LLM): a picture, the same LLM as Settings, its own System (picture → prompt, from
  // assets/prompts/img_to_text) and SAVE; Run queues just that, and the prompt the LLM writes comes back here (setup(): LLM_RUNS)
  const lBox = el("div", "mn-lbox"), lImg = el("img"), lUp = el("div", "mn-upload mn-lup", ICON.upload + "Upload")
  const putLlm = (name) => {
    node.setProperty("mn_llm_image", name) // saves with the workflow; the node's own image is untouched
    refresh()
  }
  const lOut = el("div", "mn-lout"), lFile = picker(putLlm)
  const llmImage = () => node.properties?.mn_llm_image || W("image")?.value || "" // none uploaded: the node's input
  lImg.draggable = false
  lOut.dataset.scroll = ""
  lBox.append(lImg, ...corners())
  lUp.onclick = () => lFile.click()
  dropTo(lBox, putLlm)
  dropTo(lUp, putLlm)
  panes.LLM.append(lBox, lUp, lFile, enru("l"), lOut, ...[["LLM", "llm_name", 611.5], ["System", "llm_system_file", 655.1], ["SAVE", "llm_save_to", 698.6]]
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

  setP.append(texture("mn-stex"), shead, ...Object.values(panes), det)
  showTab(tab)
  openB.onclick = () => { if (setP.classList.toggle("open")) showTab(tab) } // ↗ sits right of the panel: it also closes it

  const gal = el("div", "mn-gal"), gfil = el("div", "mn-gfil", ICON.search), gIn = el("input")
  const gDirs = el("div", "mn-gdirs"), gHead = el("div", "mn-ghead"), gList = el("div", "mn-glist")
  gDirs.dataset.scroll = gList.dataset.scroll = ""
  gIn.placeholder = "Filter Images..."
  gIn.spellcheck = false
  gfil.append(gIn)
  gal.append(gfil, gDirs, gHead, gList)
  let dir = "All", mtimes = {}, galFor = "image" // the column that opened it: image or 2 IMG's image_2
  const renderGal = () => {
    const all = comboValues(W("image")), cur = W(galFor)?.value, q = gIn.value.trim().toLowerCase()
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
      it.onclick = () => { set(galFor, p); gal.classList.remove("open") }
      return it
    }))
  }
  gIn.oninput = renderGal
  const openGal = async (name, col) => {
    galFor = name
    gal.style.left = `${Math.max(0, col.offsetLeft)}px` // over that column
    gal.classList.add("open")
    try { // fresh list: files added to input/ since the page loaded show up too
      const r = await api.fetchApi("/mynode/images")
      const list = W("image").options.values
      if (r.ok) mtimes = await r.json()
      if (r.ok && Array.isArray(list)) list.splice(0, list.length, ...Object.keys(mtimes))
    } catch {}
    renderGal()
    const on = gList.querySelector(".on") // centred by the list alone: scrollIntoView also scrolled the face up inside the node
    if (on) gList.scrollTop = on.offsetTop - (gList.clientHeight - on.offsetHeight) / 2
    gIn.focus({ preventScroll: true })
  }

  root.append(texture("mn-back"), head, left, c2.box, el("div", "mn-fog"), mid, ...Object.values(qwPanels),
    ...Object.values(modeTabs).map((t) => t.box), right, setP, gal) // texture on the backgrounds

  canvasControls(node, root, head)
  const laidOut = new ResizeObserver(() => fits.forEach(fitVal)) // the face gets its size when it lands on the canvas
  laidOut.observe(root)
  off.signal.addEventListener("abort", () => laidOut.disconnect())
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
    fits.forEach(fitVal)
    if (document.activeElement !== prompt) prompt.value = !h3() && loaded().trim() ? loaded() : W(textKey())?.value ?? ""
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
    llm: (text, ruText = "") => {
      llmText = { EN: text.trim() ? text : "", RU: ruText.trim() ? ruText : "" }
      lOut.className = llmText.EN ? "mn-lout" : "mn-lout none" // ran, wrote nothing: "no prompt"
      paintLang()
    },
    ding: () => { if (!muted() && soundName()) play(soundName()) },
    model: (key, file) => {
      const [, , name, strength] = Object.values(STATUS).flat().find((x) => x[1] === key) ?? []
      if (strength === undefined) return set(name, file)
      const list = JSON.parse(W(name)?.value || "[]") // a LoRA list: the file joins it, once
      if (!list.some(([f]) => f === file)) set(name, JSON.stringify([...list, [file, strength]]))
    },
  }

  // hideInPanel: the right Parameters panel sets widget.width to its own width, and the canvas sizes this face by it
  fs.append(root)
  const dw = node.addDOMWidget("mn_ui", "mn_ui", fs, {
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

// MyNode.svg's GSEN texture, running up-left along its words, one word (80 px) every 8 s. A Web Animation on the page's
// clock, not a CSS one: a CSS animation starts over whenever the face is re-attached or hidden for a moment (the canvas
// and other packs can do that), and one ComfyUI with many packs showed it standing still
function texture(cls) {
  const box = el("div", `mn-tex ${cls}`), run = el("i")
  box.append(run)
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    run.animate([{ transform: "none" }, { transform: "translate(-80px,-80px)" }], { duration: 8000, iterations: Infinity }).startTime = 0
  }
  return box
}

// a strip of slanted tabs (Krea2.svg's modes, SettingIU.svg's families): [name, its word's centre]; the lit one is lime
function tabStrip(cls, tabs, pick, can = () => true) {
  const box = el("div", `mn-tabs ${cls}`)
  const bs = tabs.map(([name, mid], i) => {
    const b = el("div", "mn-ttab"), w = txt("span", null, name)
    b.style.left = [0, 72.33, 144.55, 216.75, 288.96][i] + "px"
    b.dataset.t = name
    b.classList.toggle("off", !can(name)) // a mode to come
    w.style.left = mid + "px"
    b.append(w)
    b.onclick = () => { if (can(name)) pick(name) }
    return b
  })
  box.append(...bs)
  return { box, light: (name) => bs.forEach((b) => b.classList.toggle("on", b.dataset.t === name)) }
}

const LLM_RUNS = new Map() // prompt id of a Settings → LLM run -> its node; the run isn't part of the graph

// Settings → Update: GET /mynode/update (update.py), once per page and again on each click
let updateInfo = null
const checkUpdate = () => (updateInfo = api.fetchApi("/mynode/update").then((r) => r.json()).catch(() => null))
const updateText = (s) => !s ? "no answer" : s.mode === "dev" ? `${s.version} · dev` // the dev copy has no update
  : `${s.version}${s.available ? ` → ${s.latest}` : s.latest ? " · latest" : s.error ? " · offline" : ""}`

// Krea2 One's models (assets/models.py): [{key, file, size, name, got}]; name = where the file is (null: missing), got =
// the bytes so far while it downloads. One list for every Krea2 One: a "paint" event tells them it changed
let models = []
const modelEvents = new EventTarget()
const modelsChanged = () => modelEvents.dispatchEvent(new Event("paint"))
const fetchModels = () => api.fetchApi("/mynode/models").then((r) => r.json())
  .then((list) => { models = list; modelsChanged() }).catch(() => {})
const gb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.ceil(n / 1e3)} KB`)
const asked = new Map() // key -> the Krea2 One whose ⬇️ asked for it: it takes the file once it is in

// ⬇️: the server downloads it; "mynode.models" (setup) brings the bar and the end
async function download(node, key) {
  const m = models.find((x) => x.key === key)
  asked.set(key, node)
  try {
    const r = await api.fetchApi(`/mynode/models/download?key=${key}`, { method: "POST" })
    if (!r.ok) throw new Error(r.statusText)
    models = await r.json()
    if (models.find((x) => x.key === key)?.got != null) toast(`Downloading ${m.file}, ${gb(m.size)}`) // else it was here already
  } catch (e) {
    toast(`${m.file}: ${e.message}`, "error", 15000)
  }
  modelsChanged()
}

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
    for (const name of Object.keys(KIND)) DEFAULTS[name] = (nodeData.input?.required?.[name] ?? nodeData.input?.optional?.[name])?.[1]?.default
    nodeType.title_mode = LiteGraph.NO_TITLE // the lime header is the title; no LiteGraph bar above it
    nodeType.collapsable = false
  },

  async nodeCreated(node) {
    if (node.comfyClass !== NODE) return
    node.widgets_start_y = 0
    node.resizable = false
    const ctl = node.widgets?.find((w) => w.name === "control_after_generate")
    if (ctl) ctl.value = "fixed" // the workflow kept its seed; saved workflows override this on load
    build(node) // its refresh sizes the node for its mode
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
    node._mn?.refresh() // sizes the node for the mode it was saved in
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
      l?._mn.llm(detail.output.mn_llm[0], detail.output.mn_llm_ru?.[0])
      if (n || l) DONE.set(detail.prompt_id, n || l)
    })
    api.addEventListener("execution_success", ({ detail }) => DONE.get(detail?.prompt_id)?._mn.ding())
    for (const ev of ["execution_error", "execution_interrupted"]) { // ComfyUI shows the error itself
      api.addEventListener(ev, ({ detail }) => LLM_RUNS.get(detail?.prompt_id)?._mn.llm(""))
    }
    for (const ev of ["execution_success", "execution_error", "execution_interrupted"]) {
      api.addEventListener(ev, ({ detail }) => DONE.delete(detail?.prompt_id))
    }
    api.addEventListener("mynode.toast", ({ detail }) => toast(detail.text, "warn", 8000))
    // a model download (models.py): the bar moves, then the end
    api.addEventListener("mynode.models", async ({ detail }) => {
      const m = models.find((x) => x.key === detail.key)
      if (!detail.done) {
        if (m) m.got = detail.got
        return modelsChanged()
      }
      const node = asked.get(detail.key), file = m?.file ?? detail.key
      asked.delete(detail.key)
      if (detail.error) toast(`${file}: ${detail.error}`, "error", 30000)
      else toast(`${file} is in ${detail.folder}`, "success", 10000)
      await fetchModels()
      if (detail.error) return
      await app.extensionManager.command.execute("Comfy.RefreshNodeDefinitions") // the loaders' lists get the new file
      const name = models.find((x) => x.key === detail.key)?.name
      if (name) node?._mn?.model(detail.key, name) // the Krea2 One that asked for it takes it
    })
    api.addEventListener("promptQueued", () => app.graph?.nodes.forEach((n) => n.comfyClass === NODE && n._mn?.refresh()))
  },
})
