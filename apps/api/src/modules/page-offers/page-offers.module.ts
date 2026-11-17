import { Module } from '@nestjs/common';
import { PageOffersService } from './page-offers.service';

@Module({ providers: [PageOffersService], exports: [PageOffersService] })
export class PageOffersModule {}
