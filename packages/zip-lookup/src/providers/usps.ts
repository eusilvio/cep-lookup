import { ZipAddress, ZipProvider, Fetcher } from "../types";

const STATE_ABBR_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  PR: "Puerto Rico", VI: "Virgin Islands", GU: "Guam",
  AS: "American Samoa", MP: "Northern Mariana Islands",
};

function parseXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`));
  return match ? match[1].trim() : undefined;
}

/**
 * Creates a USPS CityStateLookup provider.
 * Requires a free USPS Web Tools API key: https://www.usps.com/business/web-tools-apis/
 *
 * Note: USPS only returns city and state - no lat/lng or county.
 * The provider uses a text/xml fetcher internally so no custom global fetcher is needed.
 */
export function createUspsProvider(apiKey: string): ZipProvider {
  const uspsTextFetcher: Fetcher = async (url: string, signal?: AbortSignal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.text();
  };

  return {
    name: "USPS",
    fetcher: uspsTextFetcher,
    buildUrl: (zip: string) => {
      const xml = `<CityStateLookupRequest USERID="${apiKey}"><ZipCode ID="0"><Zip5>${zip}</Zip5></ZipCode></CityStateLookupRequest>`;
      return `https://secure.shippingapis.com/ShippingAPI.dll?API=CityStateLookup&XML=${encodeURIComponent(xml)}`;
    },
    transform: (xmlText: string): ZipAddress => {
      const errorDescription = parseXmlTag(xmlText, "Description");
      if (xmlText.includes("<Error>") && errorDescription) {
        throw new Error(errorDescription);
      }

      const city = parseXmlTag(xmlText, "City");
      const stateAbbr = parseXmlTag(xmlText, "State");
      const zip5 = parseXmlTag(xmlText, "Zip5");

      if (!city || !stateAbbr || !zip5) {
        throw new Error("ZIP not found");
      }

      return {
        zip: zip5,
        city: city.charAt(0) + city.slice(1).toLowerCase(),
        state: STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr,
        stateAbbr,
        country: "United States",
        service: "USPS",
      };
    },
  };
}
