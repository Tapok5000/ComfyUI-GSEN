// node ComfyUI-GSEN/tests/test_crop.mjs: Crop's presets and the box kept at their ratio (web/assets/crop.js), no browser
import assert from "node:assert/strict"
import { aspectOf, fitIn, resizeLocked, withRatio, zoomAt } from "../web/assets/crop.js"

assert.equal(aspectOf("free", 1600, 2400, 0), 0)
assert.equal(aspectOf("9:16", 1600, 2400, 0), 9 / 16)
assert.equal(aspectOf("face 2:3", 1600, 2400, 0), 2 / 3)
assert.equal(aspectOf("orig", 1600, 2400, 0), 2 / 3)
assert.equal(aspectOf("orig", 1600, 2400, -90), 3 / 2) // turned a quarter, the picture lies on its side

// a preset on the whole picture gives its largest box, in the middle (Windows); on a set box, about its size and middle
assert.deepEqual(withRatio([0, 0, 1600, 2400], 1, 1600, 2400), [0, 400, 1600, 1600])
assert.deepEqual(withRatio([0, 0, 1600, 2400], 16 / 9, 1600, 2400), [0, 750, 1600, 900])
assert.deepEqual(withRatio([286, 400, 1242, 1242], 2 / 3, 1600, 2400), [400, 260, 1014, 1521])

// a corner keeps the one across and follows the axis moved more along; a side keeps the middle along it
assert.deepEqual(resizeLocked([100, 100, 400, 400], "se", 100, 20, 1, 1600, 2400), [100, 100, 500, 500])
assert.deepEqual(resizeLocked([100, 100, 400, 400], "nw", 20, 100, 1, 1600, 2400), [200, 200, 300, 300])
assert.deepEqual(resizeLocked([100, 100, 400, 200], "e", 100, 0, 2, 1600, 2400), [100, 75, 500, 250])
assert.deepEqual(resizeLocked([100, 100, 400, 200], "n", 0, -100, 2, 1600, 2400), [0, 0, 600, 300])
// the canvas stops it, the ratio stays
assert.deepEqual(resizeLocked([1000, 100, 400, 400], "se", 900, 900, 1, 1600, 2400), [1000, 100, 600, 600])
assert.deepEqual(resizeLocked([1000, 100, 400, 400], "nw", 0, -900, 1, 1600, 2400), [900, 0, 500, 500])

// the wheel: the box zooms about the point under the pointer, which stays where it was in it; out only to the picture
assert.deepEqual(zoomAt([0, 0, 1600, 2400], 800, 1000, 0.5, 1600, 2400), [400, 500, 800, 1200])
const [zx, , zw] = zoomAt([400, 500, 800, 1200], 600, 900, 0.8, 1600, 2400)
assert.equal((600 - zx) / zw, (600 - 400) / 800)
assert.deepEqual(zoomAt([400, 500, 800, 1200], 600, 900, 4, 1600, 2400), [0, 0, 1600, 2400])
assert.deepEqual(zoomAt([0, 0, 20, 20], 10, 10, 0.1, 1600, 2400), [2, 2, 16, 16])

// too big for the canvas: shrinks whole about its middle at a ratio, is only cut without one
assert.deepEqual(fitIn([0, 0, 2000, 1000], 1600, 2400, 2), [0, 100, 1600, 800])
assert.deepEqual(fitIn([0, 0, 2000, 1000], 1600, 2400, 0), [0, 0, 1600, 1000])
console.log("test_crop: ok")
