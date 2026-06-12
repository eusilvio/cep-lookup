import { zippopotamProvider, zippopotamPlusProvider } from "../src/providers/zippopotam";
import { createZipcodestackProvider } from "../src/providers/zipcodestack";
import { createUspsProvider } from "../src/providers/usps";

describe("zippopotamProvider", () => {
  it("builds the correct URL", () => {
    expect(zippopotamProvider.buildUrl("10001")).toBe("https://api.zippopotam.us/us/10001");
  });

  it("transforms a valid response", () => {
    const response = {
      "post code": "10001",
      country: "United States",
      "country abbreviation": "US",
      places: [{
        "place name": "New York City",
        state: "New York",
        "state abbreviation": "NY",
        latitude: "40.7484",
        longitude: "-73.9967",
      }],
    };
    const address = zippopotamProvider.transform(response);
    expect(address.zip).toBe("10001");
    expect(address.city).toBe("New York City");
    expect(address.state).toBe("New York");
    expect(address.stateAbbr).toBe("NY");
    expect(address.latitude).toBe("40.7484");
    expect(address.service).toBe("Zippopotam");
  });

  it("throws when places is empty", () => {
    expect(() => zippopotamProvider.transform({ places: [] })).toThrow("ZIP not found");
    expect(() => zippopotamProvider.transform(null)).toThrow("ZIP not found");
  });
});

describe("zippopotamPlusProvider", () => {
  it("has a different service name", () => {
    const response = {
      "post code": "90210",
      country: "United States",
      places: [{ "place name": "Beverly Hills", state: "California", "state abbreviation": "CA" }],
    };
    const address = zippopotamPlusProvider.transform(response);
    expect(address.service).toBe("ZippopotamPlus");
  });
});

describe("createZipcodestackProvider", () => {
  const provider = createZipcodestackProvider("test-api-key");

  it("builds the correct URL with API key", () => {
    const url = provider.buildUrl("10001");
    expect(url).toContain("10001");
    expect(url).toContain("test-api-key");
    expect(url).toContain("zipcodestack.com");
  });

  it("transforms a valid response", () => {
    const response = {
      results: {
        "10001": [{
          postal_code: "10001",
          city: "New York City",
          state: "New York",
          state_code: "NY",
          county: "New York County",
          latitude: "40.7484",
          longitude: "-73.9967",
          timezone: "America/New_York",
        }],
      },
    };
    const address = provider.transform(response);
    expect(address.zip).toBe("10001");
    expect(address.county).toBe("New York County");
    expect(address.timezone).toBe("America/New_York");
    expect(address.service).toBe("ZipCodeStack");
  });

  it("throws when results are empty", () => {
    expect(() => provider.transform({ results: {} })).toThrow("ZIP not found");
    expect(() => provider.transform(null)).toThrow("ZIP not found");
  });
});

describe("createUspsProvider", () => {
  const provider = createUspsProvider("test-api-key");

  it("builds the correct URL with API key and XML payload", () => {
    const url = provider.buildUrl("10001");
    expect(url).toContain("ShippingAPI.dll");
    expect(url).toContain("CityStateLookup");
    expect(url).toContain("test-api-key");
    expect(url).toContain("10001");
  });

  it("has a custom fetcher (for XML)", () => {
    expect(provider.fetcher).toBeDefined();
  });

  it("transforms a valid XML response", () => {
    const xml = `<CityStateLookupResponse><ZipCode ID="0"><Zip5>10001</Zip5><City>NEW YORK</City><State>NY</State></ZipCode></CityStateLookupResponse>`;
    const address = provider.transform(xml);
    expect(address.zip).toBe("10001");
    expect(address.city).toBe("New york");
    expect(address.stateAbbr).toBe("NY");
    expect(address.state).toBe("New York");
    expect(address.service).toBe("USPS");
  });

  it("throws on USPS error XML", () => {
    const xml = `<CityStateLookupResponse><ZipCode ID="0"><Error><Number>-2147219399</Number><Source>clsZipLookup;clsZipLookup.CityStateLookup</Source><Description>Invalid Zip Code.</Description><HelpFile></HelpFile><HelpContext>1000440</HelpContext></Error></ZipCode></CityStateLookupResponse>`;
    expect(() => provider.transform(xml)).toThrow("Invalid Zip Code.");
  });
});
