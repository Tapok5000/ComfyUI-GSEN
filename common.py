"""Pack-wide pieces, shared by every node: the image galleries' HTTP routes, result saving, the expansion output."""
import asyncio
import functools
import json
import os
import re
from io import BytesIO

from aiohttp import web
from PIL import Image, ImageOps

import folder_paths
from comfy_api.latest import io, ui
from server import PromptServer


def input_images():
    """Every image under ComfyUI's input folder, subfolders included, as 'sub/name.png'."""
    base = folder_paths.get_input_directory()
    files = []
    for root, _dirs, names in os.walk(base):
        rel = os.path.relpath(root, base)
        files += [(n if rel == "." else os.path.join(rel, n)).replace("\\", "/") for n in names]
    return sorted(folder_paths.filter_files_content_types(files, ["image"]))


@PromptServer.instance.routes.get("/mynode/images")
async def _images(request):
    """name -> mtime; the mtime busts the browser cache when a file changes under the same name."""
    base = folder_paths.get_input_directory()
    return web.json_response({n: int(os.path.getmtime(os.path.join(base, n))) for n in input_images()})


@functools.lru_cache(maxsize=1024)
def _thumb(path, mtime, size):
    with Image.open(path) as src:
        im = ImageOps.exif_transpose(src)
        im.thumbnail((size, size))
        buf = BytesIO()
        im.convert("RGB").save(buf, "WEBP", quality=80)
    return buf.getvalue()


@PromptServer.instance.routes.get("/mynode/thumb")
async def _thumb_route(request):
    base = folder_paths.get_input_directory()
    path = os.path.abspath(os.path.join(base, request.query.get("name", "")))
    if not folder_paths.is_within_directory(base, path) or not os.path.isfile(path):
        return web.Response(status=404)
    s = request.query.get("s", "")
    size = min(int(s), 1024) if s.isdigit() and int(s) >= 16 else 256
    data = await asyncio.get_running_loop().run_in_executor(None, _thumb, path, os.path.getmtime(path), size)
    return web.Response(body=data, content_type="image/webp", headers={"Cache-Control": "max-age=31536000"})


def _save_path(folder, prefix, w=0, h=0):
    """get_save_image_path for SAVE: a subfolder of ComfyUI's output (core refuses one that leaves it) or a full path."""
    if os.path.isabs(folder):
        return folder_paths.get_save_image_path(prefix, folder, w, h)
    return folder_paths.get_save_image_path(os.path.join(folder, prefix), folder_paths.get_output_directory(), w, h)


RESULT = re.compile(r"ID_(\d+)\.png|FACE_(\d+)_\.png")  # results: ID_7.png, before 1.15.0 FACE_00007_.png


def result_id(name):
    """A result's number, the ID the gallery shows; None for any other file."""
    m = RESULT.fullmatch(name)
    return int(m[1] or m[2]) if m else None


def save_images(images, folder, cls, info=None):
    """Results as ID_<n>.png, named like their gallery cards, with the workflow inside and info as a "mynode" text
    chunk (the card reads it). n goes on from the highest result already there, old FACE_ files included, so an ID
    never repeats. folder: a subfolder of ComfyUI's output, a full path, or empty (not saved, only previewed)."""
    folder = folder.strip().strip('"')  # Explorer's "Copy as path" quotes the path
    if not folder:
        return ui.PreviewImage(images, cls=cls).as_dict()["images"]
    full, _, _, sub, _ = _save_path(folder, "ID", images[0].shape[1], images[0].shape[0])
    meta = ui.ImageSaveHelper._create_png_metadata(cls)
    if meta and info:
        meta.add_text("mynode", json.dumps(info, ensure_ascii=False))
    first = 1 + max(filter(None, map(result_id, os.listdir(full))), default=0)
    files = [f"ID_{first + i}.png" for i in range(len(images))]
    for file, im in zip(files, images, strict=True):
        ui.ImageSaveHelper._convert_tensor_to_pil(im).save(os.path.join(full, file), pnginfo=meta, compress_level=4)
    if os.path.isabs(folder):  # /view only serves output, input and temp: the face gets a temp copy, and the ID
        return [{**e, "id": first + i} for i, e in enumerate(ui.PreviewImage(images, cls=cls).as_dict()["images"])]
    return [{"filename": file, "subfolder": sub, "type": "output", "id": first + i} for i, file in enumerate(files)]


def save_text(text, folder, prefix):
    """text as a numbered .txt in SAVE, next to the images; empty folder: not saved. Returns the path."""
    folder = folder.strip().strip('"')
    if not folder:
        return None
    full, name, counter, _, _ = _save_path(folder, prefix)
    path = os.path.join(full, f"{name}_{counter:05}_.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def results_dir(folder):
    """The folder SAVE names, if it exists. A relative one must stay inside output, like save_images keeps it."""
    folder = folder.strip().strip('"')
    if not folder:
        return None
    out = folder_paths.get_output_directory()
    path = os.path.abspath(folder if os.path.isabs(folder) else os.path.join(out, folder))
    if not os.path.isabs(folder) and not folder_paths.is_within_directory(out, path):
        return None
    return path if os.path.isdir(path) else None


def result_info(path):
    """A result's size, sampling settings and prompt (en, ru), from the PNG's "mynode" chunk; a PNG saved before
    1.14.0 has none, so its node's inputs come from the workflow's prompt chunk."""
    with Image.open(path) as im:
        chunks, (w, h) = dict(im.info), im.size
    out = {"width": w, "height": h}
    try:
        out |= json.loads(chunks.get("mynode") or "{}")
        if "seed" not in out:
            prompt = json.loads(chunks.get("prompt") or "{}")
            node = next((n.get("inputs", {}) for n in prompt.values() if n.get("class_type") == "MyNode_FaceProcessing"), {})
            keys = {"seed": "seed", "steps": "steps", "sampler": "sampler_name", "scheduler": "scheduler", "en": "text"}
            out |= {k: node[v] for k, v in keys.items() if isinstance(node.get(v), (str, int, float))}  # a link is a list
    except (ValueError, AttributeError, TypeError):  # a chunk some other tool wrote
        pass
    return out


@PromptServer.instance.routes.get("/mynode/results")
async def _results(request):
    """The results in a SAVE folder, newest first: [{name, id, mtime}]."""
    path = results_dir(request.query.get("folder", ""))
    found = sorted(((result_id(n), n) for n in os.listdir(path) if result_id(n)), reverse=True) if path else []
    return web.json_response([{"name": n, "id": i, "mtime": int(os.path.getmtime(os.path.join(path, n)))} for i, n in found])


@PromptServer.instance.routes.get("/mynode/result")
async def _result(request):
    """One result by folder and name: the PNG; with s=320 a thumbnail; with info=1 what result_info reads."""
    q = request.query
    base, name = results_dir(q.get("folder", "")), q.get("name", "")
    path = os.path.join(base, name) if base and RESULT.fullmatch(name) else ""
    if not os.path.isfile(path):
        return web.Response(status=404)
    if q.get("info"):
        return web.json_response(await asyncio.to_thread(result_info, path))
    if q.get("s", "").isdigit():
        size = min(max(int(q["s"]), 16), 1024)
        data = await asyncio.get_running_loop().run_in_executor(None, _thumb, path, os.path.getmtime(path), size)
        return web.Response(body=data, content_type="image/webp", headers={"Cache-Control": "max-age=31536000"})
    return web.FileResponse(path)


class Expansion(io.NodeOutput):
    """Output of a node that only expands into a graph and has no sockets of its own."""

    # shortcut: core 0.44 crashes on an expand with zero outputs (NodeOutput.result is None and
    # execution.py calls len() on it); drop this class once NodeOutput.result returns ()
    @property
    def result(self):
        return ()
