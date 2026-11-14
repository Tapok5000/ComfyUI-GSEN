// Krea2 One's Crop, edited on its input preview: turn, crop box, padding. Same model as ausboss Image Crop + Rotate +
// Pad, and assets/crop_edit.py applies it: the picture turns clockwise on a canvas grown to fit, the box is cut from
// that canvas, the padding is gray. Saved as {angle, box: [x, y, w, h], pad: [left, top, right, bottom]} in pixels.
const LIME = "#c7f400", INK = "#070a10"
const CW = 306, CH = 447 // face.css .mn-pbox
const ROOM = 30 // around the picture for the handles and the turn knob
const OUT = 12 // padding handles sit this far outside the frame, clear of the box handles
const GRAB = 10, MIN = 16, Q = 2 // grab radius, smallest box side in picture pixels, canvas supersampling
const SIDES = { w: 0, n: 1, e: 2, s: 3 }
const CURSOR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize" }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const ratio = (w, h) => (w > h ? `${(w / h).toFixed(2)}:1` : `1:${(h / w).toFixed(2)}`)

/** The canvas PIL's rotate(expand=True) makes for a w x h picture turned by deg (crop_edit.py asks PIL itself). */
export function turnedSize(w, h, deg) {
  const r = (deg * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
  const side = (a, b) => Math.ceil(a / 2 + (a * c + b * s) / 2 - 1e-6) - Math.floor(a / 2 - (a * c + b * s) / 2 + 1e-6)
  return [side(w, h), side(h, w)]
}

/** img: the shown input; read(): its saved crop or null; write(crop) saves one. */
export function cropEditor(img, read, write) {
  const canvas = document.createElement("canvas"), label = document.createElement("div"), ctx = canvas.getContext("2d")
  canvas.className = "mn-cropcv"
  label.className = "mn-croplbl"
  let s = null, view = null, drag = null

  const fitBox = () => {
    const w = clamp(s.box[2], MIN, s.cw), h = clamp(s.box[3], MIN, s.ch)
    s.box = [clamp(s.box[0], 0, s.cw - w), clamp(s.box[1], 0, s.ch - h), w, h].map(Math.round)
  }
  const load = () => {
    const W = img.naturalWidth, H = img.naturalHeight, r = read() ?? {}
    if (!W) return void (s = null)
    const angle = clamp(+r.angle || 0, -180, 180), [cw, ch] = turnedSize(W, H, angle)
    s = { W, H, angle, cw, ch, box: [...(r.box ?? [0, 0, cw, ch])], pad: [...(r.pad ?? [0, 0, 0, 0])] }
    fitBox()
  }
  // where the turned picture's centre sits on screen and how big a picture pixel is; held still while dragging
  const fit = () => {
    const [x, y, w, h] = s.box, [l, t, r, b] = s.pad
    const x0 = Math.min(0, x - l), y0 = Math.min(0, y - t), x1 = Math.max(s.cw, x + w + r), y1 = Math.max(s.ch, y + h + b)
    const k = Math.min((CW - 2 * ROOM) / (x1 - x0), (CH - 2 * ROOM) / (y1 - y0))
    return { k, cx: CW / 2 + (s.cw / 2 - (x0 + x1) / 2) * k, cy: CH / 2 + (s.ch / 2 - (y0 + y1) / 2) * k }
  }
  const at = (x, y) => [view.cx + (x - s.cw / 2) * view.k, view.cy + (y - s.ch / 2) * view.k]
  const rects = () => {
    const [x, y, w, h] = s.box, [l, t, r, b] = s.pad
    return { box: [...at(x, y), ...at(x + w, y + h)], frame: [...at(x - l, y - t), ...at(x + w + r, y + h + b)] }
  }
  const handles = () => {
    const { box: [a0, b0, a1, b1], frame: [f0, g0, f1, g1] } = rects(), o = OUT * 0.7
    const am = (a0 + a1) / 2, bm = (b0 + b1) / 2, fm = (f0 + f1) / 2, gm = (g0 + g1) / 2
    return [
      { kind: "turn", x: clamp(f1 + o + 20, 12, CW - 12), y: clamp(g0 - o - 20, 12, CH - 12) },
      ...[["w", f0 - OUT, gm], ["e", f1 + OUT, gm], ["n", fm, g0 - OUT], ["s", fm, g1 + OUT],
        ["nw", f0 - o, g0 - o], ["ne", f1 + o, g0 - o], ["sw", f0 - o, g1 + o], ["se", f1 + o, g1 + o]]
        .map(([d, x, y]) => ({ kind: "pad", d, x, y })),
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
    const [a0, b0, a1, b1] = rects().box
    return best ?? (px > a0 && px < a1 && py > b0 && py < b1 ? { kind: "move" } : null)
  }

  const move = (p, shift) => {
    const { h, p0, s0 } = drag, dx = (p[0] - p0[0]) / view.k, dy = (p[1] - p0[1]) / view.k
    s = structuredClone(s0)
    if (h.kind === "turn") {
      const turned = Math.atan2(p[1] - view.cy, p[0] - view.cx) - Math.atan2(p0[1] - view.cy, p0[0] - view.cx)
      let a = ((s0.angle + (turned * 180) / Math.PI + 540) % 360) - 180
      const step = shift ? 15 : 90 // Shift: 15° steps; otherwise only a right angle within 2° pulls it in
      if (shift || Math.abs(a - Math.round(a / step) * step) < 2) a = Math.round(a / step) * step
      s.angle = Math.round(a * 10) / 10
      ;[s.cw, s.ch] = turnedSize(s.W, s.H, s.angle)
      s.box[0] += (s.cw - s0.cw) / 2 // the box keeps its place against the picture's centre
      s.box[1] += (s.ch - s0.ch) / 2
    } else if (h.kind === "move") {
      s.box[0] += dx
      s.box[1] += dy
    } else if (h.kind === "box") {
      let [x0, y0, x1, y1] = [s0.box[0], s0.box[1], s0.box[0] + s0.box[2], s0.box[1] + s0.box[3]]
      if (h.d.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN)
      if (h.d.includes("e")) x1 = clamp(x1 + dx, x0 + MIN, s.cw)
      if (h.d.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN)
      if (h.d.includes("s")) y1 = clamp(y1 + dy, y0 + MIN, s.ch)
      s.box = [x0, y0, x1 - x0, y1 - y0]
    } else {
      const out = { w: -dx, e: dx, n: -dy, s: dy } // dragging a side outward adds gray there
      for (const c of h.d) s.pad[SIDES[c]] = Math.max(0, Math.round(s0.pad[SIDES[c]] + out[c]))
    }
    fitBox()
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
    label.textContent = `crop ${w}×${h} · ${ratio(w, h)}${l + t + r + b ? ` → ${w + l + r}×${h + t + b}` : ""}`
    ctx.setTransform(Q, 0, 0, Q, 0, 0)
    const { box: [a0, b0, a1, b1], frame: [f0, g0, f1, g1] } = rects(), o = OUT * 0.7
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
    ctx.rect(a0, b0, a1 - a0, b1 - b0)
    ctx.fill("evenodd")
    ctx.restore()
    ctx.strokeStyle = LIME
    ctx.lineWidth = 1
    ctx.strokeRect(a0 + 0.5, b0 + 0.5, a1 - a0 - 1, b1 - b0 - 1)
    ctx.lineWidth = 2
    for (const [x, y, i, j] of [[f0 - o, g0 - o, 1, 1], [f1 + o, g0 - o, -1, 1], [f0 - o, g1 + o, 1, -1], [f1 + o, g1 + o, -1, -1]]) {
      ctx.beginPath()
      ctx.moveTo(x + i * 10, y)
      ctx.lineTo(x, y)
      ctx.lineTo(x, y + j * 10)
      ctx.stroke()
    }
    // box handles are squares, side padding handles diamonds (the frame corners are the brackets above)
    const [knob, ...rest] = handles()
    ctx.lineWidth = 1
    ctx.fillStyle = LIME
    ctx.strokeStyle = INK
    for (const { kind, d, x, y } of rest) {
      ctx.beginPath()
      if (kind === "box") ctx.rect(x - 3.5, y - 3.5, 7, 7)
      else if (d.length === 1) diamond(x, y)
      else continue
      ctx.fill()
      ctx.stroke()
    }
    ctx.strokeStyle = LIME
    ctx.beginPath()
    ctx.moveTo(f1 + o, g0 - o)
    ctx.lineTo(knob.x, knob.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(knob.x, knob.y, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = "bold 13px Arial"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("↻", knob.x, knob.y + 1)
    if (drag?.h.kind !== "turn") return
    ctx.fillStyle = LIME
    ctx.fillText(`${s.angle.toFixed(1)}°`, clamp(knob.x, 24, CW - 24), knob.y + (knob.y < 40 ? 24 : -20))
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect()
    return [((e.clientX - r.left) * CW) / r.width, ((e.clientY - r.top) * CH) / r.height]
  }
  canvas.addEventListener("pointerdown", (e) => {
    const h = e.button === 0 && s && hit(local(e))
    if (!h) return
    e.preventDefault()
    e.stopPropagation()
    canvas.setPointerCapture(e.pointerId)
    drag = { h, p0: local(e), s0: structuredClone(s) }
  })
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      move(local(e), e.shiftKey)
      paint()
      return
    }
    const h = s && hit(local(e))
    canvas.style.cursor = !h ? "" : h.kind === "move" ? "move" : h.kind === "turn" ? "grab" : CURSOR[h.d]
  })
  const end = () => {
    if (!drag) return
    const changed = JSON.stringify(drag.s0) !== JSON.stringify(s)
    drag = null
    if (changed) write({ angle: s.angle, box: s.box, pad: s.pad })
    else draw()
  }
  canvas.addEventListener("pointerup", end)
  canvas.addEventListener("lostpointercapture", end)

  function draw() {
    if (drag) return
    load()
    if (s) view = fit()
    paint()
  }
  return { canvas, label, draw }
}
