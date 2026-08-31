export interface PhoneProfile {
  prefix: string;
  areaCodes: string[];
  normalize(raw: string): string | null; // → E.164 o null
  format(e164: string): string;
}

export interface NormalizedAddress {
  formatted: string | null;
  street: string | null;
  number: string | null;
  district: string | null; // sector / barrio
  city: string | null;     // municipio
  province: string | null;
  provinceCode: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface ShopifyAddress {
  address1: string;
  address2: string | null;
  city: string;
  provinceCode: string | null;
  countryCode: string;
  zip: string | null;
}

export interface CountryProfile {
  code: string;
  currency: string;
  postalCodeRequired: boolean;
  provinces: { code: string; name: string }[];
  matchProvince(input: string | null | undefined): string | null;
  phone: PhoneProfile;
  toShopifyAddress(a: NormalizedAddress): ShopifyAddress;
}
