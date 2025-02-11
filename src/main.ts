import { Client, GatewayIntentBits, TextChannel, Events, SlashCommandBuilder, Routes, CommandInteractionOptionResolver } from 'discord.js';
import dotenv from 'dotenv';
import { Database, Statement } from 'sqlite3';
import { open } from 'sqlite';
import * as sqlite from 'sqlite';
import { REST } from '@discordjs/rest';
import { getRandomVideo, getLabelsForVideo, getVideosByLabel, insertVideoWithLabels, videoExists, addLabelsToVideo } from './api/videoDatabaseInteraction';
import { VideoInfo } from './datatypes/videoInfo';
import { initializeDatabase } from './database/database'

dotenv.config();

if (!process.env.token || !process.env.CID || !process.env.GUILD_ID) {
  throw new Error("Missing required environment variables");
}

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent],
});


// Database setup
const dbPromise: Promise<sqlite.Database<Database, Statement>> = open({
  filename: './database.db',
  driver: Database,
});

// Event listener for when the bot is ready
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user?.tag}!`);
  await initializeDatabase(dbPromise);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(process.env.token!);

  const commands = [
    new SlashCommandBuilder()
      .setName('incidents')
      .setDescription('Manage video incidents')
      .addSubcommand((subcommand) =>
        subcommand
          .setName('random')
          .setDescription('Get a random video incident')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('search')
          .setDescription('Get a video incident by label')
          .addStringOption((option) =>
            option
              .setName('label')
              .setDescription('The label to search for')
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('label')
          .setDescription('Label a video incident')
          .addStringOption((option) =>
            option
              .setName('link')
              .setDescription('The video link to label')
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('label')
              .setDescription('The label to assign')
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('update')
          .setDescription('Restarts the database 🤓')
      ),
  ].map((command) => command.toJSON());

  await rest.put(
    Routes.applicationGuildCommands(readyClient.user.id, process.env.GUILD_ID!),
    { body: commands }
  );

  console.log('Slash commands registered!');
});

// Event listener for when a message is created
client.on('messageCreate', async (message) => {
  const targetChannelId = process.env.CID;

  if (message.channelId === targetChannelId && message.attachments.size > 0) {
    const attachment = message.attachments.first();

    if (attachment?.contentType?.startsWith('video/')) {
      await insertVideoWithLabels(dbPromise, { videoUrl: attachment.url, uploadDate: message.createdAt, messageUrl: message.url });

      console.log(`Video uploaded: ${attachment.url}`);
    }
  }
});

// Event listener for slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const options = interaction.options as CommandInteractionOptionResolver<"cached">;

  if (interaction.commandName === 'incidents') {
    const subcommand = options.getSubcommand();

    if (subcommand === 'random') {
      const videoInfo: VideoInfo | null = await getRandomVideo(dbPromise);
      if (videoInfo) {
        await interaction.reply(`Random video: ${videoInfo.videoUrl}, messageLink: ${videoInfo.messageUrl}`);
      } else {
        await interaction.reply('No videos found.');
      }
    } else if (subcommand === 'search') {
      const label = options.getString('label', true);
      const videos: VideoInfo[] = await getVideosByLabel(dbPromise, label);
      


      if (videos.length > 0) {
        await interaction.reply(`Videos with label "${label}":\n${videos.map((videoInfo, id) => `video ${id}: ${videoInfo.videoUrl}, messageLink: ${videoInfo.messageUrl}`).join('\n')}`);
      } else {
        await interaction.reply(`No videos found with label "${label}".`);
      }

    } else if (subcommand === 'label') {
      const link = options.getString('link', true);
      const label = options.getString('label', true);
      try {
        await addLabelsToVideo(dbPromise, link, [label]);
        await interaction.reply(`Label "${label}" added to video: ${link}`);
      } catch (error) {
        console.error(error);
        await interaction.reply(`Error: ${error instanceof Error ? error.message : 'Failed to add label'}`);
      }
    } else if (subcommand === 'update') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const channel = client.channels.cache.get(process.env.CID!) as TextChannel;
        if (!channel) {
          return interaction.editReply('Channel not found!');
        }

        let addedCount = 0;
        let processedMessages = 0;
        let lastMessageId: string | undefined;

        // Fetch messages in batches
        while (true) {
          const messages = await channel.messages.fetch({
            before: lastMessageId
          });

          if (messages.size === 0) break;

          for (const [_, message] of messages) {
            processedMessages++;
            const attachments = message.attachments.filter(a => a.contentType?.startsWith('video/'));

            for (const [_, attachment] of attachments) {
              if (!(await videoExists(dbPromise, attachment.url))) {
                await insertVideoWithLabels(
                  dbPromise, {
                  videoUrl: attachment.url,
                  uploadDate: message.createdAt,
                  messageUrl: message.url
                }
                );
                addedCount++;
              }
            }
          }

          lastMessageId = messages.last()?.id;
        }

        await interaction.editReply(
          `Scanned ${processedMessages} messages.\nAdded ${addedCount} new videos to database.`
        );
      } catch (error) {
        console.error('Update failed:', error);
        await interaction.editReply(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
});

// Log in to Discord with your app's token
client.login(process.env.token);