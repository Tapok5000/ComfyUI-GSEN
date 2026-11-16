"""Krea2 One's Crop: turn, crop and pad the input before everything else, as set on its preview (web/assets/crop.js).

Same model as ausboss Image Crop + Rotate + Pad: the picture turns clockwise on a canvas grown to fit it, the box
is cut from that canvas, and the padding around the box plus the corners the turn leaves empty are gray.
The preview saves {"image", "angle", "box": [x, y, w, h], "pad": [left, top, right, bottom]} in pixels, and "ratio"
and "oval" (the preset it keeps the box at, its face oval's size), which only face_oval reads besides the preview.
"""
import json

import numpy as np
import torch
from PIL import Image

GRAY = (128, 128, 128)  # ausboss's default fill
MAX_PAD = 8192  # per side: the JSON comes from the prompt, and a huge pad would be a huge canvas
# MyNode.svg's face templates ("1 1", "2:3"), the same numbers as crop.js OVAL: the oval's middle and half axes in parts
# of the box
OVAL = {"face 1:1": (0.5, 0.4358, 0.2467, 0.3026), "face 2:3": (0.5, 0.3861, 0.2962, 0.2927)}
FEATHER = 0.45  # Mask's soft edge, a part of the oval's radius: half inside its line, half outside (crop.js has it too)


def spec_of(crop, image):
    """The preview's crop when it was set on this image, cleaned up; None when there is none."""
    try:
        spec = json.loads(crop or "null")
        if not isinstance(spec, dict) or spec.get("image") != image:
            return None
        box = [round(float(v)) for v in spec["box"]] if spec.get("box") else None
        pad = [min(MAX_PAD, max(0, round(float(v)))) for v in spec.get("pad") or (0, 0, 0, 0)]
        angle = min(180.0, max(-180.0, float(spec.get("angle") or 0)))
    except (TypeError, ValueError):
        return None
    if len(pad) != 4 or (box and len(box) != 4):
        return None
    return {"image": image, "angle": angle, "box": box, "pad": pad}


def _box(spec, cw, ch):
    """The box inside the turned canvas; no box = all of it."""
    x, y, w, h = spec["box"] or (0, 0, cw, ch)
    w, h = min(max(w, 1), cw), min(max(h, 1), ch)
    return min(max(x, 0), cw - w), min(max(y, 0), ch - h), w, h


def _turn(im, spec):
    return im.rotate(-spec["angle"], Image.Resampling.BICUBIC, expand=True, fillcolor=GRAY) if spec["angle"] else im


def size(w, h, spec):
    """The output size for a w x h input; the canvas size comes from PIL itself, so it matches apply()."""
    turned = Image.new("L", (w, h)).rotate(-spec["angle"], expand=True).size if spec["angle"] else (w, h)
    *_, bw, bh = _box(spec, *turned)
    left, top, right, bottom = spec["pad"]
    return bw + left + right, bh + top + bottom


def face_oval(crop, image):
    """The face template's oval the preview set on this image, as crop.js draws it: (x, y, rx, ry) in parts of the box,
    its size (Ctrl+wheel) applied and kept inside the box; None when the crop has no face template."""
    try:
        raw = json.loads(crop or "null")
        oval = OVAL.get(raw.get("ratio")) if isinstance(raw, dict) and raw.get("image") == image else None
        scale = float(raw.get("oval") or 1) if oval else 1.0
    except (TypeError, ValueError):
        return None
    if not oval:
        return None
    x, y, rx, ry = oval
    scale = min(max(scale, 0.3), min(x, 1 - x) / rx, min(y, 1 - y) / ry)
    return x, y, rx * scale, ry * scale


def oval_mask(oval, pad, h, w):
    """MASK [1, h, w] of an h x w crop (its box and padding): 1 inside the oval on the box, fading to 0 across its line
    over FEATHER of the radius (smoothstep): Mask's ref_boost holds on the whole face and fades out softly."""
    x, y, rx, ry = oval
    left, top, right, bottom = pad
    bw, bh = w - left - right, h - top - bottom
    dy = (np.arange(h, dtype=np.float32)[:, None] + 0.5 - (top + y * bh)) / (ry * bh)
    dx = (np.arange(w, dtype=np.float32)[None, :] + 0.5 - (left + x * bw)) / (rx * bw)
    m = np.clip(0.5 + (1 - np.sqrt(dx * dx + dy * dy)) / FEATHER, 0, 1)
    return torch.from_numpy(m * m * (3 - 2 * m))[None]


def apply(image, spec):
    """IMAGE batch -> the same batch turned, cropped and padded."""
    out = []
    for frame in image:
        im = _turn(Image.fromarray(np.clip(255.0 * frame.float().cpu().numpy(), 0, 255).astype(np.uint8)).convert("RGB"), spec)
        x, y, w, h = _box(spec, *im.size)
        left, top, right, bottom = spec["pad"]
        canvas = Image.new("RGB", (w + left + right, h + top + bottom), GRAY)
        canvas.paste(im.crop((x, y, x + w, y + h)), (left, top))
        out.append(torch.from_numpy(np.array(canvas).astype(np.float32) / 255.0))
    return torch.stack(out)
