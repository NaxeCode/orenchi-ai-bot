type VoiceTask = () => Promise<void>;

export class VoicePlaybackQueue {
  private queues = new Map<string, Promise<void>>();

  enqueue(guildId: string, task: VoiceTask): Promise<void> {
    const previous = this.queues.get(guildId) ?? Promise.resolve();

    const next = previous
      .catch((error) => {
        console.error(`Error in previous voice task for guild ${guildId}:`, error);
      })
      .then(() => task())
      .catch((error) => {
        console.error(`Error executing voice task for guild ${guildId}:`, error);
      });

    this.queues.set(
      guildId,
      next.finally(() => {
        if (this.queues.get(guildId) === next) {
          this.queues.delete(guildId);
        }
      })
    );

    return next;
  }
}
