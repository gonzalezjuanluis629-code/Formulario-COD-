import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { GEOCODING_PROVIDER } from '../../infra/providers/geocoding/geocoding.provider';
import { GoogleGeocodingProvider } from '../../infra/providers/geocoding/google.provider';

@Module({
  providers: [
    LocationService,
    // Cambiar de Google a Mapbox = cambiar ESTA línea. Nada más.
    { provide: GEOCODING_PROVIDER, useClass: GoogleGeocodingProvider },
  ],
  controllers: [LocationController],
  exports: [LocationService],
})
export class LocationModule {}
