"""Krea2 One (was FACE Processing): the node and the small internal nodes its graph expands into."""
from .node import FaceProcessing
from .parts import CropRotatePad, Decode, FaceCrop, Krea2Encode, Krea2Patch, Show, Translate

NODES = [FaceProcessing, FaceCrop, Krea2Patch, Krea2Encode, Translate, Decode, Show, CropRotatePad]
