import type { AuthTokenPayload } from "../modules/auth/token.service.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export {};
