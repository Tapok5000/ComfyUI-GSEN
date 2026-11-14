// Face of MyNode_FaceProcessing: the whole node is this DOM, laid out 1:1 from MyNode.svg (face.css).
import { app } from "../../../scripts/app.js"
import { api } from "../../../scripts/api.js"
import { canvasControls, comboValues, el, hideWidgets, menu, nodeByExecId, txt } from "../shared/ui.js"
import { cropEditor } from "./crop.js"

const NODE = "MyNode_FaceProcessing"
const SIZE = [1896, 745]

// [label, widget, top, left, width] px from MyNode.svg; a row with a left is one of its short pills
const ROWS = [
  ["Resize", "resolution_source", 369.6, 58.6, 147.7], ["ref_boost", "ref_boost", 369.6, 220.3, 218.4],
  ["grounding_px", "grounding_px", 369.6, 444.5, 247.7], ["W", "custom_width", 432.2, 372.8, 147.7],
  ["H", "custom_height", 432.2, 539.3, 147.7],
  ["", "aspect_ratio", 432.2, 259, 428], // a preset's pill, in W and H's place (not in MyNode.svg)
  ["seed", "seed", 488.9], ["steps", "steps", 527.9], ["sampler", "sampler_name", 579.5], ["scheduler", "scheduler", 617.1],
]
const SETTINGS = [
  ["MODEL", "unet_name", 78], ["LoRa", "lora_name", 121], ["CLIP", "clip_name", 167], ["VAE", "vae_name", 211],
  ["LLM", "llm_name", 281.4], ["LLM", "ai_prompt", 331.8, 25.9, 147.7], ["System", "system_file", 375.5, 25.9, 282.8],
  ["Crop", "manual_crop", 444.3, 25.9, 147.7], ["FaceCrop", "face_crop", 445.5, 181.5, 194.1],
  ["SAVE", "save_to", 517.6, 25.9, 282.8],
  // not in MyNode.svg: kept in its free right column
  ["max_resolution", "max_resolution", 444.3, 451.4, 282.8],
  ["seed mode", "control_after_generate", 517.6, 451.4, 282.8], // ComfyUI's own seed control: fixed / randomize / …
]
// a loaded .txt: prompts split by lines of dashes (---) if it has any, else by blank lines (face/node.py: _prompts)
const DASHES = /^[ \t]*-{3,}[ \t]*$/m
const countPrompts = (t) => t.split(DASHES.test(t) ? DASHES : /\n\s*\n/).filter((p) => p.trim()).length

const ICON = {
  clock: `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.6 1.8M3.8 6.2 7 3.6M20.2 6.2 17 3.6M7.2 19.6l-1.6 2M16.8 19.6l1.6 2"/></svg>`,
  open: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="#111" stroke-width="2"><path d="M1 1h20v20H1zM7 15 18 4M11 4h7v7"/></svg>`,
  upload: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#161a0a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 13.5V20h16v-6.5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#777" stroke-width="2.6" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>`,
  plus: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M11 6v10M6 11h10"/></svg>`,
  cross: `<svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m7 7 8 8m0-8-8 8"/></svg>`,
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
  head.append(txt("div", "mn-title", "Krea2 One"), el("div", "mn-pill t"), el("div", "mn-pill p"),
    el("div", "mn-clock", ICON.clock), time, track, pct, run, openB, dims)

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
  prompt.style.top = "33px"
  ru.style.top = "201.3px"
  prompt.oninput = () => {
    W("text").value = prompt.value
    W("text").callback?.(prompt.value)
  }
  const lp = txt("div", "mn-lbl", "PROMPT"), lr = txt("div", "mn-lbl mn-lang", "RU")
  lp.style.top = "14px"
  lr.style.top = "182.5px"
  // the box shows the RU translation; a click on its label switches to EN, the prompt the sampler got
  let shot = { RU: "", EN: "" }
  lr.title = "RU / EN"
  lr.onclick = () => {
    lr.textContent = lr.textContent === "RU" ? "EN" : "RU"
    ru.textContent = shot[lr.textContent]
  }
  // LOAD TXT keeps the file's text in the hidden "prompts" widget; while it is there, Run makes an image per
  // prompt and the box shows them read-only. CLOSE TXT goes back to the box's own prompt.
  const lt = txt("div", "mn-lbl mn-txt"), txtIn = el("input")
  const loaded = () => W("prompts")?.value ?? ""
  lt.style.top = "14px"
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
    lp.textContent = on ? `TXT: ${W("prompt_file")?.value || "prompts"} · ${n} prompt${n === 1 ? "" : "s"}` : "PROMPT"
    lp.classList.toggle("on", on)
    lt.textContent = on ? "CLOSE TXT" : "LOAD TXT"
    prompt.readOnly = on
  })
  // custom / preset: aspect_ratio "custom" is W × H; a preset shows its own pill in their place
  const presets = () => comboValues(W("aspect_ratio")).filter((p) => p !== "custom")
  let preset = null // the one custom goes back to
  const mode = row(["", "", 432.2, 58.6, 147.7], "mn-row tog mn-mode")
  mode.firstChild.append(txt("span", "cu", "custom /"), " ", txt("span", "pr", "preset"))
  mode.onclick = () => {
    const v = W("aspect_ratio")?.value
    if (v !== "custom") preset = v
    set("aspect_ratio", v !== "custom" ? "custom" : presets().includes(preset) ? preset : presets()[0])
  }
  binds.push(() => { mid.classList.toggle("preset", W("aspect_ratio")?.value !== "custom") })
  mid.append(lp, lt, txtIn, prompt, lr, ru, mode, ...ROWS.map((s) => row(s, "mn-row")))

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
    ru.textContent = shot[lr.textContent]
    rNum.textContent = `${at + 1}/${shots.length}`
    frame.classList.toggle("many", shots.length > 1)
  }
  rPrev.onclick = () => { showShot(at - 1) }
  rNext.onclick = () => { showShot(at + 1) }

  // Settings: a panel over the middle with tabs, as in MyNode.svg; its header also holds Update and the LLM tab's Run
  const setP = el("div", "mn-set"), shead = el("div", "mn-shead"), det = el("div", "mn-det")
  const upB = txt("div", "mn-up", "Update"), lRun = txt("div", "mn-run mn-lrun", "Run")
  const panes = { Settings: el("div", "mn-pane"), Gallery: el("div", "mn-pane"), LLM: el("div", "mn-pane") }
  panes.Settings.dataset.scroll = panes.Gallery.dataset.scroll = "" // added LoRAs, many results: they scroll
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
    det.hidden = true
    if (t === "Gallery") loadGallery()
    if (setP.classList.contains("open")) panes[t].focus({ preventScroll: true }) // so its wheel scrolls in Nodes 2.0 too
  }
  shead.append(...tabs, lRun, upB)
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
    if (!s?.available) return toast(s?.error ?? `MyNode ${s?.version} is the newest.`, s?.error ? "warn" : "info")
    upB.textContent = "updating…"
    const r = await api.fetchApi("/mynode/update", { method: "POST" }).then((x) => x.json()).catch((e) => ({ error: String(e) }))
    upB.textContent = r.ok ? "Restart" : "Update"
    toast(r.ok ? `MyNode ${r.version} is in. Restart ComfyUI, then Ctrl+F5.` : r.error ?? r.log, r.ok ? "success" : "error", 15000)
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

  // Gallery: the results in SAVE (common.py: /mynode/results), newest first; a card opens over them with its
  // picture, size, sampling settings and prompt, as saved in the PNG
  const grid = el("div", "mn-resgrid"), folder = () => String(W("save_to")?.value ?? "")
  const resultRoute = (r, q = "") => `/mynode/result?folder=${encodeURIComponent(folder())}&name=${encodeURIComponent(r.name)}&v=${r.mtime}${q}`
  const corners = () => ["tl", "tr", "bl", "br"].map((c) => el("i", c))
  panes.Gallery.append(grid)
  // shortcut: every card at once (thumbnails load lazily); page the list if a SAVE folder grows past a few thousand
  const loadGallery = async () => {
    const list = await api.fetchApi(`/mynode/results?folder=${encodeURIComponent(folder())}`).then((r) => r.json()).catch(() => [])
    grid.replaceChildren(...list.map((r) => {
      const c = el("div", "mn-rescard"), box = el("div", "mn-resimg"), im = el("img")
      im.loading = "lazy"
      im.decoding = "async"
      im.draggable = false
      im.src = api.apiURL(resultRoute(r, "&s=320"))
      box.append(im)
      c.append(box, ...corners(), txt("div", "mn-resid", `ID_${r.id}`))
      c.onclick = () => { openResult(r) }
      return c
    }))
    if (!list.length) grid.append(txt("div", "mn-resnone", folder().trim() ? `No results in ${folder()} yet` : "SAVE is empty: results aren't kept"))
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
    bImg.src = api.apiURL(resultRoute(r))
    bId.textContent = `ID_${r.id}`
    par.replaceChildren()
    const info = await api.fetchApi(resultRoute(r, "&info=1")).then((x) => x.json()).catch(() => ({}))
    if (opened !== r) return // another card was opened meanwhile
    par.replaceChildren(...[["seed", info.seed], ["step", info.steps], ["sampler", info.sampler], ["scheduler", info.scheduler]]
      .flatMap(([k, v]) => [txt("span", "k", k), txt("span", "v", String(v ?? "—"))]))
    said.textContent = info.en ?? ""
  }

  // LLM: the AI step alone (MyNode_LLM): a picture, the same LLM, System and SAVE as Settings; Run queues just that,
  // and the prompt the LLM writes comes back here (setup(): LLM_RUNS)
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
  panes.LLM.append(lBox, lUp, lFile, lOut, ...[["LLM", "llm_name", 611.5], ["System", "system_file", 655.1], ["SAVE", "save_to", 698.6]]
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
    lOut.classList.add("busy")
    const prompt = { mynode_llm: { class_type: "MyNode_LLM", inputs: {
      image, llm_name: W("llm_name")?.value ?? "", system_file: W("system_file")?.value ?? "", save_to: folder() } } }
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
      if (setP.classList.contains("open") && tab === "Gallery" && det.hidden) loadGallery()
    },
    llm: (text) => {
      lOut.classList.remove("busy")
      lOut.textContent = text
    },
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

const toast = (detail, severity = "info", life = 6000) => app.extensionManager.toast.add({ severity, summary: "MyNode", detail, life })

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
    const sys = node.widgets?.find((w) => w.name === "system_file")
    // 1.9.0 saved "" or a file from anywhere, and a renamed prompt is gone: take the first one there is
    if (sys && !comboValues(sys).includes(sys.value)) sys.value = comboValues(sys)[0] ?? ""
    relink(node)
    node.setSize([...SIZE])
    node._mn?.refresh()
  },

  async setup() {
    const css = el("link")
    css.rel = "stylesheet"
    css.href = new URL("./face.css", import.meta.url)
    document.head.append(css)
    ;(updateInfo ?? checkUpdate()).then((s) => {
      if (s?.problems?.length) {
        toast(`This ComfyUI changed what Krea2 One is built from: ${s.problems.join("; ")}. Run may fail; Settings → Update brings a fixed version.`, "warn", 20000)
      }
    })

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
    api.addEventListener("executed", ({ detail }) => {
      ours(detail.display_node ?? detail.node)?._mn.show(detail.output, detail.prompt_id)
      if (detail.output?.mn_llm) LLM_RUNS.get(detail.prompt_id)?._mn.llm(detail.output.mn_llm[0])
    })
    for (const ev of ["execution_error", "execution_interrupted"]) { // ComfyUI shows the error itself
      api.addEventListener(ev, ({ detail }) => LLM_RUNS.get(detail?.prompt_id)?._mn.llm(""))
    }
    api.addEventListener("mynode.toast", ({ detail }) => {
      app.extensionManager.toast.add({ severity: "warn", summary: "Krea2 One", detail: detail.text, life: 8000 })
    })
    api.addEventListener("promptQueued", () => app.graph?.nodes.forEach((n) => n.comfyClass === NODE && n._mn?.refresh()))
  },
})
