# Compat shim for running openwakeword.train on a modern (2026) stack.
# Each patch below restores behavior an upstream library still expects but
# its dependency removed; all were reproduced and verified locally.
#
# 1. speechbrain 0.5.14 calls torchaudio.set_audio_backend (removed in
#    torchaudio 2.2+; backend dispatch is automatic now) -> no-op.
# 2. acoustics 0.2.6 imports scipy.special.sph_harm (removed in modern
#    scipy; renamed sph_harm_y with swapped args) -> alias. openwakeword
#    uses acoustics only for noise generation and never calls the
#    directivity code, so the alias is import-satisfying, not load-bearing.
# 3. torch >=2.6 defaults torch.load(weights_only=True); the Piper voice
#    checkpoint is a full pickled model from rhasspy's official release
#    (trusted source) -> default weights_only=False, the pre-2.6 behavior.
import torchaudio

if not hasattr(torchaudio, "set_audio_backend"):
    torchaudio.set_audio_backend = lambda *a, **k: None
if not hasattr(torchaudio, "get_audio_backend"):
    torchaudio.get_audio_backend = lambda: "soundfile"

import scipy.special

if not hasattr(scipy.special, "sph_harm"):
    def _sph_harm(m, n, theta, phi, *args, **kwargs):
        return scipy.special.sph_harm_y(n, m, phi, theta, *args, **kwargs)
    scipy.special.sph_harm = _sph_harm

import torch

_orig_torch_load = torch.load

def _torch_load(*args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _orig_torch_load(*args, **kwargs)

torch.load = _torch_load

# torchaudio 2.11 removed the legacy torchaudio.info; torch_audiomentations
# and openwakeword.data still call it. Minimal old-API surface via soundfile.
if not hasattr(torchaudio, "info"):
    import soundfile as _sf

    class _AudioMetaData:
        def __init__(self, i):
            self.sample_rate = int(i.samplerate)
            self.num_frames = int(i.frames)
            self.num_channels = int(i.channels)
            self.bits_per_sample = 16
            self.encoding = "PCM_S"

    torchaudio.info = lambda p, *a, **k: _AudioMetaData(_sf.info(str(p)))

# torchaudio 2.11's load() delegates to the new torchcodec package and
# raises if it's absent. All audio in this pipeline is plain wav, so fall
# back to a soundfile-backed load with the legacy return convention
# (float32 tensor, channels-first) only when torchcodec is missing.
try:
    import torchcodec  # noqa: F401
except Exception:
    import soundfile as _sf2
    import torch as _torch

    def _sf_load(path, frame_offset=0, num_frames=-1, normalize=True,
                 channels_first=True, **_kwargs):
        data, sr = _sf2.read(str(path), dtype="float32", always_2d=True,
                             start=int(frame_offset),
                             frames=int(num_frames) if num_frames and int(num_frames) > 0 else -1)
        tensor = _torch.from_numpy(data.T if channels_first else data)
        return tensor, sr

    torchaudio.load = _sf_load

import runpy
runpy.run_module("openwakeword.train", run_name="__main__")
