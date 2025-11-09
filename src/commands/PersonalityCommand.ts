import { PersonalityDB } from "../database/PersonalityDB";

export class PersonalityCommand {
  private db: PersonalityDB;

  constructor(db: PersonalityDB) {
    this.db = db;
  }

  async handle(userId: string, personalityText: string): Promise<string> {
    try {
      this.db.setPersonality(userId, personalityText);
      return "Personality updated!";
    } catch (error) {
      console.error("Error setting personality:", error);
      return "Failed to update personality. Please try again.";
    }
  }

  getPersonality(userId: string): string | null {
    return this.db.getPersonality(userId);
  }

  async clear(userId: string): Promise<string> {
    try {
      this.db.clearPersonality(userId);
      return "Personality cleared.";
    } catch (error) {
      console.error("Error clearing personality:", error);
      return "Failed to clear personality. Please try again.";
    }
  }
}
