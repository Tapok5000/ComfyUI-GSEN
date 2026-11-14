// Helpers for nodes whose whole body is a custom DOM face (no LiteGraph title bar, widgets hidden).
// Exports only: the frontend imports every .js under web/, so nothing here may run on import.
import { app } from "../../../scripts/app.js"

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

/** ComfyUI's own dark combo menu (the one every combo widget opens), with its filter box. */
export function menu(e, node, values, pick) {
  // the filter add-on reads active_canvas.current_node to preselect the current value
  LiteGraph.LGraphCanvas.active_canvas ??= app.canvas
  app.canvas.current_node = node
  return new LiteGraph.ContextMenu(values, {
    event: e, className: "dark", scale: Math.max(1, app.canvas.ds.scale),
    callback: (v) => pick(typeof v === "string" ? v : v?.content ?? v?.value),
  })
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
