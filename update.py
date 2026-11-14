"""Settings → Update: this pack's version, the newest one on GitHub, and getting it.

A git clone updates with git pull; a folder unpacked from a zip downloads GitHub's zip of main over itself; the
development copy (the pack inside a bigger repo) is left alone. Files already in assets/prompts are the user's system
prompts and stay as they are; web/ mirrors the new version exactly, since the frontend loads every .js under it.
"""
import asyncio
import logging
import re
import shutil
import subprocess
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path

from aiohttp import web

from server import PromptServer

from .assets.node import core_problems

PACK = Path(__file__).resolve().parent
KEEP = "assets/prompts/"
MIRROR = "web/"


def migrate(pack=PACK):
    """1.18.0 renamed face/ to assets/. An update from an older version leaves the user's prompts in face/prompts: they
    move to assets/prompts as they are (theirs win, as KEEP always kept them), then the rest of face/, old code, goes."""
    old = pack / "face"
    if not old.is_dir():
        return
    try:
        for f in sorted(old.glob("prompts/**/*")):
            if f.is_file():
                dest = pack / KEEP / f.relative_to(old / "prompts")
                dest.parent.mkdir(parents=True, exist_ok=True)
                f.replace(dest)
        shutil.rmtree(old)
    except OSError as e:  # a file in use: the next start tries again
        logging.warning("GSEN: moving face/ to assets/: %s", e)


migrate()


def field(text, key):
    """A 'key = "value"' line of pyproject.toml."""
    m = re.search(rf'^{key}\s*=\s*"([^"]*)"', text, re.M)
    return m.group(1) if m else None


def _pyproject(pack=PACK):
    return (pack / "pyproject.toml").read_text(encoding="utf-8")


def newer(a, b):
    """Version a is newer than version b ("1.10.0" > "1.9.0")."""
    return tuple(map(int, a.split("."))) > tuple(map(int, b.split(".")))


def mode(pack=PACK):
    """git: a clone of the repo; dev: inside a bigger repo (the development copy); zip: plain files."""
    if (pack / ".git").exists():
        return "git"
    return "dev" if any((p / ".git").exists() for p in pack.parents) else "zip"


def _get(url, timeout):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def latest(repo):
    """The version in pyproject.toml on the repo's main branch; a short wait, so an offline page doesn't hang."""
    path = repo.removeprefix("https://github.com/").strip("/")
    return field(_get(f"https://raw.githubusercontent.com/{path}/main/pyproject.toml", 5).decode("utf-8"), "version")


def unpack(data, pack=PACK):
    """GitHub's zip of main ("<repo>-main/..." inside) over the pack; returns the files it wrote or removed."""
    changed, fresh = [], set()
    with zipfile.ZipFile(BytesIO(data)) as z:
        for info in z.infolist():
            rel = info.filename.partition("/")[2]
            dest = (pack / rel).resolve()
            if info.is_dir() or not rel or pack not in dest.parents:
                continue
            fresh.add(rel)
            new = z.read(info)
            if (rel.startswith(KEEP) and dest.exists()) or (dest.exists() and dest.read_bytes() == new):
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(new)
            changed.append(rel)
    if any(rel.startswith(MIRROR) for rel in fresh):  # a zip without web/ is broken, not a version without a face
        for old in (pack / MIRROR).rglob("*"):
            rel = old.relative_to(pack).as_posix()
            if old.is_file() and rel not in fresh:
                old.unlink()
                changed.append(rel)
    return changed


def status():
    text = _pyproject()
    info = {"version": field(text, "version"), "mode": mode(), "repo": field(text, "Repository"), "problems": core_problems()}
    if info["repo"]:
        try:
            info["latest"] = latest(info["repo"])
            info["available"] = newer(info["latest"], info["version"])
        except Exception as e:  # offline, or GitHub unreachable: the rest still shows
            info["error"] = f"GitHub: {e}"
    return info


def apply():
    m, repo = mode(), field(_pyproject(), "Repository")
    if m == "dev":
        return {"error": "This is the development copy: it is the source, there is nothing to update."}
    if m == "git":
        r = subprocess.run(["git", "pull", "--ff-only"], check=False, cwd=PACK, capture_output=True, text=True, timeout=120)
        return {"ok": r.returncode == 0, "log": (r.stdout + r.stderr).strip(), "version": field(_pyproject(), "version")}
    if not repo:
        return {"error": "No GitHub repository in pyproject.toml"}
    changed = unpack(_get(f"{repo.rstrip('/')}/archive/refs/heads/main.zip", 120))
    return {"ok": True, "changed": changed, "version": field(_pyproject(), "version")}


@PromptServer.instance.routes.get("/mynode/update")
async def _status(request):
    return web.json_response(await asyncio.to_thread(status))


@PromptServer.instance.routes.post("/mynode/update")
async def _apply(request):
    try:
        return web.json_response(await asyncio.to_thread(apply))
    except Exception as e:
        return web.json_response({"error": str(e)})
