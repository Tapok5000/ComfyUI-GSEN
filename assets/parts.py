"""Small nodes the FACE graph expands into. Dev-only, so they stay out of the node library."""
import json
import logging
import math
import urllib.request
from urllib.parse import urlencode

import torch.nn.functional as F

from comfy_api.latest import io

from ..common import save_images, save_text
from . import crop_edit, faces, krea2_edit


class FaceCrop(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_FaceCrop", category="GSEN", is_dev_only=True,
                         inputs=[io.Image.Input("image")], outputs=[io.Image.Output()])

    @classmethod
    def execute(cls, image):
        return io.NodeOutput(faces.crop_face(image))


class CropRotatePad(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_CropRotatePad", category="GSEN", is_dev_only=True,
                         inputs=[io.Image.Input("image"), io.String.Input("crop")], outputs=[io.Image.Output()])

    @classmethod
    def execute(cls, image, crop):
        return io.NodeOutput(crop_edit.apply(image, json.loads(crop)))


class Krea2Patch(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_Krea2Patch", category="GSEN", is_dev_only=True,
                         inputs=[io.Model.Input("model"), io.Vae.Input("vae"), io.Image.Input("image"),
                                 io.Latent.Input("target"), io.Float.Input("ref_boost", default=1.0, min=0.0, max=1000.0)],
                         outputs=[io.Model.Output()])

    @classmethod
    def execute(cls, model, vae, image, target, ref_boost):
        return io.NodeOutput(krea2_edit.patch(model, vae, image, target, ref_boost))


class Krea2Encode(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_Krea2Encode", category="GSEN", is_dev_only=True,
                         inputs=[io.Clip.Input("clip"), io.Image.Input("image"), io.String.Input("prompt", multiline=True),
                                 io.Int.Input("grounding_px", default=768, min=0, max=4096)],
                         outputs=[io.Conditioning.Output()])

    @classmethod
    def execute(cls, clip, image, prompt, grounding_px):
        return io.NodeOutput(krea2_edit.encode(clip, image, prompt, grounding_px))


_failed = set()  # texts whose translation failed: translate again next run instead of reusing the cached error


class Translate(io.ComfyNode):
    """EN -> RU through Google Translate, the service 444.json's Text_Translation_V2 used. Needs internet."""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_Translate", category="GSEN", is_dev_only=True,
                         inputs=[io.String.Input("text", multiline=True)], outputs=[io.String.Output()])

    @classmethod
    def fingerprint_inputs(cls, text):
        return float("nan") if text in _failed else text

    @classmethod
    def execute(cls, text):
        if not text.strip():
            return io.NodeOutput("")
        query = urlencode({"client": "gtx", "sl": "en", "tl": "ru", "dt": "t"})
        req = urllib.request.Request("https://translate.googleapis.com/translate_a/single?" + query,
                                     data=urlencode({"q": text}).encode(), headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                ru = "".join(seg[0] for seg in json.load(r)[0] if seg and seg[0])
        except Exception as e:  # no internet / Google refused: the RU box says so, the image still comes out
            logging.warning("GSEN: translation failed: %s", e)
            _failed.add(text)
            return io.NodeOutput(f"[перевод недоступен: {e}]")
        _failed.discard(text)
        return io.NodeOutput(ru)


class Decode(io.ComfyNode):
    """VAE decode that also unpacks upscale VAEs (Wan2.1 2x: the decoder packs r*r pixels into the channels)."""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_Decode", category="GSEN", is_dev_only=True,
                         inputs=[io.Latent.Input("samples"), io.Vae.Input("vae")], outputs=[io.Image.Output()])

    @classmethod
    def execute(cls, samples, vae):
        images = vae.decode(samples["samples"])
        if images.ndim == 5:
            images = images.reshape(-1, *images.shape[-3:])
        if images.min() < -0.1:  # raw decoder range: some core versions skip process_output here
            images = ((images.float() + 1) / 2).clamp(0, 1)
        c = images.shape[-1]
        if c > 3:
            images = F.pixel_shuffle(images.movedim(-1, 1), math.isqrt(c // 3)).movedim(1, -1)
        return io.NodeOutput(images)


class Show(io.ComfyNode):
    """Saves the result and sends one UI message with it, RU and EN (separate messages would overwrite each other).
    info: the sampling settings, JSON; saved in the PNG with the prompt for Settings → Gallery."""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_Show", category="GSEN", is_output_node=True, is_dev_only=True,
                         inputs=[io.Image.Input("images"), io.String.Input("ru", force_input=True),
                                 io.String.Input("en", force_input=True), io.String.Input("save_to", default=""),
                                 io.String.Input("info", default="{}")],
                         outputs=[])

    @classmethod
    def execute(cls, images, ru, en, save_to="", info="{}"):
        meta = {**json.loads(info or "{}"), "en": en, "ru": ru}
        saved = save_images(images, save_to, cls, meta)
        # not "images": that key makes the frontend add its own preview widget and break the layout
        return io.NodeOutput(ui={"mn_images": saved, "ru": [ru], "en": [en], "mn_info": [meta]})


class LLMText(io.ComfyNode):
    """Settings → LLM's result: the text on the node, and a numbered .txt in SAVE."""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_LLMText", category="GSEN", is_output_node=True, is_dev_only=True,
                         inputs=[io.String.Input("text", force_input=True), io.String.Input("save_to", default="")],
                         outputs=[])

    @classmethod
    def execute(cls, text, save_to=""):
        save_text(text, save_to, "LLM")
        return io.NodeOutput(ui={"mn_llm": [text]})
