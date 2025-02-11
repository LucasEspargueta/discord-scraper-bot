import { Database, Statement } from 'sqlite3';
import * as sqlite from 'sqlite';

export async function initializeDatabase(dbPromise: Promise<sqlite.Database<Database, Statement>>) {
    const db = await dbPromise;
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