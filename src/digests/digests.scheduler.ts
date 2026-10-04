import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DigestsService } from './digests.service';

@Injectable()
export class DigestsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DigestsScheduler.name);
  private readonly jobName = 'weekly-email-digest';

  constructor(
    private readonly config: ConfigService,
    private readonly registry: SchedulerRegistry,
    private readonly digestsService: DigestsService,
  ) {}

  onModuleInit(): void {
    const expression = this.config.get<string>('DIGEST_CRON', '0 9 * * 1');
    const job = new CronJob(
      expression,
      () => {
        void this.digestsService.sendWeeklyDigests().catch((error: unknown) => {
          this.logger.error('Weekly digest run failed', error);
        });
      },
      null,
      false,
      'UTC',
    );
    this.registry.addCronJob(this.jobName, job);
    job.start();
    this.logger.log(`Weekly digest scheduled with cron: ${expression} (UTC)`);
  }

  onModuleDestroy(): void {
    const job = this.registry.getCronJob(this.jobName);
    job.stop();
  }
}
