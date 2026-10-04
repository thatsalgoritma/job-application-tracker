import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { ApplicationTransferService } from './application-transfer.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationTransferService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
