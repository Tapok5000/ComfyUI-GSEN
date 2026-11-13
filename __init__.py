"""MyNode: personal ComfyUI nodes. One folder per node; a new node = its folder + one entry in NODES."""
import logging

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

from . import common  # noqa: F401  registers the gallery HTTP routes
from . import face
from . import update  # noqa: F401  registers Settings → Update's routes
from .face.node import core_problems

WEB_DIRECTORY = "./web"
NODES = [*face.NODES]


class MyNodeExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        for problem in core_problems():  # this ComfyUI changed a core node Krea2 One's graph is built from
            logging.warning("MyNode: %s. Run may fail; Settings → Update gets a version that knows this ComfyUI.", problem)
        return NODES


async def comfy_entrypoint() -> MyNodeExtension:
    return MyNodeExtension()
