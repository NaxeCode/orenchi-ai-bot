import { SlashCommandBuilder } from "discord.js";

const openAiVoices = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "coral",
  "verse",
  "ballad",
  "ash",
  "sage",
  "marin",
  "cedar"
] as const;

export const ttsVoiceCommand = new SlashCommandBuilder()
  .setName("tts-voice")
  .setDescription("Update the global TTS voice preset/ID.")
  .addSubcommand(sub =>
    sub
      .setName("openai")
      .setDescription("Choose one of the built-in OpenAI voices.")
      .addStringOption(option => {
        const builder = option
          .setName("voice")
          .setDescription("Select an OpenAI preset.")
          .setRequired(true);
        openAiVoices.forEach(v => builder.addChoices({ name: v, value: v }));
        return builder;
      })
  )
  .addSubcommand(sub =>
    sub
      .setName("custom")
      .setDescription("Provide a custom voice or voice ID for the current TTS engine.")
      .addStringOption(option =>
        option
          .setName("voice")
          .setDescription("Voice ID or preset supported by the current TTS engine.")
          .setRequired(true)
      )
  )
  .toJSON();
