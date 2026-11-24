"""H3 · CH SHEET: Muse-CharacterSheet-H3's "H3 Character Sheet" workflow at its INSTALLATION.md settings (MIT,
licenses/muse-charactersheet-h3.txt), on ComfyUI's core MiniMax H3. The picture is <Picture 1>; H3 turns the person
around in 10 s, and five of its frames become one sheet (parts.Sheet). Left out: Muse's CHUNK/CUT editor, RefMod,
two-stage sampling, video and audio references, background removal (GPL)."""
import json
from pathlib import Path

SHEET = json.loads((Path(__file__).parent / "h3_sheet.json").read_text(encoding="utf-8"))  # the workflow's CUTs and style
SECONDS, WIDTH, HEIGHT, LENGTH = 10, 544, 960, 243  # 9:16 at 0.5 MP on 32 px; 10 s at 24 fps on H3's 17k+5 frames
PICKS = (236, 24, 168, 72, 120)  # the sheet's panels, the workflow's frames: close-up, front, left, right, back
TRIGGERS = {"h3-realism-people": "r34l1sm", "perfe8ct": "perfe8ct"}  # INSTALLATION.md: a LoRA's word only with it


def triggers(loras):
    """The trigger words of the LoRA files in use, in the workflow's order."""
    return [word for key, word in TRIGGERS.items() if any(key in name.lower() for name in loras)]


def stamp(seconds):
    return f"{int(seconds // 60):02d}:{seconds % 60:06.3f}"  # MiniMax's [Shot N] At MM:SS.mmm


def prompt(description, words):
    """Muse's six sections, as its compiler writes them for one reference picture and these CUTs. words: the LoRAs'
    trigger words, a line before them, and the realism one before each CUT, as the workflow has it."""
    total, at, shots = sum(w for _, w in SHEET["cuts"]), 0.0, []
    lead = "r34l1sm, " if "r34l1sm" in words else ""
    for n, (cut, weight) in enumerate(SHEET["cuts"], 1):
        shots.append(f"[Shot {n}] " + (f"At {stamp(at)}, " if n > 1 else "") + lead + cut)
        at += weight / total * SECONDS
    who = f"is {description.strip()} (from `<Picture 1>`)" if description.strip() else "is the subject shown in `<Picture 1>`"
    sections = {"subject_definitions": f"<Subject 1> {who}.",
                "summary": "[reference generation] The target video shows <Subject 1>.",
                "retention_analysis": "<Subject 1> (present throughout): fully_preserved - matches `<Picture 1>`.",
                "detailed_description": "\n".join([SHEET["style"], *shots]),
                "overall_soundscape": "N/A", "non_diegetic_music": "N/A"}
    text = "\n\n".join(f"{k}:\n{v}" for k, v in sections.items())
    return f"{', '.join(words)},\n{text}" if words else text


def build(g, picture, description, seed, loras, i):
    """The workflow on core nodes: H3 with its LoRAs and parts.H3Memory, the reference call, one sampler pass at the
    workflow's 8 steps, the video and its sound decoded, the sheet. Returns (sheet, frames, audio, prompt, sampling)."""
    model = g.node("UNETLoader", unet_name=i["h3_unet_name"], weight_dtype="default").out(0)
    for name, strength in loras:
        model = g.node("LoraLoaderModelOnly", model=model, lora_name=name, strength_model=strength).out(0)
    model = g.node("MyNode_H3Memory", model=model).out(0)
    clip = g.node("CLIPLoader", clip_name=i["h3_clip_name"], type="minimax", device="default").out(0)
    vae = g.node("VAELoader", vae_name=i["h3_vae_video"]).out(0)
    audio_vae = g.node("VAELoader", vae_name=i["h3_vae_audio"]).out(0)
    text = g.node("MyNode_H3Prompt", description=description, words=", ".join(triggers([n for n, _ in loras]))).out(0)
    cond = g.node("MiniMaxH3ReferenceToVideo", clip=clip, vae=vae, audio_vae=audio_vae, prompt=text, width=WIDTH,
                  height=HEIGHT, length=LENGTH, ref_image_size="max", **{"ref_images.ref_image_0": picture})
    steps, sampler, scheduler = i.get("h3_steps", 8), i.get("h3_sampler", "euler"), i.get("h3_scheduler", "simple")
    samples = g.node("SamplerCustomAdvanced", noise=g.node("RandomNoise", noise_seed=seed).out(0),
                     guider=g.node("BasicGuider", model=model, conditioning=cond.out(0)).out(0),
                     sampler=g.node("KSamplerSelect", sampler_name=sampler).out(0),
                     sigmas=g.node("BasicScheduler", model=model, scheduler=scheduler, steps=steps, denoise=1.0).out(0),
                     latent_image=cond.out(1)).out(0)
    frames = g.node("VAEDecode", samples=samples, vae=vae).out(0)
    audio = g.node("VAEDecodeAudio", samples=samples, vae=audio_vae).out(0)
    return g.node("MyNode_Sheet", frames=frames).out(0), frames, audio, text, (steps, sampler, scheduler)
