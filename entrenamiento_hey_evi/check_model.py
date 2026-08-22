#!/usr/bin/env python3
"""Measure a wake-word model before letting it near Clem.

A wake word is the one piece of Clem that is always listening, and a false
accept is not a cosmetic bug: waking opens the cloud voice connection nobody
asked for. So a new model does not get deployed because training finished — it
gets deployed because it was measured against audio from a real room and the
false-accept rate came back low.

This script does that measurement:

  * **False accepts per hour** — streams a folder of negative audio (anything
    that must NOT wake Clem: TV, podcasts, dinner conversation, music) through
    the model and counts activations at each threshold.
  * **Recall** — the fraction of held-out positive clips that would have woken
    him, at those same thresholds.
  * **A recommended threshold** — the lowest one that stays inside the
    false-accept budget, which is also the most sensitive one that is safe.

Both folders are optional; run it with only negatives to check an existing
model, or only positives to sanity-check a fresh one.

    python check_model.py --model hey_clem.onnx --negatives ~/room_audio \
        --positives ~/hey_clem_heldout

Reads .wav only (any sample rate, mono or stereo; converted internally). For
other formats:  ffmpeg -i in.mp3 -ac 1 -ar 16000 out.wav
"""

from __future__ import annotations

import argparse
import glob
import os
import sys
import wave

import numpy as np

SAMPLE_RATE = 16000
FRAME = 1280  # 80 ms, openwakeword's native chunk
DEFAULT_THRESHOLDS = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)


def read_wav(path: str) -> np.ndarray:
    """Return a wav as 16 kHz mono int16, resampling and downmixing as needed."""
    with wave.open(path) as w:
        if w.getsampwidth() != 2:
            raise ValueError(f"{path}: only 16-bit PCM is supported")
        audio = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        channels, rate = w.getnchannels(), w.getframerate()
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1).astype(np.int16)
    if rate != SAMPLE_RATE:
        n_out = int(round(len(audio) * SAMPLE_RATE / rate))
        audio = np.interp(
            np.linspace(0, len(audio) - 1, n_out), np.arange(len(audio)), audio
        ).astype(np.int16)
    return audio


def scores(model, key: str, audio: np.ndarray) -> np.ndarray:
    """Per-frame model scores for one clip, from a clean model state."""
    model.reset()
    out = []
    for i in range(0, len(audio) - FRAME + 1, FRAME):
        out.append(model.predict(audio[i:i + FRAME])[key])
    return np.array(out) if out else np.zeros(0)


def count_activations(frame_scores: np.ndarray, threshold: float) -> int:
    """Rising edges above threshold — one continuous detection counts once."""
    above = frame_scores >= threshold
    if not above.any():
        return 0
    return int(np.count_nonzero(above[1:] & ~above[:-1]) + int(above[0]))


def load_clips(directory: str) -> list[str]:
    return sorted(glob.glob(os.path.join(directory, "**", "*.wav"), recursive=True))


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--model", required=True, help="path to a wake-word .onnx, or a "
                    "built-in name like 'hey_jarvis'")
    ap.add_argument("--negatives", help="folder of audio that must NOT wake Clem")
    ap.add_argument("--positives", help="folder of held-out wake-phrase clips")
    ap.add_argument("--budget", type=float, default=0.5,
                    help="false accepts per hour you are willing to accept "
                         "(default 0.5, i.e. about one every two hours)")
    ap.add_argument("--min-hours", type=float, default=1.0,
                    help="refuse to recommend a threshold from less negative audio "
                         "than this (default 1.0)")
    ap.add_argument("--allow-short", action="store_true",
                    help="report anyway when the negative audio is shorter than "
                         "--min-hours (the numbers are still not trustworthy)")
    ap.add_argument("--thresholds", type=float, nargs="+", default=list(DEFAULT_THRESHOLDS))
    args = ap.parse_args()

    if not args.negatives and not args.positives:
        ap.error("give --negatives, --positives, or both")

    from openwakeword.model import Model  # imported late: heavy, and optional for --help

    model = Model(wakeword_models=[args.model], inference_framework="onnx")
    key = next(iter(model.models))

    thresholds = sorted(args.thresholds)
    fa_per_hour: dict[float, float] = {}
    recall: dict[float, float] = {}
    negative_hours = 0.0

    if args.negatives:
        clips = load_clips(args.negatives)
        if not clips:
            print(f"no .wav files under {args.negatives}", file=sys.stderr)
            return 1
        counts = {t: 0 for t in thresholds}
        seconds = 0.0
        for path in clips:
            audio = read_wav(path)
            seconds += len(audio) / SAMPLE_RATE
            frame_scores = scores(model, key, audio)
            for t in thresholds:
                counts[t] += count_activations(frame_scores, t)
        negative_hours = seconds / 3600
        fa_per_hour = {t: counts[t] / negative_hours for t in thresholds}
        print(f"negatives: {len(clips)} clips, {seconds / 60:.1f} minutes")

    if args.positives:
        clips = load_clips(args.positives)
        if not clips:
            print(f"no .wav files under {args.positives}", file=sys.stderr)
            return 1
        peaks = []
        for path in clips:
            # pad with silence so the phrase sits inside the model's window
            audio = read_wav(path)
            padded = np.concatenate(
                [np.zeros(SAMPLE_RATE, np.int16), audio, np.zeros(SAMPLE_RATE, np.int16)]
            )
            frame_scores = scores(model, key, padded)
            peaks.append(frame_scores.max() if len(frame_scores) else 0.0)
        peaks_arr = np.array(peaks)
        recall = {t: float((peaks_arr >= t).mean()) for t in thresholds}
        print(f"positives: {len(clips)} clips, median peak score {np.median(peaks_arr):.3f}")

    print()
    header = f"{'threshold':>10}"
    if fa_per_hour:
        header += f"{'false accepts/hr':>20}"
    if recall:
        header += f"{'recall':>10}"
    print(header)
    print("-" * len(header))
    for t in thresholds:
        row = f"{t:>10.2f}"
        if fa_per_hour:
            row += f"{fa_per_hour[t]:>20.2f}"
        if recall:
            row += f"{recall[t]:>9.0%}"
        print(row)
    print()

    if fa_per_hour and negative_hours < args.min_hours:
        # Zero false accepts across two minutes of audio is not evidence of
        # anything; at a 0.5/hr budget you would expect zero either way.
        print(f"NOT A VERDICT: {negative_hours * 60:.1f} minutes of negative audio is "
              f"too little to measure a {args.budget:.2f}/hr false-accept rate — you "
              f"would expect {negative_hours * args.budget:.2f} false accepts from a "
              "model that is exactly at budget.")
        print(f"Collect at least {args.min_hours:.0f} hour(s) of audio from the room "
              "Clem lives in, or pass --allow-short to see the numbers anyway.")
        if not args.allow_short:
            return 3

    if fa_per_hour:
        safe = [t for t in thresholds if fa_per_hour[t] <= args.budget]
        if not safe:
            print(f"NOT FIT TO DEPLOY: even at threshold {thresholds[-1]:.2f} this model "
                  f"false-accepts {fa_per_hour[thresholds[-1]]:.2f}/hr, over the "
                  f"{args.budget:.2f}/hr budget.")
            print("Train longer, add negative data resembling this room, or pick a "
                  "longer wake phrase.")
            return 2
        best = safe[0]  # lowest safe threshold = most sensitive one within budget
        print(f"Recommended WAKE_WORD_THRESHOLD={best:.2f} "
              f"({fa_per_hour[best]:.2f} false accepts/hr"
              + (f", {recall[best]:.0%} recall" if recall else "") + ")")
        if recall and recall[best] < 0.8:
            print(f"WARNING: recall is only {recall[best]:.0%} at the safe threshold — "
                  "Clem would miss one wake in "
                  f"{max(1, round(1 / max(1e-9, 1 - recall[best])))}. Prefer a longer "
                  "wake phrase over lowering the threshold.")
    elif recall:
        print("Recall only — no false-accept measurement, so this says nothing about "
              "whether the model is safe to deploy. Re-run with --negatives.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
