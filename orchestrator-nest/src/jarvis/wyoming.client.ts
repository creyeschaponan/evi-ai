import * as net from 'net';

export interface AudioInfo {
  rate: number;
  width: number;
  channels: number;
}

export class WyomingClient {
  /**
   * Helper to write a 44-byte standard WAV header for PCM data.
   */
  static createWavBuffer(pcmData: Buffer, rate = 22050, channels = 1, bitDepth = 16): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = (rate * channels * bitDepth) / 8;
    const blockAlign = (channels * bitDepth) / 8;
    const totalDataLen = pcmData.length;
    const totalChunkLen = totalDataLen + 36;

    header.write('RIFF', 0);
    header.writeUInt32LE(totalChunkLen, 4);
    header.write('WAVE', 8);

    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitDepth, 34);

    header.write('data', 36);
    header.writeUInt32LE(totalDataLen, 40);

    return Buffer.concat([header, pcmData]);
  }

  /**
   * Encode and send a Wyoming event over a net.Socket
   */
  private static sendEvent(socket: net.Socket, type: string, data: any = {}, payload?: Buffer) {
    const dataBuffer = Buffer.from(JSON.stringify(data), 'utf-8');
    const payloadLength = payload ? payload.length : 0;
    const header = {
      type,
      data_length: dataBuffer.length,
      payload_length: payloadLength,
    };
    const headerLine = Buffer.from(JSON.stringify(header) + '\n', 'utf-8');
    socket.write(headerLine);
    if (dataBuffer.length > 0) {
      socket.write(dataBuffer);
    }
    if (payload && payload.length > 0) {
      socket.write(payload);
    }
  }

  /**
   * Synthesize text to WAV audio via Wyoming Piper TCP socket.
   */
  static async synthesizeText(
    host: string,
    port: number,
    text: string,
    voiceName = 'es_MX-claude-high',
    lengthScale = 0.85,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      const pcmChunks: Buffer[] = [];
      let audioInfo: AudioInfo = { rate: 22050, width: 2, channels: 1 };
      let incomingBuffer = Buffer.alloc(0);

      client.connect(port, host, () => {
        WyomingClient.sendEvent(client, 'synthesize', {
          text: text.trim(),
          voice: {
            name: voiceName,
            length_scale: lengthScale,
          },
        });
      });

      client.on('data', (chunk) => {
        incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

        while (true) {
          const newlineIndex = incomingBuffer.indexOf('\n');
          if (newlineIndex === -1) break;

          let header: any;
          try {
            const headerStr = incomingBuffer.slice(0, newlineIndex).toString('utf-8');
            header = JSON.parse(headerStr);
          } catch {
            break;
          }

          const dataLen = header.data_length || 0;
          const payloadLen = header.payload_length || 0;
          const totalMsgLen = newlineIndex + 1 + dataLen + payloadLen;

          if (incomingBuffer.length < totalMsgLen) {
            // Wait for full message
            break;
          }

          let eventData: any = {};
          if (dataLen > 0) {
            const dataSlice = incomingBuffer.slice(newlineIndex + 1, newlineIndex + 1 + dataLen);
            try {
              eventData = JSON.parse(dataSlice.toString('utf-8'));
            } catch {}
          }

          if (payloadLen > 0) {
            const payloadSlice = incomingBuffer.slice(
              newlineIndex + 1 + dataLen,
              totalMsgLen,
            );
            if (header.type === 'audio-chunk') {
              pcmChunks.push(Buffer.from(payloadSlice));
            }
          }

          if (header.type === 'audio-start') {
            audioInfo = {
              rate: eventData.rate || 22050,
              width: eventData.width || 2,
              channels: eventData.channels || 1,
            };
          } else if (header.type === 'audio-stop') {
            client.end();
            const totalPcm = Buffer.concat(pcmChunks);
            const wavBuffer = WyomingClient.createWavBuffer(
              totalPcm,
              audioInfo.rate,
              audioInfo.channels,
              audioInfo.width * 8,
            );
            resolve(wavBuffer);
            return;
          }

          incomingBuffer = incomingBuffer.slice(totalMsgLen);
        }
      });

      client.on('error', (err) => reject(err));
      client.on('close', () => {
        if (pcmChunks.length > 0) {
          const totalPcm = Buffer.concat(pcmChunks);
          const wavBuffer = WyomingClient.createWavBuffer(
            totalPcm,
            audioInfo.rate,
            audioInfo.channels,
            audioInfo.width * 8,
          );
          resolve(wavBuffer);
        }
      });
    });
  }

  /**
   * Transcribe audio WAV/PCM via Wyoming Whisper TCP socket.
   */
  static async transcribeAudio(
    host: string,
    port: number,
    pcmAudio: Buffer,
    rate = 16000,
    width = 2,
    channels = 1,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let recognizedText = '';
      let incomingBuffer = Buffer.alloc(0);

      client.connect(port, host, () => {
        WyomingClient.sendEvent(client, 'audio-start', {
          rate,
          width,
          channels,
          language: 'es',
        });

        const chunkSize = 2048;
        for (let i = 0; i < pcmAudio.length; i += chunkSize) {
          const chunk = pcmAudio.slice(i, i + chunkSize);
          WyomingClient.sendEvent(
            client,
            'audio-chunk',
            { rate, width, channels },
            chunk,
          );
        }

        WyomingClient.sendEvent(client, 'audio-stop');
      });

      client.on('data', (chunk) => {
        incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

        while (true) {
          const newlineIndex = incomingBuffer.indexOf('\n');
          if (newlineIndex === -1) break;

          let header: any;
          try {
            const headerStr = incomingBuffer.slice(0, newlineIndex).toString('utf-8');
            header = JSON.parse(headerStr);
          } catch {
            break;
          }

          const dataLen = header.data_length || 0;
          const payloadLen = header.payload_length || 0;
          const totalMsgLen = newlineIndex + 1 + dataLen + payloadLen;

          if (incomingBuffer.length < totalMsgLen) {
            break;
          }

          if (dataLen > 0 && header.type === 'transcript') {
            const dataSlice = incomingBuffer.slice(newlineIndex + 1, newlineIndex + 1 + dataLen);
            try {
              const eventData = JSON.parse(dataSlice.toString('utf-8'));
              recognizedText += eventData.text || '';
            } catch {}
          }

          incomingBuffer = incomingBuffer.slice(totalMsgLen);
        }
      });

      client.on('error', (err) => reject(err));
      client.on('close', () => resolve(recognizedText.trim()));
    });
  }
}
