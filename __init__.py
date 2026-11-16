"""GSEN (was MyNode): personal ComfyUI nodes. One folder per node; a new node = its folder + one entry in NODES."""
import contextlib
import logging
import shutil
import sys

from typing_extensions import override

from comfy_api.latest import ComfyExtension, io

from . import common  # noqa: F401  registers the gallery and sound HTTP routes
from . import assets, facetest
from . import update  # also registers Settings → Update's routes
from .assets.node import core_problems

WEB_DIRECTORY = "./web"
NODES = [*assets.NODES, *facetest.NODES]

LIME, PLAIN = "\033[38;2;199;244;0m", "\033[0m"  # c7f400, the pack's lime; the console's own colour
LOGO = """\
 ██████╗ ███████╗███████╗███╗   ██╗
██╔════╝ ██╔════╝██╔════╝████╗  ██║
██║  ███╗███████╗█████╗  ██╔██╗ ██║
██║   ██║╚════██║██╔══╝  ██║╚██╗██║
╚██████╔╝███████║███████╗██║ ╚████║
 ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═══╝"""


def banner(version, count, width=56):
    """The pack's sign in the console at start: GSEN in lime, the version and node count beside it in the plain colour,
    between two lines as wide as the console."""
    rule, art = "═" * width, LOGO.splitlines()
    art[2] += f"{PLAIN}    v{version} | {count} node{'' if count == 1 else 's'} loaded{LIME}"
    return f"\n{LIME}{rule}\n\n" + "\n".join(art) + f"\n\n{rule}{PLAIN}\n"


class MyNodeExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        shown = sum(not n.define_schema().is_dev_only for n in NODES)
        with contextlib.suppress(OSError, UnicodeError):  # a console that can't take it: the nodes still load
            # sys.__stdout__: deepdiff (ComfyUI-Crystools loads it) calls colorama.init(), and sys.stdout loses the colours
            width = shutil.get_terminal_size((56, 24)).columns  # 56 when the output goes to a file, not a window
            print(banner(update.field(update._pyproject(), "version"), shown, width), file=sys.__stdout__, flush=True)
        for problem in core_problems():  # this ComfyUI changed a core node Krea2 One's graph is built from
            logging.warning("GSEN: %s. Run may fail; Settings → Update gets a version that knows this ComfyUI.", problem)
        return NODES


async def comfy_entrypoint() -> MyNodeExtension:
    return MyNodeExtension()
