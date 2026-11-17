import { Module } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { QuoteController } from './quote.controller';
import { DiscountsModule } from '../discounts/discounts.module';
import { AddonsModule } from '../addons/addons.module';
import { PageOffersModule } from '../page-offers/page-offers.module';

@Module({ imports: [DiscountsModule, AddonsModule, PageOffersModule], providers: [QuoteService], controllers: [QuoteController], exports: [QuoteService] })
export class QuoteModule {}
