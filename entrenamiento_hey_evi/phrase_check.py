#!/usr/bin/env python3
"""Compare candidate wake phrases before spending hours training a model.

Two things decide whether a wake phrase will work, and both can be checked in
seconds:

1. **Does the TTS say it right?** The training data is synthetic, so if
   espeak-ng mispronounces the name, the model learns the wrong sound. Prints
   the IPA so you can eyeball it.
2. **Is it long enough?** Longer phrases carry more acoustic information, so
   they separate from background speech far more easily. A phrase much shorter
   than a known-good reference ("hey jarvis") will false-accept more at the
   same recall.

Needs piper-phonemize (pip) for step 1 and, for step 2, a checkout of
piper-sample-generator plus the LibriTTS-R generator checkpoint — see
README.md for both.

    python phrase_check.py "hey clem" "okay clem" "hey jarvis"
    python phrase_check.py --durations --piper ../piper-sample-generator \
        --model ../libritts_r.pt "hey clem" "okay clem" "hey jarvis"
"""

from __future__ import annotations

import argparse
import glob
import os
import statistics
import subprocess
import sys
import tempfile
import wave


def phonemes(text: str) -> str:
    from piper_phonemize import phonemize_espeak

    return "".join("".join(p) for p in phonemize_espeak(text, "en-us"))


def durations(text: str, piper_dir: str, model: str, n: int) -> list[float]:
    """Generate n TTS samples of `text` and return their durations in seconds."""
    with tempfile.TemporaryDirectory() as out:
        subprocess.run(
            [
                sys.executable, "-m", "piper_sample_generator", text + ".",
                "--model", model,
                "--max-samples", str(n),
                "--batch-size", str(min(n, 8)),
                "--output-dir", out,
            ],
            cwd=piper_dir,
            env={**os.environ, "PYTHONPATH": piper_dir},
            check=True,
            capture_output=True,
        )
        out_durations = []
        for path in glob.glob(os.path.join(out, "*.wav")):
            with wave.open(path) as w:
                out_durations.append(w.getnframes() / w.getframerate())
        return sorted(out_durations)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("phrases", nargs="+", help="candidate wake phrases to compare")
    ap.add_argument("--durations", action="store_true",
                    help="also generate TTS samples and report clip lengths")
    ap.add_argument("--piper", default="./piper-sample-generator",
                    help="path to a piper-sample-generator checkout")
    ap.add_argument("--model", default="./libritts_r.pt",
                    help="path to the LibriTTS-R generator checkpoint")
    ap.add_argument("-n", type=int, default=16, help="samples per phrase (default 16)")
    args = ap.parse_args()

    for phrase in args.phrases:
        line = f"{phrase!r:20s} {phonemes(phrase)}"
        if args.durations:
            d = durations(phrase, args.piper, args.model, args.n)
            line += (f"   n={len(d):2d}  min={d[0]:.2f}s  "
                     f"median={statistics.median(d):.2f}s  max={d[-1]:.2f}s")
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
