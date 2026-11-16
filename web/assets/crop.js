// Krea2 One's Crop, edited on its input preview: turn, crop box, padding. Same model as ausboss Image Crop + Rotate +
// Pad, and assets/crop_edit.py applies it: the picture turns clockwise on a canvas grown to fit, the box is cut from
// that canvas, the padding is gray. Saved as {angle, box: [x, y, w, h], pad: [left, top, right, bottom], ratio} in
// pixels; ratio is the preset the box keeps, for the preview only. The handles, the presets, the wheel and the view
// (the frame fills the editor, the picture moves under it) are Windows Photos'; Alt turns the picture.
const LIME = "#c7f400", INK = "#070a10"
const CW = 306, CH = 447 // face.css .mn-pbox
const ROOM = 20 // around the frame for the padding handles
const OUT = 12 // padding handles sit this far outside the frame, clear of the box handles
const GRAB = 10, MIN = 16, Q = 2 // grab radius, smallest box side in picture pixels, canvas supersampling
const SIDES = { w: 0, n: 1, e: 2, s: 3 }
const CURSOR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" }
// MyNode.svg's face templates ("1 1", "2:3") first, then Windows Photos' ratios; OVAL: the oval's middle and half axes
// in box parts
export const PRESETS = [["face 1:1", "⛶ Face 1:1"], ["face 2:3", "⛶ Face 2:3"], ["free", "Free"], ["orig", "Original"],
  ["1:1", "Square"], ...["9:16", "16:9", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "5:7", "7:5", "1:2", "2:1"].map((k) => [k, k])]
const OVAL = { "face 1:1": [0.5, 0.4358, 0.2467, 0.3026], "face 2:3": [0.5, 0.3861, 0.2962, 0.2927] }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** A box's shape as a format: the nearest a:b with both at most 16, so 1306×1959 is 2:3 and 1.12:1 is 9:8. */
export function ratioName(w, h) {
  let best = "1:1", err = Infinity
  for (let b = 1; b <= 16; b++) {
    for (let a = 1; a <= 16; a++) {
      const e = Math.abs(Math.log((a * h) / (b * w)))
      if (e < err - 1e-9) [best, err] = [`${a}:${b}`, e] // the first of equal ones has the smallest terms
    }
  }
  return best
}

/** The canvas PIL's rotate(expand=True) makes for a w x h picture turned by deg (crop_edit.py asks PIL itself). */
export function turnedSize(w, h, deg) {
  const r = (deg * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
  const side = (a, b) => Math.ceil(a / 2 + (a * c + b * s) / 2 - 1e-6) - Math.floor(a / 2 - (a * c + b * s) / 2 + 1e-6)
  return [side(w, h), side(h, w)]
}

/** A preset's width / height, 0 for free; orig is the picture's own, on its side once turned a quarter. */
export function aspectOf(key, W, H, angle) {
  if (key === "orig") return Math.round(angle / 90) % 2 ? H / W : W / H
  const m = /(\d+):(\d+)$/.exec(key ?? "")
  return m ? m[1] / m[2] : 0
}

/** box put inside the cw x ch canvas, MIN a side at least; at a ratio r it shrinks whole about its middle. */
export function fitIn([x, y, w, h], cw, ch, r) {
  const k = r ? Math.min(1, cw / w, ch / h) : 1, nw = clamp(w * k, MIN, cw), nh = clamp(h * k, MIN, ch)
  return [clamp(x + (w - nw) / 2, 0, cw - nw), clamp(y + (h - nh) / 2, 0, ch - nh), nw, nh].map(Math.round)
}

/** The box at ratio r: as big as it was (its area) on the same middle, so the whole picture gives the largest one. */
export function withRatio([x, y, w, h], r, cw, ch) {
  const nw = Math.sqrt(w * h * r), nh = nw / r
  return fitIn([x + (w - nw) / 2, y + (h - nh) / 2, nw, nh], cw, ch, r)
}

/** box after its handle d (n, se...) moved dx, dy picture pixels at ratio r: a corner keeps the one across it and
 *  follows the axis the pointer moved more along, a side keeps the box's middle along it. */
export function resizeLocked([x, y, w, h], d, dx, dy, r, cw, ch) {
  const e = d.includes("e"), s = d.includes("s"), ns = d === "n" || d === "s", ew = d === "e" || d === "w"
  const gw = e ? dx : d.includes("w") ? -dx : 0, gh = s ? dy : d.includes("n") ? -dy : 0
  const ax = e ? x : x + w, ay = s ? y : y + h // the side or corner that stays
  const maxW = Math.min(ns ? cw : e ? cw - ax : ax, (ew ? ch : s ? ch - ay : ay) * r)
  const want = ns || (!ew && Math.abs(gh * r) > Math.abs(gw)) ? (h + gh) * r : w + gw
  const nw = clamp(want, Math.min(maxW, Math.max(MIN, MIN * r)), maxW), nh = nw / r
  return [ns ? clamp(x + (w - nw) / 2, 0, cw - nw) : e ? ax : ax - nw, ew ? clamp(y + (h - nh) / 2, 0, ch - nh) : s ? ay : ay - nh, nw, nh]
}

/** The box after the wheel: f times its size about the picture point px, py (taken inside it), which so stays under
 *  the pointer; its ratio kept, no bigger than the canvas, no side under MIN. */
export function zoomAt([x, y, w, h], px, py, f, cw, ch) {
  f = clamp(f, Math.max(MIN / w, MIN / h), Math.min(cw / w, ch / h))
  px = clamp(px, x, x + w)
  py = clamp(py, y, y + h)
  return [clamp(px - (px - x) * f, 0, cw - w * f), clamp(py - (py - y) * f, 0, ch - h * f), w * f, h * f].map(Math.round)
}

// how far a face template's oval may grow about its middle and stay inside the box
const ovalMax = ([x, y, rx, ry]) => Math.min(Math.min(x, 1 - x) / rx, Math.min(y, 1 - y) / ry)

/** img: the shown input; read(): its saved crop or null; write(crop) saves one; signal: aborted when the node goes. */
export function cropEditor(img, read, write, signal) {
  const canvas = document.createElement("canvas"), label = document.createElement("div"), ctx = canvas.getContext("2d")
  canvas.className = "mn-cropcv"
  label.className = "mn-croplbl"
  let s = null, view = null, drag = null, tween = 0, settle = false

  const aspect = () => aspectOf(s.ratio, s.W, s.H, s.angle)
  const fitBox = () => { s.box = fitIn(s.box, s.cw, s.ch, aspect()) }
  const load = () => {
    const W = img.naturalWidth, H = img.naturalHeight, r = read() ?? {}
    if (!W) return void (s = null)
    const angle = clamp(+r.angle || 0, -180, 180), [cw, ch] = turnedSize(W, H, angle)
    const ratio = PRESETS.some(([k]) => k === r.ratio) ? r.ratio : "free", oval = clamp(+r.oval || 1, 0.3, 2)
    s = { W, H, angle, cw, ch, box: [...(r.box ?? [0, 0, cw, ch])], pad: [...(r.pad ?? [0, 0, 0, 0])], ratio, oval }
    fitBox()
  }
  const save = () => write({ angle: s.angle, box: s.box, pad: s.pad, ratio: s.ratio, ...(s.oval !== 1 && { oval: s.oval }) })
  // where the turned picture's centre sits on screen and how big a picture pixel is. As in Windows the frame (box and
  // padding) fills the editor and the picture is zoomed and moved under it; a handle's drag holds the view still
  const fit = () => {
    const [x, y, w, h] = s.box, [l, t, r, b] = s.pad, x0 = x - l, y0 = y - t, x1 = x + w + r, y1 = y + h + b
    const k = Math.min((CW - 2 * ROOM) / (x1 - x0), (CH - 2 * ROOM) / (y1 - y0))
    return { k, cx: CW / 2 + (s.cw / 2 - (x0 + x1) / 2) * k, cy: CH / 2 + (s.ch / 2 - (y0 + y1) / 2) * k }
  }
  const at = (x, y) => [view.cx + (x - s.cw / 2) * view.k, view.cy + (y - s.ch / 2) * view.k]
  const rects = () => {
    const [x, y, w, h] = s.box, [l, t, r, b] = s.pad
    return { box: [...at(x, y), ...at(x + w, y + h)], frame: [...at(x - l, y - t), ...at(x + w + r, y + h + b)] }
  }
  const handles = () => {
    const { box: [a0, b0, a1, b1], frame: [f0, g0, f1, g1] } = rects(), fm = (f0 + f1) / 2, gm = (g0 + g1) / 2
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2
    return [
      ...[["w", f0 - OUT, gm], ["e", f1 + OUT, gm], ["n", fm, g0 - OUT], ["s", fm, g1 + OUT]]
        .map(([d, x, y]) => ({ kind: "pad", d, x, y })),
      // the side bars too, so the nearest wins over the padding diamond 12 px out
      ...[["nw", a0, b0], ["n", am, b0], ["ne", a1, b0], ["e", a1, bm], ["se", a1, b1], ["s", am, b1], ["sw", a0, b1], ["w", a0, bm]]
        .map(([d, x, y]) => ({ kind: "box", d, x, y })),
    ]
  }
  const hit = ([px, py]) => {
    let best = null, near = GRAB
    for (const h of handles()) {
      const d = Math.hypot(h.x - px, h.y - py)
      if (d < near) [best, near] = [h, d]
    }
    if (best) return best
    // as in Windows a side moves from anywhere along it; a small box keeps a middle to move it by
    const [a0, b0, a1, b1] = rects().box, inside = Math.min(GRAB / 2, (a1 - a0) / 4, (b1 - b0) / 4)
    const on = (v, line, out) => (v - line) * out < GRAB && (v - line) * out > -inside
    const spanX = px > a0 && px < a1, spanY = py > b0 && py < b1
    const d = spanY && on(px, a0, -1) ? "w" : spanY && on(px, a1, 1) ? "e" : spanX && on(py, b0, -1) ? "n" : spanX && on(py, b1, 1) ? "s" : null
    return d ? { kind: "box", d } : spanX && spanY ? { kind: "move" } : null
  }

  // the picture turned to angle (wrapped to ±180°): its canvas grows to fit, the box keeps its place against the
  // picture's centre, and Original turns with it
  const turnTo = (angle) => {
    const [cw, ch] = [s.cw, s.ch]
    s.angle = Math.round((((angle + 540) % 360) - 180) * 10) / 10
    ;[s.cw, s.ch] = turnedSize(s.W, s.H, s.angle)
    s.box[0] += (s.cw - cw) / 2
    s.box[1] += (s.ch - ch) / 2
    if (aspect()) s.box = withRatio(s.box, aspect(), s.cw, s.ch)
    fitBox()
  }

  const move = (p, shift) => {
    const { h, p0, s0 } = drag, dx = (p[0] - p0[0]) / view.k, dy = (p[1] - p0[1]) / view.k
    s = structuredClone(s0)
    if (h.kind === "turn") {
      const turned = Math.atan2(p[1] - view.cy, p[0] - view.cx) - Math.atan2(p0[1] - view.cy, p0[0] - view.cx)
      let a = ((s0.angle + (turned * 180) / Math.PI + 540) % 360) - 180
      const step = shift ? 15 : 90 // Shift: 15° steps; otherwise only a right angle within 2° pulls it in
      if (shift || Math.abs(a - Math.round(a / step) * step) < 2) a = Math.round(a / step) * step
      turnTo(a)
    } else if (h.kind === "move") {
      s.box[0] -= dx // the picture goes with the pointer, the frame stays
      s.box[1] -= dy
    } else if (h.kind === "box" && aspect()) {
      s.box = resizeLocked(s0.box, h.d, dx, dy, aspect(), s.cw, s.ch)
    } else if (h.kind === "box") {
      let [x0, y0, x1, y1] = [s0.box[0], s0.box[1], s0.box[0] + s0.box[2], s0.box[1] + s0.box[3]]
      if (h.d.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN)
      if (h.d.includes("e")) x1 = clamp(x1 + dx, x0 + MIN, s.cw)
      if (h.d.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN)
      if (h.d.includes("s")) y1 = clamp(y1 + dy, y0 + MIN, s.ch)
      s.box = [x0, y0, x1 - x0, y1 - y0]
    } else {
      const out = { w: -dx, e: dx, n: -dy, s: dy } // dragging a side outward adds gray there
      s.pad[SIDES[h.d]] = Math.max(0, Math.round(s0.pad[SIDES[h.d]] + out[h.d]))
    }
    fitBox()
    if (h.kind === "move") view = fit()
  }

  const diamond = (x, y) => {
    ctx.moveTo(x, y - 6)
    ctx.lineTo(x + 6, y)
    ctx.lineTo(x, y + 6)
    ctx.lineTo(x - 6, y)
    ctx.closePath()
  }
  const paint = () => {
    canvas.width = CW * Q
    canvas.height = CH * Q
    label.textContent = ""
    if (!s) return
    const [, , w, h] = s.box, [l, t, r, b] = s.pad
    const oval = OVAL[s.ratio], sc = oval ? Math.min(s.oval, ovalMax(oval)) : 1
    const free = s.ratio.includes(":") ? "" : ` · ${ratioName(w, h)}` // a preset's ratio is on the Format pill
    label.textContent = `crop ${w}×${h}${free}${l + t + r + b ? ` → ${w + l + r}×${h + t + b}` : ""}`
    ctx.setTransform(Q, 0, 0, Q, 0, 0)
    const { box: [a0, b0, a1, b1], frame: [f0, g0, f1, g1] } = rects(), bw = a1 - a0, bh = b1 - b0
    const pw = s.W * view.k, ph = s.H * view.k
    ctx.save()
    ctx.translate(view.cx, view.cy)
    ctx.rotate((s.angle * Math.PI) / 180)
    ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph)
    ctx.beginPath()
    ctx.rect(-pw / 2, -ph / 2, pw, ph) // the turned picture, kept as the clip below
    ctx.restore()
    ctx.save()
    ctx.clip()
    ctx.fillStyle = "rgba(0,0,0,.55)" // the picture outside the box is left out
    ctx.beginPath()
    ctx.rect(0, 0, CW, CH)
    ctx.rect(a0, b0, bw, bh)
    ctx.fill("evenodd")
    ctx.restore()
    if (oval) {
      // MyNode.svg's face template on the box: the face goes in the dotted oval, the rest of the box is darker
      const cx = a0 + oval[0] * bw, cy = b0 + oval[1] * bh, rx = oval[2] * bw * sc, ry = oval[3] * bh * sc
      ctx.beginPath()
      ctx.rect(a0, b0, bw, bh)
      ctx.moveTo(cx + rx, cy)
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(0,0,0,.456)"
      ctx.fill("evenodd")
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.setLineDash([1.2, 5])
      ctx.lineCap = "round"
      ctx.lineWidth = 1.3
      ctx.strokeStyle = LIME
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineCap = "butt"
    } else if (drag) {
      ctx.beginPath() // Windows' thirds while the box changes
      for (const k of [1 / 3, 2 / 3]) {
        ctx.moveTo(a0 + k * bw, b0)
        ctx.lineTo(a0 + k * bw, b1)
        ctx.moveTo(a0, b0 + k * bh)
        ctx.lineTo(a1, b0 + k * bh)
      }
      ctx.strokeStyle = "rgba(255,255,255,.45)"
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.strokeStyle = LIME
    ctx.lineWidth = 1
    ctx.strokeRect(a0 + 0.5, b0 + 0.5, bw - 1, bh - 1)
    if (l + t + r + b) {
      ctx.setLineDash([4, 3]) // the padded frame: what comes out, gray past the box
      ctx.strokeRect(f0 + 0.5, g0 + 0.5, f1 - f0 - 1, g1 - g0 - 1)
      ctx.setLineDash([])
    }
    // Windows' handles, just outside the box's line: an L on each corner, a bar in the middle of each side
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2, L = 14, B = 8
    ctx.beginPath()
    for (const [x, y, i, j] of [[a0 - 1.5, b0 - 1.5, 1, 1], [a1 + 1.5, b0 - 1.5, -1, 1], [a0 - 1.5, b1 + 1.5, 1, -1], [a1 + 1.5, b1 + 1.5, -1, -1]]) {
      ctx.moveTo(x + i * L, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y + j * L)
    }
    for (const [x, y, i, j] of [[am, b0 - 1.5, 1, 0], [am, b1 + 1.5, 1, 0], [a0 - 1.5, bm, 0, 1], [a1 + 1.5, bm, 0, 1]]) {
      ctx.moveTo(x - i * B, y - j * B)
      ctx.lineTo(x + i * B, y + j * B)
    }
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.lineWidth = 1
    ctx.fillStyle = LIME
    ctx.strokeStyle = INK
    for (const { kind, x, y } of handles()) {
      if (kind !== "pad") continue
      ctx.beginPath()
      diamond(x, y)
      ctx.fill()
      ctx.stroke()
    }
    if (drag?.h.kind !== "turn") return
    ctx.font = "bold 13px Arial" // the angle while Alt+drag turns the picture; top left, clear of the top diamond
    ctx.fillText(`${s.angle.toFixed(1)}°`, 4, 13)
  }

  /** The crop as it comes out, small, into a canvas: the picture in its box, gray past it, and with mask the gray
   *  outside the face oval too (facetest's preview; what Python's crop_edit.apply and the mask give). */
  const mini = (out, mask) => {
    const c = out.getContext("2d")
    out.width = out.clientWidth * Q
    out.height = out.clientHeight * Q
    if (!s) return
    const [x, y, w, h] = s.box, [l, t, r, b] = s.pad, k = Math.min(out.width / (w + l + r), out.height / (h + t + b))
    c.translate((out.width - (w + l + r) * k) / 2, (out.height - (h + t + b) * k) / 2)
    c.scale(k, k)
    c.fillStyle = "rgb(128,128,128)" // crop_edit.GRAY
    c.fillRect(0, 0, w + l + r, h + t + b)
    c.save()
    c.translate(l - x, t - y)
    c.beginPath()
    c.rect(x, y, w, h)
    c.clip()
    c.translate(s.cw / 2, s.ch / 2)
    c.rotate((s.angle * Math.PI) / 180)
    c.drawImage(img, -s.W / 2, -s.H / 2, s.W, s.H)
    c.restore()
    const oval = mask && OVAL[s.ratio]
    if (!oval) return
    const sc = Math.min(s.oval, ovalMax(oval))
    c.beginPath()
    c.rect(l, t, w, h)
    c.moveTo(l + (oval[0] + oval[2] * sc) * w, t + oval[1] * h)
    c.ellipse(l + oval[0] * w, t + oval[1] * h, oval[2] * w * sc, oval[3] * h * sc, 0, 0, Math.PI * 2)
    c.fill("evenodd")
  }

  const choose = (key) => {
    if (!s) return
    s.ratio = key
    if (aspect()) s.box = withRatio(s.box, aspect(), s.cw, s.ch)
    settle = true // the view glides to the new frame, as after a handle
    save()
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect()
    return [((e.clientX - r.left) * CW) / r.width, ((e.clientY - r.top) * CH) / r.height]
  }
  canvas.addEventListener("pointerdown", (e) => {
    const h = e.button === 0 && s && (e.altKey ? { kind: "turn" } : hit(local(e))) // Alt: anywhere turns the picture
    if (!h) return
    e.preventDefault()
    e.stopPropagation()
    cancelAnimationFrame(tween) // the view stops where it is shown
    canvas.setPointerCapture(e.pointerId)
    drag = { h, p0: local(e), s0: structuredClone(s) }
  })
  // the wheel over the editor zooms the picture under the frame about the pointer, as Windows does; with Alt it turns
  // the picture a degree a notch, with Ctrl on a face template it sizes the oval. Taken on window before anyone: Nodes
  // 2.0's node pane hands every Ctrl wheel, and an unfocused plain one, to the graph (frontend useCanvasInteractions).
  // Ctrl elsewhere and sideways stay the graph's
  window.addEventListener("wheel", (e) => {
    const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey
    if (e.target !== canvas || !s || drag || Math.abs(e.deltaX) > Math.abs(e.deltaY) || (ctrl && !OVAL[s.ratio])) return
    e.preventDefault()
    e.stopPropagation()
    const step = (e.deltaMode === 1 ? 33 : 1) * e.deltaY
    if (e.altKey) {
      turnTo(s.angle + step / 100)
    } else if (ctrl) {
      s.oval = Math.round(clamp(s.oval * Math.exp(-step * 0.001), 0.3, ovalMax(OVAL[s.ratio])) * 1000) / 1000 // ±10%
    } else {
      const [mx, my] = local(e), f = Math.exp(step * 0.0015) // a notch ±15%
      s.box = zoomAt(s.box, s.cw / 2 + (mx - view.cx) / view.k, s.ch / 2 + (my - view.cy) / view.k, f, s.cw, s.ch)
      if (aspect()) s.box = withRatio(s.box, aspect(), s.cw, s.ch) // rounding w and h apart must not walk it off
    }
    save()
  }, { capture: true, passive: false, signal })
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      move(local(e), e.shiftKey)
      paint()
      return
    }
    const h = s && hit(local(e))
    canvas.style.cursor = e.altKey ? "grab" : !h ? "" : h.kind === "move" ? "move" : CURSOR[h.d]
  })
  const end = () => {
    if (!drag) return
    const changed = JSON.stringify(drag.s0) !== JSON.stringify(s)
    settle = drag.h.kind !== "move" // a handle let go: the view glides to the new frame, as in Windows
    drag = null
    if (changed) save()
    else draw()
  }
  canvas.addEventListener("pointerup", end)
  canvas.addEventListener("lostpointercapture", end)

  function draw() {
    if (drag) return
    load()
    cancelAnimationFrame(tween)
    const from = settle && s && view, to = s && fit()
    settle = false
    view = to || view
    if (!from) return paint()
    const t0 = performance.now()
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 180), e = 1 - (1 - t) ** 3
      view = { k: from.k + (to.k - from.k) * e, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e }
      paint()
      if (t < 1) tween = requestAnimationFrame(step)
    }
    tween = requestAnimationFrame(step)
  }
  return { canvas, label, draw, choose, mini, preset: () => s?.ratio }
}
