"""QW 21 (Qwen-Image 2.1): BG and UpScale as the QW21_BG and QW21_UpSclae workflows run them, on core nodes plus our
tiles (tiles.py) and grain (parts.Look); SeedVR2 is ComfyUI's core one (comfy_extras/nodes_seedvr.py), not the
SeedVR2 pack the workflows used."""
import json
import math
from pathlib import Path

from . import tiles

BG = json.loads((Path(__file__).parent / "qw21_bg.json").read_text(encoding="utf-8"))  # {"negative", "presets": {name: prompt}}
RESTORE = ("Restore the photo: remove blur, noise and compression artifacts and recover sharp, natural detail, keeping the "
           "same composition, people and colors.")
UPSCALE_MP = 4.0  # the workflow's Tiled Upscale: 4 MP in tiles of up to 2 MP
SEEDVR2_SHORT, SEEDVR2_LONG = 2560, 4096  # its SeedVR2: the short side to 2560, the long one at most 4096
VAE_TILES = {"tile_size": 512, "overlap": 128, "temporal_size": 4096, "temporal_overlap": 8}  # core's SeedVR2 template


def bg_size(w, h, resolution):
    """The size TextEncodeQwenImage21 gives the first reference, so its latent and the result: ~resolution² on 32 px."""
    ratio = w / h
    return (max(32, round(math.sqrt(resolution * resolution * ratio) / 32) * 32),
            max(32, round(math.sqrt(resolution * resolution / ratio) / 32) * 32))


def seedvr2_size(w, h):
    s = min(SEEDVR2_SHORT / min(w, h), SEEDVR2_LONG / max(w, h))
    return round(w * s), round(h * s)


def models(g, unet, clip, vae, lora=None):
    model = g.node("UNETLoader", unet_name=unet, weight_dtype="default").out(0)
    if lora:
        model = g.node("LoraLoaderModelOnly", model=model, lora_name=lora, strength_model=1.0).out(0)
    model = g.node("QwenImage21Cache", model=model, device="auto", dtype="default").out(0)
    return (model, g.node("CLIPLoader", clip_name=clip, type="qwen_image", device="default").out(0),
            g.node("VAELoader", vae_name=vae).out(0))


def redraw(g, model, clip, vae, image, prompt, negative, resolution, seed, steps, sampler, scheduler):
    """One edit of image by prompt, on a latent of its own size (as TextEncodeQwenImage21 gives it)."""
    enc = g.node("TextEncodeQwenImage21", clip=clip, prompt=prompt, negative_prompt=negative, vae=vae, resolution=resolution,
                 **{"images.image_1": image})
    samples = g.node("KSampler", model=model, positive=enc.out(0), negative=enc.out(1), latent_image=enc.out(2), seed=seed,
                     steps=steps, cfg=1.0, sampler_name=sampler, scheduler=scheduler, denoise=1.0).out(0)
    return g.node("VAEDecode", samples=samples, vae=vae).out(0)


def seedvr2(g, image, size, seed, unet, vae_name):
    """Core SeedVR2 3B as its template runs it: one step on the picture resized to size, colours kept (lab)."""
    model = g.node("UNETLoader", unet_name=unet, weight_dtype="default").out(0)
    vae = g.node("VAELoader", vae_name=vae_name).out(0)
    resized = g.node("ImageScale", image=image, upscale_method="lanczos", width=size[0], height=size[1], crop="disabled").out(0)
    padded = g.node("SeedVR2Preprocess", resized_images=resized).out(0)
    latent = g.node("VAEEncodeTiled", pixels=padded, vae=vae, **VAE_TILES).out(0)
    cond = g.node("SeedVR2Conditioning", model=model, vae_conditioning=latent)
    samples = g.node("KSampler", model=model, positive=cond.out(0), negative=cond.out(1), latent_image=latent, seed=seed, steps=1,
                     cfg=1.0, sampler_name="euler", scheduler="simple", denoise=1.0).out(0)
    decoded = g.node("VAEDecodeTiled", samples=samples, vae=vae, **VAE_TILES).out(0)
    return g.node("SeedVR2PostProcessing", images=decoded, original_resized_images=resized, color_correction_method="lab").out(0)


def build(g, image, size, mode, seed, i):
    """BG or UpScale on the loaded picture (size: its w, h); i: the node's inputs. The result, its prompt and sampling."""
    k = "bg" if mode == "BG" else "up"  # each mode's own steps, sampler and scheduler
    sampling = (i[f"{k}_steps"], i[f"{k}_sampler"], i[f"{k}_scheduler"])
    model, clip, vae = models(g, i["qw_unet_name"], i["qw_clip_name"], i["qw_vae_name"], i["qw_lora_name"] if k == "up" else None)
    if mode == "BG":
        prompt = BG["presets"][i["bg_preset"]]
        out = redraw(g, model, clip, vae, image, prompt, BG["negative"], i["qw_resolution"], seed, *sampling)
        size = bg_size(*size, i["qw_resolution"])
    else:  # UpScale: the picture at 4 MP in tiles, each restored at its own size, joined with its colours kept
        prompt, split = RESTORE, g.node("MyNode_TiledUpscale", image=image, megapixels=UPSCALE_MP)
        redrawn = redraw(g, model, clip, vae, split.out(0), prompt, "", 0, seed, *sampling)
        out = g.node("MyNode_TiledStitch", redrawn=redrawn, stitcher=split.out(1)).out(0)
        size = tiles.plan(*size, UPSCALE_MP)["result"]
    if i["seedvr2"]:
        out = seedvr2(g, out, seedvr2_size(*size), seed, i["seedvr2_name"], i["seedvr2_vae"])
    if mode == "UpScale" and i["grain"]:
        out = g.node("MyNode_Look", image=out, seed=seed, camera=i["grain_preset"]).out(0)
    return out, prompt, sampling
