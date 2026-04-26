import { env } from '../../../config/env.js';
import { logger } from '../../logger.js';

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  if (!env.AUTH_TURNSTILE_SECRET_KEY) {
    return true;
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: env.AUTH_TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });

    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };

    if (!data.success) {
      logger.warn({ errorCodes: data['error-codes'], ip }, 'Turnstile verification failed');
      return false;
    }

    return true;
  } catch (err) {
    logger.warn({ err, ip }, 'Turnstile verification request error');
    return false;
  }
}
