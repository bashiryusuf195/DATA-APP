"use strict";
// src/middleware/auth.ts
//
// Verifies the user's JWT and attaches their profile to req.user.
//
// Flow:
//   1. Extract "Bearer <token>" from the Authorization header
//   2. Send the token to Supabase to verify it's genuine and not expired
//   3. Look up the user's internal row, roles, and permissions in our DB
//   4. Cache the result in Redis (5 min) to avoid hitting the DB on every request
//   5. Attach to req.user for all downstream middleware and controllers
//
// Usage on any route:
//   router.get('/wallet', authenticate, walletController.getBalance);
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.optionalAuth = optionalAuth;
const database_1 = require("../config/database");
const database_2 = require("../config/database");
const redis_1 = require("../config/redis");
const errors_1 = require("../lib/errors");
async function authenticate(req, res, next) {
    try {
        // 1. Parse the Authorization header
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.UnauthorizedError('Missing or malformed Authorization header. Expected: Bearer <token>');
        }
        const token = authHeader.slice(7); // strip "Bearer "
        // 2. Verify with Supabase
        const { data: { user: supabaseUser }, error } = await database_1.supabase.auth.getUser(token);
        if (error || !supabaseUser) {
            throw new errors_1.InvalidTokenError();
        }
        // 3. Check Redis cache before hitting the DB
        const cacheKey = `user_ctx:${supabaseUser.id}`;
        let userContext = await (0, redis_1.cacheGet)(cacheKey);
        if (!userContext) {
            // 4a. Load from DB
            const userRow = await (0, database_2.db)('users')
                .where({ auth_id: supabaseUser.id, status: 'active' })
                .first();
            if (!userRow) {
                throw new errors_1.UnauthorizedError('Account not found or has been suspended.');
            }
            const roles = await (0, database_2.db)('user_roles as ur')
                .join('roles as r', 'r.id', 'ur.role_id')
                .where({ 'ur.user_id': userRow.id })
                .pluck('r.name');
            const permissions = await (0, database_2.db)('role_permissions as rp')
                .join('permissions as p', 'p.id', 'rp.permission_id')
                .join('roles as r', 'r.id', 'rp.role_id')
                .whereIn('r.name', roles)
                .pluck('p.name');
            userContext = {
                id: userRow.id,
                authId: supabaseUser.id,
                email: supabaseUser.email ?? '',
                roles,
                permissions: [...new Set(permissions)],
            };
            // 4b. Cache for 5 minutes
            await (0, redis_1.cacheSet)(cacheKey, userContext, 300);
        }
        // 5. Attach to request
        req.user = userContext;
        next();
    }
    catch (err) {
        next(err);
    }
}
// ── Optional auth ─────────────────────────────────────────────────────────────
// Use on routes that work for both logged-in and anonymous users.
// req.user will be populated if a valid token is present; otherwise undefined.
async function optionalAuth(req, res, next) {
    if (req.headers['authorization']) {
        return authenticate(req, res, next);
    }
    next();
}
//# sourceMappingURL=auth.js.map