import { SlashCommandBuilder } from "discord.js";

export const aiChatCommand = new SlashCommandBuilder()
  .setName("ai-chat")
  .setDescription("Ask Stella something in the current channel.")
  .addStringOption(option =>
    option
      .setName("prompt")
      .setDescription("What would you like Stella to respond to?")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1000)
  )
  .toJSON();
