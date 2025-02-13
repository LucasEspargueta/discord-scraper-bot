import { Database, Statement } from 'sqlite3';
import * as sqlite from 'sqlite';
import { VideoInfo } from '../datatypes/videoInfo';

export default class VideoDB {
  private dbPromise: Promise<sqlite.Database<Database, Statement>>;

  public static async create(): Promise<VideoDB> {
    const videoDB: VideoDB = new VideoDB();
    await videoDB.initializeDatabase();

    return videoDB;
  }

  private constructor() {
    this.dbPromise = sqlite.open({
      filename: './database.db',
      driver: Database,
    });

  }

  /**
   * Creates the necessary 
   */
  private async initializeDatabase(): Promise<void> {
    const db = await this.dbPromise;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          videoUrl TEXT NOT NULL,
          uploadDate TEXT NOT NULL,
          messageUrl TEXT NOT NULL
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

  /**
   * Inserts a video into the database
   * 
   * @param videoInfo 
   * @param labels 
   */
  public async insertVideoWithLabels(videoInfo: VideoInfo, labels: string[] = []) {
    const db = await this.dbPromise;

    // Insert the video
    const videoResult = await db.run(
      'INSERT INTO videos (videoUrl, uploadDate, messageUrl) VALUES (?, ?, ?)',
      [videoInfo.videoUrl, videoInfo.uploadDate, videoInfo.messageUrl]
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
  public async videoExists(videoUrl: string): Promise<boolean> {
    const db = await this.dbPromise;
    const result = await db.get(
      'SELECT 1 FROM videos WHERE videoUrl = ?',
      [videoUrl]
    );
    return !!result;
  }

  // Function to update a video's label
  public async addLabelsToVideo(videoUrl: string, labels: string[]) {
    const db = await this.dbPromise;

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
  public async getRandomVideo(): Promise<VideoInfo | null> {
    const db = await this.dbPromise;
    const video = await db.get(
      'SELECT videoUrl, uploadDate, messageUrl FROM videos ORDER BY RANDOM() LIMIT 1'
    );

    if (video) return {
      videoUrl: video.videoUrl,
      messageUrl: video.messageUrl,
      uploadDate: video.uploadDate
    };

    return null;
  }

  public async getVideosByLabel(label: string): Promise<VideoInfo[]> {
    const db = await this.dbPromise;

    // Find videos with the specified label
    const videos = await db.all(
      `SELECT v.videoUrl, v.uploadDate, v.messageUrl
         FROM videos v
         JOIN video_labels vl ON v.id = vl.videoId
         JOIN labels l ON vl.labelId = l.id
         WHERE l.label = ?`,
      [label]
    );
    return videos.map((video) => ({ videoUrl: video.videoUrl, messageUrl: video.messageUrl, uploadDate: new Date(video.uploadDate) }));
  }

  public async getLabelsForVideo(videoUrl: string): Promise<string[]> {
    const db = await this.dbPromise;

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
}