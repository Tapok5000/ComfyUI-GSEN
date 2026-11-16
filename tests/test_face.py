"""Self-check of FACE: Krea2 edit math, the reference, output size, result saving, LoRAs, a prompts .txt. CPU only, no models.

Run from the ComfyUI folder:
    cd E:\\ComfyUI_2026\\ComfyUI
    ..\\python_embeded\\python.exe custom_nodes\\ComfyUI-GSEN\\tests\\test_face.py
"""
import asyncio
import hashlib
import http.server
import importlib
import json
import math
import os
import re
import sys
import tempfile
import threading
import time
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

os.environ["CUDA_VISIBLE_DEVICES"] = ""  # leave the GPU to a running ComfyUI
PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACE = os.path.join(PACK, "assets")
sys.path[:0] = [os.getcwd(), PACK, FACE]  # ComfyUI root (the cwd), the pack, the node's folder

import torch  # noqa: E402
from aiohttp import web  # noqa: E402
from PIL import Image  # noqa: E402

from comfy.cli_args import args  # noqa: E402

args.cpu = True
import comfy.ops  # noqa: E402
import comfy.patcher_extension  # noqa: E402
import folder_paths  # noqa: E402
from comfy.ldm.krea2.model import SingleStreamDiT  # noqa: E402

# no running server: common.py's routes go into a throwaway table, messages to the browser into SENT
SENT = []
sys.modules["server"] = SimpleNamespace(PromptServer=SimpleNamespace(instance=SimpleNamespace(
    routes=web.RouteTableDef(), send_sync=lambda event, data, sid=None: SENT.append((event, data)))))
import krea2_edit  # noqa: E402
import nodes  # noqa: E402
import common  # noqa: E402
from common import save_images  # noqa: E402

target_size = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.sizes").target_size  # it imports crop_edit relatively
DAY = date.today().isoformat()  # results go into SAVE/<day>/


def tiny_dit():
    torch.manual_seed(0)
    m = SingleStreamDiT(features=64, tdim=32, txtdim=32, heads=4, kvheads=2, multiplier=2, layers=2, patch=2,
                        channels=4, txtlayers=3, txtheads=4, txtkvheads=4, operations=comfy.ops.disable_weight_init)
    for p in m.parameters():
        torch.nn.init.normal_(p, std=0.05)
    return m.eval()


def test_forward_matches_core():
    m = tiny_dit()
    x, src = torch.randn(1, 4, 8, 12), torch.randn(1, 4, 8, 12)
    t, ctx = torch.tensor([0.4]), torch.randn(1, 5, 3 * 32)
    with torch.no_grad():
        core = m._forward(x, t, ctx, ref_latents=[src], ref_latents_method="index", transformer_options={})
        ours = krea2_edit.forward(m, x, t, ctx, src, {}, ref_boost=1.0)
        boosted = krea2_edit.forward(m, x, t, ctx, src, {}, ref_boost=12.0)
        refit = krea2_edit.forward(m, x, t, ctx, torch.randn(1, 4, 13, 9), {}, ref_boost=12.0, mask=torch.rand(1, 1, 13, 9))
        whole = krea2_edit.forward(m, x, t, ctx, src, {}, ref_boost=12.0, mask=torch.ones(1, 1, 8, 12))
        none = krea2_edit.forward(m, x, t, ctx, src, {}, ref_boost=12.0, mask=torch.zeros(1, 1, 8, 12))
        placed, real_ids = [], krea2_edit._ids
        krea2_edit._ids = lambda *a: placed.append(a[2:]) or real_ids(*a)
        try:
            beside = krea2_edit.forward(m, x, t, ctx, torch.randn(1, 4, 6, 8), {}, ref_boost=1.0, beside=True)
        finally:
            krea2_edit._ids = real_ids
    # same model, same RoPE ids; the source block only sits before the target instead of after it
    assert torch.allclose(core, ours, atol=1e-5), (core - ours).abs().max()
    assert not torch.allclose(ours, boosted, atol=1e-4)
    assert refit.shape == x.shape  # an odd source grid: the mask is padded with it
    assert torch.allclose(whole, boosted, atol=1e-5) and torch.allclose(none, ours, atol=1e-5)  # mask 1: x12, 0: x1
    # beside: the 3x4 source grid keeps its centered rows and starts at column 6, right of the 4x6 target
    assert placed[0][:2] == (3, 4) and placed[0][3:] == (0.5, 6.0) and beside.shape == x.shape


def test_patch_mask():
    dit, t, ctx, image = tiny_dit(), torch.tensor([0.4]), torch.randn(1, 5, 3 * 32), torch.rand(1, 200, 160, 3)

    class Vae:  # Wan's latent, [B, C, T=1, h/8, w/8]; the same one for the same size
        def encode(self, img):
            g = torch.Generator().manual_seed(img.shape[1] * 1000 + img.shape[2])
            return torch.randn(img.shape[0], 4, 1, img.shape[1] // 8, img.shape[2] // 8, generator=g)

    class Model:
        model = SimpleNamespace(process_latent_in=lambda x: x)

        def __init__(self):
            self.model_options = {}

        def clone(self):
            return Model()

    def run(ref_boost, mask, x):  # one step of the patched model, through the wrapper sampling calls
        m = krea2_edit.patch(Model(), Vae(), image, {"samples": torch.zeros(1, 4, 1, 24, 20)}, ref_boost, mask)
        wrappers = m.model_options["transformer_options"]["wrappers"][comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL]
        with torch.no_grad():
            return wrappers["mynode_krea2_edit"][0](SimpleNamespace(class_obj=dit), x, t, ctx, {})

    for x in torch.randn(1, 4, 24, 20), torch.randn(1, 4, 17, 13):  # the target's size, and another one: encoded again
        off = run(2.0, torch.zeros(1, 200, 160), x)  # a mask of 0 everywhere: the boost reaches no token
        assert torch.allclose(off, run(1.0, None, x), atol=1e-5) and not torch.allclose(off, run(2.0, None, x), atol=1e-4)


def test_target_size():
    assert target_size(None, False, "custom", 1024, 1536, 0) == (1024, 1536)
    assert target_size(None, False, "TikTok (9:16) - 1080x1920", 1024, 1536, 0) == (1080, 1920)
    assert target_size(None, False, "custom", 1024, 1536, 1024) == (680, 1024)
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "a.png")
        Image.new("RGB", (1179, 2096)).save(p)
        assert target_size(p, True, "custom", 0, 0, 0) == (1176, 2096)
        assert target_size(p, True, "custom", 0, 0, 1024) == (576, 1024)


def test_fit_geometry():
    assert krea2_edit.fit_geometry(600, 600, 1536, 1024) == (0, 0, 600, 600, 1024, 1024)  # square face: fits inside
    assert krea2_edit.fit_geometry(1500, 1000, 1536, 1024) == (0, 0, 1500, 1000, 1536, 1024)  # same aspect: fills
    strip = torch.zeros(1, 1000, 1000)
    strip[..., :31] = 1  # what fit_encode cuts off the left of a square source for a 1024x960 target
    assert krea2_edit.fit_mask(strip, 128, 120, (128, 120)).max() == 0
    assert krea2_edit.fit_mask(1 - strip, 128, 120, (128, 120)).min() == 1


def test_whole_reference():
    graph = expand(grounding_px=512, face_crop=True)  # a workflow saved before 1.22.0 still carries both
    (enc,) = inputs_of(graph, "MyNode_Krea2Encode")
    load = next(k for k, n in graph.items() if n["class_type"] == "LoadImage")
    assert enc["grounding_px"] == 1024 and enc["image"][0] == load  # fixed grounding, the whole input as the reference


def test_save_images():
    img = torch.rand(2, 8, 8, 3)
    with tempfile.TemporaryDirectory() as d:
        folder_paths.set_output_directory(os.path.join(d, "out"))
        folder_paths.set_temp_directory(os.path.join(d, "temp"))
        saved = save_images(img, "MyNode", None)
        # in today's folder, named like its card
        assert saved[1] == {"filename": "ID_2.png", "subfolder": os.path.join("MyNode", DAY), "type": "output", "mn_id": 2}
        Image.new("RGB", (8, 8)).save(os.path.join(d, "out", "MyNode", "FACE_00007_.png"))  # one saved before 1.15.0
        assert save_images(img, "MyNode", None)[0]["filename"] == "ID_8.png"  # the IDs go on after it: never twice
        os.makedirs(os.path.join(d, "out", "MyNode", "2026-01-01"))
        Image.new("RGB", (8, 8)).save(os.path.join(d, "out", "MyNode", "2026-01-01", "ID_20.png"))  # another day's
        assert save_images(img, "MyNode", None)[0]["filename"] == "ID_21.png"
        absolute = save_images(img, f' "{d}/abs/" ', None)[0]  # /view can't serve it: a temp copy, with the ID
        assert absolute["type"] == "temp" and absolute["mn_id"] == 1
        assert sorted(os.listdir(os.path.join(d, "abs", DAY))) == ["ID_1.png", "ID_2.png"]
        assert save_images(img, "", None)[0]["type"] == "temp"
        assert os.listdir(os.path.join(d, "out")) == ["MyNode"]


def expand(**kw):
    """The graph FACE expands into, with test defaults for every input."""
    node = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.node")  # as ComfyUI loads it: relative imports work
    return node.FaceProcessing.execute(**{
        "image": "a.png", "text": "box", "seed": 1, "steps": 8, "sampler_name": "euler", "scheduler": "simple",
        "resolution_source": True, "aspect_ratio": "custom", "custom_width": 1024, "custom_height": 1536, "ref_boost": 2.0,
        "grounding_px": 1024, "max_resolution": 0, "unet_name": "u", "lora_name": "id", "clip_name": "c", "vae_name": "v",
        "llm_name": "m", **kw}).expand


def inputs_of(graph, class_type):
    return [n["inputs"] for n in graph.values() if n["class_type"] == class_type]


def test_extra_loras():
    graph = expand(loras='[["style", 0.8], ["skin", 1]]')
    loaders = {k: n["inputs"] for k, n in graph.items() if n["class_type"] == "LoraLoaderModelOnly"}
    assert [(i["lora_name"], i["strength_model"]) for i in loaders.values()] == [("id", 1.0), ("style", 0.8), ("skin", 1)]
    keys = list(loaders)
    assert [loaders[k]["model"][0] for k in keys[1:]] == keys[:-1]  # each one patches the previous one's model


def test_old_core_llm():
    nodes.NODE_CLASS_MAPPINGS.pop("TextGenerateV2", None)  # core 0.43: only the old TextGenerate
    (gen,) = inputs_of(expand(ai_prompt=True), "TextGenerate")
    assert "image" in gen and "images.image1" not in gen


def test_prompt_list():
    nodes.NODE_CLASS_MAPPINGS["TextGenerateV2"] = None  # core 0.44+
    node = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.node")
    assert node._prompts("a,\nstill a\n\nparagraph\n---------\r\n\n b \n---\n") == ["a,\nstill a\n\nparagraph", "b"]
    assert node._prompts("one <lora:x:1.1>\n\n\ntwo\nlines\r\n") == ["one <lora:x:1.1>", "two\nlines"]  # blank lines
    assert [i["prompt"] for i in inputs_of(expand(text=" as typed\n"), "MyNode_Krea2Encode")] == [" as typed\n"]
    real = folder_paths.get_filename_list
    folder_paths.get_filename_list = lambda kind: ["id", "Edit\\Style_v1.5.safetensors"]
    try:
        graph = expand(prompts="a cat <lora:style_v1.5:0.5> <lora:gone:1>\n\na dog", ai_prompt=True)
    finally:
        folder_paths.get_filename_list = real
    assert [i["prompt"] for i in inputs_of(graph, "TextGenerateV2")] == ["a cat", "a dog"]  # tags never reach the text
    loras = [(i["lora_name"], i["strength_model"]) for i in inputs_of(graph, "LoraLoaderModelOnly")]
    assert loras == [("id", 1.0), ("Edit\\Style_v1.5.safetensors", 0.5)]  # the cat's own LoRA, on top of the shared one
    assert len(inputs_of(graph, "MyNode_Show")) == 2
    assert len(inputs_of(graph, "CLIPLoader")) == 2  # text encoder + one LLM for every prompt
    assert SENT[-1] == ("mynode.toast", {"text": "LoRA not found, skipped: gone"})


def test_manual_crop():
    crop_edit = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.crop_edit")
    raw = json.dumps({"image": "a.png", "angle": 90, "box": [10, 20, 30, 40], "pad": [1, 2, 3, 4],
                      "ratio": "face 2:3", "oval": 1.2})
    spec = crop_edit.spec_of(raw, "a.png")
    assert "ratio" not in spec and "oval" not in spec  # the preset and its oval's size are the preview's own
    assert crop_edit.spec_of(raw, "b.png") is None and crop_edit.spec_of("{broken", "a.png") is None
    img = torch.rand(1, 50, 80, 3)
    turned = crop_edit.apply(img, {**spec, "box": None, "pad": [0, 0, 0, 0]})
    assert torch.allclose(turned[0, 0, 49], img[0, 0, 0], atol=1 / 255)  # clockwise: top-left -> top-right
    out = crop_edit.apply(img, spec)  # 80x50 turned -> 50x80, box 30x40, pad 1 2 3 4
    assert out.shape == (1, 46, 34, 3) and crop_edit.size(80, 50, spec) == (34, 46)
    assert torch.allclose(out[0, :, 0], torch.full((46, 3), 128 / 255))  # the padding is gray
    tilted = {**spec, "angle": 10.0, "box": None, "pad": [0, 0, 0, 0]}
    assert crop_edit.apply(img, tilted).shape[1:3] == crop_edit.size(80, 50, tilted)[::-1]  # size() = what PIL makes
    graph = expand(manual_crop=True, crop=raw)
    turn = next(k for k, n in graph.items() if n["class_type"] == "MyNode_CropRotatePad")
    assert inputs_of(graph, "MyNode_Krea2Patch")[0]["image"][0] == turn  # the reference is the cropped input
    assert not inputs_of(expand(manual_crop=False, crop=raw), "MyNode_CropRotatePad")


def test_crop_mask():
    crop_edit = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.crop_edit")
    parts = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.parts")
    raw = json.dumps({"image": "a.png", "angle": 0, "box": [10, 20, 40, 40], "pad": [0, 0, 0, 0], "ratio": "face 1:1"})
    oval = crop_edit.face_oval(raw, "a.png")
    assert oval == (0.5, 0.4358, 0.2467, 0.3026) and crop_edit.face_oval(raw, "b.png") is None
    assert crop_edit.face_oval(json.dumps({**json.loads(raw), "ratio": "4:5"}), "a.png") is None
    big = crop_edit.face_oval(json.dumps({**json.loads(raw), "oval": 9}), "a.png")
    assert abs(big[3] - 0.4358) < 1e-9  # Ctrl+wheel's size stops where the oval meets the box, as crop.js draws it
    row = crop_edit.oval_mask(oval, (0, 0, 0, 0), 400, 400)[0, 174]  # through the oval's middle; its line at x 298.7
    assert row[275] == 1 and row[321] == 0 and 0.3 < row[298] < 0.7  # a soft edge across the line, the face whole inside
    # Mask on: the same one crop for Krea2 and the LLM, and Krea2Patch gets the oval ref_boost acts on; off: no oval
    graph = expand(manual_crop=True, crop=raw, crop_mask=True, ai_prompt=True)
    (cut,) = [k for k, n in graph.items() if n["class_type"] == "MyNode_CropRotatePad"]
    (patch,) = inputs_of(graph, "MyNode_Krea2Patch")
    assert patch["image"][0] == cut and json.loads(patch["oval"]) == {"oval": list(oval), "pad": [0, 0, 0, 0]}
    gen = next(n["inputs"] for n in graph.values() if n["class_type"] in ("TextGenerateV2", "TextGenerate"))
    assert (gen.get("images.image1") or gen.get("image"))[0] == cut
    assert inputs_of(expand(manual_crop=True, crop=raw), "MyNode_Krea2Patch")[0]["oval"] == ""
    # a ⛶ Face crop, with or without Mask, is placed beside the result; other crops and the whole input stay aligned
    four_five = json.dumps({**json.loads(raw), "ratio": "4:5"})
    assert patch["beside"] is True and inputs_of(expand(manual_crop=True, crop=raw), "MyNode_Krea2Patch")[0]["beside"] is True
    assert inputs_of(expand(manual_crop=True, crop=four_five), "MyNode_Krea2Patch")[0]["beside"] is False
    assert inputs_of(expand(), "MyNode_Krea2Patch")[0]["beside"] is False
    real, parts.krea2_edit.patch = parts.krea2_edit.patch, lambda *a: a
    try:
        (masked,) = parts.Krea2Patch.execute("m", "v", torch.zeros(1, 40, 30, 3), {}, 2.0, patch["oval"], True).result
        (whole,) = parts.Krea2Patch.execute("m", "v", torch.zeros(1, 40, 30, 3), {}, 2.0).result
    finally:
        parts.krea2_edit.patch = real
    assert torch.equal(masked[-2], crop_edit.oval_mask(oval, (0, 0, 0, 0), 40, 30)) and masked[-1] is True
    assert whole[-2:] == (None, False)


def test_system_prompt():
    nodes.NODE_CLASS_MAPPINGS["TextGenerateV2"] = None  # core 0.44+
    node = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.node")
    real = node.PROMPTS
    with tempfile.TemporaryDirectory() as d:
        node.PROMPTS = Path(d)
        (node.PROMPTS / "short.txt").write_text("Be brief.", encoding="utf-8")
        (node.PROMPTS / "a_first.txt").write_text("First.", encoding="utf-8")
        (node.PROMPTS / "img_to_text").mkdir()
        (node.PROMPTS / "img_to_text" / "0_describe.txt").write_text("Describe.", encoding="utf-8")  # the other task's
        try:
            (own,) = inputs_of(expand(ai_prompt=True, system_file="short.txt"), "TextGenerateV2")
            (up,) = inputs_of(expand(ai_prompt=True, system_file="../short.txt"), "TextGenerateV2")  # the name only
            (first,) = inputs_of(expand(ai_prompt=True), "TextGenerateV2")  # none chosen: the first file
            assert node._prompt_files(node.PROMPTS) == ["a_first.txt", "short.txt"]  # picture → prompt ones aren't listed
        finally:
            node.PROMPTS = real
    assert own["system_prompt"] == up["system_prompt"] == "Be brief." and first["system_prompt"] == "First."


def test_newest_default():
    node = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.node")
    real = folder_paths.get_filename_list
    files = ["Edit\\krea2_identity_edit_v1_2.safetensors", "krea2_identity_edit_v2.safetensors", "other.safetensors",
             "x_v9.safetensors", "x_v10.safetensors"]
    folder_paths.get_filename_list = lambda kind: files
    try:
        assert node._files("lora_name", "loras", "krea2_identity_edit").default == "krea2_identity_edit_v2.safetensors"
        assert node._files("lora_name", "loras", "x_v").default == "x_v10.safetensors"
        assert node._files("lora_name", "loras", "absent").default == "Edit\\krea2_identity_edit_v1_2.safetensors"
    finally:
        folder_paths.get_filename_list = real


def test_core_problems():
    node = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.node")

    class Gen:  # TextGenerateV2 with the inputs core 0.44 gives it
        @classmethod
        def INPUT_TYPES(cls):
            return {"required": dict.fromkeys(node.LLM_INPUTS + ("images",))}

    saved = dict(nodes.NODE_CLASS_MAPPINGS)
    try:
        nodes.NODE_CLASS_MAPPINGS["TextGenerateV2"] = Gen
        assert node.core_problems() == []
        del nodes.NODE_CLASS_MAPPINGS["ConditioningZeroOut"]
        Gen.INPUT_TYPES = classmethod(lambda cls: {"required": {"clip": None, "prompt": None, "images": None}})
        problems = node.core_problems()
    finally:
        nodes.NODE_CLASS_MAPPINGS.clear()
        nodes.NODE_CLASS_MAPPINGS.update(saved)
    assert "ConditioningZeroOut: no such node" in problems
    assert "TextGenerateV2: no input max_length, thinking, use_default_template, mtp, system_prompt, sampling_mode" in problems


def test_update():
    update = importlib.import_module("custom_nodes.ComfyUI-GSEN.update")
    assert update.field('[project]\nversion = "1.2.3"\n', "version") == "1.2.3"
    assert update.newer("1.10.0", "1.9.0") and not update.newer("1.9.0", "1.9.0")
    with tempfile.TemporaryDirectory() as d:
        repo = Path(d).resolve() / "repo"
        pack = repo / "ComfyUI-GSEN"
        (pack / "web" / "assets").mkdir(parents=True)
        (pack / "assets" / "prompts").mkdir(parents=True)
        assert update.mode(pack) == "zip"
        (pack / ".git").mkdir()
        assert update.mode(pack) == "git"
        (pack / ".git").rmdir()
        (repo / ".git").mkdir()
        assert update.mode(pack) == "dev"
        files = {"assets/prompts/system.txt": "mine", "assets/prompts/own.txt": "own", "web/assets/old.js": "stale",
                 "same.py": "same"}
        for name, text in files.items():
            (pack / name).write_text(text)
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for name, text in {"pyproject.toml": 'version = "9.9.9"', "same.py": "same", "assets/prompts/system.txt": "theirs",
                               "assets/prompts/new.txt": "new", "web/assets/index.js": "js", "../evil.txt": "x"}.items():
                z.writestr(f"ComfyUI-GSEN-main/{name}", text)
        changed = update.unpack(buf.getvalue(), pack)
        assert sorted(changed) == ["assets/prompts/new.txt", "pyproject.toml", "web/assets/index.js", "web/assets/old.js"]
        assert (pack / "assets/prompts/system.txt").read_text() == "mine" and (pack / "assets/prompts/own.txt").exists()
        assert not (pack / "web/assets/old.js").exists() and not (repo / "evil.txt").exists()
        # updated from before 1.18.0: the user's prompts are still in face/, beside the old code
        old = {"face/prompts/system.txt": "edited", "face/prompts/img_to_text/my.txt": "my", "face/node.py": "old"}
        for name, text in old.items():
            (pack / name).parent.mkdir(parents=True, exist_ok=True)
            (pack / name).write_text(text)
        update.migrate(pack)
        assert (pack / "assets/prompts/system.txt").read_text() == "edited"  # theirs win, as KEEP always kept them
        assert (pack / "assets/prompts/img_to_text/my.txt").read_text() == "my" and not (pack / "face").exists()
        update.migrate(pack)  # nothing left to move


def test_sounds():
    ask = lambda route, **q: asyncio.run(route(SimpleNamespace(query=q)))  # noqa: E731
    real = common.SOUNDS
    with tempfile.TemporaryDirectory() as d:
        common.SOUNDS = d
        for name in ("b.mp3", "a.WAV", "README.txt"):
            Path(d, name).write_bytes(b"")
        try:
            assert common.sounds() == ["a.WAV", "b.mp3"]  # audio only
            assert ask(common._sound, name="b.mp3").status == 200
            assert ask(common._sound, name="README.txt").status == ask(common._sound, name="../b.mp3").status == 404
        finally:
            common.SOUNDS = real


def test_gallery():
    img = torch.rand(1, 8, 8, 3)
    typed = {"5": {"class_type": "MyNode_FaceProcessing", "inputs": {"seed": 7, "steps": 4, "sampler_name": "euler",
                                                                       "scheduler": "simple", "text": ["9", 0]}}}
    cls = SimpleNamespace(hidden=SimpleNamespace(prompt=typed, extra_pnginfo=None))
    ask = lambda route, **q: asyncio.run(route(SimpleNamespace(query=q)))  # noqa: E731
    with tempfile.TemporaryDirectory() as d:
        folder_paths.set_output_directory(os.path.join(d, "out"))
        save_images(img, "R", cls)  # saved before 1.14.0: no "mynode" chunk, named the old way, in SAVE itself
        os.rename(os.path.join(d, "out", "R", DAY, "ID_1.png"), os.path.join(d, "out", "R", "FACE_00001_.png"))
        save_images(img, "R", cls, {"seed": 9, "en": "the AI's prompt"})
        os.makedirs(os.path.join(d, "x"))
        assert common.results_dir("R") and common.results_dir(os.path.join(d, "x"))  # in output, or a full path
        assert not common.results_dir("../x") and not common.results_dir("")  # a relative one can't leave output
        listed = json.loads(ask(common._results, folder="R").body)
        # newest first, from the day folders and from SAVE itself
        assert [(r["name"], r["id"]) for r in listed] == [(f"{DAY}/ID_2.png", 2), ("FACE_00001_.png", 1)]
        old = json.loads(ask(common._result, folder="R", name="FACE_00001_.png", info="1").body)
        new = json.loads(ask(common._result, folder="R", name=f"{DAY}/ID_2.png", info="1").body)
        # the old one gets its node's inputs from the workflow; its text was a link, so there is none
        assert old == {"width": 8, "height": 8, "seed": 7, "steps": 4, "sampler": "euler", "scheduler": "simple"}
        assert new == {"width": 8, "height": 8, "seed": 9, "en": "the AI's prompt"}
        assert ask(common._result, folder="R", name=f"{DAY}/ID_2.png", s="64").content_type == "image/webp"
        assert ask(common._result, folder="R", name=f"../R/{DAY}/ID_2.png").status == 404
        assert ask(common._result, folder="..", name=f"{DAY}/ID_2.png").status == 404
        first = common.save_llm(" a <red> & blue prompt\n", "красный", img, "R")  # a folder of its own: picture, text, page
        assert first.endswith(os.path.join("R", DAY, "001"))
        assert sorted(os.listdir(first)) == ["001_LLM.html", "001_LLM.jpg", "001_LLM.txt"]
        page = Path(first, "001_LLM.html").read_text(encoding="utf-8")
        assert '<div class="text en">a &lt;red&gt; &amp; blue prompt</div>' in page and 'src="001_LLM.jpg"' in page
        assert '<div class="text ru">красный</div>' in page  # the page's EN / RU switch shows one of them
        assert Path(first, "001_LLM.txt").read_text(encoding="utf-8") == " a <red> & blue prompt\n"
        assert common.save_llm("again", "", img, "R").endswith("002")
        wide = common.save_llm("wide", "", torch.rand(1, 10, 2100, 3), "R")  # past LLM_SIDE it comes down to it
        with Image.open(Path(wide, "003_LLM.jpg")) as im:
            assert (im.format, max(im.size)) == ("JPEG", common.LLM_SIDE)
        with Image.open(Path(first, "001_LLM.jpg")) as im:
            assert im.size == (8, 8)  # a small one is never enlarged
        assert common.save_llm("not saved", "", img, "") is None
        assert common.save_llm(" \n", "", img, "R") is None  # the LLM wrote nothing: the face says "no prompt", nothing saved
    (show,) = inputs_of(expand(seed=5), "MyNode_Show")
    assert json.loads(show["info"]) == {"seed": 5, "steps": 8, "sampler": "euler", "scheduler": "simple"}


def test_llm_tab():
    nodes.NODE_CLASS_MAPPINGS["TextGenerateV2"] = None  # core 0.44+
    node = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.node")
    real, real_prompts = node.IMG_TO_TEXT, node.PROMPTS
    with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as p:
        node.IMG_TO_TEXT, node.PROMPTS = Path(d), Path(p)
        (node.IMG_TO_TEXT / "describe.txt").write_text("Describe.", encoding="utf-8")
        for name in ("system_v1.txt", "system_v4.txt", "system_v10.txt"):
            (node.PROMPTS / name).write_text("System.", encoding="utf-8")
        try:
            graph = node.LLMPrompt.execute(image="b.png", llm_name="m", system_file="describe.txt", save_to="R").expand
            # the LLM tab's own SAVE and System, appended, then Crop's Mask: new inputs go last, saved workflows keep theirs
            inputs = node.FaceProcessing.define_schema().inputs
            *_, save, system, mask = inputs
            assert (mask.id, mask.default, mask.optional) == ("crop_mask", False, True)
            # the newest system prompt for a new node (v1 sorts first, and it wants three ||| blocks the node never sends)
            assert next(i for i in inputs if i.id == "system_file").default == "system_v10.txt"
        finally:
            node.IMG_TO_TEXT, node.PROMPTS = real, real_prompts
    (gen_id,) = [k for k, n in graph.items() if n["class_type"] == "TextGenerateV2"]
    gen = graph[gen_id]["inputs"]
    assert gen["system_prompt"] == "Describe." and gen["prompt"] == ""  # its own folder's System prompt and the picture only
    (load_id,) = [k for k, n in graph.items() if n["class_type"] == "LoadImage"]
    (ru_id,) = [k for k, n in graph.items() if n["class_type"] == "MyNode_Translate"]
    assert inputs_of(graph, "MyNode_Translate") == [{"text": [gen_id, 0]}]  # the LLM tab shows it in RU too
    llm_text = {"text": [gen_id, 0], "ru": [ru_id, 0], "image": [load_id, 0], "save_to": "R"}
    assert inputs_of(graph, "MyNode_LLMText") == [llm_text]  # kept with its picture
    assert inputs_of(graph, "LoadImage") == [{"image": "b.png"}] and inputs_of(graph, "CLIPLoader")[0]["clip_name"] == "m"
    assert math.isnan(node.LLMPrompt.fingerprint_inputs(image="b.png"))  # every Run expands anew: the text always comes back
    assert (save.id, save.default, save.optional) == ("llm_save_to", "IMGtext", True)  # saved workflows keep their values
    assert (system.id, system.options, system.default) == ("llm_system_file", ["describe.txt"], "describe.txt")
    assert system.optional
    expand(llm_save_to="X", llm_system_file="describe.txt")  # the face's own Run takes them and leaves them be


def test_models():
    models = importlib.import_module("custom_nodes.ComfyUI-GSEN.assets.models")
    body = os.urandom(3 << 20)  # three rounds of the download loop
    want = models.Model("VAE", "vae", "w.safetensors", len(body), hashlib.sha256(body).hexdigest(),
                        (("dead/x", "c", "w"), ("fake/x", "c", "w"), ("good/x", "c", "w")))

    class Hub(http.server.BaseHTTPRequestHandler):  # Hugging Face, here
        def do_GET(self):
            if self.path.startswith("/dead/"):
                self.send_error(404)
                return
            data = body if self.path == "/good/x/resolve/c/w" else body[:-1] + b"!"  # fake: the right size, other bytes
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    hub = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Hub)
    threading.Thread(target=hub.serve_forever, daemon=True).start()
    real = models.HF, models.MODELS, folder_paths.folder_names_and_paths["vae"]
    ask = lambda route, **q: asyncio.run(route(SimpleNamespace(query=q)))  # noqa: E731
    try:
        with tempfile.TemporaryDirectory() as d:
            named, mine = os.path.join(d, "vae"), os.path.join(d, "mine")
            folder_paths.folder_names_and_paths["vae"] = ([mine, named], {".safetensors"})
            folder_paths.filename_list_cache.clear()
            models.HF, models.MODELS = f"http://127.0.0.1:{hub.server_port}", (want,)
            assert models.target("vae") == named  # no files anywhere: the folder named as the kind
            os.makedirs(os.path.join(mine, "sub"))
            Path(mine, "sub", "other.safetensors").write_bytes(b"")
            assert models.target("vae") == mine  # beside the others, extra_model_paths.yaml's or not
            assert models.status() == [{"key": "VAE", "file": "w.safetensors", "size": len(body), "name": None, "got": None}]
            Path(mine, "sub", "🔴 W.safetensors").write_bytes(b"")  # emoji and another case: the same file to its owner
            folder_paths.filename_list_cache.clear()  # the folder's time can stay the same within one timer tick
            assert models.status()[0]["name"].endswith("🔴 W.safetensors") and ask(models._download, key="VAE").status == 200
            assert not models.JOBS  # it is here: nothing to download
            os.remove(Path(mine, "sub", "🔴 W.safetensors"))
            folder_paths.filename_list_cache.clear()
            assert ask(models._download, key="../w").status == 404  # only a listed model, never a link from outside
            ask(models._download, key="VAE")
            while "VAE" in models.JOBS:  # it downloads in a thread of its own
                time.sleep(0.05)
            assert SENT[-1] == ("mynode.models", {"key": "VAE", "done": True, "error": "", "folder": mine})
            assert any(event == "mynode.models" and "got" in data for event, data in SENT)  # the bar moved on the way
            assert Path(mine, "w.safetensors").read_bytes() == body and models.status()[0]["name"] == "w.safetensors"
            sent = len(SENT)
            ask(models._download, key="VAE")  # here already: no second download
            assert len(SENT) == sent and not models.JOBS
            # no source has the right bytes: nothing stays behind, and the face hears why
            models.MODELS = (want._replace(key="LLM", file="x.safetensors", sources=want.sources[:2]),)
            models.JOBS["LLM"] = {"got": 0, "sent": 0}
            models.download(models.MODELS[0])
            error = SENT[-1][1]["error"]
            assert "dead/x: HTTP Error 404" in error and f"fake/x: {len(body)} bytes that are not x.safetensors" in error
            assert sorted(os.listdir(mine)) == ["sub", "w.safetensors"] and not models.JOBS
    finally:
        hub.shutdown()
        models.HF, models.MODELS, folder_paths.folder_names_and_paths["vae"] = real
        folder_paths.filename_list_cache.clear()


def test_zip():
    ask = lambda route, **q: asyncio.run(route(SimpleNamespace(query=q)))  # noqa: E731
    real = folder_paths.get_output_directory()
    with tempfile.TemporaryDirectory() as d:
        folder_paths.set_output_directory(os.path.join(d, "out"))
        made = {"Krea2One": ["2026-11-15/ID_1.png", "2026-11-15/ID_2.png", "ID_7.png", "2026-11-15/notes.txt", "secret.txt"],
                "IMGtext": ["2026-11-15/001/001_LLM.png", "2026-11-15/001/001_LLM.txt", "2026-11-15/001/001_LLM.html",
                            "2026-11-15/001/other.txt", "2026-11-15/002/001_LLM.txt", "2026-11-16/001/001_LLM.jpg"]}
        for folder, names in made.items():
            for name in names:
                path = Path(d, "out", folder, name)
                path.parent.mkdir(parents=True, exist_ok=True)
                if name.endswith(".png"):
                    Image.new("RGB", (4, 4), "red").save(path)
                else:
                    path.write_bytes(b"xy")
        Path(d, "out", "Krea2One", "2026-11-15", "ID_3.png").write_bytes(b"cut")  # being saved right now, or broken
        try:
            files = common.saved_files("Krea2One", "IMGtext")
            want = [f"IMGtext/2026-11-15/001/001_LLM.{ext}" for ext in ("html", "png", "txt")] + [
                "IMGtext/2026-11-16/001/001_LLM.jpg", "Krea2One/2026-11-15/ID_1.jpg", "Krea2One/2026-11-15/ID_2.jpg",
                "Krea2One/2026-11-15/ID_3.jpg", "Krea2One/ID_7.jpg"]
            assert [n for _, n in files] == want  # only what GSEN made: the notes and the stray files stay out
            assert common.saved_files("..", "../..") == []  # a relative SAVE stays inside output
            assert json.loads(ask(common._zip, save="Krea2One", llm="IMGtext", check="1").text) == {"files": 8}
            assert ask(common._zip, save="", llm="").status == 404
            common.pack(files, os.path.join(d, "a.zip"))
            with zipfile.ZipFile(os.path.join(d, "a.zip")) as z:
                assert sorted(z.namelist()) == sorted(n.replace("ID_3.jpg", "ID_3.png") for n in want)
                assert z.read("Krea2One/2026-11-15/ID_3.png") == b"cut"  # it goes in as it is, the rest is packed
                with Image.open(BytesIO(z.read("Krea2One/ID_7.jpg"))) as im:  # a result goes in as JPEG
                    assert im.format == "JPEG" and im.getpixel((1, 1))[0] > 240
                old_llm = Path(d, "out", "IMGtext", "2026-11-15", "001", "001_LLM.png").read_bytes()
                assert z.read("IMGtext/2026-11-15/001/001_LLM.png") == old_llm  # the LLM tab's files as they are
                assert z.read("IMGtext/2026-11-16/001/001_LLM.jpg") == z.read("IMGtext/2026-11-15/001/001_LLM.txt") == b"xy"
        finally:
            folder_paths.set_output_directory(real)
    pack = importlib.import_module("custom_nodes.ComfyUI-GSEN")
    lines = [re.sub(r"\033\[[\d;]*m", "", line) for line in pack.banner("1.0", 3, 80).split("\n")]
    assert [line for line in lines if line and set(line) == {"═"}] == ["═" * 80] * 2  # as wide as the console; GSEN has ═ too


if __name__ == "__main__":
    test_forward_matches_core()
    test_patch_mask()
    test_target_size()
    test_fit_geometry()
    test_whole_reference()
    test_save_images()
    test_extra_loras()
    test_old_core_llm()
    test_prompt_list()
    test_manual_crop()
    test_crop_mask()
    test_system_prompt()
    test_newest_default()
    test_core_problems()
    test_update()
    test_sounds()
    test_gallery()
    test_llm_tab()
    test_models()
    test_zip()
    print("ok")
