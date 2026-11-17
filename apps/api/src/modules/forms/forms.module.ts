import { Module } from '@nestjs/common';
import { PageOffersModule } from '../page-offers/page-offers.module';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';

@Module({ imports: [PageOffersModule], providers: [FormsService], controllers: [FormsController], exports: [FormsService] })
export class FormsModule {}
