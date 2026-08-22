#!/usr/bin/env python3
"""Slice a wake-phrase recording session into per-utterance clips.

The gate (check_model.py) scores positives ONE CLIP PER FILE. The easiest
way to collect real positives is a single capture of someone saying the
wake phrase repeatedly with pauses — this splits that recording on silence
into individual clips check_model.py can consume.

    python slice_positives.py session.wav out_dir/ --label hey_clem

Energy-based segmentation tuned for "short phrase, clear pauses":
frame RMS against a noise-floor-relative threshold, gap merging, and
padding. Prints one line per clip so mislabeled splits are easy to spot;
listen to (or re-slice) anything suspicious rather than feeding the gate
a clip that is actually two utterances or a cough.

16-bit PCM wav in (any rate, mono or stereo); clips out at the input rate.
"""

from __future__ import annotations

import argparse
import os
import sys
import wave

import numpy as np

FRAME_S = 0.05          # RMS frame size
MERGE_GAP_S = 0.35      # gaps shorter than this join two segments
MIN_UTTERANCE_S = 0.25  # drop blips shorter than this (a click, a breath)
MAX_UTTERANCE_S = 3.0   # flag anything longer (probably two phrases)
PAD_S = 0.25            # context kept on each side of a segment


def read_wav(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path) as w:
        if w.getsampwidth() != 2:
            raise ValueError(f"{path}: only 16-bit PCM is supported")
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        channels, rate = w.getnchannels(), w.getframerate()
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1).astype(np.int16)
    return audio, rate


def segments(audio: np.ndarray, rate: int) -> list[tuple[int, int]]:
    frame = max(1, int(rate * FRAME_S))
    n_frames = len(audio) // frame
    if n_frames == 0:
        return []
    rms = np.sqrt(
        (audio[: n_frames * frame].astype(np.float64) ** 2)
        .reshape(n_frames, frame)
        .mean(axis=1)
    )
    # Noise floor from the quietest quarter of frames; speech must clear
    # 4x that, with an absolute floor so silence-only recordings yield nothing.
    floor = np.percentile(rms, 25)
    threshold = max(floor * 4.0, 120.0)
    active = rms >= threshold

    segs: list[tuple[int, int]] = []
    start = None
    for i, on in enumerate(active):
        if on and start is None:
            start = i
        elif not on and start is not None:
            segs.append((start * frame, i * frame))
            start = None
    if start is not None:
        segs.append((start * frame, n_frames * frame))

    merged: list[tuple[int, int]] = []
    max_gap = int(rate * MERGE_GAP_S)
    for s, e in segs:
        if merged and s - merged[-1][1] <= max_gap:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))

    pad = int(rate * PAD_S)
    return [
        (max(0, s - pad), min(len(audio), e + pad))
        for s, e in merged
        if (e - s) >= int(rate * MIN_UTTERANCE_S)
    ]


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("input", help="capture wav containing repeated utterances")
    ap.add_argument("out_dir", help="directory for the per-utterance clips")
    ap.add_argument("--label", default="clip", help="clip filename prefix")
    args = ap.parse_args()

    audio, rate = read_wav(args.input)
    segs = segments(audio, rate)
    if not segs:
        print("no utterances found — is the recording silent?", file=sys.stderr)
        return 1

    os.makedirs(args.out_dir, exist_ok=True)
    long_ones = 0
    for i, (s, e) in enumerate(segs, 1):
        dur = (e - s) / rate
        flag = ""
        if dur > MAX_UTTERANCE_S:
            long_ones += 1
            flag = "  <-- LONG: listen to this one, may be two utterances"
        path = os.path.join(args.out_dir, f"{args.label}_{i:03d}.wav")
        with wave.open(path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(audio[s:e].tobytes())
        print(f"{path}  {s / rate:7.2f}s -> {e / rate:7.2f}s  ({dur:.2f}s){flag}")

    print(f"\n{len(segs)} clips written to {args.out_dir}"
          + (f" — {long_ones} flagged LONG, review before gating" if long_ones else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
