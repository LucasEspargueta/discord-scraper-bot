import { Database, Statement } from 'sqlite3';
import * as sqlite from 'sqlite';
import { VideoInfo } from '../datatypes/videoInfo';


// Function to insert a video into the database
export async function insertVideoWithLabels(dbPromise: Promise<sqlite.Database<Database, Statement>>, videoInfo: VideoInfo, labels: string[] = []) {
    const db = await dbPromise;
  
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
  export async function videoExists(dbPromise: Promise<sqlite.Database<Database, Statement>>, videoUrl: string): Promise<boolean> {
    const db = await dbPromise;
    const result = await db.get(
      'SELECT 1 FROM videos WHERE videoUrl = ?',
      [videoUrl]
    );
    return !!result;
  }
  
  // Function to update a video's label
  export async function addLabelsToVideo(dbPromise: Promise<sqlite.Database<Database, Statement>>, videoUrl: string, labels: string[]) {
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
  export async function getRandomVideo(dbPromise: Promise<sqlite.Database<Database, Statement>>, ): Promise<VideoInfo | null> {
    const db = await dbPromise;
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
  
  export async function getVideosByLabel(dbPromise: Promise<sqlite.Database<Database, Statement>>, label: string): Promise<VideoInfo[]> {
    const db = await dbPromise;
  
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
  
  export async function getLabelsForVideo(dbPromise: Promise<sqlite.Database<Database, Statement>>, videoUrl: string): Promise<string[]> {
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
  