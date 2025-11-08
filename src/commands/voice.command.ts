import { SlashCommandBuilder } from "discord.js";

const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "verse", "ballad", "ash", "sage", "marin", "cedar"] as const;

export const voiceCommand = new SlashCommandBuilder()
  .setName("voice")
  .setDescription("Switch the TTS voice preset used for future speech.")
  .addStringOption(option => {
    const builder = option
      .setName("preset")
      .setDescription("Select the OpenAI TTS voice preset.")
      .setRequired(true);

    voices.forEach(v => builder.addChoices({ name: v, value: v }));
    return builder;
  })
  .toJSON();
