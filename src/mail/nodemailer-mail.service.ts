import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailMessage, MailService } from './mail.service';

@Injectable()
export class NodemailerMailService extends MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    super();
    const user = config.get<string>('SMTP_USER', '');
    const password = config.get<string>('SMTP_PASSWORD', '');
    this.from = config.get<string>('SMTP_FROM', 'digest@example.com');
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST', 'localhost'),
      port: config.get<number>('SMTP_PORT', 1025),
      secure: config.get<boolean>('SMTP_SECURE', false),
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
