import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { DigestsController } from './digests.controller';
import { DigestsScheduler } from './digests.scheduler';
import { DigestsService } from './digests.service';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [DigestsController],
  providers: [DigestsService, DigestsScheduler],
})
export class DigestsModule {}
