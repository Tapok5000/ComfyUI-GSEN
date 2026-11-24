"""QW 21 UpScale's tiles: the picture enlarged to a size in megapixels, cut into tiles a model redraws one at a time, the
redrawn tiles joined back with blended seams and each one's colours kept to its source.

Adapted from ausboss-nodes 2.26.2, Tiled Upscale and Tiled Upscale Stitch (MIT License, copy in licenses/ausboss-nodes.txt).
Changes: no upscale model, no report; core lanczos (comfy.utils) instead of the pack's resampler. The plan and the joins
are unchanged.
"""
import math

import torch

import comfy.utils

TILE_SLACK, SNAP_SLACK = 1.125, 1.03  # a "2 MP" picture on a 32 px grid is often 2.05-2.1 MP: it stays one tile
NEAR_ENOUGH = 0.9  # a redraw capped by max_growth within 10% of the size asked for is redrawn at that size
MAX_TILE_ASPECT, MAX_TILES = 2.2, 144
COLOR_CELLS, COLOR_FLOOR, COLOR_GAIN_MAX = 32, 0.5, 3.0  # colours compared on 32-cell copies; LAB units
_D65, _DELTA = (0.95047, 1.0, 1.08883), 6.0 / 29.0
_RGB_TO_XYZ = ((0.4124564, 0.3575761, 0.1804375), (0.2126729, 0.7151522, 0.0721750), (0.0193339, 0.1191920, 0.9503041))
_XYZ_TO_RGB = ((3.2404542, -1.5371385, -0.4985314), (-0.9692660, 1.8760108, 0.0415560), (0.0556434, -0.2040259, 1.0572252))


def _half_up(value):
    return int(math.floor(value + 0.5))


def _snap(value, multiple):
    return max(multiple, _half_up(value / multiple) * multiple)


def _megapixel_size(width, height, megapixels, multiple):
    scale = math.sqrt(megapixels * 1e6 / (width * height))
    return _snap(max(1, _half_up(width * scale)), multiple), _snap(max(1, _half_up(height * scale)), multiple)


def _starts(length, tile, count):
    return [0] if count <= 1 or tile >= length else [_half_up(i * (length - tile) / (count - 1)) for i in range(count)]


def _side(length, count, overlap, multiple):
    if count <= 1:
        return length
    return max(multiple, min(length, math.ceil((length + (count - 1) * overlap) / count / multiple) * multiple))


def _grid(width, height, cap_pixels, overlap, multiple):
    """Fewest equal tiles of at most cap_pixels covering the picture, the squarest of those: columns, rows, w, h."""
    for count in range(1, MAX_TILES + 1):
        best = None
        for columns in (c for c in range(1, count + 1) if count % c == 0):
            rows = count // columns
            w, h = _side(width, columns, overlap, multiple), _side(height, rows, overlap, multiple)
            if w * h > cap_pixels or (count > 1 and max(w / h, h / w) > MAX_TILE_ASPECT):
                continue
            score = (abs(math.log(w / h)), columns)
            if best is None or score < best[0]:
                best = (score, columns, rows, w, h)
        if best:
            return best[1:]
    raise ValueError(f"UpScale would cut this picture into more than {MAX_TILES} tiles")


def plan(width, height, megapixels, tile_megapixels=2.0, overlap=128, multiple=32, max_growth=8.0):
    """The result size, the redraw size (capped at max_growth x the picture's megapixels), the tile size and every
    tile's box (left, top, right, bottom) in redraw pixels, row by row."""
    result = _megapixel_size(width, height, megapixels, multiple)
    limit = max(tile_megapixels, max_growth * width * height / 1e6)
    redraw = _megapixel_size(width, height, limit, multiple) if limit < megapixels * NEAR_ENOUGH else result
    columns, rows, tw, th = _grid(*redraw, tile_megapixels * TILE_SLACK * SNAP_SLACK * 1e6, overlap, multiple)
    xs, ys = _starts(redraw[0], tw, columns), _starts(redraw[1], th, rows)
    return {"result": result, "redraw": redraw, "tile": (tw, th), "boxes": [(x, y, x + tw, y + th) for y in ys for x in xs]}


def resize(image, width, height):
    """BHWC lanczos to width x height, untouched when it already is."""
    if image.shape[2] == width and image.shape[1] == height:
        return image
    return comfy.utils.common_upscale(image.movedim(-1, 1), width, height, "lanczos", "disabled").movedim(1, -1).clamp(0, 1)


def split(image, megapixels, **kw):
    """The tiles (a list, one redraw each) and the stitcher that joins them; the picture is enlarged the plain way."""
    image = image[..., :3].float()
    p = plan(image.shape[2], image.shape[1], megapixels, **kw)
    base = resize(image, *p["redraw"])
    tiles = [base[:, t:b, le:r, :].contiguous() for le, t, r, b in p["boxes"]]
    return tiles, {"plan": p, "tiles": tiles}


def _matrix(rows, like):
    return torch.tensor(rows, dtype=like.dtype, device=like.device)


def rgb_to_lab(rgb):
    rgb = rgb.clamp(0.0, 1.0)
    linear = torch.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    scaled = (linear @ _matrix(_RGB_TO_XYZ, rgb).T) / _matrix([_D65], rgb)
    f = torch.where(scaled > _DELTA**3, scaled.clamp_min(1e-12) ** (1.0 / 3.0), scaled / (3.0 * _DELTA**2) + 4.0 / 29.0)
    fx, fy, fz = f.unbind(-1)
    return torch.stack([116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)], dim=-1)


def lab_to_rgb(lab):
    lightness, a, b = lab.unbind(-1)
    fy = (lightness + 16.0) / 116.0
    f = torch.stack([fy + a / 500.0, fy, fy - b / 200.0], dim=-1)
    xyz = torch.where(f > _DELTA, f**3, 3.0 * _DELTA**2 * (f - 4.0 / 29.0)) * _matrix([_D65], lab)
    linear = (xyz @ _matrix(_XYZ_TO_RGB, lab).T).clamp_min(0.0)
    return torch.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1.0 / 2.4) - 0.055).clamp(0.0, 1.0)


def _averaged_lab(rgb):
    h, w = rgb.shape[1:3]
    s = COLOR_CELLS / max(h, w)
    small = torch.nn.functional.interpolate(rgb.movedim(-1, 1), size=(max(2, min(h, round(h * s))), max(2, min(w, round(w * s)))),
                                            mode="area")
    return rgb_to_lab(small.movedim(1, -1))


def keep_colors(tile, source, strength):
    """The redrawn tile brought to its source's colours: per LAB channel a straight-line fit on small averaged copies,
    so noise in an old photo doesn't count as colour (matching the spread instead doubled a pale noisy photo's saturation)."""
    mine, wanted = _averaged_lab(tile), _averaged_lab(source)
    mean, wanted_mean = mine.mean(dim=(1, 2), keepdim=True), wanted.mean(dim=(1, 2), keepdim=True)
    variance = ((mine - mean) ** 2).mean(dim=(1, 2), keepdim=True)
    shared = ((mine - mean) * (wanted - wanted_mean)).mean(dim=(1, 2), keepdim=True)
    gain = ((shared + COLOR_FLOOR**2) / (variance + COLOR_FLOOR**2)).clamp(0.0, COLOR_GAIN_MAX)
    return tile + (lab_to_rgb((rgb_to_lab(tile) - mean) * gain + wanted_mean) - tile) * strength


def _ramp(length, rise, fall):
    """Blend weights along a tile's side: up over rise px, down over fall px; a neighbour's fall and rise add up to 1."""
    weights = torch.ones(length)
    rise, fall = max(0, min(int(rise), length)), max(0, min(int(fall), length))
    if rise:
        weights[:rise] = torch.arange(1, rise + 1) / (rise + 1)
    if fall:
        weights[length - fall:] *= torch.arange(fall, 0, -1) / (fall + 1)
    return weights


def _shared(starts, size, start):
    i = starts.index(start)
    before = starts[i - 1] + size - start if i > 0 else 0
    after = start + size - starts[i + 1] if i + 1 < len(starts) else 0
    return max(0, before), max(0, after)


def stitch(redrawn, stitcher, strength=1.0):
    """One picture from its redrawn tiles (same order as split's), seams blended, at the result size."""
    p = stitcher["plan"]
    (rw, rh), (tw, th), boxes = p["redraw"], p["tile"], p["boxes"]
    if len(redrawn) != len(boxes):
        raise ValueError(f"UpScale got {len(redrawn)} tiles back for {len(boxes)}")
    lefts, tops = sorted({b[0] for b in boxes}), sorted({b[1] for b in boxes})
    total = torch.zeros((max(t.shape[0] for t in redrawn), rh, rw, 3))
    weight = torch.zeros((rh, rw))
    for back, source, (le, t, r, b) in zip(redrawn, stitcher["tiles"], boxes, strict=True):
        tile = resize(back[..., :3].float().cpu(), tw, th)
        if strength > 0:
            tile = keep_colors(tile, source.cpu()[:1] if source.shape[0] != tile.shape[0] else source.cpu(), strength)
        mask = _ramp(th, *_shared(tops, th, t))[:, None] * _ramp(tw, *_shared(lefts, tw, le))[None, :]
        total[:, t:b, le:r, :] += tile * mask[None, :, :, None]
        weight[t:b, le:r] += mask
    return resize((total / weight.clamp_min(1e-6)[None, :, :, None]).clamp(0, 1), *p["result"])
