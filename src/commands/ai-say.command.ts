import { SlashCommandBuilder } from "discord.js";

export const aiSayCommand = new SlashCommandBuilder()
  .setName("ai-say")
  .setDescription("Queue a text-to-speech message in your current voice channel.")
  .addStringOption(option =>
    option
      .setName("text")
      .setDescription("What should I say?")
      .setRequired(true)
      .setMaxLength(500)
  )
  .addStringOption(option =>
    option
      .setName("language")
      .setDescription("Optional language to remember for future speech (e.g., Spanish).")
      .setRequired(false)
      .setMaxLength(50)
  )
  .toJSON();
