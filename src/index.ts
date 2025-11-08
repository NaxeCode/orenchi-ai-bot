#!/usr/bin/env bun

import { Client, GatewayIntentBits, Events, Message, ChannelType, Guild, PartialGroupDMChannel, TextChannel } from "discord.js";
import type { Interaction } from "discord.js";
import { DiscordBot } from "./bot/DiscordBot";
import { ChannelManager } from "./bot/ChannelManager";

// Initialize the bot with database path
const bot = new DiscordBot("personalities.db");
const channelManager = new ChannelManager();

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Set client for bot to use
bot.setClient(client);

// Handle bot startup
client.once(Events.ClientReady, async () => {
  console.log(`Ready! Logged in as ${client.user?.tag}`);
  await bot.initialize();
  
  // Start periodic cleanup task
  setInterval(async () => {
    const guild = client.guilds.cache.first();
    if (guild) {
      console.log("Running periodic channel cleanup task...");
      await bot.cleanupInactiveChannels(guild);
      console.log("Channel cleanup task completed.");
    }
  }, 60 * 60 * 1000); // Run every hour
});

// Handle slash commands
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  console.log(`Received command: ${interaction.commandName} from user: ${interaction.user.tag}`);

  if (interaction.commandName === "personality") {
    const personalityText = interaction.options.getString("text", false);
    console.log(`Handling personality command for user: ${interaction.user.tag}`);
    const response = await bot.handlePersonalityCommand(interaction.user.id, personalityText);
    
    // Send ephemeral response
    await interaction.reply({ content: response, flags: 64 });
    console.log(`Personality command handled for user: ${interaction.user.tag}`);
  } else if (interaction.commandName === "start-ai-chat") {
    // Handle start-ai-chat command
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: 64
      });
      return;
    }
    
    console.log(`Starting AI chat for user: ${interaction.user.tag}`);
    const response = await bot.handleStartAiChatCommand(interaction.user, interaction.guild);
    await interaction.reply({ content: response, flags: 64 });
    console.log(`AI chat started for user: ${interaction.user.tag}`);
  } else if (interaction.commandName === "end-ai-chat") {
    // Handle end-ai-chat command
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: 64
      });
      return;
    }
    
    try {
      console.log(`Ending AI chat for user: ${interaction.user.tag}`);
      const response = await bot.handleEndAiChatCommand(interaction.user, interaction.guild, interaction.channel as TextChannel);
      await interaction.reply({ content: response, flags: 64 }); // 64 is the flag for ephemeral
      console.log(`AI chat ended for user: ${interaction.user.tag}`);
    } catch (error: any) {
      // If the channel was deleted, we might get an "Unknown Channel" error (code 10003)
      // This is expected when deleting the channel and trying to reply, so we don't log it as an error
      if (error.code !== 10003) {
        console.error(`Error handling end-ai-chat command for user ${interaction.user.tag}:`, error);
      } else {
        console.log(`Channel was deleted before response could be sent to user: ${interaction.user.tag}`);
      }
      
      // Try to send an error response, but don't fail the entire process if this fails
      try {
        // If the interaction is still valid (not already replied to and not in a deleted channel)
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Sorry, I encountered an error while processing your request.",
            flags: 64
          });
        }
      } catch (replyError: any) {
        // If we can't reply (e.g., channel was deleted), just log it at info level
        // If it's a "Unknown interaction" error (code 10062), this is also expected
        if (replyError.code !== 10062 && replyError.code !== 10003) {
          console.error(`Could not send error response to user ${interaction.user.tag}:`, replyError.message);
        } else {
          console.log(`Could not send error response to user ${interaction.user.tag} (expected error): ${replyError.message}`);
        }
      }
    }
  } else if (interaction.commandName === "ai-voice") {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server voice channel.",
        flags: 64
      });
      return;
    }

    const message = interaction.options.getString("text", true);
    await interaction.deferReply({ flags: 64 });
    try {
      const response = await bot.handleAiVoiceInteraction(interaction.user, interaction.guild, message);
      await interaction.editReply({ content: response });
    } catch (error) {
      console.error(`Error handling ai-voice command for user ${interaction.user.tag}:`, error);
      await interaction.editReply({
        content: "I couldn't play that audio. Please confirm your OpenRouter voice model supports audio responses and try again."
      });
    }
  } else if (interaction.commandName === "ai-say") {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server voice channel.",
        flags: 64
      });
      return;
    }

    const text = interaction.options.getString("text", true);
    const language = interaction.options.getString("language") ?? undefined;
    await interaction.deferReply({ flags: 64 });
    try {
      const response = await bot.handleVoiceSpeakCommand(interaction.user, interaction.guild, text, language ?? undefined);
      await interaction.editReply({ content: response });
    } catch (error) {
      console.error(`Error handling ai-say command for user ${interaction.user.tag}:`, error);
      await interaction.editReply({
        content: "I couldn't speak that text. Please confirm voice output is configured and try again."
      });
    }
  } else if (interaction.commandName === "ai-debug-voice") {
    const promptText = interaction.options.getString("text") ?? "Please generate a short sample sentence I can listen to.";
    await interaction.deferReply({ flags: 64 });
    try {
      const response = await bot.handleVoiceDebugCommand(interaction.user, promptText);
      await interaction.editReply({ content: response });
    } catch (error) {
      console.error(`Error handling ai-debug-voice command for user ${interaction.user.tag}:`, error);
      await interaction.editReply({
        content: "Voice debug failed. Check the server logs for details."
      });
    }
  } else if (interaction.commandName === "leave") {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server voice channel.",
        flags: 64
      });
      return;
    }
    try {
      const response = await bot.handleLeaveVoiceCommand(interaction.guild);
      await interaction.reply({ content: response, flags: 64 });
    } catch (error) {
      console.error(`Error handling leave command for user ${interaction.user.tag}:`, error);
      await interaction.reply({
        content: "I couldn't disconnect from voice. Please try again.",
        flags: 64
      });
    }
  }
});

// Helper function to check if a message is explicitly directed to others (not including the bot)
function isMessageDirectedToOthers(message: Message, botUserId: string): boolean {
  // If there are no mentions, the message is not directed to anyone specifically
  if (message.mentions.users.size === 0) {
    return false;
  }
  
  // Check if all mentions are to users other than the bot
  const mentionedUsers = message.mentions.users;
  for (const [userId, user] of mentionedUsers) {
    if (userId === botUserId) {
      // If the bot is mentioned, the message is directed to the bot
      return false;
    }
  }
  
  // If we get here, all mentions are to users other than the bot
  return true;
}

// Helper function to check if bot should process a message in public channels
function shouldBotProcessMessage(message: Message, botUserId: string): boolean {
  // If the bot is explicitly mentioned, always process
  if (message.mentions.has(botUserId)) {
    return true;
  }
  
  // If there are no mentions, check the environment variable
  if (message.mentions.users.size === 0) {
    // Check if RESPOND_TO_PUBLIC_NO_MENTION is set to true
    const respondToPublicNoMention = process.env.RESPOND_TO_PUBLIC_NO_MENTION === 'true';
    return respondToPublicNoMention;
  }
  
  // If there are mentions but the bot is not mentioned, don't process
  return false;
}

// Handle messages
client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  console.log(`Received message from ${message.author.tag} in ${message.channel.type === ChannelType.GuildText ? message.channel.name : 'DM'}: ${message.content}`);

  // Check if this is a private chat channel
  if (message.channel.type === ChannelType.GuildText &&
      channelManager.isPrivateChatChannel(message.channel.name)) {
    // Check if the message is explicitly directed to others (not including the bot)
    if (isMessageDirectedToOthers(message, client.user!.id)) {
      console.log(`Message in private channel ${message.channel.name} is directed to others, ignoring`);
      return; // Ignore the message
    }
    
    // Handle messages in private chat channels
    console.log(`Processing message in private channel: ${message.channel.name}`);
    try {
      // Extract attachment information
      const attachments = message.attachments.map(attachment => ({
        url: attachment.url,
        contentType: attachment.contentType ?? undefined
      }));
      
      const response = await bot.handleMessage(
        message.author.id,
        message.content,
        message.channel,
        attachments
      );
      await message.channel.send(response);
      console.log(`Sent response to ${message.author.tag} in ${message.channel.name}`);
    } catch (error) {
      console.error("Error handling message:", error);
      await message.channel.send("Sorry, I encountered an error while processing your request.");
    }
  }
  // Handle mentions in public channels
  else if (shouldBotProcessMessage(message, client.user!.id)) {
    console.log(`Bot mentioned in public channel: ${(message.channel as any).name || 'unknown channel'}`);
    // Create private channel and move conversation there
    if (!message.guild) return;
    
    try {
      // Get all mentioned users (excluding the bot itself)
      const mentionedUsers = message.mentions.users.filter(user => user.id !== client.user!.id);
      const users = Array.from(mentionedUsers.values());
      
      // Add the message author if they're not already included
      if (!users.some(user => user.id === message.author.id)) {
        users.unshift(message.author);
      }
      
      const channel = await channelManager.createPrivateChannel(message.guild, users, client.user!.id, message.content);
      
      // Send public response immediately
      if (!(message.channel instanceof PartialGroupDMChannel)) {
        // Generate a varied response for the public channel
        const publicResponse = await bot.generatePublicResponse(message.author.id, message.content, channel.toString());
        
        // Create mentions for all users who will be in the private channel
        const userMentions = users.map(user => `<@${user.id}>`).join(' ');
        
        await message.reply(
          `${userMentions} ${publicResponse} ${channel.toString()}`
        );
      }
      
      // Generate and send a simple response to the new private channel without web search
      // Do this asynchronously without waiting to avoid delaying the public response
      bot.generateFirstMessageResponse(message.author.id, message.content)
        .then(response => channel.send(response))
        .catch(error => {
          console.error("Error sending first message response to private channel:", error);
          // Send a fallback message
          channel.send("Hello! I've moved our conversation to this private channel. How can I help you today?");
        });
      
      console.log(`Created private channel for ${message.author.tag}: ${channel.name}`);
    } catch (error) {
      console.error("Error creating private channel:", error);
      if (!(message.channel instanceof PartialGroupDMChannel)) {
        await message.reply(
          `<@${message.author.id}> Sorry, I couldn't create a private channel for our conversation. Please try again later.`
        );
      }
    }
  }
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await bot.shutdown();
  client.destroy();
  process.exit(0);
});

// Login to Discord
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN environment variable is required");
  process.exit(1);
}

client.login(token);
