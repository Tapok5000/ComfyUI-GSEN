// node ComfyUI-GSEN/tests/test_tree.mjs: the pick list's folders and search (web/shared/tree.js), no browser needed
import assert from "node:assert/strict"
import { tree } from "../web/shared/tree.js"

const show = (rows) => rows.map((r) => `${r.kind}:${r.name}${r.count ? ` ${r.count}` : ""}${r.cur ? " *" : ""}`)
const loras = ["KreeA_LORA\\Edit\\v10.safetensors", "KreeA_LORA\\Edit\\b.safetensors", "KreeA_LORA\\Edit\\v2.safetensors",
  "KreeA_LORA\\x.safetensors", "H3\\h.safetensors", "🌸Brie\\c.safetensors", "top.safetensors"]
const t = tree(loras, "KreeA_LORA\\Edit\\b.safetensors")
assert.equal(t.files, true)

// top: folders (emoji first) with how many files each holds, the current one's lit; then the files
assert.deepEqual(show(t.view([], "")), ["dir:🌸Brie 1", "dir:H3 1", "dir:KreeA_LORA 4 *", "file:top.safetensors"])
// inside: the way back, subfolders, then files by name with numbers in order (v2 before v10); current lit
assert.deepEqual(show(t.view(["KreeA_LORA"], "")), ["back:KreeA_LORA", "dir:Edit 3 *", "file:x.safetensors"])
assert.deepEqual(show(t.view(["KreeA_LORA", "Edit"], "")),
  ["back:KreeA_LORA › Edit", "file:b.safetensors *", "file:v2.safetensors", "file:v10.safetensors"])
assert.deepEqual(t.view(["KreeA_LORA", "Edit"], "")[0].path, ["KreeA_LORA"])

// a search looks in every folder, wants every word in any case, and tells where each hit lies
assert.deepEqual(t.view([], "edit B").map((r) => [r.name, r.dirs, r.value]),
  [["b.safetensors", ["KreeA_LORA", "Edit"], "KreeA_LORA\\Edit\\b.safetensors"]])
assert.deepEqual(t.view([], "nothing like it"), [])

// "/" splits like "\"; a list that isn't files (samplers) stays flat and in its order, even with a "/" in it
assert.deepEqual(show(tree(["a/b.pt", "c.pt"]).view([], "")), ["dir:a 1", "file:c.pt"])
const samplers = tree(["euler", "dpm/2", "ddim"], "ddim")
assert.equal(samplers.files, false)
assert.deepEqual(show(samplers.view([], "")), ["file:euler", "file:dpm/2", "file:ddim *"])
console.log("ok")
