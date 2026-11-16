"""Krea 2 identity edit: source patch + image-grounded prompt encode, on bare ComfyUI.

Adapted from comfyui-krea2edit 1.2.5 (Apache License 2.0, copy in licenses/krea2edit.txt). Changes: trimmed to
the path 444.json runs (one source image with vae -> pixel path, fit_mode "fit", stride-1 positions, ref_position
aligned or beside, ref_boost);
the source is encoded before sampling (what krea2edit does when target_latent is wired); ref_boost can act on a
mask's part of the source only (ours, like ref_boost_mask in RedNodeAI's Krea 2 nodes); beside follows _place_refs of
comfyui-krea2edit 2.0.0 (same license). The math is otherwise unchanged.
"""
import math

import torch
import torch.nn.functional as F
from einops import rearrange

import comfy.ldm.common_dit
import comfy.patcher_extension
import comfy.utils
from comfy.ldm.flux.layers import timestep_embedding

TEMPLATE = (
    "<|im_start|>system\nDescribe the image by detailing the color, shape, size, texture, quantity, text, "
    "spatial relationships of the objects and background:<|im_end|>\n<|im_start|>user\n"
    "<|vision_start|><|image_pad|><|vision_end|>{}<|im_end|>\n<|im_start|>assistant\n"
)
CROP_TOL = 0.08  # aspect gap under which the source fills the target grid by a small center crop


def encode(clip, image, prompt, grounding_px):
    """The edit prompt encoded together with the source image (Qwen3-VL sees both), as in training."""
    px = image.movedim(-1, 1)
    h, w = px.shape[-2:]
    if grounding_px and max(h, w) > grounding_px:
        s = grounding_px / max(h, w)
        px = comfy.utils.common_upscale(px, round(w * s), round(h * s), "area", "disabled")
    tokens = clip.tokenize(prompt, images=[px.movedim(1, -1)[..., :3]], llama_template=TEMPLATE)
    return clip.encode_from_tokens_scheduled(tokens)


def fit_geometry(ih, iw, px_h, px_w):
    """Crop box (y0, x0, h, w) and size (nh, nw) the source gets on a px_h x px_w target, as in training:
    near-matched aspect -> fills the target exactly; otherwise fits inside on the /16 grid, cropped so the
    scale stays exact (no squash)."""
    sc = min(px_h / ih, px_w / iw)
    if ih * sc >= px_h * (1 - CROP_TOL) and iw * sc >= px_w * (1 - CROP_TOL):
        s = max(px_h / ih, px_w / iw)
        ch, cw = min(ih, int(round(px_h / s))), min(iw, int(round(px_w / s)))
        nh, nw = px_h, px_w
    else:
        nh = min(max(16, int(ih * sc) // 16 * 16), max(16, px_h // 16 * 16))
        nw = min(max(16, int(iw * sc) // 16 * 16), max(16, px_w // 16 * 16))
        ch, cw = min(ih, max(1, int(round(nh / sc)))), min(iw, max(1, int(round(nw / sc))))
    return (ih - ch) // 2, (iw - cw) // 2, ch, cw, nh, nw


def fit_encode(image, vae, H, W):
    """The source resampled for a target latent of H x W (pixels: x8) and VAE-encoded."""
    img = image.movedim(-1, 1)
    y0, x0, ch, cw, nh, nw = fit_geometry(img.shape[-2], img.shape[-1], H * 8, W * 8)
    img = F.interpolate(img[..., y0:y0 + ch, x0:x0 + cw].float(), size=(nh, nw), mode="bicubic", antialias=True)
    return vae.encode(img.movedim(1, -1)[..., :3].clamp(0, 1))


def fit_mask(mask, H, W, size):
    """A [1, h, w] mask on the source image, cropped as fit_encode crops it and area-resized to its latent's size."""
    y0, x0, ch, cw, *_ = fit_geometry(*mask.shape[-2:], H * 8, W * 8)
    return F.interpolate(mask[None, :, y0:y0 + ch, x0:x0 + cw].float(), size=size, mode="area")


def _ids(bs, frame, h, w, device, off_h=0.0, off_w=0.0):
    ids = torch.zeros(h, w, 3, device=device, dtype=torch.float32)
    ids[..., 0] = frame
    ids[..., 1] = (torch.arange(h, device=device, dtype=torch.float32) + off_h)[:, None]
    ids[..., 2] = (torch.arange(w, device=device, dtype=torch.float32) + off_w)[None, :]
    return ids.reshape(1, h * w, 3).repeat(bs, 1, 1)


def _4d(v):
    # (B,C,T,H,W) -> (B*T,C,H,W); images have T=1
    return v.reshape(v.shape[0] * v.shape[2], v.shape[1], *v.shape[-2:]) if v.ndim == 5 else v


def forward(m, x, timesteps, context, src, transformer_options, ref_boost=1.0, mask=None, beside=False):
    """SingleStreamDiT._forward with the clean source prepended: [text | source (frame 1) | target (frame 0)].
    src is already on the target grid (fit_encode); a smaller one sits at a centered offset, stride 1.
    mask (fit_mask, src's size): where ref_boost acts, fading to none where it is 0; None: on all of src.
    beside: the source's columns start right of the target's (krea2edit's "beside (right of target)") instead of on
    them, so its layout, head angle and light stop pinning the result's."""
    patch = m.patch
    shape5 = x.shape if x.ndim == 5 else None
    x = _4d(x)
    bs, _, h0, w0 = x.shape
    x = comfy.ldm.common_dit.pad_to_patch_size(x, (patch, patch), padding_mode="replicate")
    h, w = x.shape[-2] // patch, x.shape[-1] // patch
    src = _4d(src).to(x.device, x.dtype)
    if src.shape[0] != bs:
        src = src[:1].expand(bs, *src.shape[1:])
    src = comfy.ldm.common_dit.pad_to_patch_size(src, (patch, patch), padding_mode="replicate")
    gh, gw = src.shape[-2] // patch, src.shape[-1] // patch

    def tokens(v):
        return m.first(rearrange(v, "b c (h ph) (w pw) -> b (h w) (c ph pw)", ph=patch, pw=patch))

    tgt, ref = tokens(x), tokens(src)
    t = m.tmlp(timestep_embedding(timesteps, m.tdim).unsqueeze(1).to(tgt.dtype))
    tvec = m.tproj(t)
    context = m.txtmlp(m.txtfusion(m._unpack_context(context), mask=None, transformer_options=transformer_options))
    txtlen, srclen = context.shape[1], ref.shape[1]
    combined = torch.cat([context, ref, tgt], dim=1)
    dev = combined.device
    src_ids = _ids(bs, 1, gh, gw, dev, max(0.0, (h - gh) / 2), float(w) if beside else max(0.0, (w - gw) / 2))
    freqs = m.pe_embedder(torch.cat([torch.zeros(bs, txtlen, 3, device=dev), src_ids, _ids(bs, 0, h, w, dev)], dim=1))

    bias = None
    if ref_boost != 1.0:  # target->source attention x ref_boost: an additive log bias on those logits
        n = combined.shape[1]
        bias = torch.zeros(1, 1, n, n, device=dev, dtype=combined.dtype)
        boost = math.log(max(ref_boost, 1e-4))
        if mask is not None:  # per source token: x ref_boost where the mask is 1, x1 (no bias) where it is 0
            mask = comfy.ldm.common_dit.pad_to_patch_size(mask.to(dev), (patch, patch), padding_mode="replicate")
            boost = torch.log1p((max(ref_boost, 1e-4) - 1) * F.avg_pool2d(mask, patch).flatten())
        bias[:, :, txtlen + srclen:, txtlen:txtlen + srclen] = boost
    for block in m.blocks:
        combined = block(combined, tvec, freqs, bias, transformer_options=transformer_options)

    out = m.last(combined, t)[:, txtlen + srclen:, :]
    out = rearrange(out, "b (h w) (c ph pw) -> b c (h ph) (w pw)", h=h, w=w, ph=patch, pw=patch, c=m.channels)[:, :, :h0, :w0]
    if shape5 is not None:
        out = out.reshape(shape5[0], shape5[2], m.channels, h0, w0).movedim(1, 2)
    return out


def patch(model, vae, image, target_latent, ref_boost, mask=None, beside=False):
    """Clone of a Krea2 model whose diffusion forward sees the source image (and ref_boost, on mask's part of it
    when there is one: [1, h, w] on the image; placed beside the target or on it, see forward). The source is
    encoded here, for the target size, so the VAE never loads mid-sampling."""
    m = model.clone()
    inner = model.model

    def encoded(size):  # the source latent for a target latent of this size, and the mask on its grid
        src = inner.process_latent_in(fit_encode(image, vae, *size))
        return src, None if mask is None else fit_mask(mask, *size, _4d(src).shape[-2:])

    hw = tuple(_4d(target_latent["samples"]).shape[-2:])
    cache = {hw: encoded(hw)}

    def wrapper(executor, x, timesteps, context, *args, **kwargs):
        # core passes transformer_options by name or as the last positional dict
        opts = kwargs.get("transformer_options")
        if opts is None:
            opts = next((a for a in reversed(args) if isinstance(a, dict)), {})
        size = tuple(_4d(x).shape[-2:])
        if size not in cache:  # sampled at another size than the target latent
            cache[size] = encoded(size)
        src, src_mask = cache[size]
        return forward(executor.class_obj, x, timesteps, context, src, opts, ref_boost, src_mask, beside)

    comfy.patcher_extension.add_wrapper_with_key(
        comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, "mynode_krea2_edit", wrapper,
        m.model_options.setdefault("transformer_options", {}))
    return m
