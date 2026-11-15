"""Krea2 One's models, in Settings: which of them this ComfyUI's model folders hold, and a download of a missing one into
the folder of its kind that already holds the most files (extra_model_paths.yaml's folders included)."""
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
    sources: tuple  # (repo, commit, path) on Hugging Face, tried in this order


# Each source is pinned to a commit and a download must match the size and sha256: no link can hand over another file.
# A source gone: add one with the same sha256 and release a version (Settings → Update brings it). No Civitai: its files
# want a logged-in account (401 without a token). MODEL and CLIP: Comfy-Org's own builds, the files Krea2 One is made with.
KREA2 = ("Comfy-Org/Krea-2", "588feaf955b08b9ac4723eeb751752ab045dba71")
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
    return [{"key": m.key, "file": m.file, "size": m.size, "name": listed(m),
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
    m = next((m for m in MODELS if m.key == request.query.get("key")), None)
    if not m:
        return web.Response(status=404)
    if m.key not in JOBS and not listed(m):
        JOBS[m.key] = {"got": 0, "sent": 0}
        threading.Thread(target=download, args=(m,), daemon=True).start()
    return web.json_response(status())
