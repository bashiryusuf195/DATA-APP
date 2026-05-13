export declare const config: {
    readonly env: string;
    readonly port: number;
    readonly appName: string;
    readonly appVersion: string;
    readonly isDev: boolean;
    readonly isProd: boolean;
    readonly supabase: {
        readonly url: string;
        readonly anonKey: string;
        readonly serviceRoleKey: string;
    };
    readonly database: {
        readonly writeUrl: string;
        readonly readUrl: string;
    };
    readonly redis: {
        readonly url: string;
    };
    readonly jwt: {
        readonly secret: string;
    };
    readonly encryption: {
        readonly key: string;
    };
    readonly rateLimit: {
        readonly windowMs: number;
        readonly max: number;
    };
    readonly corsOrigins: string[];
    readonly logLevel: string;
};
