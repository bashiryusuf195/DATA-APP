type QueueJobHandler = (
  payload: unknown
) => Promise<void>;

class QueueService {
  private handlers = new Map<
    string,
    QueueJobHandler
  >();

  register(
    jobName: string,
    handler: QueueJobHandler
  ) {
    this.handlers.set(jobName, handler);
  }

  async dispatch(
    jobName: string,
    payload: unknown
  ) {
    const handler =
      this.handlers.get(jobName);

    if (!handler) {
      throw new Error(
        `Queue handler '${jobName}' not found`
      );
    }

    setTimeout(async () => {
      try {
        await handler(payload);
      } catch (err) {
        console.error(
          `[QUEUE ERROR] ${jobName}`,
          err
        );
      }
    }, 0);
  }
}

export const queueService =
  new QueueService();