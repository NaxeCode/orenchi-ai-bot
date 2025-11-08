import { Buffer } from "node:buffer";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { AttachmentBuilder, Client, Guild, User, TextChannel, VoiceBasedChannel } from "discord.js";
import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus
} from "@discordjs/voice";
import { PassThrough, Readable } from "node:stream";
import { FFmpeg, opus as PrismOpus } from "prism-media";
import { PersonalityDB } from "../database/PersonalityDB";
import { ChannelManager } from "./ChannelManager";
import { PersonalityCommand } from "../commands/PersonalityCommand";
import type { MessageHistoryItem } from "../utils/ConversationHistory";
import {ConversationHistory} from "../utils/ConversationHistory";
import { AIService } from "../services/AIService";
import { ChannelSummarizer } from "../services/ChannelSummarizer";
import { VoiceService, TTSProvider } from "../services/VoiceService";
import { VoicePlaybackQueue } from "./VoicePlaybackQueue";

// Types for the mock
type MockAIService = {
  generateResponse: (messages: MessageHistoryItem[], personality?: string | null) => Promise<string>;
  processImage: (imageURL: string, messages: MessageHistoryItem[], personality?: string | null) => Promise<string>;
};

type VoicePreference = {
  mode: "speech" | "ai";
  language?: string;
  lastVoiceChannelId?: string;
  lastGuildId?: string;
};

const SUPPORTED_OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "verse", "ballad", "ash", "sage", "marin", "cedar"] as const;
type VoiceName = (typeof SUPPORTED_OPENAI_VOICES)[number];

export class DiscordBot {
  private db: PersonalityDB;
  private channelManager: ChannelManager;
  private personalityCommand: PersonalityCommand;
  private aiService: AIService | MockAIService;
  private channelSummarizer: ChannelSummarizer;
  private voiceService: VoiceService;
  private voicePlaybackEnabled: boolean;
  private voiceDebugDir: string;
  private readonly silenceFrame = Buffer.from([0xf8, 0xff, 0xfe]);
  private voiceQueue: VoicePlaybackQueue;
  private userVoicePreferences = new Map<string, VoicePreference>();
  private client: Client | null = null;
  private voicePreset: VoiceName;

  constructor(dbPath?: string, mockAIService?: MockAIService) {
    this.db = new PersonalityDB(dbPath);
    this.channelManager = new ChannelManager();
    this.personalityCommand = new PersonalityCommand(this.db);
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable is required");
    }
    
    // Use mock if provided (for testing)
    if (mockAIService) {
      this.aiService = mockAIService;
    } else {
      this.aiService = new AIService({ apiKey });
    }
    
    // Initialize ChannelSummarizer with OpenRouter API key from environment
    this.channelSummarizer = new ChannelSummarizer({ apiKey });

    this.voicePlaybackEnabled = process.env.VOICE_ENABLED === "true";
    this.voicePreset = this.normalizeVoicePreset(process.env.OPENAI_TTS_VOICE);
    const ttsProvider = (process.env.VOICE_TTS_PROVIDER as TTSProvider) || "openai";
    const audioFormat = process.env.OPENAI_TTS_FORMAT === "mp3" ? "mp3" : "wav";
    this.voiceService = new VoiceService({
      provider: ttsProvider,
      voice: this.voicePreset,
      format: audioFormat,
      enabled: true,
      openAIApiKey: process.env.OPENAI_TTS_API_KEY || process.env.OPENAI_API_KEY
    });
    this.voiceDebugDir = path.join(process.cwd(), "debug", "voice");
    this.voiceQueue = new VoicePlaybackQueue();
    this.voiceService.setVoice(this.voicePreset);
  }

  private normalizeVoicePreset(value?: string | null): VoiceName {
    if (value && SUPPORTED_OPENAI_VOICES.includes(value as VoiceName)) {
      return value as VoiceName;
    }
    return "alloy";
  }

  async handleVoicePresetCommand(voice: string): Promise<string> {
    const normalized = this.normalizeVoicePreset(voice);
    this.voicePreset = normalized;
    this.voiceService.setVoice(normalized);
    return `Updated voice preset to **${normalized}**. Future TTS responses will use this voice.`;
  }

  // Initialize the bot (would connect to Discord in a real implementation)
  async initialize(): Promise<void> {
    console.log("Bot initialized");
  }

  async handleVoiceSpeakCommand(user: User, guild: Guild, text: string, language?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Discord client is not ready");
    }

    if (!this.voiceService.isEnabled()) {
      return "Voice output is disabled. Please configure VOICE_ENABLED and a valid TTS provider.";
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return "I couldn't find your guild membership. Please try again.";
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return "You need to join a voice channel first.";
    }

    const previousPreference = this.userVoicePreferences.get(user.id);
    const effectiveLanguage = language ?? previousPreference?.language;
    this.updateVoicePreference(user.id, {
      mode: "speech",
      language: effectiveLanguage,
      lastVoiceChannelId: voiceChannel.id,
      lastGuildId: guild.id
    });

    let audioData: Buffer;

    try {
      const speechText = this.formatSpeechText(text);
      const result = await this.voiceService.synthesizeSpeech(speechText, null, "wav");
      audioData = result.buffer;
    } catch (error: any) {
      console.error("Unable to synthesize speech:", error);
      return "Voice output is not configured. Please set VOICE_ENABLED and provide a TTS API key.";
    }

    this.enqueueVoicePlayback(guild, voiceChannel, audioData);

    if (effectiveLanguage) {
      return `I'll speak your message in ${voiceChannel.name} using your ${effectiveLanguage} preference as soon as any previous requests finish.`;
    }

    return `I'll speak your message in ${voiceChannel.name} as soon as any previous requests finish.`;
  }

  async handleAiVoiceInteraction(user: User, guild: Guild, promptText: string): Promise<string> {
    if (!this.client) {
      throw new Error("Discord client is not ready");
    }

    if (!this.voiceService.isEnabled()) {
      return "Voice output is disabled. Please configure VOICE_ENABLED and a valid TTS provider.";
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return "I couldn't find your guild membership. Please try again.";
    }

    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return "You need to join a voice channel first.";
    }

    const personality = this.personalityCommand.getPersonality(user.id);
    const previousPreference = this.userVoicePreferences.get(user.id);
    const effectiveLanguage = previousPreference?.language;
    this.updateVoicePreference(user.id, {
      mode: "ai",
      language: effectiveLanguage,
      lastVoiceChannelId: voiceChannel.id,
      lastGuildId: guild.id
    });
    const history: MessageHistoryItem[] = [
      {
        role: "user",
        content: promptText
      }
    ];

    let aiResponse: string;
    try {
      aiResponse = await this.generateReply(history, personality);
    } catch (error) {
      console.error("Failed to generate AI response for voice command:", error);
      return "I couldn't generate an AI response right now. Please try again.";
    }

    let audioData: Buffer;
    try {
      const speechText = this.formatSpeechText(aiResponse);
      const result = await this.voiceService.synthesizeSpeech(speechText, personality, "wav");
      audioData = result.buffer;
    } catch (error) {
      console.error("Unable to synthesize AI voice response:", error);
      return "Voice output is not available right now.";
    }

    this.enqueueVoicePlayback(guild, voiceChannel, audioData);

    return `Queued AI response in ${voiceChannel.name}: ${aiResponse}`;
  }

  // Set the Discord client (for testing)
  setClient(client: Client): void {
    this.client = client;
  }

  private async generateReply(
    historyItems: MessageHistoryItem[],
    personality?: string | null,
    imageURL?: string
  ): Promise<string> {
    if (imageURL) {
      return this.aiService.processImage(imageURL, historyItems, personality);
    }

    return this.aiService.generateResponse(historyItems, personality);
  }

  private async maybeSpeak(text: string, personality?: string | null): Promise<void> {
    if (!this.voicePlaybackEnabled) {
      return;
    }

    if (!this.voiceService.isEnabled()) {
      return;
    }

    try {
      await this.voiceService.speak(text, personality);
    } catch (error) {
      console.error("Failed to play TTS audio:", error);
    }
  }

  private createOpusStreamFromWav(wavBuffer: Buffer) {
    const bufferStream = new PassThrough();
    bufferStream.end(wavBuffer);

    const pcmStream = new FFmpeg({
      args: [
        "-loglevel", "0",
        "-i", "pipe:0",
        "-f", "s16le",
        "-ac", "2",
        "-ar", "48000"
      ]
    });

    const opusEncoder = new PrismOpus.Encoder({
      rate: 48000,
      channels: 2,
      frameSize: 960
    });

    bufferStream.pipe(pcmStream).pipe(opusEncoder);
    return opusEncoder;
  }

  private createSilenceStream(frameCount: number = 5): Readable {
    const frames = Array.from({ length: frameCount }, () => Buffer.from(this.silenceFrame));
    return Readable.from(frames);
  }

  private getLanguagePreference(userId: string): string | undefined {
    return this.userVoicePreferences.get(userId)?.language;
  }

  private updateVoicePreference(userId: string, preference: VoicePreference): void {
    const current = this.userVoicePreferences.get(userId);
    this.userVoicePreferences.set(userId, {
      language: preference.language ?? current?.language,
      mode: preference.mode ?? current?.mode ?? "speech",
      lastVoiceChannelId: preference.lastVoiceChannelId ?? current?.lastVoiceChannelId,
      lastGuildId: preference.lastGuildId ?? current?.lastGuildId
    });
  }

  private formatSpeechText(text: string): string {
    return text;
  }

  private async playAudioBuffer(guild: Guild, voiceChannel: VoiceBasedChannel, audioData: Buffer): Promise<void> {
    let connection = getVoiceConnection(guild.id);

    if (connection) {
      const currentChannel = connection.joinConfig.channelId;
      if (currentChannel !== voiceChannel.id) {
        connection.destroy();
        connection = null;
      }
    }

    if (!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator as any,
        selfDeaf: false
      });
    }

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    const audioPlayer = createAudioPlayer();
    audioPlayer.on("error", (error) => {
      console.error("Audio player error:", error);
    });

    const opusStream = this.createOpusStreamFromWav(audioData);
    const resource = createAudioResource(opusStream, {
      inputType: StreamType.Opus
    });
    const subscription = connection.subscribe(audioPlayer);

    if (!subscription) {
      connection.destroy();
      throw new Error("Unable to subscribe audio player to the voice connection.");
    }

    audioPlayer.play(resource);

    try {
      await entersState(audioPlayer, AudioPlayerStatus.Playing, 5_000);
      await entersState(audioPlayer, AudioPlayerStatus.Idle, 120_000);
      await this.flushSilenceFrames(audioPlayer);
    } finally {
      subscription.unsubscribe();
      audioPlayer.stop(true);
    }
  }

  private async flushSilenceFrames(audioPlayer: AudioPlayer): Promise<void> {
    try {
      const silenceStream = this.createSilenceStream();
      const silenceResource = createAudioResource(silenceStream, {
        inputType: StreamType.Opus
      });
      audioPlayer.play(silenceResource);
      await entersState(audioPlayer, AudioPlayerStatus.Playing, 1_000);
      await entersState(audioPlayer, AudioPlayerStatus.Idle, 2_000);
    } catch (error) {
      console.warn("Failed to flush silence frames:", error);
    }
  }

  private enqueueVoicePlayback(guild: Guild, voiceChannel: VoiceBasedChannel, audioBuffer: Buffer): void {
    void this.voiceQueue.enqueue(guild.id, async () => {
      await this.playAudioBuffer(guild, voiceChannel, audioBuffer);
    });
  }

  private async maybeSpeakUserMessage(userId: string, text: string, guild: Guild | null): Promise<void> {
    if (!this.voiceService.isEnabled()) {
      return;
    }

    const preference = this.userVoicePreferences.get(userId);
    if (!preference || preference.mode !== "speech") {
      return;
    }

    let targetGuild: Guild | null = guild;
    if (!targetGuild && preference.lastGuildId && this.client) {
      targetGuild = await this.client.guilds.fetch(preference.lastGuildId).catch(() => null);
    }

    if (!targetGuild) {
      return;
    }

    const member = await targetGuild.members.fetch(userId).catch(() => null);
    if (!member || !member.voice.channel) {
      return;
    }

    const speechText = this.formatSpeechText(text);
    try {
      const { buffer } = await this.voiceService.synthesizeSpeech(speechText, null, "wav");
      this.enqueueVoicePlayback(targetGuild, member.voice.channel, buffer);
    } catch (error) {
      console.warn("Failed to TTS user speech-mode message:", error);
    }
  }

  async handleSpeechModeFollowup(userId: string, text: string, guild: Guild | null): Promise<void> {
    await this.maybeSpeakUserMessage(userId, text, guild);
  }

  async handleLeaveVoiceCommand(guild: Guild): Promise<string> {
    const connection = getVoiceConnection(guild.id);
    if (!connection) {
      return "I'm not connected to a voice channel right now.";
    }
    connection.destroy();
    return "Disconnected from the voice channel.";
  }

  private async trySendVoiceAttachment(channel: TextChannel | null, text: string, personality?: string | null): Promise<void> {
    if (!channel) {
      return;
    }

    if (!this.channelManager.isPrivateChatChannel(channel.name)) {
      return;
    }

    if (!this.voiceService.isEnabled()) {
      return;
    }

    try {
      const { buffer, format } = await this.voiceService.synthesizeSpeech(text, personality);
      const fileName = `ai-response-${Date.now()}.${format}`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });
      await channel.send({ files: [attachment] });
    } catch (error) {
      console.warn("Failed to send voice attachment:", error);
    }
  }

  async handleVoiceDebugCommand(user: User, promptText: string): Promise<string> {
    if (!this.voiceService.isEnabled()) {
      return "Voice output is disabled. Set VOICE_ENABLED=true and configure OPENAI_TTS_API_KEY to use this command.";
    }

    const personality = this.personalityCommand.getPersonality(user.id);
    const history: MessageHistoryItem[] = [
      {
        role: "user",
        content: promptText
      }
    ];

    const aiResponse = await this.generateReply(history, personality);
    const { buffer, format } = await this.voiceService.synthesizeSpeech(aiResponse, personality);

    await mkdir(this.voiceDebugDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = `${timestamp}-${user.id}`;
    const audioPath = path.join(this.voiceDebugDir, `${baseName}.${format}`);
    await writeFile(audioPath, buffer);

    const metadata = {
      timestamp,
      user: {
        id: user.id,
        tag: user.tag
      },
      prompt: promptText,
      personality,
      aiResponse,
      voice: {
        provider: this.voiceService.getProvider(),
        voice: this.voiceService.getVoiceName(),
        format
      }
    };

    const metadataPath = path.join(this.voiceDebugDir, `${baseName}.json`);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return `Saved debug audio and metadata.\nAudio: ${audioPath}\nMetadata: ${metadataPath}`;
  }

  // Handle a message from a user
  async handleMessage(userId: string, messageContent: string, channel?: TextChannel, attachments?: { url: string, contentType?: string }[]): Promise<string> {
    console.log(`Handling message from user ${userId} in channel ${channel?.name || 'unknown'}: ${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}`);
    
    // Send initial typing indicator if channel is provided
    if (channel) {
      try {
        await channel.sendTyping();
      } catch (error) {
        console.error("Failed to send initial typing indicator:", error);
      }
    }
    
    // Set up more frequent typing indicators for better UX
    let typingInterval: NodeJS.Timeout | null = null;
    if (channel) {
      // Send typing indicator immediately and then more frequently
      let typingSentCount = 0;
      const maxTypingIndicators = 10; // Limit to prevent infinite loops
      
      typingInterval = setInterval(async () => {
        try {
          // Stop sending typing indicators after a reasonable number to prevent spam
          if (typingSentCount >= maxTypingIndicators) {
            if (typingInterval) clearInterval(typingInterval);
            return;
          }
          
          await channel.sendTyping();
          typingSentCount++;
        } catch (error) {
          console.error("Failed to send typing indicator:", error);
          if (typingInterval) clearInterval(typingInterval);
        }
      }, 5000); // Send typing indicator every 5 seconds for smoother experience
    }
    
    // Get user's personality if it exists
    const personality = this.personalityCommand.getPersonality(userId);
    if (personality) {
      console.log(`Using personality for user ${userId}: ${personality.substring(0, 50)}${personality.length > 50 ? '...' : ''}`);
    }
    
    let historyItems: MessageHistoryItem[] = [];
    
    // If we have a channel, fetch actual history from Discord
    if (channel) {
      try {
        console.log(`Fetching message history from channel ${channel.name}`);
        const messages = await channel.messages.fetch({ limit: 10 });
        historyItems = messages
          .filter(msg => !msg.author.bot || msg.author.id === this.client?.user?.id)
          .map(msg => ({
            role: msg.author.id === this.client?.user?.id ? "assistant" as const: "user" as const,
            content: msg.content
          }))
          .reverse(); // Reverse to get chronological order
        console.log(`Fetched ${historyItems.length} history items`);
      } catch (error) {
        console.error("Failed to fetch message history:", error);
        // Fall back to in-memory history
        const history = new ConversationHistory(10);
        history.addMessage({ role: "user", content: messageContent });
        historyItems = history.getHistory();
      }
    } else {
      // Use in-memory history as fallback
      console.log("Using in-memory history as fallback");
      const history = new ConversationHistory(10);
      history.addMessage({ role: "user", content: messageContent });
      historyItems = history.getHistory();
    }
    
    // Check if there are image attachments
    const imageAttachments = attachments?.filter(attachment =>
      attachment.contentType?.startsWith('image/') && 
      attachment.url
    ) || [];

    const firstImageURL = imageAttachments[0]?.url;
    
    // Get response from AI service
    console.log("Generating AI response...");
    let response: string;
    
    try {
      response = await this.generateReply(historyItems, personality, firstImageURL);
      console.log(`Generated response: ${response.substring(0, 50)}${response.length > 50 ? '...' : ''}`);
      await this.maybeSpeak(response, personality);
      await this.trySendVoiceAttachment(channel ?? null, response, personality);
    } finally {
      // Clear typing interval when done (success or error)
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }
    
    // Check if we should rename the channel (after 5 messages exchanged)
    if (channel && this.channelManager.isPrivateChatChannel(channel.name)) {
      try {
        // Fetch message count
        const messages = await channel.messages.fetch({ limit: 10 });
        const userMessages = messages.filter(msg => !msg.author.bot || msg.author.id === this.client?.user?.id);
        
        // Rename channel after every 2 messages
        if (userMessages.size >= 2 && (userMessages.size - 2) % 4 === 0) {
          // Check if the channel name already contains a summary (to avoid renaming multiple times)
          if (!channel.name.includes("-ai-discussion-") && !channel.name.includes("-chat-summary-")) {
            await this.channelManager.renameChannelWithSummary(channel, this.channelSummarizer);
          }
        }
      } catch (error) {
        console.error(`Failed to check for channel renaming:`, error);
      }
    }
    
    // Send one final typing indicator right before sending the message
    // This ensures the typing indicator is active when the message appears
    if (channel) {
      try {
        await channel.sendTyping();
      } catch (error) {
        console.error("Failed to send final typing indicator:", error);
      }
    }
    
    return response;
  }

  // Handle the /personality command
  async handlePersonalityCommand(userId: string, personalityText?: string | null): Promise<string> {
    // If no personality text is provided, return the current personality with a help message
    if (!personalityText) {
      const currentPersonality = this.personalityCommand.getPersonality(userId);
      if (currentPersonality) {
        return `Current personality: ${currentPersonality}\n\nTo set a new personality, use: /personality <personality text>`;
      } else {
        return "No personality set. To set a personality, use: /personality <personality text>";
      }
    }
    
    // If personality text is provided, set it
    return await this.personalityCommand.handle(userId, personalityText);
  }

  // Handle the /start-ai-chat command
  async handleStartAiChatCommand(user: User, guild: Guild): Promise<string> {
    try {
      const botId = this.client?.user?.id;
      const channel = await this.channelManager.createPrivateChannel(guild, [user], botId);
      return `I've created a private AI chat channel for you: ${channel.toString()}`;
    } catch (error) {
      console.error("Failed to create private channel:", error);
      return "Sorry, I couldn't create a private AI chat channel for you. Please try again later.";
    }
  }

  // Handle the /end-ai-chat command
  async handleEndAiChatCommand(user: User, guild: Guild, channel?: TextChannel): Promise<string> {
    // If the command was issued from a private AI chat channel, delete that channel
    if (channel && this.channelManager.isPrivateChatChannel(channel.name)) {
      try {
        await this.channelManager.deletePrivateChannel(channel);
        return "This private AI chat channel has been deleted.";
      } catch (error) {
        console.error("Failed to delete private channel:", error);
        return "Sorry, I couldn't delete this private AI chat channel. Please try again later.";
      }
    }
    
    // Otherwise, search for the user's private channel and delete it
    const userChannel = this.channelManager.findUserPrivateChannel(guild, user.username);
    
    if (!userChannel) {
      return "You don't have an active private AI chat channel.";
    }
    
    try {
      await this.channelManager.deletePrivateChannel(userChannel);
      return "Your private AI chat channel has been deleted.";
    } catch (error) {
      console.error("Failed to delete private channel:", error);
      return "Sorry, I couldn't delete your private AI chat channel. Please try again later.";
    }
  }

  // Check and cleanup inactive channels
  async cleanupInactiveChannels(guild: Guild): Promise<void> {
    await this.channelManager.cleanupInactiveChannels(guild);
  }

  // Generate a varied response for public channel notifications
  async generatePublicResponse(userId: string, userMessage: string, channelMention: string): Promise<string> {
    // Create system prompt for generating varied responses
    const systemPrompt = "Generate a friendly one-line response indicating we're moving to a private channel in the language the user used, in a tone of who you are supposed to be. Keep it concise. Only provide one response.";
    
    // Create user prompt with the original message for language detection
    const userPrompt = `${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}`;
    
    const historyItems = [
      { role: "user" as const, content: userPrompt }
    ];
    
    // Generate response using the AI service with system prompt as personality
    const response = await this.aiService.generateResponse(historyItems, systemPrompt, false);
    return response;
  }
  
  // Generate a response for the first message in a private channel
  // This response is generated with personality and with web search enabled
  async generateFirstMessageResponse(userId: string, originalMessage: string): Promise<string> {
    console.log(`Generating first message response for user ${userId} with original message: ${originalMessage.substring(0, 50)}${originalMessage.length > 50 ? '...' : ''}`);
    
    // Get user's personality if it exists
    const personality = this.personalityCommand.getPersonality(userId);
    if (personality) {
      console.log(`Using personality for user ${userId}: ${personality.substring(0, 50)}${personality.length > 50 ? '...' : ''}`);
    }
    
    // Create a system prompt that tells the AI to generate a friendly response
    // that respects the user's personality
    const systemPrompt = `Generate a friendly, natural response in the language as the user's message, in a tone of who you are supposed to be. Keep it concise but not necessarily limited to one line. Only provide one response.`;
    
    // Create a history with just the original message
    const historyItems = [
      { role: "user" as const, content: originalMessage }
    ];
    
    // Generate response using the AI service with the system prompt as personality
    // This approach ensures we don't do web search but still respect personality
    try {
      const response = await this.aiService.generateResponse(historyItems, systemPrompt, true);
      console.log(`Generated first message response: ${response.substring(0, 50)}${response.length > 50 ? '...' : ''}`);
      return response;
    } catch (error) {
      console.error("Error generating first message response:", error);
      // Fallback to a simple response
      return "Hello! I've moved our conversation to this private channel. How can I help you today?";
    }
  }
  
  // Shutdown the bot and cleanup resources
  async shutdown(): Promise<void> {
    this.db.close();
    console.log("Bot shut down");
  }
}
