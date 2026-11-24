"""The models Settings lists, a page per family plus SeedVR2 and the LLM: which of them this ComfyUI's model folders
hold, and a download of a missing one into the folder of its kind that already holds the most files
(extra_model_paths.yaml's folders included)."""
import contextlib
import hashlib
import http.client
import os
import threading
import time
import unicodedata
import urllib.request
from typing import NamedTuple

from aiohttp import web

import folder_paths
from server import PromptServer

HF = os.environ.get("HF_ENDPOINT", "https://huggingface.co").rstrip("/")  # a mirror (hf-mirror.com) where it is blocked


class Model(NamedTuple):
    key: str  # its row in Settings
    kind: str  # the model folder its loader reads
    file: str
    size: int
    sha256: str
    sources: tuple  # (repo, commit, path) on Hugging Face, tried in this order; none: shown, not downloaded


# Each source is pinned to a commit and a download must match the size and sha256: no link can hand over another file.
# A source gone: add one with the same sha256 and release a version (Settings → Update brings it). No Civitai: its files
# want a logged-in account (401 without a token). MODEL and CLIP: Comfy-Org's own builds, the files Krea2 One is made with.
KREA2 = ("Comfy-Org/Krea-2", "588feaf955b08b9ac4723eeb751752ab045dba71")
SEEDVR2 = ("Comfy-Org/SeedVR2", "df48879708206a403d2a61acd55578c2e80fd233")
RUNPOD = ("Balkhaev/Qwen-Image-2.1-UC-RunPod", "66e46ce69cfe0d8f28cb84a8be4160a8aa2ade6d")
H3 = ("Comfy-Org/MiniMax-H3", "4b53a35191437de05370da548e59aeabe2a5a09a")
VAE = "Wan2.1_VAE_upscale2x_imageonly_real_v1.safetensors"
MODELS = (
    Model("MODEL", "diffusion_models", "krea2_turbo_int8_convrot.safetensors", 13492686496,
          "8e4eeda70dd5037ab1ba2bef6b417f9f901e26093117cf397f741fc1fdaaf3f1",
          ((*KREA2, "diffusion_models/krea2_turbo_int8_convrot.safetensors"),)),
    Model("LORA", "loras", "krea2_identity_edit_v2.safetensors", 1828285728,
          "c53843f9451963a6cb3c22dc4975205056b93a6575fb9347dd2bc6e055ef9877",
          (("conradlocke/krea2-identity-edit", "f33b26291c640e8ec50b0da420bfee3c9a660daa",
            "krea2_identity_edit_v2.safetensors"),)),
    Model("CLIP", "text_encoders", "qwen3vl_4b_int8_convrot.safetensors", 4858559240,
          "32de113cbf8282b02cbff0794b637b9d6676da09314a1db5a30bcea9bf4ee01c",
          ((*KREA2, "text_encoders/qwen3vl_4b_int8_convrot.safetensors"),)),
    Model("VAE", "vae", VAE, 507684560, "2413554bbec24215185662d009893cf4666b8e777efece2d895e03e1a6b63e06",
          (("spacepxl/Wan2.1-VAE-upscale2x", "384fb7de682e60bd54b59d6eea810ca9d9993497", VAE),
           ("simonri/Wan2.1-VAE-upscale2x", "04932fc624178329fcabb26674e4b9f792836bf7", VAE),
           ("Osrivers/" + VAE, "62184b03592269cfcc4bdcdb22178e19229a23b6", VAE))),
    Model("LLM", "text_encoders", "qwen3VLInstruct4bHeretic_v10.safetensors", 5242481504,
          "8ff7cf6676213361cf44db908dd8e427c0541f8ade53a08e4e4aa80b81c82f5e",
          (("martineux/altkreas", "21846a601dd2bebcfbc1f996cfb59757074cd58c", "qwen3VLInstruct4bHeretic_v10.safetensors"),)),
    # SeedVR2 of ComfyUI's core (comfy_extras/nodes_seedvr.py), not the SeedVR2 pack's GGUF: QW 21's UpScale and BG
    Model("SEEDVR2", "diffusion_models", "seedvr2_3b_int8_convrot.safetensors", 3458259704,
          "c3dec8bcc5916843a8a858572970597462e1f2dc598d6dfd818f6cd40f53a157",
          ((*SEEDVR2, "diffusion_models/seedvr2_3b_int8_convrot.safetensors"),)),
    Model("SEEDVR2_VAE", "vae", "seedvr2_ema_vae_fp16.safetensors", 501324814,
          "20678548f420d98d26f11442d3528f8b8c94e57ee046ef93dbb7633da8612ca1",
          ((*SEEDVR2, "vae/seedvr2_ema_vae_fp16.safetensors"),)),
    # QW 21: the files its two workflows were made with, matched by sha256; the UC int8 build is only in a RunPod repo, the
    # text encoder comes from Comfy-Org first
    Model("QW_MODEL", "diffusion_models", "qwen-image-2.1-UC-int8_convrot.safetensors", 7256796840,
          "5bc5a6c007eff1e0d4004344a24c4af966b9d2c83d142e613b0d456ccceb19ae",
          ((*RUNPOD, "diffusion_models/qwen-image-2.1-UC-int8_convrot.safetensors"),)),
    Model("QW_LORA", "loras", "qwen-image-2.1-restore.safetensors", 159436584,
          "65de4f6c2468071d5aa6ffbd82c76bfee7cc8ac28fe960e91bbca4a58f43c08c",
          (("ausboss/Qwen-Image-2.1-Restore-LoRA", "a223f1255f4738b89b36d79c44d61740d3b3546f",
            "qwen-image-2.1-restore.safetensors"),)),
    Model("QW_CLIP", "text_encoders", "qwen3vl_8b_int8_convrot.safetensors", 9350798360,
          "8bfd0f6e12abf2d2d697ecc888e5e90b0d6741d6708f05799f53afa560452e8f",
          (("Comfy-Org/Qwen-Image-2.1", "aacf31a6d48e707f352ecba714cee0680da3479b",
            "text_encoders/qwen3vl_8b_int8_convrot.safetensors"),
           (*RUNPOD, "text_encoders/qwen3vl_8b_int8_convrot.safetensors"))),
    Model("QW_VAE", "vae", "texture_fix_vae_for_qwen_image_2.1_bf16.safetensors", 675509688,
          "36f56608b02077a50a08ea3dbcdb88351298ceba49948f41f9f87186378e6908",
          (("madebyollin/texture-fix-vae-for-qwen-image-2.1", "9a10df811f183323e4e94d255c18add1924ce340",
            "texture_fix_vae_for_qwen_image_2.1_bf16.safetensors"),)),
    # H3 · CH SHEET: Muse-CharacterSheet-H3's INSTALLATION.md. Its 4-step FastVideo int8 is no file on Hugging Face, so
    # MODEL is Comfy-Org's reference-mode int8 under the Turbo LoRA's 8 steps; Polyhedron is on Civitai only
    Model("H3_MODEL", "diffusion_models", "minimax_h3_ref2va_pruned_int8_convrot.safetensors", 20970379616,
          "9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779",
          ((*H3, "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors"),)),
    Model("H3_LORA", "loras", "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors", 1956193000,
          "6a56f41ab4229c9dd845b9501bbd475ee57e112d846cf2e819d534a1ae928c5a",
          (("lightx2v/Minimax-h3-Turbo", "ff0edf44b7a96e1b1b4a0c84287dfe9f6a7d133e",
            "minimax_h3_ref2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors"),)),
    Model("H3_REALISM", "loras", "h3-realism-people-t2v-i2v-r2v.safetensors", 131229656,
          "acc529601d2da117fb81179e76c56e488a3beab1171659d305f04fa3655b787e",
          (("fal/MiniMax-H3-Realism-People-LoRA", "039cc8579d7aa357a882d7f4111b25da4f72dccc",
            "h3-realism-people-t2v-i2v-r2v.safetensors"),)),
    Model("H3_POLYHEDRON", "loras", "polyhedron_minimax_h3_image_lora_v2__perfe8ct.safetensors", 0, "", ()),
    Model("H3_CLIP", "text_encoders", "qwen3vl_32b_minimax_h3_int8_convrot.safetensors", 27141342152,
          "bc2ced0fbea64757fa9acddccfc0b3f4819d1dcf1da6c124d690d368be283923",
          ((*H3, "text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors"),)),
    Model("H3_VAE_VIDEO", "vae", "minimax_h3_video_vae_fp16.safetensors", 5207808496,
          "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522",
          ((*H3, "vae/minimax_h3_video_vae_fp16.safetensors"),)),
    Model("H3_VAE_AUDIO", "vae", "minimax_h3_audio_vae_fp32.safetensors", 605254808,
          "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48",
          ((*H3, "vae/minimax_h3_audio_vae_fp32.safetensors"),)),
)
JOBS = {}  # key -> {"got": bytes so far, "sent": when the face last heard} while that model downloads


def plain(name):
    """A file's name without the emoji people decorate it with (🔴Wan2.1_VAE….safetensors), in lower case."""
    keep = (c for c in os.path.basename(name) if unicodedata.category(c) not in ("So", "Sk", "Cf", "Mn", "Me"))
    return "".join(keep).strip().lower()


def listed(m):
    """The model's file as its loader lists it (KREA/name.safetensors), or None: by name, in any subfolder, in any case,
    emoji or not (the face's plain() drops them too)."""
    return next((f for f in folder_paths.get_filename_list(m.kind) if plain(f) == m.file.lower()), None)


def status():
    """Each model: where it is (name; None = missing), its size and, while it downloads, the bytes so far (got)."""
    return [{"key": m.key, "file": m.file, "size": m.size, "name": listed(m), "get": bool(m.sources),
             "got": JOBS[m.key]["got"] if m.key in JOBS else None} for m in MODELS]


def target(kind):
    """The folder of kind with the most files in it, so a new model goes beside the others (also on another disk through
    extra_model_paths.yaml). No files anywhere: the folder named as kind (diffusion_models, not the legacy unet)."""
    paths = folder_paths.get_folder_paths(kind)
    files = {p: sum(len(names) for _, _, names in os.walk(p)) for p in paths}
    return max(paths, key=lambda p: (files[p], os.path.basename(os.path.normpath(p)) == kind))


def fetch(url, part, m):
    """url into part, hashed as it streams; ValueError unless the bytes are m's file exactly."""
    sha, got, job = hashlib.sha256(), 0, JOBS[m.key]
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ComfyUI-GSEN"}), timeout=60) as r, \
            open(part, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
            sha.update(chunk)
            got += len(chunk)
            job["got"] = got
            if time.monotonic() - job["sent"] > 0.5:  # twice a second is plenty for a bar
                job["sent"] = time.monotonic()
                PromptServer.instance.send_sync("mynode.models", {"key": m.key, "got": got})
    if got != m.size or sha.hexdigest() != m.sha256:
        raise ValueError(f"{got} bytes that are not {m.file}")


def first_good(m, folder):
    """'' once a source's bytes are folder/<file>, else why each source failed. Through <file>.part, which never stays."""
    part, errors = os.path.join(folder, m.file + ".part"), []
    for repo, commit, path in m.sources:
        try:
            fetch(f"{HF}/{repo}/resolve/{commit}/{path}", part, m)
            os.replace(part, os.path.join(folder, m.file))
            return ""
        except (OSError, ValueError, http.client.HTTPException) as e:  # HTTP errors, a cut connection, a full disk
            errors.append(f"{repo}: {e}")
        finally:
            with contextlib.suppress(OSError):
                os.remove(part)
    return "; ".join(errors)


def download(m):
    """In a thread of its own; the face hears how it ended ("mynode.models" with done)."""
    error, folder = "", ""
    try:
        folder = target(m.kind)
        os.makedirs(folder, exist_ok=True)
        error = first_good(m, folder)
    except Exception as e:  # a thread has no caller: anything else goes to the face too, and the row frees up
        error = str(e) or type(e).__name__
    finally:
        folder_paths.filename_list_cache.pop(m.kind, None)  # the loaders list the new file at once
        JOBS.pop(m.key, None)
        PromptServer.instance.send_sync("mynode.models", {"key": m.key, "done": True, "error": error, "folder": folder})


@PromptServer.instance.routes.get("/mynode/models")
async def _models(request):
    return web.json_response(status())


@PromptServer.instance.routes.post("/mynode/models/download")
async def _download(request):
    """Starts one of MODELS by its key (never a link from the request), unless it is here or on its way already."""
    m = next((m for m in MODELS if m.key == request.query.get("key") and m.sources), None)
    if not m:
        return web.Response(status=404)
    if m.key not in JOBS and not listed(m):
        JOBS[m.key] = {"got": 0, "sent": 0}
        threading.Thread(target=download, args=(m,), daemon=True).start()
    return web.json_response(status())
