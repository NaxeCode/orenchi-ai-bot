import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import createPlayer from "play-sound";

export type TTSProvider = "openai" | "coqui";

export type AudioFormat = "wav" | "mp3" | "opus";

export interface VoiceServiceConfig {
  provider?: TTSProvider;
  voice?: string;
  format?: AudioFormat;
  enabled?: boolean;
  openAIApiKey?: string;
}

export class VoiceService {
  private provider: TTSProvider;
  private voiceName: string;
  private audioFormat: AudioFormat;
  private enabled: boolean;
  private openaiClient: OpenAI | null = null;
  private audioPlayer = createPlayer();
  private readonly defaultModel = "gpt-4o-mini-tts";

  constructor(config: VoiceServiceConfig) {
    this.provider = config.provider ?? "openai";
    this.voiceName = config.voice ?? "alloy";
    this.audioFormat = config.format ?? "wav";
    this.enabled = config.enabled ?? false;

    if (this.provider === "openai") {
      const apiKey = config.openAIApiKey || process.env.OPENAI_TTS_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn("OpenAI TTS API key is not set. Voice output is disabled.");
        this.enabled = false;
      } else {
        this.openaiClient = new OpenAI({ apiKey });
      }
    } else {
      console.warn(`TTS provider "${this.provider}" is not implemented. Voice output disabled.`);
      this.enabled = false;
    }
  }

  async synthesizeSpeech(
    text: string,
    personality?: string | null,
    formatOverride?: AudioFormat
  ): Promise<{ buffer: Buffer; format: AudioFormat }> {
    if (!this.enabled) {
      throw new Error("Voice output is disabled.");
    }

    if (this.provider === "openai") {
      if (!this.openaiClient) {
        throw new Error("OpenAI client is not configured.");
      }

      const prompt = this.buildSpokenPrompt(text, personality);
      const format = formatOverride ?? this.audioFormat;
      const response = await this.openaiClient.audio.speech.create({
        model: this.defaultModel,
        voice: this.voiceName,
        input: prompt,
        format
      });

      const arrayBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        format
      };
    }

    throw new Error(`Unsupported TTS provider: ${this.provider}`);
  }

  async speak(text: string, personality?: string | null): Promise<void> {
    if (!this.enabled) {
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
    return this.enabled;
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

  private buildSpokenPrompt(text: string, personality?: string | null): string {
    if (personality) {
      return `${personality}\n\nRespond with: ${text}`;
    }
    return text;
  }
}
