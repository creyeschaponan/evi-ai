import sys
import json
import base64
import io
import threading
import queue
import time
import numpy as np
import sounddevice as sd
import soundfile as sf

# Constantes de audio
RECORD_SAMPLE_RATE = 16000
RECORD_CHANNELS = 1

class AudioBridge:
    def __init__(self):
        self.is_recording = False
        self.recorded_frames = []
        self.record_stream = None
        self.play_queue = queue.Queue()
        self.play_thread = threading.Thread(target=self._playback_worker, daemon=True)
        self.play_thread.start()

    def _record_callback(self, indata, frames, time_info, status):
        if self.is_recording:
            # indata es un ndarray float32 (-1.0 a 1.0)
            self.recorded_frames.append(indata.copy())

    def start_recording(self):
        self.recorded_frames = []
        self.is_recording = True
        if self.record_stream is None:
            self.record_stream = sd.InputStream(
                samplerate=RECORD_SAMPLE_RATE,
                channels=RECORD_CHANNELS,
                dtype='float32',
                callback=self._record_callback
            )
            self.record_stream.start()

    def stop_recording(self):
        self.is_recording = False
        if self.record_stream:
            self.record_stream.stop()
            self.record_stream.close()
            self.record_stream = None

        if not self.recorded_frames:
            return ""

        # Concatenar todos los frames
        full_recording = np.concatenate(self.recorded_frames, axis=0)
        
        # Convertir a 16-bit PCM Mono
        pcm16 = (np.clip(full_recording, -1.0, 1.0) * 32767).astype(np.int16)
        raw_bytes = pcm16.tobytes()
        return base64.b64encode(raw_bytes).decode('ascii')

    def queue_playback(self, base64_wav):
        self.play_queue.put(base64_wav)

    def _playback_worker(self):
        while True:
            base64_wav = self.play_queue.get()
            if base64_wav is None:
                break
            try:
                wav_bytes = base64.b64decode(base64_wav)
                with io.BytesIO(wav_bytes) as bio:
                    data, fs = sf.read(bio, dtype='float32')
                    sd.play(data, samplerate=fs)
                    sd.wait()
            except Exception as e:
                sys.stderr.write(f"Playback error: {e}\n")
                sys.stderr.flush()
            finally:
                self.play_queue.task_done()
                # Notificar a Node que terminó este chunk si la cola está vacía
                if self.play_queue.empty():
                    self.send_message({"event": "audio_playback_idle"})

    def send_message(self, msg_obj):
        sys.stdout.write(json.dumps(msg_obj) + "\n")
        sys.stdout.flush()

    def run(self):
        self.send_message({"event": "ready", "message": "Audio bridge initialized"})
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
                action = cmd.get("action")

                if action == "start_record":
                    self.start_recording()
                    self.send_message({"event": "recording_started"})

                elif action == "stop_record":
                    b64_pcm = self.stop_recording()
                    self.send_message({
                        "event": "recording_stopped",
                        "buffer": b64_pcm,
                        "rate": RECORD_SAMPLE_RATE
                    })

                elif action == "play_chunk":
                    b64_audio = cmd.get("data", "")
                    if b64_audio:
                        self.queue_playback(b64_audio)
                        self.send_message({"event": "chunk_queued"})

                elif action == "ping":
                    self.send_message({"event": "pong"})

                elif action == "exit":
                    break
            except Exception as ex:
                self.send_message({"event": "error", "error": str(ex)})

if __name__ == "__main__":
    bridge = AudioBridge()
    bridge.run()
