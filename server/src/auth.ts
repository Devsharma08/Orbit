import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export interface AuthenticatedRequest extends Request {
  user?: { id: number; username: string; name: string };
}

export function createToken(user: {
  id: number;
  username: string;
  name: string;
}): string {
  return jwt.sign(user, config.JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "Please sign in to continue."));
    return;
  }
  try {
    req.user = jwt.verify(header.slice(7), config.JWT_SECRET) as {
      id: number;
      username: string;
      name: string;
    };
    next();
  } catch {
    next(new HttpError(401, "Your session has expired. Please sign in again."));
  }
}
