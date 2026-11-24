"""Krea2 One (was FACE Processing): the node and the small internal nodes its graph expands into."""
from . import models  # noqa: F401  registers Settings' model check and download routes
from .node import FaceProcessing, LLMPrompt
from .parts import (CropRotatePad, Decode, H3Memory, H3Prompt, Krea2Encode, Krea2Patch, LLMText, Look, Sheet, Show,
                    TiledStitch, TiledUpscale, Translate)

NODES = [FaceProcessing, Krea2Patch, Krea2Encode, Translate, Decode, Show, CropRotatePad, LLMPrompt, LLMText, TiledUpscale,
         TiledStitch, Look, H3Prompt, H3Memory, Sheet]
