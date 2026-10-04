import { Module } from '@nestjs/common';
import { NodemailerMailService } from './nodemailer-mail.service';
import { MailService } from './mail.service';

@Module({
  providers: [{ provide: MailService, useClass: NodemailerMailService }],
  exports: [MailService],
})
export class MailModule {}
