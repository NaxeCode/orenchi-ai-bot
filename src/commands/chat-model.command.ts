import { SlashCommandBuilder } from "discord.js";

export const chatModelCommand = new SlashCommandBuilder()
  .setName("chat-model")
  .setDescription("Switch the global chat model preset.")
  .addStringOption(option =>
    option
      .setName("preset")
      .setDescription("Choose the performance tier.")
      .setRequired(true)
      .addChoices(
        { name: "Economy (Gemini 2.5 Flash)", value: "economy" },
        { name: "Balanced (GPT-4o Mini)", value: "balanced" },
        { name: "Premium (GPT-4o)", value: "premium" },
        { name: "Frontier Economy (Grok 4 Fast)", value: "grok" }
      )
  )
  .toJSON();
