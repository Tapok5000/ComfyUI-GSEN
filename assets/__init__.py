"""Krea2 One (was FACE Processing): the node and the small internal nodes its graph expands into."""
from . import models  # noqa: F401  registers Settings' model check and download routes
from .node import FaceProcessing, LLMPrompt
from .parts import CropRotatePad, Decode, FaceCrop, Krea2Encode, Krea2Patch, LLMText, Show, Translate

NODES = [FaceProcessing, FaceCrop, Krea2Patch, Krea2Encode, Translate, Decode, Show, CropRotatePad, LLMPrompt, LLMText]
