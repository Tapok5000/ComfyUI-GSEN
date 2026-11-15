"""Krea2 One (was FACE Processing): the 444.json pipeline (face crop + AI prompt + Krea2 identity edit + RU/EN) as one node.

execute() expands into ComfyUI core nodes plus this folder's small nodes (parts.py), so sampling,
caching and VRAM handling stay ComfyUI's own. No other node pack is needed. The CROP and AI switches
of 444.json pick the branch here, so the branch that is off is never built or run. A loaded .txt of
prompts gets one sampling branch per prompt on the same loaded models, all in one run.
"""
import json
import logging
import os
import re
from pathlib import Path

import comfy.samplers
import folder_paths
import nodes
from comfy_api.latest import io
from comfy_execution.graph_utils import GraphBuilder
from server import PromptServer

from ..common import Expansion, input_images
from . import crop_edit
from .sizes import PRESETS, target_size

# system prompts, a .txt each, one folder per task: the photo's (Settings → System), picture → prompt (LLM → System)
PROMPTS = Path(__file__).parent / "prompts"
IMG_TO_TEXT = PROMPTS / "img_to_text"


# The core nodes and inputs execute() builds its graph from. A ComfyUI update that renames one breaks Run, so
# core_problems() names it up front: in the startup log, as a toast, under Settings → Update.
CORE = {
    "LoadImage": ("image",),
    "UNETLoader": ("unet_name", "weight_dtype"),
    "LoraLoaderModelOnly": ("model", "lora_name", "strength_model"),
    "CLIPLoader": ("clip_name", "type", "device"),
    "VAELoader": ("vae_name",),
    "EmptyLatentImage": ("width", "height", "batch_size"),
    "ConditioningZeroOut": ("conditioning",),
    "KSampler": ("model", "positive", "negative", "latent_image", "seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"),
}
LLM_INPUTS = ("clip", "prompt", "max_length", "thinking", "use_default_template", "mtp", "system_prompt", "sampling_mode")


def core_problems():
    """What this ComfyUI lacks of those nodes and inputs, a line each; empty when everything is there."""
    new_core = "TextGenerateV2" in nodes.NODE_CLASS_MAPPINGS
    needed = {**CORE, ("TextGenerateV2" if new_core else "TextGenerate"): LLM_INPUTS + (("images",) if new_core else ("image",))}
    problems = []
    for name, wanted in needed.items():
        cls = nodes.NODE_CLASS_MAPPINGS.get(name)
        if cls is None:
            problems.append(f"{name}: no such node")
            continue
        spec = cls.INPUT_TYPES()
        have = {**spec.get("required", {}), **spec.get("optional", {})}
        if lost := [i for i in wanted if i not in have]:
            problems.append(f"{name}: no input {', '.join(lost)}")
        if name == "CLIPLoader" and "type" in have and "krea2" not in have["type"][0]:
            problems.append("CLIPLoader: no type krea2")
    return problems


def _prompt_files(folder):
    return sorted(p.name for p in folder.glob("*.txt"))


def _system_path(name, folder):
    """The chosen .txt of folder (the name only: a prompt can't point outside it); none chosen: the first one."""
    return folder / Path(name or next(iter(_prompt_files(folder)), "system.txt")).name


def _natural(name):
    """Sort key where the numbers count as numbers: v2 after v1_2, v10 after v9."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def _files(id, kind, needle):
    """A model combo; the default is the newest file whose name contains needle (the family 444.json used)."""
    options = folder_paths.get_filename_list(kind)
    family = [o for o in options if needle.lower() in o.lower()]
    default = max(family, key=_natural) if family else (options[0] if options else None)
    return io.Combo.Input(id, options=options, default=default)


# web/assets/index.js counts prompts with the same two rules
DASHES = re.compile(r"^[ \t]*-{3,}[ \t]*\r?$", re.M)
BLANK_LINES = re.compile(r"\n\s*\n")
LORA_TAG = re.compile(r"\s*<lora:([^:>]+)(?::([^:>]*))?[^>]*>", re.I)


def _prompts(txt):
    """The prompts of a loaded .txt: split by lines of dashes (---) if it has any, else by blank lines."""
    return [p.strip() for p in (DASHES if DASHES.search(txt) else BLANK_LINES).split(txt) if p.strip()]


def _stem(path):
    return os.path.splitext(os.path.basename(path.replace("\\", "/")))[0].lower()


def _lora_tags(prompt, files):
    """A1111 <lora:name:strength> tags: [(name, file or None, strength)] and the prompt without them."""
    tags = [(n.strip(), files.get(n.strip().lower()) or files.get(_stem(n)), float(s or 1)) for n, s in LORA_TAG.findall(prompt)]
    return (LORA_TAG.sub("", prompt).strip() if tags else prompt), tags


def _generate(g, llm, image, prompt, system):
    """The AI step: the LLM writes the prompt from the picture. Core before 0.44 has only TextGenerate, with one
    "image" input instead of the "images" list."""
    new_core = "TextGenerateV2" in nodes.NODE_CLASS_MAPPINGS
    generate, image_in = ("TextGenerateV2", "images.image1") if new_core else ("TextGenerate", "image")
    return g.node(generate, clip=llm, prompt=prompt, max_length=300, thinking=True, use_default_template=True, mtp="auto",
                  system_prompt=system, **{image_in: image, "sampling_mode": "on", "sampling_mode.temperature": 0.35,
                                           "sampling_mode.top_k": 40, "sampling_mode.top_p": 0.9, "sampling_mode.min_p": 0.0,
                                           "sampling_mode.repetition_penalty": 1.03, "sampling_mode.seed": 2302131607,
                                           "sampling_mode.presence_penalty": 0.0}).out(0)


class FaceProcessing(io.ComfyNode):
    # input order = widgets_values order in saved workflows: append new inputs at the end, never reorder
    @classmethod
    def define_schema(cls):
        prompts, to_text = _prompt_files(PROMPTS), _prompt_files(IMG_TO_TEXT)
        return io.Schema(
            node_id="MyNode_FaceProcessing",
            display_name="Krea2 One (GSEN)",  # GSEN in the name: the search box ranks by names, not by category or aliases
            search_aliases=["FACE Processing"],  # its name before 1.4.1
            category="🟩 GSEN",
            description="Face crop + AI prompt + Krea2 identity edit + RU/EN in one node.",
            is_output_node=True,
            inputs=[
                io.Combo.Input("image", options=input_images()),
                io.String.Input("text", multiline=True, default=""),
                io.Int.Input("seed", default=801071900, min=0, max=0xffffffffffffffff),
                io.Int.Input("steps", default=8, min=1, max=200),
                io.Combo.Input("sampler_name", options=comfy.samplers.KSampler.SAMPLERS, default="euler"),
                io.Combo.Input("scheduler", options=comfy.samplers.KSampler.SCHEDULERS, default="simple"),
                io.Boolean.Input("resolution_source", default=True, label_on="on", label_off="off",
                                 tooltip="Resize. On: W x H or a preset. Off: the input's own size, capped by max_resolution."),
                io.Combo.Input("aspect_ratio", options=list(PRESETS), default="custom"),
                io.Int.Input("custom_width", default=1024, min=16, max=16384, step=8),
                io.Int.Input("custom_height", default=1536, min=16, max=16384, step=8),
                io.Float.Input("ref_boost", default=2.0, min=0.0, max=1000.0, step=0.01),
                io.Int.Input("grounding_px", default=1024, min=0, max=4096, step=64),
                io.Int.Input("max_resolution", default=0, min=0, max=16384, step=8),
                _files("unet_name", "diffusion_models", "krea2_turbo"),
                _files("lora_name", "loras", "krea2_identity_edit"),
                _files("clip_name", "text_encoders", "qwen3vl_4b_int8"),
                _files("vae_name", "vae", "Wan2.1_VAE_upscale2x_imageonly"),
                _files("llm_name", "text_encoders", "qwen3VLInstruct4bHeretic"),
                io.Boolean.Input("face_crop", default=True, optional=True, label_on="on", label_off="off",
                                 tooltip="Cut the face out of the input for the LLM and the edit reference."),
                io.Boolean.Input("ai_prompt", default=False, optional=True, label_on="on", label_off="off",
                                 tooltip="On: the LLM rewrites the prompt from the image. Off: the prompt goes in as typed."),
                io.String.Input("save_to", default="Krea2One", optional=True,
                                tooltip="Where results go: a subfolder of ComfyUI's output or a full path. Empty: not saved."),
                io.String.Input("loras", default="[]", optional=True,
                                tooltip="More LoRAs after lora_name: JSON [[file, strength], ...]. Edited in Settings."),
                io.String.Input("prompt_file", default="", optional=True,
                                tooltip="Name of the .txt in prompts, shown on the node (since 1.7.0; a path before)."),
                io.String.Input("prompts", multiline=True, default="", optional=True,
                                tooltip="A loaded .txt (LOAD TXT): prompts split by --- lines or blank lines, an image each. "
                                        "Empty: text. <lora:name:strength> tags work in any prompt."),
                io.Boolean.Input("manual_crop", default=False, optional=True, label_on="on", label_off="off",
                                 tooltip="On: the input is turned, cropped and padded as set on its preview, before Face Crop."),
                io.String.Input("crop", default="", optional=True,
                                tooltip="The preview's crop: JSON {image, angle, box, pad} in pixels, used only for that image."),
                io.Combo.Input("system_file", options=prompts, default=next(iter(prompts), None), optional=True,
                               tooltip="The AI's system prompt for the photo: a .txt from assets/prompts (R lists new ones)."),
                io.String.Input("llm_save_to", default="IMGtext", optional=True,
                                tooltip="Where Settings → LLM keeps the prompts it writes, like save_to. Empty: not saved."),
                io.Combo.Input("llm_system_file", options=to_text, default=next(iter(to_text), None), optional=True,
                               tooltip="Settings → LLM's system prompt, picture → prompt: a .txt in assets/prompts/img_to_text."),
            ],
            outputs=[],  # the node shows its own result; no sockets, as in MyNode.svg
            enable_expand=True,
        )

    @classmethod
    def fingerprint_inputs(cls, image, system_file="", **_):
        # same name, new file -> rerun: the picture, and the system prompt the AI reads (edited in place)
        system = _system_path(system_file, PROMPTS)
        return os.path.getmtime(folder_paths.get_annotated_filepath(image)), system.stat().st_mtime if system.exists() else 0

    @classmethod
    def validate_inputs(cls, image=None):
        return True if image and folder_paths.exists_annotated_filepath(image) else f"Invalid image file: {image}"

    @classmethod
    def execute(cls, image, text, seed, steps, sampler_name, scheduler, resolution_source, aspect_ratio,
                custom_width, custom_height, ref_boost, grounding_px, max_resolution,
                unet_name, lora_name, clip_name, vae_name, llm_name, face_crop=True, ai_prompt=False, save_to="Krea2One",
                loras="[]", prompt_file="", prompts="", manual_crop=False, crop="", system_file="", **_):  # **_: the LLM tab's
        spec = crop_edit.spec_of(crop, image) if manual_crop else None
        width, height = target_size(folder_paths.get_annotated_filepath(image), not resolution_source, aspect_ratio,
                                    custom_width, custom_height, max_resolution, crop=spec)
        g = GraphBuilder()
        full = g.node("LoadImage", image=image).out(0)
        if spec:
            full = g.node("MyNode_CropRotatePad", image=full, crop=json.dumps(spec)).out(0)
        ref = g.node("MyNode_FaceCrop", image=full).out(0) if face_crop else full

        model = g.node("UNETLoader", unet_name=unet_name, weight_dtype="default").out(0)
        model = g.node("LoraLoaderModelOnly", model=model, lora_name=lora_name, strength_model=1.0).out(0)
        for name, strength in json.loads(loras or "[]"):
            model = g.node("LoraLoaderModelOnly", model=model, lora_name=name, strength_model=strength).out(0)
        clip = g.node("CLIPLoader", clip_name=clip_name, type="krea2", device="default").out(0)
        vae = g.node("VAELoader", vae_name=vae_name).out(0)
        llm = g.node("CLIPLoader", clip_name=llm_name, type="krea2", device="default").out(0) if ai_prompt else None
        system = _system_path(system_file, PROMPTS).read_text(encoding="utf-8") if ai_prompt else None
        info = json.dumps({"seed": seed, "steps": steps, "sampler": sampler_name, "scheduler": scheduler})
        latent = g.node("EmptyLatentImage", width=width, height=height, batch_size=1).out(0)

        files, missing = {_stem(f): f for f in folder_paths.get_filename_list("loras")}, set()
        for line in _prompts(prompts) if prompts.strip() else [text]:
            prompt, tags = _lora_tags(line, files)
            own = model  # this prompt's own LoRAs go on top of the ones every prompt gets
            for name, file, strength in tags:
                if file:
                    own = g.node("LoraLoaderModelOnly", model=own, lora_name=file, strength_model=strength).out(0)
                else:
                    missing.add(name)
            own = g.node("MyNode_Krea2Patch", model=own, vae=vae, image=ref, target=latent, ref_boost=ref_boost).out(0)
            if ai_prompt:
                prompt = _generate(g, llm, ref, prompt, system)
            ru = g.node("MyNode_Translate", text=prompt).out(0)
            pos = g.node("MyNode_Krea2Encode", clip=clip, image=ref, prompt=prompt, grounding_px=grounding_px).out(0)
            neg = g.node("ConditioningZeroOut", conditioning=pos).out(0)
            samples = g.node("KSampler", model=own, positive=pos, negative=neg, latent_image=latent, seed=seed,
                             steps=steps, cfg=1.0, sampler_name=sampler_name, scheduler=scheduler, denoise=1.0).out(0)
            result = g.node("MyNode_Decode", samples=samples, vae=vae).out(0)
            # a Show per prompt, not one at the end: a stopped batch keeps the images already made
            g.node("MyNode_Show", images=result, ru=ru, en=prompt, save_to=save_to, info=info)
        if missing:  # the batch still runs, so say which tags did nothing
            note = "LoRA not found, skipped: " + ", ".join(sorted(missing))
            logging.warning("GSEN: %s", note)
            PromptServer.instance.send_sync("mynode.toast", {"text": note})
        return Expansion(expand=g.finalize())


class LLMPrompt(io.ComfyNode):
    """Settings → LLM: the AI step alone. A picture and a picture → prompt system prompt (assets/prompts/img_to_text) in;
    the prompt the LLM writes is shown on the node and saved as a .txt in its SAVE (parts.LLMText). The face queues it
    on its own, outside the workflow."""

    @classmethod
    def define_schema(cls):
        return io.Schema(node_id="MyNode_LLM", category="🟩 GSEN", is_output_node=True, is_dev_only=True, enable_expand=True,
                         inputs=[io.String.Input("image"), io.String.Input("llm_name"),
                                 io.String.Input("system_file", default=""), io.String.Input("save_to", default="")],
                         outputs=[])

    @classmethod
    def fingerprint_inputs(cls, **_):
        # always expand anew: a cached expansion skips LLMText, and the face would never hear back
        return float("nan")

    @classmethod
    def validate_inputs(cls, image=None):
        return FaceProcessing.validate_inputs(image)

    @classmethod
    def execute(cls, image, llm_name, system_file="", save_to=""):
        g = GraphBuilder()
        picture = g.node("LoadImage", image=image).out(0)
        llm = g.node("CLIPLoader", clip_name=llm_name, type="krea2", device="default").out(0)
        text = _generate(g, llm, picture, "", _system_path(system_file, IMG_TO_TEXT).read_text(encoding="utf-8"))
        g.node("MyNode_LLMText", text=text, save_to=save_to)
        return Expansion(expand=g.finalize())
