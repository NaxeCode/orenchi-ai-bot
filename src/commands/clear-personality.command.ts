import { SlashCommandBuilder } from "discord.js";

export const clearPersonalityCommand = new SlashCommandBuilder()
  .setName("clear-personality")
  .setDescription("Reset your custom personality back to Stella's default.")
  .toJSON();
