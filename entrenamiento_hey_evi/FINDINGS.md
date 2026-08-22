# Teaching Clem to wake to his own name

Clem's standby wake word is **"hey Jarvis"** — a pretrained openWakeWord model,
chosen because it exists, not because it fits. the owner calls the robot Clem, so
after a session times out he ends up talking to something that isn't listening.
This directory is the work to fix that: a **"hey Clem"** wake word.

## What was established 2026-08-01

Measured in the build sandbox, not guessed:

| Question | Answer |
| --- | --- |
| Does the TTS pronounce "Clem" correctly? | **Yes.** espeak-ng gives `hˈeɪ klˈɛm`. No creative spelling needed — the ASR's habit of hearing "Clam/Cliff/Glen" is a transcription artifact and does not affect training data, which is generated from phonemes. |
| Is synthetic training audio good enough to train on? | **Yes, and this is the strong result.** 24 TTS clips of "hey jarvis" were scored with the real pretrained `hey_jarvis` model: median peak **0.985**, 20/24 firing above 0.5. The synthetic pipeline produces audio the production stack accepts as genuine speech. |
| Does "hey Clem" cross-trigger the current model? | **No** — 24 clips, every score 0.000. Clem currently cannot be woken by his own name at all. |
| Is "hey Clem" a good wake phrase? | **Workable, but short.** Median TTS length 0.64 s vs 0.79 s for "hey jarvis". Shorter phrases carry less information and false-accept more at equal recall. |
| Better phrasing? | **"okay Clem" (0.77 s)** is closest to the known-good reference. Bare **"Clem" (0.46 s) is too short** and should not be trained. The config trains "hey Clem" and "okay Clem" together — one binary model, either phrase wakes him. |

Reproduce any of it with `phrase_check.py`:

```sh
python phrase_check.py "hey clem" "okay clem" "hey jarvis"        # phonemes only
python phrase_check.py --durations --piper ../piper-sample-generator \
    --model ../libritts_r.pt "hey clem" "okay clem" "hey jarvis"  # + clip lengths
```

## Why the model isn't trained yet

Not time, and not difficulty — **the build sandbox cannot reach the training
data.** Its network policy allows PyPI and GitHub (including release assets,
so the Piper generator and openWakeWord's base models download fine) but
denies `huggingface.co`, which is where every piece of the negative-data half
of the recipe lives: the MIT room impulse responses, the AudioSet and FMA
background audio, the ~2,000 hours of precomputed ACAV100M negative features,
and the 11-hour false-positive validation set.

That last one is the reason not to improvise around the gap. Without a real
negative corpus there is no way to *measure* the false-accept rate, and an
unmeasured wake word is the one thing that must not ship: Clem's wake listener
runs all day, and a false accept opens the cloud voice connection nobody asked
for. Training on synthetic negatives alone would produce a model that looks
fine on paper and wakes at the television.

So the training run belongs on a machine with open network access. It is about
an hour of unattended work.

## Runbook

Google Colab (free T4) matches openWakeWord's own notebook and is the path of
least resistance; any networked Linux box with a GPU works the same way.

```sh
# 1. Tooling
git clone https://github.com/dscripka/piper-sample-generator   # the FORK — see note
wget -O piper-sample-generator/models/en_US-libritts_r-medium.pt \
  https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/en_US-libritts_r-medium.pt
pip install openwakeword piper-phonemize webrtcvad mutagen torchinfo torchmetrics \
            speechbrain audiomentations torch-audiomentations acoustics datasets
python -c "import openwakeword.utils as u; u.download_models()"

# 2. Data (all from HuggingFace — this is the part the sandbox cannot do).
#    Follow cells 8-10 of openWakeWord's automatic_model_training.ipynb, which
#    fetch: davidscripka/MIT_environmental_impulse_responses -> ./mit_rirs
#           agkphysics/AudioSet (bal_train09.tar), 16 kHz -> ./audioset_16k
#           rudraml/fma (small), 16 kHz               -> ./fma
#           davidscripka/openwakeword_features        -> the two .npy files
#    Paths must match hey_clem.yaml.

# 3. Train (~1 h on a T4)
cp <this repo>/wakeword/hey_clem.yaml .
python -m openwakeword.train --training_config hey_clem.yaml \
    --generate_clips --augment_clips --train_model
```

**The fork matters.** `openwakeword.train` does `from generate_samples import
generate_samples`, and only `dscripka/piper-sample-generator` has that module
at the top level; `rhasspy/piper-sample-generator` (the upstream, and what
`phrase_check.py` uses) exposes `piper_sample_generator.__main__` instead.
Point `piper_sample_generator_path` at the fork or generation fails at import.

Training writes both `hey_clem.onnx` and `hey_clem.tflite`. **Take the ONNX.**
openwakeword is installed on the robot with `--no-deps` precisely because
tflite-runtime has no Python 3.12 wheels, so the robot runs the ONNX path.

## Live-run addendum (2026-08-01, Colab attempts #1-#5)

The runbook above is the shape of the work; the **operative recipe is
`hey_clem_colab.ipynb`** (v6), which encodes everything the live runs taught.
Deviations discovered against 2026 Colab (Python 3.12, torch 2.11), each
verified against live metadata or reproduced in a local py3.12 venv:

- `piper-phonemize` has no cp312 wheel -> `piper-phonemize-fix` (wheel
  inspected: same import name, espeak data bundled). Only phrase_check.py
  (upstream module path) needs it; the FORK phonemizes via
  `espeak_phonemizer` + apt `espeak-ng` instead.
- `pip install openwakeword` backtracks to a fossil version on py3.12
  (v0.6.0 requires tflite-runtime on Linux; none exists for cp312) ->
  install `--no-deps` + explicit deps, as on the robot.
- `datasets==2.14.6` breaks on py3.12 (needs pyarrow<14; no cp312 wheel) ->
  2.21.0. AudioSet's tars are GONE (repo is parquet now) -> stream config
  "balanced". FMA's loader can't stream under modern fsspec -> wget the
  canonical fma_small.zip + ffmpeg.
- Two removed APIs still called at import: torchaudio.set_audio_backend
  (speechbrain 0.5.14) and scipy.special.sph_harm (acoustics 0.2.6); and
  torch>=2.6 flips torch.load to weights_only=True, which the pickled Piper
  checkpoint can't pass -> all three patched in `oww_train_shim.py`
  (written by the notebook; train.py runs through it).
- train.py 0.6.0 passes NO model path to generate_samples -> the fork's
  default `models/en-us-libritts-high.pt` (v1.0.0 release asset, per the
  fork's own README) must exist; its `.pt.json` ships in the fork. The
  v2.0.0 medium_r model in step 1 above remains correct for
  phrase_check.py, but the TRAINING path needs the high model.
- torchaudio 2.11 also removed `torchaudio.info` (torch_audiomentations and
  openwakeword.data call it) and made `torchaudio.load` require the new
  torchcodec package -> both shimmed (soundfile-backed fallbacks).
- Colab's pip onnxruntime is CPU-only -> swap to onnxruntime-gpu or feature
  computation takes hours instead of minutes; modern torch.onnx.export needs
  `onnxscript`.
- A crashed augment leaves a PARTIAL features .npy and the step's guard is
  existence-based -> it silently skips and trains on garbage. Clear
  *_features_*.npy unless all four exist (notebook cell 6 does).
- The 0.6.0 wheel attempts tflite conversion UNCONDITIONALLY after writing
  the .onnx -> a ModuleNotFoundError: onnx_tf traceback at the very end of
  training is expected and harmless.
- The full augment -> train -> ONNX-export path was executed locally end to
  end (micro config, py3.12 + torch 2.13 venv) with the final shim: a valid
  hey_clem.onnx came out and scored in onnxruntime. The shim is the contract;
  keep it in sync with hey_clem_colab.ipynb.

## The gate: measure before deploying

Do not deploy on the strength of the training loop's own numbers. Record real
audio from the room Clem lives in — an hour or more of ordinary evening: talk,
television, music, the dishwasher, and no one saying "hey Clem" — then:

```sh
python check_model.py --model hey_clem.onnx \
    --negatives ~/clem_room_audio --positives ~/hey_clem_heldout
```

It reports false accepts per hour and recall at each threshold and recommends
the most sensitive threshold inside the budget (default 0.5/hour). It refuses
to give a verdict on less than an hour of negative audio, because zero false
accepts across two minutes is not evidence of anything. Exit codes: `0` fit,
`2` over budget at every threshold, `3` not enough audio to say.

A reasonable bar: **≤ 0.5 false accepts/hour at ≥ 80% recall.** If the model
can't hit both, do not lower the bar — prefer "okay Clem" alone, or train
longer. Falling short is a real outcome and worth journalling rather than
working around.

## Deploying it, and undoing it

Point your stack's openwakeword model path at the validated `.onnx` and set
the threshold `check_model.py` recommended. Keep the previous wake word one
config line away as the rollback.

## If false accepts turn out to be the problem

The honest risk with a phrase this short. Before giving up on the name, the
cheap fix is openWakeWord's **custom verifier model** — a small classifier
trained on a handful of recordings of the owner actually saying "hey Clem", which
gates detections on the speaker. It needs no datasets, takes minutes, and
targets exactly this failure mode: a television that says something klˈɛm-ish
is not the owner. See `openwakeword.custom_verifier_model`.

## Files

- `phrase_check.py` — compare candidate phrases (phonemes + clip length) before
  committing to one. Validated end-to-end in the sandbox.
- `hey_clem.yaml` — the training config, tuned for a short wake phrase.
- `check_model.py` — the deployment gate. Validated against the pretrained
  `hey_jarvis` model over 76 minutes of audio.
- `models/` — where a validated `hey_clem.onnx` goes. Empty until then.
