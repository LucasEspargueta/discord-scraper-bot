import { Client, GatewayIntentBits, TextChannel, Events, SlashCommandBuilder, Routes, CommandInteractionOptionResolver, EmbedBuilder, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import { REST } from '@discordjs/rest';
import { VideoInfo } from './datatypes/videoInfo';
import './database/database';
import VideoDB from './database/database';

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

// instantiated when the bot boots up
let videoDB: VideoDB;

// Event listener for when the bot is ready
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user?.tag}!`);
  videoDB = await VideoDB.create();

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
      await videoDB.insertVideoWithLabels(new VideoInfo(message.url, attachment.url, message.createdAt));

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
      const videoInfo: VideoInfo | null = await videoDB.getRandomVideo();
      if (videoInfo) {
        await interaction.reply(`Random video: ${videoInfo.videoUrl}, messageLink: ${videoInfo.messageUrl}`);
      } else {
        await interaction.reply('No videos found.');
      }
    } else if (subcommand === 'search') {

      const label = options.getString('label', true);
      const videos: VideoInfo[] = await videoDB.getVideosByLabel(label);

      const embed = new EmbedBuilder().setAuthor({ name: `Videos labeled "${label}"` })

      if (videos.length > 0) {

        videos.forEach((videoInfo, id) => {
          embed.addFields({ name: `**${videoInfo.videoUrl.split('/').at(-1)?.split('?').at(0)}**`, value: `[*here!*](${videoInfo.messageUrl})` })
        });

        await interaction.reply({ embeds: [embed] });

      } else {
        await interaction.reply(`No videos found with label "${label}".`);
      }

    } else if (subcommand === 'label') {
      const url = options.getString('link', true);
      const label = options.getString('label', true);
      try {
        await videoDB.addLabelsToVideo(VideoInfo.getUniqueVideoIdentifier(url), [label]);
        await interaction.reply(`Label "${label}" added to video: ${url}`);
      } catch (error) {
        console.error(error);
        await interaction.reply(`Error: ${error instanceof Error ? error.message : 'Failed to add label'}`);
      }
    } else if (subcommand === 'update') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const channel = client.channels.cache.get(process.env.CID!) as TextChannel;
        if (!channel) {
          return interaction.editReply('Channel not found!');
        }

        let addedCount = 0;
        let updatedURLCount = 0;
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
              const videoIdentifier: string = VideoInfo.getUniqueVideoIdentifier(attachment.url);

              if (!(await videoDB.videoExists(videoIdentifier))) {
                await videoDB.insertVideoWithLabels(new VideoInfo(message.url, attachment.url, message.createdAt));
                addedCount++;
              } else {
                const video: VideoInfo = await videoDB.getVideoByVideoIdentifier(videoIdentifier);
                if (video.getUniqueVideoIdentifier() !== videoIdentifier) await videoDB.setVideoUrl(attachment.url);
                updatedURLCount++;
              }
            }
          }

          lastMessageId = messages.last()?.id;
        }

        await interaction.editReply(
          `Scanned ${processedMessages} messages.\nAdded ${addedCount} new videos to database and updated ${updatedURLCount} URLs.`
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