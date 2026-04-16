import { useState, useEffect } from 'react';
import { GeoCoords } from '../services/caseMapper';

export function useGeolocation(): GeoCoords & { isAvailable: boolean } {
  const [coords, setCoords] = useState<GeoCoords>({ latitude: '0.0', longitude: '0.0' });
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: String(pos.coords.latitude),
          longitude: String(pos.coords.longitude),
        });
        setIsAvailable(true);
      },
      () => {
        // Permission denied or unavailable — keep "0.0"/"0.0" fallback
        setIsAvailable(false);
      },
      { timeout: 10_000, maximumAge: 60_000 }
    );
  }, []);

  return { ...coords, isAvailable };
}
