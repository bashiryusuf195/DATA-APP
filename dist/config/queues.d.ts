import { Queue } from 'bullmq';
export declare const transactionQueue: Queue<any, any, string, any, any, string>;
export declare const webhookQueue: Queue<any, any, string, any, any, string>;
export declare const notificationQueue: Queue<any, any, string, any, any, string>;
export declare const reconciliationQueue: Queue<any, any, string, any, any, string>;
export declare const riskEventQueue: Queue<any, any, string, any, any, string>;
export declare const providerHealthQueue: Queue<any, any, string, any, any, string>;
export declare const dlqTransactions: Queue<any, any, string, any, any, string>;
export declare const dlqWebhooks: Queue<any, any, string, any, any, string>;
export declare const dlqNotifications: Queue<any, any, string, any, any, string>;
export declare const defaultJobOptions: {
    readonly attempts: 4;
    readonly backoff: {
        readonly type: "exponential";
        readonly delay: 2000;
    };
    readonly removeOnComplete: {
        readonly count: 1000;
    };
    readonly removeOnFail: false;
};
export declare function enqueue(queue: Queue, name: string, data: Record<string, unknown>, options?: Partial<typeof defaultJobOptions>): Promise<import("bullmq").Job<any, any, string>>;
