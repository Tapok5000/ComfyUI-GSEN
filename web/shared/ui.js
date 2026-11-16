// Helpers for nodes whose whole body is a custom DOM face (no LiteGraph title bar, widgets hidden).
// Exports only: the frontend imports every .js under web/, so nothing here may run on import.
import { app } from "../../../scripts/app.js"
import { api } from "../../../scripts/api.js"
import { tree } from "./tree.js"

export const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

export const txt = (tag, cls, text) => {
  const e = el(tag, cls)
  e.textContent = text
  return e
}

/** A combo widget's values, whether the frontend keeps them as a list or a function. */
export const comboValues = (w) => (typeof w?.options?.values === "function" ? w.options.values() : w?.options?.values) ?? []

// the pick list's icons: a folder, a file, back up
const PICK = {
  dir: `<svg viewBox="0 0 20 20" width="18" height="18"><path fill="#f2c14e" d="M2 5.5C2 4.7 2.7 4 3.5 4h4.1l1.7 1.9h7.2c.8 0 1.5.7 1.5 1.5v7.1c0 .8-.7 1.5-1.5 1.5h-13C2.7 16 2 15.3 2 14.5z"/></svg>`,
  file: `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="#b5b5b5" stroke-width="1.3"><path d="M5 2.7h6.4L15 6.3v11H5z"/><path d="M11.3 2.7v3.7H15M7.6 10h4.8M7.6 12.8h4.8"/></svg>`,
  back: `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="#b5b5b5" stroke-width="1.6"><path d="M12 4.5 6.5 10l5.5 5.5"/></svg>`,
}
let closePick = null // one pick list at a time

// the face's pick list, laid out like a model picker: a search box over tree()'s folders and files (tree.js)
export function menu(e, values, pick, { title = "", current } = {}) {
  closePick?.()
  const t = tree(values, current)
  const box = el("div", "mn-menu"), find = el("input", "mn-menu-f"), list = el("div", "mn-menu-l")
  find.placeholder = "Search"
  find.spellcheck = false
  list.setAttribute("role", "listbox")
  box.append(txt("div", "mn-menu-h", title), find, list)
  let at = [], rows = [], act = -1
  let x0 = e.clientX - 10, y0 = e.clientY - 10 // where it opened; a longer folder only lifts it
  const mark = (i, scroll = true) => {
    rows[act]?.classList.remove("act")
    act = Math.max(-1, Math.min(i, rows.length - 1))
    rows[act]?.classList.add("act")
    if (scroll) rows[act]?.scrollIntoView({ block: "nearest" })
  }
  const row = (cls, icon, name, run, count) => {
    const r = el("div", `mn-menu-r ${cls}`, t.files ? icon : null)
    r.setAttribute("role", "option")
    r.append(typeof name === "string" ? txt("span", "n", name) : name)
    if (count != null) r.append(txt("span", "c", String(count)))
    r.onclick = run
    return r
  }
  const go = (path) => () => {
    at = path
    render()
  }
  const fileName = ({ name, dirs }) => {
    if (!dirs.length) return name
    const n = el("span", "n")
    n.append(txt("span", "d", `${dirs.join(" › ")} › `), name)
    return n
  }
  const render = () => {
    const shown = t.view(at, find.value)
    rows = shown.map((it) => (it.kind === "file"
      ? row(it.cur ? "cur" : "", PICK.file, fileName(it), () => choose(it.value))
      : row(it.cur ? "dir cur" : it.kind, PICK[it.kind], it.name, go(it.path), it.count)))
    list.replaceChildren(...(rows.length ? rows : [txt("div", "mn-menu-none", "Nothing found")]))
    list.scrollTop = 0
    act = -1
    mark(find.value.trim() ? 0 : shown.findIndex((it) => it.kind === "file" && it.cur))
    x0 = Math.max(8, Math.min(x0, innerWidth - box.offsetWidth - 8))
    y0 = Math.max(8, Math.min(y0, innerHeight - box.offsetHeight - 8))
    Object.assign(box.style, { left: `${x0}px`, top: `${y0}px` })
  }
  const outside = (ev) => { if (!box.contains(ev.target)) close() }
  const close = () => {
    box.remove()
    document.removeEventListener("pointerdown", outside, true)
    removeEventListener("resize", close)
    if (closePick === close) closePick = null
  }
  const choose = (v) => {
    close()
    pick(v)
  }
  find.oninput = render
  find.onkeydown = (ev) => {
    ev.stopPropagation() // the face closes Settings on Escape, and ComfyUI has keys of its own
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault()
      mark(act + (ev.key === "ArrowDown" ? 1 : -1))
    } else if (ev.key === "Enter") rows[act]?.click()
    else if (ev.key === "Escape") close()
    else if (ev.key === "Tab") ev.preventDefault() // the keys reach the list only through the search box
  }
  // a click anywhere in it, the title too, leaves the focus in the search box, so the keys go on working
  box.onmousedown = (ev) => { if (ev.target !== find) ev.preventDefault() }
  list.onpointermove = (ev) => {
    const i = rows.indexOf(ev.target.closest?.(".mn-menu-r"))
    if (i >= 0 && i !== act) mark(i, false)
  }
  document.addEventListener("pointerdown", outside, true)
  addEventListener("resize", close)
  closePick = close
  document.body.append(box)
  render()
  find.focus({ preventScroll: true })
}

/** Take the widgets off the node; they still save with the workflow and go into the prompt. */
export function hideWidgets(node) {
  for (const w of node.widgets ?? []) {
    w.hidden = true
    if (w.options) w.options.hidden = true
    w.computeSize = () => [0, -4]
  }
}

/** The node a unique_id points at; inside a subgraph it is an execution id like "527:458". */
export function nodeByExecId(execId) {
  let graph = app.graph, node
  for (const id of String(execId).split(":")) {
    node = graph?.getNodeById(id)
    graph = node?.subgraph
  }
  return node
}

/**
 * Canvas controls for a face that covers the whole node (the canvas never sees those events):
 * handle: left button drags the node, right button opens its menu (on contextmenu, so the release
 * doesn't close it); clicks on [data-click] inside the handle are left alone.
 * root: middle button pans, the wheel zooms unless the element under it is [data-scroll] and can scroll.
 */
export function canvasControls(node, root, handle) {
  handle.addEventListener("pointerdown", (e) => {
    const c = app.canvas
    if (e.target.closest("[data-click]") || e.button !== 0 || node.pinned || node.flags?.pinned) return
    e.preventDefault()
    c.selectNode(node)
    c.bringToFront(node)
    const s = c.ds.scale, x0 = e.clientX, y0 = e.clientY, p0 = [node.pos[0], node.pos[1]]
    handle.setPointerCapture(e.pointerId)
    const move = (ev) => {
      node.pos = [p0[0] + (ev.clientX - x0) / s, p0[1] + (ev.clientY - y0) / s]
      c.setDirty(true, true)
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  })
  handle.addEventListener("contextmenu", (e) => {
    e.preventDefault()
    LiteGraph.LGraphCanvas.active_canvas ??= app.canvas
    app.canvas.adjustMouseEvent(e)
    app.canvas.processContextMenu(node, e)
  })
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return
    e.preventDefault()
    root.setPointerCapture(e.pointerId)
    app.canvas.processMouseDown(e)
    const move = (ev) => app.canvas.processMouseMove(ev)
    const end = (ev) => {
      app.canvas.processMouseUp(ev)
      root.removeEventListener("pointermove", move)
      root.removeEventListener("pointerup", end)
    }
    root.addEventListener("pointermove", move)
    root.addEventListener("pointerup", end)
  }, true)
  // Nodes 2.0 gives the wheel to the canvas unless it is over a [data-capture-wheel] element that holds the focus
  // (frontend useCanvasInteractions), so a press inside a scroll area focuses it and the wheel then scrolls it
  for (const sc of root.querySelectorAll("[data-scroll]")) {
    sc.dataset.captureWheel = "true"
    if (!sc.matches("textarea, input, [tabindex]")) sc.tabIndex = -1
  }
  root.addEventListener("pointerdown", (e) => {
    const sc = e.target.closest?.("[data-scroll]")
    if (sc && !sc.contains(document.activeElement)) sc.focus({ preventScroll: true })
  }, true)
  root.addEventListener("wheel", (e) => {
    const sc = e.target.closest?.("[data-scroll]")
    if (!e.ctrlKey && sc && sc.scrollHeight > sc.clientHeight) return e.stopPropagation()
    e.preventDefault()
    e.stopPropagation()
    app.canvas.processMouseWheel(e)
  }, { passive: false })
}

export const toast = (detail, severity = "info", life = 6000) => app.extensionManager.toast.add({ severity, summary: "GSEN", detail, life })

// a hidden file input for pictures: the chosen file goes to ComfyUI's input/, put() gets its name there
export function picker(put) {
  const inp = el("input")
  inp.type = "file"
  inp.accept = "image/*"
  inp.hidden = true
  inp.onchange = () => {
    const f = inp.files[0]
    inp.value = ""
    if (f) upload(f, put)
  }
  return inp
}

async function upload(f, put) {
  const body = new FormData()
  body.append("image", f)
  const r = await api.fetchApi("/upload/image", { method: "POST", body })
  if (r.status !== 200) return toast(`Upload: ${r.statusText}`, "error", 3000)
  const d = await r.json()
  put(d.subfolder ? `${d.subfolder}/${d.name}` : d.name)
}

// a picture dragged in from the file manager goes in as Upload takes it; left to the canvas it would open the
// PNG's workflow or make a LoadImage node
export function dropTo(zone, put) {
  zone.addEventListener("dragover", (e) => {
    if (![...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file")) return
    e.preventDefault()
    e.stopPropagation()
    zone.classList.add("mn-drop")
  })
  zone.addEventListener("dragleave", (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("mn-drop") })
  zone.addEventListener("drop", (e) => {
    zone.classList.remove("mn-drop")
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith("image/"))
    if (!f) return
    e.preventDefault()
    e.stopPropagation()
    upload(f, put)
  })
}
