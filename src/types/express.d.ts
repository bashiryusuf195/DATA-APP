import "express";

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      requestId?: string;
      sessionId?: string;
      deviceFingerprint?: string;

      rawBody?: Buffer;
      user?: {
  sub?: string;
  id: string;
  authId?: string;
  auth_id?: string;
  email: string;
  status?: string;
  session?: string;
  roles: string[];
  permissions: string[];
};
    }
  }
}

export {};