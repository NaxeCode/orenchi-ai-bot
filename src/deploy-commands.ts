import { REST, Routes } from "discord.js";
import { personalityCommand } from "./commands/personality.command.js";
import { startAiChatCommand } from "./commands/start-ai-chat.command.js";
import { endAiChatCommand } from "./commands/end-ai-chat.command.js";
import { aiVoiceCommand } from "./commands/ai-voice.command.js";
import { aiSayCommand } from "./commands/ai-say.command.js";
import { aiDebugVoiceCommand } from "./commands/ai-debug-voice.command.js";
import { leaveCommand } from "./commands/leave.command.js";

// Load environment variables
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const token = process.env.DISCORD_BOT_TOKEN;

if (!clientId || !guildId || !token) {
  console.error("Missing required environment variables: DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN");
  process.exit(1);
}

const commands = [
  personalityCommand,
  startAiChatCommand,
  endAiChatCommand,
  aiVoiceCommand,
  aiSayCommand,
  aiDebugVoiceCommand,
  leaveCommand
];

const rest = new REST().setToken(token);

try {
  console.log(`Started refreshing ${commands.length} application (/) commands.`);

  // Register commands for a specific guild (faster for development)
  const data: any = await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );

  console.log(`Successfully reloaded ${data.length} application (/) commands.`);
} catch (error) {
  console.error("Error deploying commands:", error);
}
