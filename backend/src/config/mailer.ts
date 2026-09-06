import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

export interface SendMailInput {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | false;
}

let transporterPromise: Promise<Transporter> | null = null;

/**
 * Lazily builds (and caches) a single Nodemailer transporter.
 *
 * If SMTP_USER/SMTP_PASS are not configured and we're not in production,
 * a throwaway Ethereal test account is created on first use so local dev
 * and grading don't require manually signing up for Ethereal first.
 * In production, missing credentials are a hard failure.
 */
function getTransporter(): Promise<Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    let user = env.SMTP_USER;
    let pass = env.SMTP_PASS;

    if (!user || !pass) {
      if (env.NODE_ENV === "production") {
        throw new Error(
          "SMTP_USER/SMTP_PASS are required in production - refusing to auto-provision a throwaway Ethereal account."
        );
      }

      console.log("ℹ️  SMTP_USER/SMTP_PASS not set - provisioning a temporary Ethereal test account...");
      const testAccount = await nodemailer.createTestAccount();
      user = testAccount.user;
      pass = testAccount.pass;
      console.log(`✅ Ethereal test account ready: ${user}`);
      console.log("   View sent mail at https://ethereal.email/messages after login with these credentials.");
    }

    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user, pass },
    });
  })();

  return transporterPromise;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: input.from || env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.body,
    html: input.body,
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}
