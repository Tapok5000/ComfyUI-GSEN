"""Self-check of FACE: Krea2 edit math, face crop, output size, result saving, LoRAs, a prompts .txt. CPU only, no models.

Run from the ComfyUI folder:
    cd E:\\ComfyUI_2026\\ComfyUI
    ..\\python_embeded\\python.exe custom_nodes\\ComfyUI-MyNode\\tests\\test_face.py
"""
import importlib
import json
import os
import sys
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

os.environ["CUDA_VISIBLE_DEVICES"] = ""  # leave the GPU to a running ComfyUI
PACK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACE = os.path.join(PACK, "face")
sys.path[:0] = [os.getcwd(), PACK, FACE]  # ComfyUI root (the cwd), the pack, the node's folder

import torch  # noqa: E402
from aiohttp import web  # noqa: E402
from PIL import Image  # noqa: E402

from comfy.cli_args import args  # noqa: E402

args.cpu = True
import comfy.ops  # noqa: E402
import folder_paths  # noqa: E402
from comfy.ldm.krea2.model import SingleStreamDiT  # noqa: E402

# no running server: common.py's routes go into a throwaway table, messages to the browser into SENT
SENT = []
sys.modules["server"] = SimpleNamespace(PromptServer=SimpleNamespace(instance=SimpleNamespace(
    routes=web.RouteTableDef(), send_sync=lambda event, data, sid=None: SENT.append((event, data)))))
import faces  # noqa: E402
import krea2_edit  # noqa: E402
import nodes  # noqa: E402
from common import save_images  # noqa: E402

target_size = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.sizes").target_size  # it imports crop_edit relatively


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
        refit = krea2_edit.forward(m, x, t, ctx, torch.randn(1, 4, 14, 10), {}, ref_boost=12.0)
    # same model, same RoPE ids; the source block only sits before the target instead of after it
    assert torch.allclose(core, ours, atol=1e-5), (core - ours).abs().max()
    assert not torch.allclose(ours, boosted, atol=1e-4)
    assert refit.shape == x.shape


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


def test_face_crop():
    assert faces.crop_box(100, 100, 200, 220, 1000, 1000) == (73, 90, 227, 244)  # x2 area, 1:1, a bit lower
    assert faces.crop_box(0, 0, 100, 120, 1000, 1000)[:2] == (0, 0)  # clamped at the image edge
    assert faces.crop_face(torch.zeros(1, 64, 96, 3)).shape == (1, 864, 1280, 3)  # no face: the scaled input


def test_save_images():
    img = torch.rand(2, 8, 8, 3)
    with tempfile.TemporaryDirectory() as d:
        folder_paths.set_output_directory(os.path.join(d, "out"))
        folder_paths.set_temp_directory(os.path.join(d, "temp"))
        saved = save_images(img, "MyNode", "FACE", None)
        assert saved[1] == {"filename": "FACE_00002_.png", "subfolder": "MyNode", "type": "output"}
        assert save_images(img, f' "{d}\\abs" ', "FACE", None)[0]["type"] == "temp"  # /view can't serve it: a temp copy
        assert sorted(os.listdir(os.path.join(d, "abs"))) == ["FACE_00001_.png", "FACE_00002_.png"]
        assert save_images(img, "", "FACE", None)[0]["type"] == "temp"
        assert os.listdir(os.path.join(d, "out")) == ["MyNode"]


def expand(**kw):
    """The graph FACE expands into, with test defaults for every input."""
    node = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.node")  # as ComfyUI loads it: relative imports work
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
    node = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.node")
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
    crop_edit = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.crop_edit")
    raw = json.dumps({"image": "a.png", "angle": 90, "box": [10, 20, 30, 40], "pad": [1, 2, 3, 4]})
    spec = crop_edit.spec_of(raw, "a.png")
    assert crop_edit.spec_of(raw, "b.png") is None and crop_edit.spec_of("{broken", "a.png") is None
    img = torch.rand(1, 50, 80, 3)
    turned = crop_edit.apply(img, {**spec, "box": None, "pad": [0, 0, 0, 0]})
    assert torch.allclose(turned[0, 0, 49], img[0, 0, 0], atol=1 / 255)  # clockwise: top-left -> top-right
    out = crop_edit.apply(img, spec)  # 80x50 turned -> 50x80, box 30x40, pad 1 2 3 4
    assert out.shape == (1, 46, 34, 3) and crop_edit.size(80, 50, spec) == (34, 46)
    assert torch.allclose(out[0, :, 0], torch.full((46, 3), 128 / 255))  # the padding is gray
    tilted = {**spec, "angle": 10.0, "box": None, "pad": [0, 0, 0, 0]}
    assert crop_edit.apply(img, tilted).shape[1:3] == crop_edit.size(80, 50, tilted)[::-1]  # size() = what PIL makes
    graph = expand(manual_crop=True, crop=raw, face_crop=False)
    turn = next(k for k, n in graph.items() if n["class_type"] == "MyNode_CropRotatePad")
    assert inputs_of(graph, "MyNode_Krea2Patch")[0]["image"][0] == turn  # the reference is the cropped input
    assert not inputs_of(expand(manual_crop=False, crop=raw), "MyNode_CropRotatePad")


def test_system_prompt():
    nodes.NODE_CLASS_MAPPINGS["TextGenerateV2"] = None  # core 0.44+
    node = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.node")
    real = node.PROMPTS
    with tempfile.TemporaryDirectory() as d:
        node.PROMPTS = Path(d)
        (node.PROMPTS / "short.txt").write_text("Be brief.", encoding="utf-8")
        (node.PROMPTS / "a_first.txt").write_text("First.", encoding="utf-8")
        try:
            (own,) = inputs_of(expand(ai_prompt=True, system_file="short.txt"), "TextGenerateV2")
            (up,) = inputs_of(expand(ai_prompt=True, system_file="../short.txt"), "TextGenerateV2")  # the name only
            (first,) = inputs_of(expand(ai_prompt=True), "TextGenerateV2")  # none chosen: the first file
        finally:
            node.PROMPTS = real
    assert own["system_prompt"] == up["system_prompt"] == "Be brief." and first["system_prompt"] == "First."


def test_newest_default():
    node = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.node")
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
    node = importlib.import_module("custom_nodes.ComfyUI-MyNode.face.node")

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
    update = importlib.import_module("custom_nodes.ComfyUI-MyNode.update")
    assert update.field('[project]\nversion = "1.2.3"\n', "version") == "1.2.3"
    assert update.newer("1.10.0", "1.9.0") and not update.newer("1.9.0", "1.9.0")
    with tempfile.TemporaryDirectory() as d:
        repo = Path(d).resolve() / "repo"
        pack = repo / "ComfyUI-MyNode"
        (pack / "web" / "face").mkdir(parents=True)
        (pack / "face" / "prompts").mkdir(parents=True)
        assert update.mode(pack) == "zip"
        (pack / ".git").mkdir()
        assert update.mode(pack) == "git"
        (pack / ".git").rmdir()
        (repo / ".git").mkdir()
        assert update.mode(pack) == "dev"
        files = {"face/prompts/system.txt": "mine", "face/prompts/own.txt": "own", "web/face/old.js": "stale", "same.py": "same"}
        for name, text in files.items():
            (pack / name).write_text(text)
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            for name, text in {"pyproject.toml": 'version = "9.9.9"', "same.py": "same", "face/prompts/system.txt": "theirs",
                               "face/prompts/new.txt": "new", "web/face/index.js": "js", "../evil.txt": "x"}.items():
                z.writestr(f"ComfyUI-MyNode-main/{name}", text)
        changed = update.unpack(buf.getvalue(), pack)
        assert sorted(changed) == ["face/prompts/new.txt", "pyproject.toml", "web/face/index.js", "web/face/old.js"]
        assert (pack / "face/prompts/system.txt").read_text() == "mine" and (pack / "face/prompts/own.txt").exists()
        assert not (pack / "web/face/old.js").exists() and not (repo / "evil.txt").exists()


if __name__ == "__main__":
    test_forward_matches_core()
    test_target_size()
    test_fit_geometry()
    test_face_crop()
    test_save_images()
    test_extra_loras()
    test_old_core_llm()
    test_prompt_list()
    test_manual_crop()
    test_system_prompt()
    test_newest_default()
    test_core_problems()
    test_update()
    print("ok")
