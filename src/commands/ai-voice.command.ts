import { SlashCommandBuilder } from "discord.js";

export const aiVoiceCommand = new SlashCommandBuilder()
  .setName("ai-voice")
  .setDescription("Have the AI join your voice channel and speak a short response.")
  .addStringOption(option =>
    option
      .setName("text")
      .setDescription("What should the AI say out loud?")
      .setRequired(true)
      .setMaxLength(300)
  )
  .toJSON();
