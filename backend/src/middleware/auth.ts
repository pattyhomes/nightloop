import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "../lib/config";
import { ApiError } from "../lib/apiError";
import { isUUID } from "../lib/validateUUID";

export type AuthContext = {
  authUserId: string;
  claims: JWTPayload;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function readBearerToken(req: Request): string {
  const header = req.header("authorization");
  if (!header) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authorization bearer token is required.");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authorization bearer token is required.");
  }

  return match[1];
}

export function createAuthMiddleware(config: AppConfig) {
  const jwks = createRemoteJWKSet(new URL(config.supabaseJwksUrl));

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = readBearerToken(req);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.supabaseJwtIssuer,
        audience: config.supabaseJwtAudience,
        algorithms: ["ES256"]
      });

      if (typeof payload.sub !== "string" || !isUUID(payload.sub)) {
        throw new ApiError(401, "AUTH_INVALID", "Token subject is invalid.");
      }

      req.auth = {
        authUserId: payload.sub,
        claims: payload
      };
      next();
    } catch (error) {
      if (error instanceof ApiError) {
        next(error);
        return;
      }

      next(new ApiError(401, "AUTH_INVALID", "Authorization token is invalid or expired."));
    }
  };
}
