// Face of MyNode_FaceCropTest: Krea2 One's picture and Crop (crop.js) with its face templates, a Mask switch and the
// result, to try them out
// shortcut: repeats Krea2 One's picture, crop and Format wiring; once it is settled what stays, that goes into Krea2 One
// and this node is deleted
import { app } from "../../../scripts/app.js"
import { api } from "../../../scripts/api.js"
import { PRESETS, cropEditor } from "../assets/crop.js"
import { canvasControls, comboValues, dropTo, el, hideWidgets, menu, picker, txt } from "../shared/ui.js"

const NODE = "MyNode_FaceCropTest"
const SIZE = [1010, 690] // Krea2 One's left column (526 wide, its preview ends at 686) and the result beside it
const UPLOAD = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#161a0a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 13.5V20h16v-6.5"/></svg>`
const view = (filename, subfolder, type) =>
  api.apiURL(`/view?type=${type}&filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder ?? "")}`)
const dirOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")
const baseOf = (p) => p.slice(p.lastIndexOf("/") + 1)
const nameOf = (key) => PRESETS.find(([k]) => k === key)?.[1] ?? "Free"

function build(node) {
  const W = (n) => node.widgets?.find((w) => w.name === n)
  hideWidgets(node)
  const off = new AbortController()
  const set = (n, v) => {
    const w = W(n)
    if (!w || v === undefined) return
    w.value = v
    w.callback?.(v)
    node.setDirtyCanvas(true, true)
    refresh()
  }
  const root = el("div", "mn mn-ft")

  const left = el("div", "mn-left")
  const pick = el("div", "mn-pick"), pName = el("div", "mn-pname"), pIdx = el("div", "mn-pidx")
  pick.append(pName, pIdx, el("div", "mn-pbtn"))
  const putImage = (name) => {
    const list = W("image").options.values
    if (Array.isArray(list) && !list.includes(name)) list.push(name), list.sort()
    set("image", name)
  }
  pick.onclick = async (e) => {
    try { // files put into input/ since the page loaded show up too
      const r = await api.fetchApi("/mynode/images"), list = W("image").options.values
      if (r.ok && Array.isArray(list)) list.splice(0, list.length, ...Object.keys(await r.json()))
    } catch {}
    menu(e, comboValues(W("image")), (x) => set("image", x), { title: "Image", current: W("image").value })
  }
  const up = el("div", "mn-upload", UPLOAD + "Upload"), file = picker(putImage)
  up.onclick = () => file.click()
  dropTo(left, putImage)

  const prev = el("div", "mn-prev"), pBox = el("div", "mn-pbox"), pImg = el("img")
  const la = el("div", "mn-arrow l"), ra = el("div", "mn-arrow r")
  const stepImage = (d) => {
    const list = comboValues(W("image"))
    if (list.length) set("image", list[(list.indexOf(W("image").value) + d + list.length) % list.length])
  }
  la.onclick = () => stepImage(-1)
  ra.onclick = () => stepImage(1)
  const readCrop = () => {
    try {
      const c = JSON.parse(W("crop")?.value || "null")
      return c?.image === W("image")?.value ? c : null
    } catch {
      return null
    }
  }
  const ed = cropEditor(pImg, readCrop, (c) => set("crop", JSON.stringify({ image: W("image")?.value, ...c })), off.signal)
  const reset = txt("div", "mn-lbl mn-txt mn-cropreset", "RESET")
  reset.onclick = () => set("crop", "")
  const fmt = el("div", "mn-row c mn-fmt"), fv = el("div", "v"), fl = el("div", "mn-tri l"), fval = el("div", "mn-val")
  const fr = el("div", "mn-tri r")
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
  // Mask and its preview, where MyNode.svg has them: on, everything outside the face oval comes out gray
  const maskB = txt("div", "mn-ftmask", "Mask"), mini = el("div", "mn-ftmini"), miniCv = el("canvas")
  maskB.title = "Gray outside the face oval: Format ⛶ Face 1:1 or ⛶ Face 2:3"
  maskB.onclick = () => { set("mask", !W("mask").value) }
  mini.append(miniCv)
  pBox.append(ed.canvas)
  prev.append(pBox, la, ra, ed.label, reset, fmt, maskB, mini)
  left.append(pick, up, file, prev)
  pImg.onload = () => refresh()

  // the result and a Run of this node alone
  const right = el("div", "mn-ftres"), frame = el("div", "mn-ftframe"), res = el("img"), rDims = el("div", "mn-ftdims")
  const run = txt("div", "mn-run mn-ftrun", "Run")
  run.title = "Run this node"
  run.onclick = () => {
    app.canvas.selectNode(node) // the command queues the selected output nodes, so: only this one
    app.extensionManager.command.execute("Comfy.QueueSelectedOutputNodes")
  }
  run.dataset.click = ""
  frame.append(res)
  right.append(run, frame, rDims)
  res.onload = () => { rDims.textContent = `${res.naturalWidth} × ${res.naturalHeight}` }
  node.onExecuted = (out) => {
    const im = out?.mn_images?.[0]
    if (im) res.src = view(im.filename, im.subfolder, im.type) + `&t=${Date.now()}`
  }

  const refresh = () => {
    const name = W("image")?.value ?? "", list = comboValues(W("image"))
    pName.textContent = baseOf(name)
    pIdx.textContent = `${list.indexOf(name) + 1}/${list.length}`
    const src = name ? view(baseOf(name), dirOf(name), "input") : ""
    if (pImg.dataset.src !== src) {
      pImg.dataset.src = src
      if (src) pImg.src = src
      else pImg.removeAttribute("src")
    }
    ed.draw()
    fval.textContent = nameOf(ed.preset())
    maskB.classList.toggle("on", !!W("mask")?.value)
    miniCv.hidden = !(W("mask")?.value && String(ed.preset()).startsWith("face")) // a mask is there only with a face
    if (!miniCv.hidden) ed.mini(miniCv, true)
  }
  node._ft = refresh

  root.append(left, right)
  canvasControls(node, root, right) // the result's panel drags the node, as the title does
  const dw = node.addDOMWidget("mn_ft", "mn_ft", root, {
    serialize: false, hideOnZoom: false, margin: 0, getMinHeight: () => SIZE[1], hideInPanel: true,
  })
  dw.serialize = false
  const onRemoved = node.onRemoved
  node.onRemoved = function () {
    off.abort()
    return onRemoved?.apply(this, arguments)
  }
  refresh()
}

app.registerExtension({
  name: "MyNode.FaceCropTest",

  async nodeCreated(node) {
    if (node.comfyClass !== NODE) return
    node.resizable = false
    build(node)
    node.setSize([...SIZE])
  },

  loadedGraphNode(node) {
    if (node.comfyClass !== NODE) return
    node.setSize([...SIZE])
    node._ft?.()
  },
})
