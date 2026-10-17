import { describe, expect, it } from 'vitest';
import { insideSudan, matchPlace, type PlaceQuery } from './map-check';

const khartoum: PlaceQuery = {
  stateName: 'الخرطوم',
  stateEn: 'Khartoum',
  city: 'الخرطوم',
  cityEn: 'Khartoum',
  addressLine: 'شارع النيل',
};

describe('map place check', () => {
  it('keeps a pin inside Sudan when the label names the city', () => {
    const pin = matchPlace(
      [{ lat: '15.500654', lon: '32.559899', display_name: 'Khartoum, Sudan' }],
      khartoum,
    );
    expect(pin).toEqual({ latitude: '15.500654', longitude: '32.559899', label: 'Khartoum, Sudan' });
    expect(insideSudan(15.5, 32.5)).toBe(true);
  });

  it('matches an Arabic map label when the form used the English city name', () => {
    const pin = matchPlace(
      [{ lat: '15.607806', lon: '32.514588', display_name: 'شارع النيل, الخرطوم, ولاية الخرطوم, السودان' }],
      { ...khartoum, city: 'Khartoum', cityEn: 'Khartoum', stateName: 'Khartoum', stateEn: 'Khartoum' },
    );
    expect(pin?.label).toContain('الخرطوم');
  });

  it('rejects a pin outside Sudan and a Sudan pin for another city', () => {
    expect(matchPlace([{ lat: '30.0444', lon: '31.2357', display_name: 'Cairo, Egypt' }], khartoum)).toBeNull();
    expect(
      matchPlace([{ lat: '12.05', lon: '24.88', display_name: 'Nyala, South Darfur, Sudan' }], khartoum),
    ).toBeNull();
    expect(insideSudan(30, 31)).toBe(false);
  });
});
