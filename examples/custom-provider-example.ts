
import axios from "axios";
import { CepLookup, Address, Provider } from "@eusilvio/cep-lookup";

// 1. Define your custom provider
// It must implement the `Provider` interface
const myCustomProvider: Provider = {
  name: "MyCustomAPI",
  buildUrl: (cep: string) => `https://myapi.com/cep/${cep}`,
  transform: (response: any): Address => {
    // Here you would transform the response from your custom API to the `Address` format
    // For this example, we'll just return a mock address
    return {
      cep: response.postal_code,
      state: response.data.state_short,
      city: response.data.city_name,
      neighborhood: response.data.neighborhood,
      street: response.data.street_name,
      service: "MyCustomAPI",
    };
  },
};

// 2. Define your fetcher function
const myFetcher = async (url: string) => {
  console.log(`Fetching ${url}...`);

  // For this example, we'll mock the response from our custom API
  if (url.includes("myapi.com")) {
    return {
      postal_code: "12345-678",
      data: {
        state_short: "SP",
        city_name: "São Paulo",
        neighborhood: "Vila Madalena",
        street_name: "Rua dos Pinheiros",
      },
    };
  }

  const response = await axios.get(url);
  return response.data;
};

// 3. Create an instance of CepLookup with your custom provider
const cepLookup = new CepLookup({
  providers: [myCustomProvider],
  fetcher: myFetcher,
});

// 4. Use the instance to look up a CEP
async function run() {
  const cep = "12345-678";

  try {
    const address = await cepLookup.lookup(cep);
    console.log("Address found:", address);
  } catch (error) {
    console.error("Failed to fetch CEP:", (error as Error).message);
  }
}

run();
