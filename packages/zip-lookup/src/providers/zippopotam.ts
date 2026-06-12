import { ZipAddress, ZipProvider } from "../types";

/**
 * Free provider with no API key required.
 * Returns city, state, county, latitude and longitude.
 * Docs: https://www.zippopotam.us/
 */
export const zippopotamProvider: ZipProvider = {
  name: "Zippopotam",
  buildUrl: (zip: string) => `https://api.zippopotam.us/us/${zip}`,
  transform: (response: any): ZipAddress => {
    if (!response || !response.places || response.places.length === 0) {
      throw new Error("ZIP not found");
    }
    const place = response.places[0];
    return {
      zip: response["post code"] || "",
      city: place["place name"] || "",
      state: place["state"] || "",
      stateAbbr: place["state abbreviation"] || "",
      country: response["country"] || "United States",
      latitude: place["latitude"] || undefined,
      longitude: place["longitude"] || undefined,
      service: "Zippopotam",
    };
  },
};

/**
 * Same as zippopotamProvider but requests the extended endpoint with
 * additional place data (multiple cities per ZIP when available).
 */
export const zippopotamPlusProvider: ZipProvider = {
  name: "ZippopotamPlus",
  buildUrl: (zip: string) => `https://api.zippopotam.us/us/${zip}`,
  transform: (response: any): ZipAddress => {
    if (!response || !response.places || response.places.length === 0) {
      throw new Error("ZIP not found");
    }
    // Use the primary (first) place; all places are exposed via the raw response
    const place = response.places[0];
    return {
      zip: response["post code"] || "",
      city: place["place name"] || "",
      state: place["state"] || "",
      stateAbbr: place["state abbreviation"] || "",
      country: response["country"] || "United States",
      latitude: place["latitude"] || undefined,
      longitude: place["longitude"] || undefined,
      service: "ZippopotamPlus",
    };
  },
};
