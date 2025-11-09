import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import createPlayer from "play-sound";

export type TTSProvider = "openai" | "elevenlabs" | "playht" | "coqui" | "azure" | "google";

export type AudioFormat = "wav" | "mp3" | "opus";

export interface VoiceServiceConfig {
  provider?: TTSProvider;
  voice?: string;
  format?: AudioFormat;
  enabled?: boolean;
  openAIApiKey?: string;
  elevenLabsApiKey?: string;
  googleApiKey?: string;
}

export class VoiceService {
  private provider: TTSProvider;
  private voiceName: string;
  private audioFormat: AudioFormat;
  private enabled: boolean;
  private openaiClient: OpenAI | null = null;
  private elevenLabsApiKey?: string;
  private googleApiKey?: string;
  private googleSampleRate: number;
  private audioPlayer = createPlayer();
  private readonly defaultModel = "gpt-4o-mini-tts";

  constructor(config: VoiceServiceConfig) {
    this.provider = config.provider ?? "openai";
    this.voiceName = config.voice ?? "alloy";
    this.audioFormat = config.format ?? "wav";
    this.enabled = config.enabled ?? false;
    this.elevenLabsApiKey = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
    this.googleApiKey = config.googleApiKey || process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY;
    this.googleSampleRate = this.parseSampleRate(process.env.GOOGLE_TTS_SAMPLE_RATE);

    const openAIApiKey = config.openAIApiKey || process.env.OPENAI_TTS_API_KEY || process.env.OPENAI_API_KEY;
    if (openAIApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openAIApiKey });
    } else if (this.provider === "openai") {
      console.warn("OpenAI TTS API key is not set. Voice output is disabled.");
    }
  }

  async synthesizeSpeech(
    text: string,
    personality?: string | null,
    formatOverride?: AudioFormat
  ): Promise<{ buffer: Buffer; format: AudioFormat }> {
    if (!this.isEnabled()) {
      throw new Error("Voice output is disabled.");
    }

    switch (this.provider) {
      case "openai":
        return await this.generateOpenAITTS(text, formatOverride);
      case "elevenlabs":
        return await this.generateElevenLabsTTS(text);
      case "google":
        return await this.generateGoogleCloudTTS(text, formatOverride);
      default:
        throw new Error(`TTS provider "${this.provider}" is not supported yet.`);
    }
  }

  async speak(text: string, personality?: string | null): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const { buffer, format } = await this.synthesizeSpeech(text, personality);
    const tempFile = path.join(os.tmpdir(), `orenchi-tts-${Date.now()}.${format}`);

    await fs.writeFile(tempFile, buffer);

    await new Promise<void>((resolve, reject) => {
      this.audioPlayer.play(tempFile, (err) => {
        fs.unlink(tempFile).catch(() => {});
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  isEnabled(): boolean {
    if (!this.enabled) {
      return false;
    }

    switch (this.provider) {
      case "openai":
        return !!this.openaiClient;
      case "elevenlabs":
        return !!this.elevenLabsApiKey;
      case "google":
        return !!this.googleApiKey;
      default:
        return false;
    }
  }

  getProvider(): TTSProvider {
    return this.provider;
  }

  getVoiceName(): string {
    return this.voiceName;
  }

  getAudioFormat(): AudioFormat {
    return this.audioFormat;
  }

  setVoice(voice: string): void {
    this.voiceName = voice;
  }

  setProvider(provider: TTSProvider): void {
    this.provider = provider;
  }

  private async generateOpenAITTS(text: string, formatOverride?: AudioFormat): Promise<{ buffer: Buffer; format: AudioFormat }> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client is not configured.");
    }

    const format = formatOverride ?? this.audioFormat;
    const response = await this.openaiClient.audio.speech.create({
      model: this.defaultModel,
      voice: this.voiceName,
      input: text,
      format
    });

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      format
    };
  }

  private async generateElevenLabsTTS(text: string): Promise<{ buffer: Buffer; format: AudioFormat }> {
    if (!this.elevenLabsApiKey) {
      throw new Error("ELEVENLABS_API_KEY environment variable is required for ElevenLabs TTS.");
    }

    const voiceId = this.voiceName || "21m00Tcm4TlvDq8ikWAM";
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": this.elevenLabsApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.8
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      format: "mp3"
    };
  }

  private async generateGoogleCloudTTS(text: string, formatOverride?: AudioFormat): Promise<{ buffer: Buffer; format: AudioFormat }> {
    if (!this.googleApiKey) {
      throw new Error("GOOGLE_TTS_API_KEY environment variable is required for Google Cloud TTS.");
    }

    const desiredFormat = formatOverride ?? this.audioFormat;
    const encoding = this.mapFormatToGoogleEncoding(desiredFormat);
    const voiceName = this.voiceName || process.env.GOOGLE_TTS_VOICE || "en-US-Neural2-F";
    const languageCode = this.resolveGoogleLanguageCode(voiceName);
    const sampleRate = this.googleSampleRate;

    const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.googleApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          name: voiceName,
          languageCode
        },
        audioConfig: {
          audioEncoding: encoding,
          sampleRateHertz: sampleRate
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Cloud TTS failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.audioContent) {
      throw new Error("Google Cloud TTS response did not include audioContent.");
    }

    const audioBuffer = Buffer.from(data.audioContent, "base64");
    if (encoding === "LINEAR16") {
      return {
        buffer: this.wrapLinear16AsWav(audioBuffer, sampleRate),
        format: "wav"
      };
    }

    if (encoding === "MP3") {
      return { buffer: audioBuffer, format: "mp3" };
    }

    return { buffer: audioBuffer, format: "opus" };
  }

  private mapFormatToGoogleEncoding(format: AudioFormat): "LINEAR16" | "MP3" | "OGG_OPUS" {
    switch (format) {
      case "mp3":
        return "MP3";
      case "opus":
        return "OGG_OPUS";
      case "wav":
      default:
        return "LINEAR16";
    }
  }

  private resolveGoogleLanguageCode(voiceName: string): string {
    const segments = voiceName.split("-");
    if (segments.length >= 2) {
      return `${segments[0]}-${segments[1]}`;
    }
    return process.env.GOOGLE_TTS_LANGUAGE || "en-US";
  }

  private parseSampleRate(value?: string): number {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 24000;
  }

  private wrapLinear16AsWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
    const channels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
  }
}
