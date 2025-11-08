import { SlashCommandBuilder } from "discord.js";

export const leaveCommand = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Ask the AI to disconnect from the current voice channel.")
  .toJSON();
