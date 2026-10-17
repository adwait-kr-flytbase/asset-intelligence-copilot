import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { type Actor, ApplicationError } from './repository.js';

/** Deliberate challenge demo impersonation, not production authentication. */
export function createDemoSession(secret: string, namespace: string) {
  if (secret.length < 32) throw new Error('APP_SESSION_SECRET must have at least 32 characters.');
  const sign = (payload: string) =>
    createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    actor(context: Context): Actor | null {
      const cookie = getCookie(context, 'asset_demo_session');
      if (!cookie) return null;
      const [payload, signature, ...extra] = cookie.split('.');
      if (!payload || !signature || extra.length) return null;
      const expected = Buffer.from(sign(payload));
      const received = Buffer.from(signature);
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
      try {
        const value = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
          namespace?: string;
          ownerId?: string;
          expires?: number;
        };
        return value.namespace === namespace &&
          typeof value.ownerId === 'string' &&
          Number(value.expires) > Date.now()
          ? { namespace, ownerId: value.ownerId }
          : null;
      } catch {
        return null;
      }
    },
    require(context: Context): Actor {
      const actor = this.actor(context);
      if (!actor)
        throw new ApplicationError(401, 'PERSONA_REQUIRED', 'Select a demo persona first.');
      return actor;
    },
    select(context: Context, ownerId: string) {
      const maxAge = 60 * 60 * 24 * 7;
      const payload = Buffer.from(
        JSON.stringify({ namespace, ownerId, expires: Date.now() + maxAge * 1000 }),
      ).toString('base64url');
      setCookie(context, 'asset_demo_session', `${payload}.${sign(payload)}`, {
        httpOnly: true,
        sameSite: 'Strict',
        secure: new URL(context.req.url).protocol === 'https:',
        path: '/',
        maxAge,
      });
    },
  };
}
