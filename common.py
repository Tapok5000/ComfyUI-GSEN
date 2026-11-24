"""Pack-wide pieces, shared by every node: the image galleries' and sounds' HTTP routes, result saving, the expansion output."""
import asyncio
import contextlib
import functools
import html
import json
import os
import re
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date
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


SOUNDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "Sound")


def sounds():
    """The sounds Krea2 One can play when a Run is done (Settings → Sound): the audio files in assets/Sound."""
    names = os.listdir(SOUNDS) if os.path.isdir(SOUNDS) else []
    return sorted(n for n in names if n.lower().endswith((".mp3", ".wav", ".ogg", ".m4a", ".flac")))


@PromptServer.instance.routes.get("/mynode/sounds")
async def _sounds(request):
    return web.json_response(sounds())


@PromptServer.instance.routes.get("/mynode/sound")
async def _sound(request):
    name = request.query.get("name", "")
    if name not in sounds():  # only a listed name: it can't reach outside the folder
        return web.Response(status=404)
    return web.FileResponse(os.path.join(SOUNDS, name))


def _save_path(folder, prefix, w=0, h=0):
    """get_save_image_path for SAVE, into a folder per day (SAVE/2026-11-14/): SAVE is a subfolder of ComfyUI's output
    (core refuses one that leaves it) or a full path."""
    prefix = os.path.join(date.today().isoformat(), prefix)
    if os.path.isabs(folder):
        return folder_paths.get_save_image_path(prefix, folder, w, h)
    return folder_paths.get_save_image_path(os.path.join(folder, prefix), folder_paths.get_output_directory(), w, h)


DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
# a result's name in SAVE: 2026-11-14/ID_8.png; before 1.16.0 ID_7.png in SAVE itself, before 1.15.0 FACE_00007_.png
RESULT = re.compile(r"(?:\d{4}-\d{2}-\d{2}/)?(?:ID_(\d+)\.png|FACE_(\d+)_\.png)")


def result_id(name):
    """A result's number, the ID the gallery shows; None for any other file."""
    m = RESULT.fullmatch(name)
    return int(m[1] or m[2]) if m else None


def results(path):
    """[(id, name)] of every result in a SAVE folder, its day folders included, newest first."""
    days = [d for d in os.listdir(path) if DAY.fullmatch(d) and os.path.isdir(os.path.join(path, d))]
    names = os.listdir(path) + [f"{d}/{n}" for d in days for n in os.listdir(os.path.join(path, d))]
    return sorted(((i, n) for n in names if (i := result_id(n))), reverse=True)


def save_images(images, folder, cls, info=None, beside=None):
    """Results as SAVE/<day>/ID_<n>.png, named like their gallery cards, with the workflow inside and info as a "mynode"
    text chunk (the card reads it). n goes on from the highest result in SAVE, other days and old names included, so an
    ID never repeats. folder: a subfolder of ComfyUI's output, a full path, or empty (not saved, only previewed).
    beside: more files of each result, {".mp4": write(path)}, saved next to its PNG as ID_<n>.mp4."""
    folder = folder.strip().strip('"')  # Explorer's "Copy as path" quotes the path
    if not folder:
        return ui.PreviewImage(images, cls=cls).as_dict()["images"]
    full, _, _, sub, _ = _save_path(folder, "ID", images[0].shape[1], images[0].shape[0])
    meta = ui.ImageSaveHelper._create_png_metadata(cls)
    if meta and info:
        meta.add_text("mynode", json.dumps(info, ensure_ascii=False))
    first = 1 + max((i for i, _ in results(os.path.dirname(full))), default=0)
    files = [f"ID_{first + i}.png" for i in range(len(images))]
    for file, im in zip(files, images, strict=True):
        ui.ImageSaveHelper._convert_tensor_to_pil(im).save(os.path.join(full, file), pnginfo=meta, compress_level=4)
        for ext, write in (beside or {}).items():
            write(os.path.join(full, file.removesuffix(".png") + ext))
    # mn_id, not id: newer core registers each output entry as an asset and writes its UUID into "id"
    if os.path.isabs(folder):  # /view only serves output, input and temp: the face gets a temp copy, and the ID
        return [{**e, "mn_id": first + i} for i, e in enumerate(ui.PreviewImage(images, cls=cls).as_dict()["images"])]
    return [{"filename": file, "subfolder": sub, "type": "output", "mn_id": first + i} for i, file in enumerate(files)]


LLM_PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "llm.html")
LLM_SIDE = 2048  # the picture beside a prompt only shows what it was written from: 0.3-0.8 MB, not a 2-15 MB PNG


def save_llm(text, ru, image, folder):
    """A prompt written from a picture (Settings → LLM), in a folder of its own in SAVE/<day>/: 001/001_LLM.jpg (the
    picture, its long side up to LLM_SIDE), .txt (the prompt) and .html (the picture and the prompt, EN / RU, laid out
    like MyNode.svg's page). No folder or no text: not saved."""
    folder = folder.strip().strip('"')
    if not folder or not text.strip():
        return None
    day = _save_path(folder, "LLM")[0]  # the day folder, inside output when SAVE is relative
    os.makedirs(day, exist_ok=True)
    n = 1 + max((int(d) for d in os.listdir(day) if d.isdigit()), default=0)
    out, name = os.path.join(day, f"{n:03}"), f"{n:03}_LLM"
    os.makedirs(out)
    picture = ui.ImageSaveHelper._convert_tensor_to_pil(image[0]).convert("RGB")
    picture.thumbnail((LLM_SIDE, LLM_SIDE))  # never enlarges
    picture.save(os.path.join(out, name + ".jpg"), quality=92, optimize=True)
    with open(LLM_PAGE, encoding="utf-8") as f:
        page = f.read()
    for key, value in (("{{name}}", name), ("{{en}}", html.escape(text.strip())), ("{{ru}}", html.escape(ru.strip()))):
        page = page.replace(key, value)
    for ext, body in ((".txt", text), (".html", page)):
        with open(os.path.join(out, name + ext), "w", encoding="utf-8") as f:
            f.write(body)
    return out


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
    found = results(path) if path else []
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


# the LLM tab's result in its SAVE (save_llm): 2026-11-15/001/001_LLM.jpg (.png before 1.24.0), .txt and .html
LLM_FILE = re.compile(r"\d{4}-\d{2}-\d{2}/(\d{3,})/\1_LLM\.(?:jpg|png|txt|html)")


def saved_files(save, llm):
    """What Krea2 One saved in SAVE and what its LLM tab wrote in its own SAVE: [(path, name in the zip)], each under its
    folder's name; a result's name there is .jpg (pack). Only those files: a zip of whatever folder a request names
    would hand over anything in it."""
    out = {}
    if path := results_dir(save):
        for _, name in results(path):
            out[os.path.join(path, name)] = f"{os.path.basename(path)}/{os.path.splitext(name)[0]}.jpg"
    if path := results_dir(llm):
        for root, _, names in os.walk(path):
            for n in names:
                rel = os.path.relpath(os.path.join(root, n), path).replace("\\", "/")
                if LLM_FILE.fullmatch(rel):
                    out[os.path.join(root, n)] = f"{os.path.basename(path)}/{rel}"
    return sorted(out.items(), key=lambda f: f[1])


def _jpeg(path):
    """A result as JPEG 95 without chroma subsampling: a fifth of its PNG and the same to the eye (PSNR ~45 dB on
    Krea2 One's 2048x3072), but without the workflow inside. The PNG is lossless already: a zip saves under 3% of it."""
    buf = BytesIO()
    with Image.open(path) as im:
        im.convert("RGB").save(buf, "JPEG", quality=95, subsampling=0, optimize=True)
    return buf.getvalue()


def pack(files, path):
    """saved_files into a zip: each result's PNG as JPEG (_jpeg; the PNG in SAVE stays), the LLM tab's files as they are."""
    def jpeg(file):
        full, name = file
        if not (full.endswith(".png") and name.endswith(".jpg")):
            return name, None
        try:
            return name, _jpeg(full)
        except OSError:  # a result still being saved, or a broken one, goes in as it is: the zip itself must not fail
            return os.path.splitext(name)[0] + ".png", None

    # the PNGs decode side by side (JPEG encoding holds the GIL, more threads gain nothing): 350 results in ~45 s, not ~85
    with ThreadPoolExecutor(4) as pool, zipfile.ZipFile(path, "w") as z:
        for (full, _), (name, data) in zip(files, pool.map(jpeg, files), strict=True):
            if data is None:
                z.write(full, name)
            else:
                z.writestr(zipfile.ZipInfo.from_file(full, name), data)  # dated as the result, not as the zip


@PromptServer.instance.routes.get("/mynode/zip")
async def _zip(request):
    """Settings → Save → zip: saved_files as one .zip download. check=1: only how many files, so the face can say so first.
    Packed into ComfyUI's temp folder, then sent with its length (the browser shows how far), then deleted."""
    q = request.query
    files = await asyncio.to_thread(saved_files, q.get("save", ""), q.get("llm", ""))
    if q.get("check"):
        return web.json_response({"files": len(files)})
    if not files:
        return web.Response(status=404)
    tmp = os.path.join(folder_paths.get_temp_directory(), f"gsen_{uuid.uuid4().hex}.zip")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    try:
        await asyncio.to_thread(pack, files, tmp)
        resp = web.StreamResponse(headers={"Content-Type": "application/zip",
                                           "Content-Disposition": f'attachment; filename="GSEN_{date.today()}.zip"'})
        resp.content_length = os.path.getsize(tmp)
        await resp.prepare(request)
        with open(tmp, "rb") as f:
            while chunk := await asyncio.to_thread(f.read, 1 << 20):
                await resp.write(chunk)
        await resp.write_eof()
        return resp
    finally:
        with contextlib.suppress(OSError):
            os.remove(tmp)


class Expansion(io.NodeOutput):
    """Output of a node that only expands into a graph and has no sockets of its own."""

    # shortcut: core 0.44 crashes on an expand with zero outputs (NodeOutput.result is None and
    # execution.py calls len() on it); drop this class once NodeOutput.result returns ()
    @property
    def result(self):
        return ()
