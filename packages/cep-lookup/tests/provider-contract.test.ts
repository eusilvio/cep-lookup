import { apicepProvider, brasilApiProvider, openCepProvider, viaCepProvider } from "../src/providers";
import { Address, Provider } from "../src/types";

function assertAddressShape(address: Address, expectedService: string): void {
  expect(address).toMatchObject({
    cep: expect.any(String),
    state: expect.any(String),
    city: expect.any(String),
    neighborhood: expect.any(String),
    street: expect.any(String),
    service: expectedService,
  });
}

describe("Provider contract", () => {
  it("viaCepProvider should transform success payload", () => {
    const payload = {
      cep: "01001-000",
      uf: "SP",
      localidade: "São Paulo",
      bairro: "Sé",
      logradouro: "Praça da Sé",
      ibge: "3550308",
      ddd: "11",
    };
    const result = viaCepProvider.transform(payload);
    assertAddressShape(result, "ViaCEP");
    expect(result.cep).toBe("01001000");
  });

  it("viaCepProvider should throw not found for erro=true payload", () => {
    expect(() => viaCepProvider.transform({ erro: true })).toThrow("CEP not found");
  });

  it("brasilApiProvider should transform success payload", () => {
    const payload = {
      cep: "01001-000",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Sé",
      street: "Praça da Sé",
    };
    const result = brasilApiProvider.transform(payload);
    assertAddressShape(result, "BrasilAPI");
    expect(result.cep).toBe("01001000");
  });

  it("brasilApiProvider should throw when message/error payload is returned", () => {
    expect(() => brasilApiProvider.transform({ message: "CEP not found" })).toThrow("CEP not found");
    expect(() => brasilApiProvider.transform({ errors: [] })).toThrow();
  });

  it("apicepProvider should transform success payload", () => {
    const payload = {
      status: 200,
      code: "01001-000",
      state: "SP",
      city: "São Paulo",
      district: "Sé",
      address: "Praça da Sé",
    };
    const result = apicepProvider.transform(payload);
    assertAddressShape(result, "ApiCEP");
    expect(result.cep).toBe("01001000");
  });

  it("apicepProvider should throw on non-200 payload", () => {
    expect(() => apicepProvider.transform({ status: 404, message: "CEP not found" })).toThrow("CEP not found");
  });

  it("openCepProvider should transform success payload", () => {
    const payload = {
      cep: "01001-000",
      uf: "SP",
      localidade: "São Paulo",
      bairro: "Sé",
      logradouro: "Praça da Sé",
      ibge: "3550308",
    };
    const result = openCepProvider.transform(payload);
    assertAddressShape(result, "OpenCEP");
    expect(result.cep).toBe("01001000");
  });

  it("openCepProvider should throw not found on error payload", () => {
    expect(() => openCepProvider.transform({ error: true })).toThrow("CEP not found");
  });

  it("providers should expose basic contract fields", () => {
    const providers: Provider[] = [viaCepProvider, brasilApiProvider, apicepProvider, openCepProvider];
    providers.forEach((provider) => {
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.buildUrl("01001000")).toBe("string");
      expect(typeof provider.transform).toBe("function");
    });
  });
});

