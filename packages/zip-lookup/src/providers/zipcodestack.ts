import { ZipAddress, ZipProvider } from "../types";

/**
 * Creates a ZipCodeStack provider.
 * Requires a free API key from https://zipcodestack.com
 * Returns city, state, county, timezone, latitude, longitude.
 */
export function createZipcodestackProvider(apiKey: string): ZipProvider {
  return {
    name: "ZipCodeStack",
    buildUrl: (zip: string) =>
      `https://api.zipcodestack.com/v1/search?codes=${zip}&country=us&apikey=${apiKey}`,
    transform: (response: any): ZipAddress => {
      if (!response || !response.results) {
        throw new Error("ZIP not found");
      }

      const keys = Object.keys(response.results);
      if (keys.length === 0) {
        throw new Error("ZIP not found");
      }

      const places: any[] = response.results[keys[0]];
      if (!places || places.length === 0) {
        throw new Error("ZIP not found");
      }

      const place = places[0];
      return {
        zip: place.postal_code || keys[0],
        city: place.city || "",
        state: place.state || "",
        stateAbbr: place.state_code || "",
        county: place.county || undefined,
        country: "United States",
        latitude: place.latitude != null ? String(place.latitude) : undefined,
        longitude: place.longitude != null ? String(place.longitude) : undefined,
        timezone: place.timezone || undefined,
        service: "ZipCodeStack",
      };
    },
  };
}
