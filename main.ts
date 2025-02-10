import { Client, GatewayIntentBits, EmbedBuilder, TextChannel, Events, SlashCommandBuilder, Routes, CommandInteractionOptionResolver, Message, Attachment } from 'discord.js';
import dotenv from 'dotenv';
import { sqlite3, Database } from 'sqlite3';
import { open } from 'sqlite';
import { REST } from '@discordjs/rest';

dotenv.config();

if (!process.env.token || !process.env.CID || !process.env.GUILD_ID) {
  throw new Error("Missing required environment variables");
}

console.log("before client");

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent],
});

console.log("before dbpromise");

// Database setup
const dbPromise = open({
  filename: './database.db',
  driver: Database,
});

console.log("after dbpromise");

// Function to initialize the database
async function initializeDatabase() {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        videoUrl TEXT NOT NULL,
        uploadDate TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS labels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS video_labels (
        videoId INTEGER NOT NULL,
        labelId INTEGER NOT NULL,
        PRIMARY KEY (videoId, labelId),
        FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (labelId) REFERENCES labels(id) ON DELETE CASCADE
      );
    `);
}

// Function to insert a video into the database
async function insertVideoWithLabels(videoUrl: string, uploadDate: string, labels: string[] = []) {
  const db = await dbPromise;

  // Insert the video
  const videoResult = await db.run(
    'INSERT INTO videos (videoUrl, uploadDate) VALUES (?, ?)',
    [videoUrl, uploadDate]
  );

  const videoId = videoResult.lastID;

  // Insert labels and link them to the video
  for (const label of labels) {
    // Insert the label if it doesn't exist
    let labelResult = await db.get('SELECT id FROM labels WHERE label = ?', [label]);
    if (!labelResult) {
      labelResult = await db.run('INSERT INTO labels (label) VALUES (?)', [label]);
    }

    const labelId = labelResult.lastID || labelResult.id;

    // Link the video to the label
    await db.run('INSERT INTO video_labels (videoId, labelId) VALUES (?, ?)', [videoId, labelId]);
  }
}

// Add this new function to check for existing videos
async function videoExists(videoUrl: string): Promise<boolean> {
    const db = await dbPromise;
    const result = await db.get(
      'SELECT 1 FROM videos WHERE videoUrl = ?',
      [videoUrl]
    );
    return !!result;
  }

// Function to update a video's label
async function addLabelsToVideo(videoUrl: string, labels: string[]) {
  const db = await dbPromise;

  // Find the video by URL
  const video = await db.get('SELECT id FROM videos WHERE videoUrl = ?', [videoUrl]);
  if (!video) throw new Error('Video not found');

  const videoId = video.id;

  // Insert labels and link them to the video
  for (const label of labels) {
    // Insert the label if it doesn't exist
    let labelResult = await db.get('SELECT id FROM labels WHERE label = ?', [label]);
    if (!labelResult) {
      labelResult = await db.run('INSERT INTO labels (label) VALUES (?)', [label]);
    }

    const labelId = labelResult.lastID || labelResult.id;

    // Link the video to the label
    await db.run('INSERT INTO video_labels (videoId, labelId) VALUES (?, ?)', [videoId, labelId]);
  }
}

// Function to get a random video
async function getRandomVideo() {
  const db = await dbPromise;
  const video = await db.get(
    'SELECT videoUrl, id FROM videos ORDER BY RANDOM() LIMIT 1'
  );
  return video?.videoUrl;
}

// Function to get a video by label
async function getVideosByLabel(label: string) {
  const db = await dbPromise;

  // Find videos with the specified label
  const videos = await db.all(
    `SELECT v.videoUrl
     FROM videos v
     JOIN video_labels vl ON v.id = vl.videoId
     JOIN labels l ON vl.labelId = l.id
     WHERE l.label = ?`,
    [label]
  );

  return videos.map((video) => video.videoUrl);
}

async function getLabelsForVideo(videoUrl: string) {
  const db = await dbPromise;

  // Find labels for the specified video
  const labels = await db.all(
    `SELECT l.label 
       FROM labels l
       JOIN video_labels vl ON l.id = vl.labelId
       JOIN videos v ON vl.videoId = v.id
       WHERE v.videoUrl = ?`,
    [videoUrl]
  );

  return labels.map((label) => label.label);
}

console.log("before once");

// Event listener for when the bot is ready
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user?.tag}!`);
  await initializeDatabase();

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

console.log("before on");

// Event listener for when a message is created
client.on('messageCreate', async (message) => {
  const targetChannelId = process.env.CID;

  if (message.channelId === targetChannelId && message.attachments.size > 0) {
    const attachment = message.attachments.first();

    if (attachment?.contentType?.startsWith('video/')) {
      const videoUrl = attachment.url;
      const uploadDate = new Date().toISOString();

      // Insert the video with no labels initially
      await insertVideoWithLabels(videoUrl, uploadDate);

      console.log(`Video uploaded: ${videoUrl}`);
    }
  }
});

async function getMessagesWithVideos(channel: TextChannel): Promise<Message[]> {
  const messages = await channel.messages.fetch();
  const filteredMessages = messages.filter((message) => {
    return message.attachments.some((attachment) => {
      return attachment.contentType?.startsWith('video/') ?? false;
    });
  });

  return Array.from(filteredMessages.values());
}

function extractVideoURLs(message: Message): string[] {
  return [...message.attachments.values()].filter((a: Attachment) => a.contentType?.startsWith('video/') ?? false).map((a: Attachment) => a.url);
}

// Event listener for slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const options = interaction.options as CommandInteractionOptionResolver<"cached">;

  if (interaction.commandName === 'incidents') {
    const subcommand = options.getSubcommand();

    if (subcommand === 'random') {
      const videoUrl = await getRandomVideo();
      if (videoUrl) {
        await interaction.reply(`Random video: ${videoUrl}`);
      } else {
        await interaction.reply('No videos found.');
      }
    } else if (subcommand === 'search') {
      const label = options.getString('label', true);
      const videos = await getVideosByLabel(label);
      if (videos.length > 0) {
        await interaction.reply(`Videos with label "${label}":\n${videos.join('\n')}`);
      } else {
        await interaction.reply(`No videos found with label "${label}".`);
      }
    } else if (subcommand === 'label') {
      const link = options.getString('link', true);
      const label = options.getString('label', true);
      try {
        await addLabelsToVideo(link, [label]);
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
              limit: 100,
              before: lastMessageId
            });
      
            if (messages.size === 0) break;
      
            for (const [_, message] of messages) {
              processedMessages++;
              const attachments = message.attachments.filter(a => a.contentType?.startsWith('video/'));
              
              for (const [_, attachment] of attachments) {
                if (!(await videoExists(attachment.url))) {
                  await insertVideoWithLabels(
                    attachment.url,
                    message.createdAt.toISOString()
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

console.log("before login");
// Log in to Discord with your app's token
client.login(process.env.token);