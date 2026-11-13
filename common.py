"""Pack-wide pieces, shared by every node: the image gallery's HTTP routes, result saving, the expansion output."""
import asyncio
import functools
import os
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


def save_images(images, folder, prefix, cls):
    """Results as numbered PNGs with the workflow inside. folder: a subfolder of ComfyUI's output, an absolute
    path, or empty (not saved, only previewed). Returns the entries a node's face shows."""
    folder = folder.strip().strip('"')  # Explorer's "Copy as path" quotes the path
    if not folder:
        return ui.PreviewImage(images, cls=cls).as_dict()["images"]
    if not os.path.isabs(folder):  # core refuses a path that leaves the output folder
        return ui.ImageSaveHelper.get_save_images_ui(images, os.path.join(folder, prefix), cls=cls).as_dict()["images"]
    full, name, counter, _, _ = folder_paths.get_save_image_path(prefix, folder, images[0].shape[1], images[0].shape[0])
    meta = ui.ImageSaveHelper._create_png_metadata(cls)
    for i, im in enumerate(images):
        path = os.path.join(full, f"{name}_{counter + i:05}_.png")
        ui.ImageSaveHelper._convert_tensor_to_pil(im).save(path, pnginfo=meta, compress_level=4)
    return ui.PreviewImage(images, cls=cls).as_dict()["images"]  # /view only serves output, input and temp


class Expansion(io.NodeOutput):
    """Output of a node that only expands into a graph and has no sockets of its own."""

    # shortcut: core 0.44 crashes on an expand with zero outputs (NodeOutput.result is None and
    # execution.py calls len() on it); drop this class once NodeOutput.result returns ()
    @property
    def result(self):
        return ()
