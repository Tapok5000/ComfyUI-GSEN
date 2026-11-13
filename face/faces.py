"""Face crop (CROP ON in 444.json): the input scaled to 1280 on its longest side, then the face cut out 1:1.

Ported 1:1 from 444.json's FaceCrop subgraph, so the pack needs no other node packs (licenses in licenses/):
- scaling: comfyui_layerstyle "ImageScaleByAspectRatio V2" (MIT, chflame163) with original / crop / lanczos /
  round 16 / longest / 1280;
- detector: Pytorch_Retinaface MobileNet-0.25 (MIT, biubug6), weights as bundled by ComfyUI-AutoCropFaces;
- crop: ComfyUI-AutoCropFaces "AutoCropFaces" (MIT, Liu Sida) with 1 face, scale 2, shift 0.45, start_index 1, 1:1.
"""
import math
from functools import lru_cache
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torch import nn

import comfy.model_management
import comfy.utils

WEIGHTS = Path(__file__).parent / "retinaface_mobilenet0.25.safetensors"


def scale_longest(image, length=1280, multiple=16):
    """Longest side -> length, both sides rounded up to multiple, center-cropped to fit, PIL Lanczos."""
    out = []
    for im in image:
        pil = Image.fromarray(np.clip(255.0 * im.float().cpu().numpy(), 0, 255).astype(np.uint8)).convert("RGB")
        w, h = pil.size
        ratio = w / h
        tw, th = (length, int(length / ratio)) if ratio > 1 else (int(length * ratio), length)
        tw, th = -(-tw // multiple) * multiple, -(-th // multiple) * multiple
        if w / h > tw / th:
            fw = int(h * tw / th)
            pil = pil.crop(((w - fw) // 2, 0, (w - fw) // 2 + fw, h))
        else:
            fh = int(w * th / tw)
            pil = pil.crop((0, (h - fh) // 2, w, (h - fh) // 2 + fh))
        out.append(torch.from_numpy(np.array(pil.resize((tw, th), Image.LANCZOS)).astype(np.float32) / 255.0))
    return torch.stack(out)


def _conv_bn(i, o, stride=1, leaky=0.0):
    return nn.Sequential(nn.Conv2d(i, o, 3, stride, 1, bias=False), nn.BatchNorm2d(o), nn.LeakyReLU(leaky, inplace=True))


def _conv_bn_no_relu(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, 1, 1, bias=False), nn.BatchNorm2d(o))


def _conv_bn1x1(i, o, leaky):
    return nn.Sequential(nn.Conv2d(i, o, 1, 1, 0, bias=False), nn.BatchNorm2d(o), nn.LeakyReLU(leaky, inplace=True))


def _conv_dw(i, o, stride, leaky=0.1):
    return nn.Sequential(
        nn.Conv2d(i, i, 3, stride, 1, groups=i, bias=False), nn.BatchNorm2d(i), nn.LeakyReLU(leaky, inplace=True),
        nn.Conv2d(i, o, 1, 1, 0, bias=False), nn.BatchNorm2d(o), nn.LeakyReLU(leaky, inplace=True))


class _SSH(nn.Module):
    def __init__(self, i, o, leaky=0.1):
        super().__init__()
        self.conv3X3 = _conv_bn_no_relu(i, o // 2)
        self.conv5X5_1 = _conv_bn(i, o // 4, leaky=leaky)
        self.conv5X5_2 = _conv_bn_no_relu(o // 4, o // 4)
        self.conv7X7_2 = _conv_bn(o // 4, o // 4, leaky=leaky)
        self.conv7x7_3 = _conv_bn_no_relu(o // 4, o // 4)

    def forward(self, x):
        c5 = self.conv5X5_1(x)
        return F.relu(torch.cat([self.conv3X3(x), self.conv5X5_2(c5), self.conv7x7_3(self.conv7X7_2(c5))], dim=1))


class _FPN(nn.Module):
    def __init__(self, ins, o, leaky=0.1):
        super().__init__()
        self.output1, self.output2, self.output3 = (_conv_bn1x1(i, o, leaky) for i in ins)
        self.merge1 = _conv_bn(o, o, leaky=leaky)
        self.merge2 = _conv_bn(o, o, leaky=leaky)

    def forward(self, x):
        o1, o2, o3 = self.output1(x[0]), self.output2(x[1]), self.output3(x[2])
        o2 = self.merge2(o2 + F.interpolate(o3, size=[o2.size(2), o2.size(3)], mode="nearest"))
        o1 = self.merge1(o1 + F.interpolate(o2, size=[o1.size(2), o1.size(3)], mode="nearest"))
        return [o1, o2, o3]


class _Head(nn.Module):
    def __init__(self, values, anchors=2, channels=64):
        super().__init__()
        self.values = values
        self.conv1x1 = nn.Conv2d(channels, anchors * values, 1)

    def forward(self, x):
        return self.conv1x1(x).permute(0, 2, 3, 1).reshape(x.shape[0], -1, self.values)


class _RetinaFace(nn.Module):
    def __init__(self):
        super().__init__()
        self.body = nn.Module()
        self.body.stage1 = nn.Sequential(_conv_bn(3, 8, 2, leaky=0.1), _conv_dw(8, 16, 1), _conv_dw(16, 32, 2),
                                         _conv_dw(32, 32, 1), _conv_dw(32, 64, 2), _conv_dw(64, 64, 1))
        self.body.stage2 = nn.Sequential(_conv_dw(64, 128, 2), *(_conv_dw(128, 128, 1) for _ in range(5)))
        self.body.stage3 = nn.Sequential(_conv_dw(128, 256, 2), _conv_dw(256, 256, 1))
        self.fpn = _FPN([64, 128, 256], 64)
        self.ssh1, self.ssh2, self.ssh3 = _SSH(64, 64), _SSH(64, 64), _SSH(64, 64)
        self.ClassHead = nn.ModuleList(_Head(2) for _ in range(3))
        self.BboxHead = nn.ModuleList(_Head(4) for _ in range(3))
        self.LandmarkHead = nn.ModuleList(_Head(10) for _ in range(3))  # unused, kept so the weights load strictly

    def forward(self, x):
        s1 = self.body.stage1(x)
        s2 = self.body.stage2(s1)
        fpn = self.fpn([s1, s2, self.body.stage3(s2)])
        feats = [ssh(f) for ssh, f in zip((self.ssh1, self.ssh2, self.ssh3), fpn, strict=True)]
        loc = torch.cat([h(f) for h, f in zip(self.BboxHead, feats, strict=True)], dim=1)
        conf = torch.cat([h(f) for h, f in zip(self.ClassHead, feats, strict=True)], dim=1)
        return loc, F.softmax(conf, dim=-1)


@lru_cache(maxsize=1)
def _net():
    net = _RetinaFace()
    net.load_state_dict(comfy.utils.load_torch_file(str(WEIGHTS), safe_load=True))
    return net.eval()


def _priors(h, w):
    out = []
    for sizes, step in zip(((16, 32), (64, 128), (256, 512)), (8, 16, 32), strict=True):
        cy = (torch.arange(math.ceil(h / step), dtype=torch.float64)[:, None, None] + 0.5) * step / h
        cx = (torch.arange(math.ceil(w / step), dtype=torch.float64)[None, :, None] + 0.5) * step / w
        s = torch.tensor(sizes, dtype=torch.float64)[None, None, :]
        out.append(torch.stack(torch.broadcast_tensors(cx, cy, s / w, s / h), dim=-1).reshape(-1, 4))
    return torch.cat(out).float()


def _nms(dets, thresh):
    x1, y1, x2, y2, scores = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3], dets[:, 4]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        w = np.maximum(0.0, np.minimum(x2[i], x2[order[1:]]) - np.maximum(x1[i], x1[order[1:]]) + 1)
        h = np.maximum(0.0, np.minimum(y2[i], y2[order[1:]]) - np.maximum(y1[i], y1[order[1:]]) + 1)
        inter = w * h
        order = order[np.where(inter / (areas[i] + areas[order[1:]] - inter) <= thresh)[0] + 1]
    return keep


def detect(image255, top_k=50, keep_top_k=50, conf=0.02, nms=0.4):
    """Faces in one (H, W, 3) image with values 0..255: rows x1, y1, x2, y2, score, best first."""
    dev = comfy.model_management.get_torch_device()
    net = _net().to(dev)
    h, w, _ = image255.shape
    # the BGR means subtracted from RGB pixels: as the original does
    x = (image255.to(dev, torch.float32) - torch.tensor([104, 117, 123], dtype=torch.float32, device=dev)).permute(2, 0, 1)[None]
    with torch.no_grad():
        loc, scores = net(x)
    priors = _priors(h, w).to(dev)
    var = (0.1, 0.2)
    centers = priors[:, :2] + loc[0, :, :2] * var[0] * priors[:, 2:]
    boxes = torch.cat((centers, priors[:, 2:] * torch.exp(loc[0, :, 2:] * var[1])), 1)
    boxes[:, :2] -= boxes[:, 2:] / 2
    boxes[:, 2:] += boxes[:, :2]
    boxes = (boxes * torch.tensor([w, h, w, h], dtype=torch.float32, device=dev)).cpu().numpy()
    scores = scores[0, :, 1].cpu().numpy()
    keep = np.where(scores > conf)[0]
    boxes, scores = boxes[keep], scores[keep]
    order = scores.argsort()[::-1][:top_k]
    dets = np.hstack((boxes[order], scores[order, np.newaxis])).astype(np.float32, copy=False)
    return dets[_nms(dets, nms), :][:keep_top_k]


def crop_box(x1, y1, x2, y2, img_w, img_h, scale=2.0, shift=0.45, aspect=1.0):
    """The face box grown to scale x its area at the given aspect, moved down by (0.5 - shift) of its height."""
    x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
    fw, fh = x2 - x1, y2 - y1
    side = math.sqrt(fw * fh * scale)
    nw, nh = int(side * math.sqrt(aspect)), int(side / math.sqrt(aspect))
    cx = x1 + fw // 2
    cy = y1 + fh // 2 + int(nh * (0.5 - shift))
    return max(0, cx - nw // 2), max(0, cy - nh // 2), min(img_w, cx + nw // 2), min(img_h, cy + nh // 2)


def crop_face(image, vis=0.6, start_index=1):
    """444.json's FaceCrop: one face of the scaled input, or the scaled input itself when no face is found."""
    scaled = scale_longest(image)
    faces = []
    for im in scaled:
        for x1, y1, x2, y2, score in detect(im * 255)[:, :5]:
            if score >= vis:
                bx1, by1, bx2, by2 = crop_box(x1, y1, x2, y2, im.shape[1], im.shape[0])
                faces.append(im[by1:by2, bx1:bx2])
    if not faces:
        return scaled
    # 444.json takes 1 face from start_index 1: with several faces that is the second most confident one
    return faces[start_index % len(faces)][None]
