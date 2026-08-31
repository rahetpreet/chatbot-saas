import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { CustomSmtpConfig } from "@/types";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  resetLink?: string;
}

export interface EmailProvider {
  sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; devUrl?: string }>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; devUrl?: string }> {
    const textContent = options.text || options.html.replace(/<[^>]*>?/gm, "");
    
    console.log("==================== [ZERO-COST EMAIL (DEV MODE)] ====================");
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    if (options.resetLink) {
      console.log(`🔗 PASSWORD RESET LINK: ${options.resetLink}`);
    }
    console.log(`Content:\n${textContent}`);
    console.log("======================================================================");

    // Save to dev email table so developer / tester can inspect in UI at /dev/email-inbox
    try {
      const devEmail = await prisma.devEmail.create({
        data: {
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: textContent,
          resetLink: options.resetLink || null,
        },
      });
      return { success: true, messageId: devEmail.id, devUrl: options.resetLink };
    } catch (err) {
      console.warn("Could not record dev email to DB (Prisma may not be initialized yet):", err);
      return { success: true, devUrl: options.resetLink };
    }
  }
}

export class SMTPProvider implements EmailProvider {
  private config: CustomSmtpConfig;

  constructor(config: CustomSmtpConfig) {
    this.config = config;
  }

  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string }> {
    try {
      const transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.user,
          pass: this.config.pass,
        },
      });

      const info = await transporter.sendMail({
        from: this.config.from || this.config.user,
        to: options.to,
        subject: options.subject,
        text: options.text || options.html.replace(/<[^>]*>?/gm, ""),
        html: options.html,
      });

      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error("SMTP Email delivery failed:", error);
      throw new Error(`SMTP Error: ${error.message || "Failed to send email"}`);
    }
  }
}

export function getEmailProvider(customSmtpConfig?: CustomSmtpConfig | null): EmailProvider {
  // If custom SMTP config is provided and configured with host, use SMTP
  if (customSmtpConfig && customSmtpConfig.host && customSmtpConfig.user) {
    return new SMTPProvider(customSmtpConfig);
  }

  // Check system env SMTP
  if (process.env.EMAIL_PROVIDER === "smtp" && process.env.SMTP_HOST && process.env.SMTP_USER) {
    return new SMTPProvider({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || "",
      secure: process.env.SMTP_PORT === "465",
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    });
  }

  // Default ₹0 Free-First Console provider
  return new ConsoleEmailProvider();
}

export async function sendAppEmail(options: EmailOptions, customSmtpConfig?: CustomSmtpConfig | null) {
  try {
    const provider = getEmailProvider(customSmtpConfig);
    return await provider.sendEmail(options);
  } catch (error) {
    console.warn("SMTP email delivery failed, using fallback console recorder:", error);
    const fallback = new ConsoleEmailProvider();
    return await fallback.sendEmail(options);
  }
}
