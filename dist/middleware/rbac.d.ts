import { Request, Response, NextFunction } from 'express';
export declare function requirePermission(permission: string): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireAnyPermission(permissions: string[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireAdmin(req: Request, _res: Response, next: NextFunction): void;
