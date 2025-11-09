import { SlashCommandBuilder } from "discord.js";

const providers = [
  { name: "OpenAI (gpt-4o-mini-tts)", value: "openai" },
  { name: "ElevenLabs", value: "elevenlabs" },
  { name: "PlayHT (coming soon)", value: "playht" },
  { name: "Coqui (coming soon)", value: "coqui" },
  { name: "Microsoft Azure (coming soon)", value: "azure" },
  { name: "Google Cloud TTS", value: "google" }
] as const;

export const ttsEngineCommand = new SlashCommandBuilder()
  .setName("tts-engine")
  .setDescription("Switch the global TTS provider/model.")
  .addStringOption(option => {
    const builder = option
      .setName("provider")
      .setDescription("Choose the backend TTS provider.")
      .setRequired(true);

    providers.forEach(choice => builder.addChoices(choice));
    return builder;
  })
  .addStringOption(option =>
    option
      .setName("voice")
      .setDescription("Optional voice/voice ID for the selected provider.")
      .setRequired(false)
  )
  .toJSON();
