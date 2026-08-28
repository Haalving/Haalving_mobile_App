import type { Audience } from '../utils/tokens.js';

/**
 * What `authenticate` puts on the request. Everything downstream — the authorize
 * middleware, every controller, the audit writer — reads the caller from here and
 * never from a header or a body field.
 */
declare global {
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      role: string;
      audience: Audience;
      /** The client record this login owns. Present only for the client app. */
      clientId?: string;
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
