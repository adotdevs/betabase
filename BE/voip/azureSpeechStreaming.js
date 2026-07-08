const sdk = require('microsoft-cognitiveservices-speech-sdk');
const EventEmitter = require('events');

/**
 * Azure Speech Streaming Transcription Service (8kHz telephony)
 * Exposes the same interface/events used by DeepgramStreaming:
 *  - startStream(sessionId, options)
 *  - sendAudioChunk(pcmChunk)
 *  - stopStream()
 * Emits:
 *  - 'partialTranscript' { text }
 *  - 'finalTranscript' { text }
 *  - 'utteranceEnd' { finalTranscript, partialTranscript }
 *  - 'completeThought' { text }
 *  - 'error', 'closed', 'connected'
 */
class AzureSpeechStreaming extends EventEmitter {
  constructor(apiKey, region) {
    super();
    this.apiKey = apiKey;
    this.region = region;
    this.pushStream = null;
    this.recognizer = null;
    this.isStreaming = false;
    this.isConnected = false;
    this.sessionId = null;

    this.partial = '';
    this.final = '';
  }

  async startStream(sessionId, options = {}) {
    if (this.isStreaming) {
      await this.stopStream();
    }

    this.sessionId = sessionId;
    this.partial = '';
    this.final = '';

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(this.apiKey, this.region);
      speechConfig.speechRecognitionLanguage = options.language || 'en-US';
      // Tune for telephony (8k, mono, 16-bit PCM)
      const format = sdk.AudioStreamFormat.getWaveFormatPCM(
        options.sample_rate || 8000,
        16,
        options.channels || 1
      );
      this.pushStream = sdk.AudioInputStream.createPushStream(format);
      const audioConfig = sdk.AudioConfig.fromStreamInput(this.pushStream);

      this.recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      this.recognizer.recognizing = (s, e) => {
        if (e && e.result && e.result.text) {
          this.partial = e.result.text.trim();
          if (this.partial) {
            this.emit('partialTranscript', { text: this.partial, sessionId: this.sessionId });
          }
        }
      };

      this.recognizer.recognized = (s, e) => {
        if (e && e.result && e.result.text) {
          this.final = e.result.text.trim();
          if (this.final) {
            this.emit('finalTranscript', { text: this.final, sessionId: this.sessionId });
            // Heuristic: consider final with punctuation as a complete thought to speed up LLM
            if (/[.!?]$/.test(this.final) || this.final.split(' ').length > 4) {
              this.emit('completeThought', { text: this.final });
            }
          }
        }
      };

      this.recognizer.canceled = (s, e) => {
        this.emit('error', new Error(`Azure STT canceled: ${e.errorDetails || 'unknown'}`));
      };

      this.recognizer.sessionStarted = () => {
        this.isConnected = true;
        this.emit('connected');
      };

      this.recognizer.sessionStopped = () => {
        this.emit('utteranceEnd', {
          finalTranscript: this.final,
          partialTranscript: this.partial
        });
        this.emit('closed');
      };

      await new Promise((resolve, reject) => {
        this.recognizer.startContinuousRecognitionAsync(
          () => {
            this.isStreaming = true;
            resolve();
          },
          (err) => reject(err)
        );
      });

      return;
    } catch (err) {
      this.isStreaming = false;
      this.isConnected = false;
      this.emit('error', err);
      throw err;
    }
  }

  sendAudioChunk(pcmChunk) {
    if (!this.isStreaming || !this.pushStream) return false;
    try {
      // Push 16-bit PCM little-endian
      this.pushStream.write(pcmChunk);
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  getCurrentTranscript() {
    return this.final || this.partial || '';
  }

  async stopStream() {
    if (!this.isStreaming) return this.final || this.partial || '';
    this.isStreaming = false;

    try {
      await new Promise((resolve) => {
        if (this.recognizer) {
          this.recognizer.stopContinuousRecognitionAsync(
            () => resolve(),
            () => resolve()
          );
        } else {
          resolve();
        }
      });
    } catch (_) {}

    try {
      if (this.pushStream) this.pushStream.close();
    } catch (_) {}

    try {
      if (this.recognizer) this.recognizer.close();
    } catch (_) {}

    this.pushStream = null;
    this.recognizer = null;
    this.isConnected = false;

    const text = this.final || this.partial || '';
    return text;
  }
}

module.exports = AzureSpeechStreaming;

