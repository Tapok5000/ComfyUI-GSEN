"""Output size, computed the way 123.json's resolution node did it."""
from PIL import Image

from .crop_edit import size as crop_size

# the Format row; "custom" = W x H
PRESETS = {
    "custom": None,
    "Instagram Portrait (4:5) - 1080x1350": (1080, 1350),
    "Instagram Square (1:1) - 1080x1080": (1080, 1080),
    "Widescreen (16:9) - 1344x768": (1344, 768),
    "TikTok (9:16) - 1080x1920": (1080, 1920),
    "CivitAI Cover (4:1) - 1600x400": (1600, 400),
    "2:3 (Portrait Photo) - 832x1248": (832, 1248),
    "3:2 (Photo) - 1248x832": (1248, 832),
    "3:4 (Portrait Standard) - 896x1152": (896, 1152),
    "4:3 (Standard) - 1152x896": (1152, 896),
    "21:9 (Ultrawide) - 1536x640": (1536, 640),
}


def target_size(path, from_image, preset, w, h, max_res, div=8, crop=None):
    """from_image: the input's aspect (after the preview's crop, if any), longer side = max_res (0 = its own size).
    Otherwise the preset (or W x H), shrunk to max_res if larger. Both floor to a multiple of div."""
    if from_image:
        with Image.open(path) as im:
            w, h = im.size
            if im.getexif().get(0x0112) in (5, 6, 7, 8):  # EXIF-rotated: LoadImage turns it upright
                w, h = h, w
        if crop:
            w, h = crop_size(w, h, crop)
        if max_res:
            s = max_res / max(w, h)
            w, h = round(w * s), round(h * s)
    else:
        w, h = PRESETS.get(preset) or (w, h)
        if max_res and max(w, h) > max_res:
            s = max_res / max(w, h)
            w, h = round(w * s), round(h * s)
    return max(div, w // div * div), max(div, h // div * div)
