import { Module } from '@nestjs/common';
import { SubmitService } from './submit.service';
import { SubmissionsController } from './submissions.controller';
import { QuoteModule } from '../quote/quote.module';
import { AntifraudModule } from '../antifraud/antifraud.module';
import { AddonsModule } from '../addons/addons.module';

@Module({
  imports: [QuoteModule, AntifraudModule, AddonsModule],
  providers: [SubmitService],
  controllers: [SubmissionsController],
})
export class SubmissionsModule {}
