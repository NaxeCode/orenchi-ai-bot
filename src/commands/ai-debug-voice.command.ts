import { SlashCommandBuilder } from "discord.js";

export const aiDebugVoiceCommand = new SlashCommandBuilder()
  .setName("ai-debug-voice")
  .setDescription("Generate a voice response, save the audio locally, and log debug metadata.")
  .addStringOption(option =>
    option
      .setName("text")
      .setDescription("Optional prompt for the AI to respond to. If omitted, a default prompt is used.")
      .setRequired(false)
      .setMaxLength(500)
  )
  .toJSON();
