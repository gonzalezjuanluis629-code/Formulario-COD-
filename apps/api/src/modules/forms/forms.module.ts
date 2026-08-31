import { Module } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';

@Module({ providers: [FormsService], controllers: [FormsController], exports: [FormsService] })
export class FormsModule {}
