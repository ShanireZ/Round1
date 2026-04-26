import nodemailer from 'nodemailer';
import { env } from '../../../config/env.js';
import { logger } from '../../logger.js';

export interface SendMailOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(opts: SendMailOpts): Promise<void> {
  const { to, subject, html, text } = opts;

  switch (env.MAIL_PROVIDER) {
    case 'resend': {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Resend API error ${res.status}: ${body}`);
      }
      break;
    }
    case 'postmark': {
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
        },
        body: JSON.stringify({
          From: env.MAIL_FROM,
          To: to,
          Subject: subject,
          HtmlBody: html,
          TextBody: text,
          MessageStream: 'outbound',
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Postmark API error ${res.status}: ${body}`);
      }
      break;
    }
    case 'tencent-ses': {
      const transport = nodemailer.createTransport({
        host: 'smtp.qcloudmail.com',
        port: 465,
        secure: true,
        auth: { user: env.TENCENT_SES_SECRET_ID, pass: env.TENCENT_SES_SECRET_KEY },
      });
      await transport.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
      break;
    }
    default: {
      const _exhaustive: never = env.MAIL_PROVIDER;
      throw new Error(`Unknown mail provider: ${_exhaustive}`);
    }
  }

  logger.info({ to, subject }, 'Email sent');

  if (env.NODE_ENV === 'development') {
    logger.debug({ to, subject, html, text }, 'Email content (dev)');
  }
}
