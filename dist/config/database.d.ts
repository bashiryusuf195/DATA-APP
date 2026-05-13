import knex from 'knex';
export declare const supabase: import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
export declare const db: knex.Knex<any, unknown[]>;
export declare const dbRead: knex.Knex<any, unknown[]>;
export declare function checkDatabaseHealth(): Promise<boolean>;
