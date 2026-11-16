"""Face Crop Test: Krea2 One's Crop on its own, to try the face templates: the picture as cropped, or with everything
outside the face oval gray. A test bench: what proves itself goes into Krea2 One, then this node goes."""
import numpy as np
import torch
from PIL import Image, ImageOps

import folder_paths
from comfy_api.latest import io, ui

from ..assets import crop_edit
from ..common import input_images


class FaceCropTest(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MyNode_FaceCropTest",
            display_name="Face Crop Test (GSEN)",
            category="🟩 GSEN",
            is_output_node=True,
            is_experimental=True,
            inputs=[
                io.Combo.Input("image", options=input_images()),
                io.Boolean.Input("mask", default=False, label_on="on", label_off="off",
                                 tooltip="On: outside the face oval is gray (Format Face 1:1 or Face 2:3)."),
                io.String.Input("crop", default="", tooltip="The preview's crop: JSON, as Krea2 One's."),
            ],
            outputs=[io.Image.Output(display_name="image"),
                     io.Mask.Output(display_name="mask", tooltip="The face oval, 1 inside; all 1 without a face template.")],
        )

    @classmethod
    def execute(cls, image, mask, crop):
        with Image.open(folder_paths.get_annotated_filepath(image)) as im:
            picture = ImageOps.exif_transpose(im).convert("RGB")  # upright, as LoadImage gives it
        out = torch.from_numpy(np.asarray(picture, dtype=np.float32) / 255.0)[None]
        spec = crop_edit.spec_of(crop, image)
        if spec:
            out = crop_edit.apply(out, spec)
        oval, (h, w) = crop_edit.face_oval(crop, image), out.shape[1:3]
        m = crop_edit.oval_mask(oval, spec["pad"] if spec else (0, 0, 0, 0), h, w) if oval else torch.ones(1, h, w)
        if mask and oval:
            out = out * m[..., None] + 0.5 * (1 - m[..., None])
        # not "images": that key makes the frontend add its own preview under the face
        return io.NodeOutput(out, m, ui={"mn_images": ui.PreviewImage(out, cls=cls).values})
