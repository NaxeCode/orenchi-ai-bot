import { Database } from "bun:sqlite";

export class PersonalityDB {
  private db: Database;

  constructor(dbPath: string = "personalities.db") {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personalities (
        user_id TEXT PRIMARY KEY,
        personality TEXT NOT NULL
      )
    `);
  }

  setPersonality(userId: string, personality: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO personalities (user_id, personality) VALUES (?, ?)"
    ).run(userId, personality);
  }

  getPersonality(userId: string): string | null {
    const row = this.db.prepare(
      "SELECT personality FROM personalities WHERE user_id = ?"
    ).get(userId) as { personality: string } | null;
    
    return row?.personality ?? null;
  }

  clearPersonality(userId: string): void {
    this.db.prepare("DELETE FROM personalities WHERE user_id = ?").run(userId);
  }

  close(): void {
    this.db.close();
  }
}
