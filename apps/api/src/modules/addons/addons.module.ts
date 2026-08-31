import { Module } from '@nestjs/common';
import { AddonsService } from './addons.service';

@Module({ providers: [AddonsService], exports: [AddonsService] })
export class AddonsModule {}
