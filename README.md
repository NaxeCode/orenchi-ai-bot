# Orenchi AI Bot

[![codecov](https://codecov.io/github/goura/orenchi-ai-bot/graph/badge.svg?token=Q2RLDQEIU8)](https://codecov.io/github/goura/orenchi-ai-bot)

A conversational AI chatbot for Discord with private, one-on-one conversations and customizable personalities.

## Features

- Private, one-on-one conversations with users
- Customizable personality per user
- Automatic channel cleanup
- SQLite-based personality storage
- Dynamic model selection based on message length
- Slash commands for personality management and chat control
- Optional voice responses that can both play locally and stream into Discord voice calls
- Audio attachments in `/start-ai-chat` channels so you can hear responses without joining voice
- Unique channel names to prevent collisions

## Architecture

The bot is built with:
- **Language**: TypeScript/JavaScript with Bun runtime
- **Discord Library**: discord.js
- **AI Model**: OpenRouter API with OpenAI ChatCompletion compatible interface
- **Database**: SQLite with Bun's built-in sqlite support

## Database

The bot uses SQLite for storing user personalities. The database is automatically initialized when the bot starts.

- **Default path**: `personalities.db` in the current working directory
- **Custom path**: Pass a path to the constructor: `new PersonalityDB("/path/to/db.sqlite")`
- **Automatic creation**: The database file and tables are created automatically if they don't exist
- **Table structure**: 
  - `personalities` table with columns:
    - `user_id` (TEXT, PRIMARY KEY)
    - `personality` (TEXT, NOT NULL)

## Testing

The project has comprehensive test coverage using Bun's built-in test runner:

```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Run tests in watch mode
bun test --watch
```

Current test coverage: 100% across all source files.

## Commands

- `/personality [text]` - Set your custom personality for the bot
- `/start-ai-chat` - Start a new private AI conversation
- `/end-ai-chat` - End current AI conversation and delete channel
- `/ai-say <text>` - Queue a direct text-to-speech playback of exactly what you typed (handy when you are muted)
- `/ai-voice <text>` - Join your current voice channel, generate an AI response via the LLM, and speak that reply aloud
- `/ai-debug-voice [text]` - Generate a debug voice sample, save the spoken audio and metadata under `debug/voice`, and report the file paths
- `/leave` - Explicitly disconnect the AI from the voice channel when you're done
- Automatic text-to-speech playback for regular chat replies when enabled

### Slash Commands Installation Guide

This guide explains how to install/register the slash commands for the Discord bot.

#### Prerequisites

Before deploying commands, ensure you have:

1. A Discord bot application created in the [Discord Developer Portal](https://discord.com/developers/applications)
2. The following environment variables set in your `.env` file:
   - `DISCORD_CLIENT_ID` - Your bot's client ID from the [Discord Developer Portal](https://discord.com/developers/applications)
   - `DISCORD_GUILD_ID` - The ID of the guild/server where you want to register the commands
     - You can get the `DISCORD_GUILD_ID` by enabling the Developer Mode and right-clicking on the server
   - `DISCORD_BOT_TOKEN` - Your bot's token from the Discord Developer Portal

#### Command Deployment

The bot includes the following slash commands:

1. `/personality` - Set a custom personality for the AI bot
2. `/start-ai-chat` - Create a private AI chat channel
3. `/end-ai-chat` - Delete your private AI chat channel
4. `/ai-voice` - Have the AI join your voice channel, craft an LLM response, and speak it aloud
5. `/ai-say` - Repeat exactly what you typed via TTS so muted users can still “talk”
6. `/ai-debug-voice` - Generate a voice response locally for debugging and dump metadata/audio files
7. `/leave` - Disconnect the bot from the current voice channel

##### Deploying Commands

To deploy the commands to your Discord server, run:

```bash
bun run deploy-commands
```

This script will register the commands with Discord for the specific guild defined in your `DISCORD_GUILD_ID` environment variable.

##### How It Works

The deployment script (`src/deploy-commands.ts`) uses Discord's REST API to register the commands:

1. It loads the command definitions from the `src/commands/` directory
2. It uses the Discord.js REST module to make API calls
3. It registers the commands for a specific guild (faster for development)

##### Command Definitions

Each command is defined using Discord.js's `SlashCommandBuilder` in separate files:

- `src/commands/personality.command.ts`
- `src/commands/start-ai-chat.command.ts`
- `src/commands/end-ai-chat.command.ts`
- `src/commands/ai-voice.command.ts`

These definitions specify:
- Command name
- Description
- Options/parameters (if any)

##### Troubleshooting

If you encounter issues during command deployment:

1. Verify all environment variables are set correctly
2. Check that your bot has the necessary permissions
3. Ensure the guild ID is correct
4. Check the console output for specific error messages

Common errors:
- `Missing Access` - Your bot token might be incorrect
- `Missing Permissions` - Your bot might not have the necessary OAuth2 permissions
- `Unknown Guild` - The guild ID might be incorrect

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set up environment variables:
   - `DISCORD_BOT_TOKEN` - Your Discord bot token
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `RESPOND_TO_PUBLIC_NO_MENTION` (optional) - Set to `true` to enable the bot to process messages with no mentions in public channels. Defaults to `false`.
   - `VOICE_ENABLED` (optional) - Set to `true` to have the bot speak responses out loud on the host machine
   - `VOICE_TTS_PROVIDER` (optional) - `openai` (default) or `coqui` (placeholder for future support)
   - `OPENAI_TTS_API_KEY` - Required when `VOICE_TTS_PROVIDER=openai`; the key never leaves your machine
   - `OPENAI_TTS_VOICE` (optional) - Voice preset for OpenAI TTS (defaults to `alloy`)
   - `OPENAI_TTS_FORMAT` (optional) - `wav` (default) or `mp3`

3. Discord OAuth2 Setup:
   When setting up OAuth2 for your Discord bot, you need to configure the proper scopes and permissions.

   ### Required Scopes
   - `bot` - Primary scope that allows your application to function as a Discord bot
   - `applications.commands` - Scope required for using slash commands

   ### Bot Permissions
   When selecting the `bot` scope, you'll need to specify the permissions your bot requires:

   #### Essential Permissions
   - `Manage Channels` - Required for creating and deleting private channels
   - `Read Messages/View Channels` - Allows the bot to read messages in channels
   - `Send Messages` - Allows the bot to send messages in channels
   - `Read Message History` - Allows the bot to read previous messages in channels

   #### Voice Permissions (if needed)
   - `Connect` - Allows the bot to connect to voice channels
   - `Speak` - Allows the bot to speak in voice channels

   ### Best Practices
   - Always follow the principle of least privilege
   - Only select the permissions your bot actually needs to function
   - Review permissions regularly and adjust as needed
   - If you encounter "Missing Access" errors, verify that your bot has "Manage Channels" permission

4. Run the bot:
   ```bash
   bun start
   ```

5. Run tests:
   ```bash
   bun test
   ```

6. Run tests with coverage:
   ```bash
   bun test --coverage
   ```

## Voice Playback

- Set `VOICE_ENABLED=true` plus `OPENAI_TTS_API_KEY` to have every AI reply spoken aloud locally using OpenAI's `gpt-4o-mini-tts`.
- `VOICE_TTS_PROVIDER` is pluggable; only the `openai` provider is wired up today, but the interface allows swapping in Coqui later.
- The new pipeline is: user text → OpenRouter response (`generateReply`) → OpenAI TTS (`speak`) → OS/Discord audio output. The `/ai-voice` command still streams the same synthesized audio into Discord voice channels.
- When using `/ai-voice`, ensure the bot has the `Connect` and `Speak` permissions in the target channel and that `ffmpeg` is installed on the host (needed to transcode TTS output to Opus frames for Discord voice).
- `/ai-debug-voice` writes both the raw audio output and a JSON payload describing the prompt, AI response, personality, and selected voice settings to `debug/voice/<timestamp>-<userId>.*`. This is useful for reproducing or sharing TTS issues without joining a voice channel.
- `/ai-say` queues literal text-to-speech so muted users can “talk”, whereas `/ai-voice` asks the LLM to craft a reply and then vocalizes it.
- All voice requests (from both commands) are funneled through a per-guild playback queue to ensure responses play sequentially.
- `/start-ai-chat` channels automatically receive an attached audio clip of each response (when TTS is configured), so you can listen back asynchronously.
---

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```

This project was created using `bun init` in bun v1.2.19. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Docker

This project can be run in a Docker container. See [DOCKER.md](DOCKER.md) for detailed instructions on building and running the Docker image.

### Quick Start with Docker

1. Build the Docker image:
   ```bash
   bun run docker:build
   ```

2. Run the container with your environment variables:
   ```bash
   bun run docker:run
   ```
