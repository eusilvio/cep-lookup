/**
 * Official Correios CEP allocation map.
 *
 * Each entry is an inclusive numeric range `[start, end, uf]` of 8-digit CEPs
 * assigned to a federative unit. The table is sorted by `start` so it can be
 * binary-searched. Ranges are stable public knowledge (they change on the order
 * of decades, not years) — which is exactly what makes a zero-network fallback
 * safe to ship inside the library.
 *
 * Interleaved blocks worth knowing about:
 * - AM is split in two blocks with RR allocated in between.
 * - DF and GO interleave twice (Brasília + surrounding GO municipalities).
 * - 78900-000..78999-999 is the legacy RO block (Porto Velho before the
 *   migration to 76800-000..76999-999); kept so legacy data still resolves.
 */
export const cepRanges: ReadonlyArray<readonly [number, number, string]> = [
  [1000000, 19999999, "SP"], // 01000-000..19999-999
  [20000000, 28999999, "RJ"],
  [29000000, 29999999, "ES"],
  [30000000, 39999999, "MG"],
  [40000000, 48999999, "BA"],
  [49000000, 49999999, "SE"],
  [50000000, 56999999, "PE"],
  [57000000, 57999999, "AL"],
  [58000000, 58999999, "PB"],
  [59000000, 59999999, "RN"],
  [60000000, 63999999, "CE"],
  [64000000, 64999999, "PI"],
  [65000000, 65999999, "MA"],
  [66000000, 68899999, "PA"],
  [68900000, 68999999, "AP"],
  [69000000, 69299999, "AM"],
  [69300000, 69399999, "RR"],
  [69400000, 69899999, "AM"],
  [69900000, 69999999, "AC"],
  [70000000, 72799999, "DF"],
  [72800000, 72999999, "GO"],
  [73000000, 73699999, "DF"],
  [73700000, 76799999, "GO"],
  [76800000, 76999999, "RO"],
  [77000000, 77999999, "TO"],
  [78000000, 78899999, "MT"],
  [78900000, 78999999, "RO"], // legacy RO block, see note above
  [79000000, 79999999, "MS"],
  [80000000, 87999999, "PR"],
  [88000000, 89999999, "SC"],
  [90000000, 99999999, "RS"],
];

export type Region = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

export interface StateInfo {
  /** Full state name, e.g. "São Paulo". */
  name: string;
  region: Region;
  capital: string;
  /** Two-digit IBGE code of the federative unit (not the 7-digit city code). */
  ibge: string;
}

export const stateInfoByUf: Record<string, StateInfo> = {
  AC: { name: "Acre", region: "Norte", capital: "Rio Branco", ibge: "12" },
  AL: { name: "Alagoas", region: "Nordeste", capital: "Maceió", ibge: "27" },
  AM: { name: "Amazonas", region: "Norte", capital: "Manaus", ibge: "13" },
  AP: { name: "Amapá", region: "Norte", capital: "Macapá", ibge: "16" },
  BA: { name: "Bahia", region: "Nordeste", capital: "Salvador", ibge: "29" },
  CE: { name: "Ceará", region: "Nordeste", capital: "Fortaleza", ibge: "23" },
  DF: { name: "Distrito Federal", region: "Centro-Oeste", capital: "Brasília", ibge: "53" },
  ES: { name: "Espírito Santo", region: "Sudeste", capital: "Vitória", ibge: "32" },
  GO: { name: "Goiás", region: "Centro-Oeste", capital: "Goiânia", ibge: "52" },
  MA: { name: "Maranhão", region: "Nordeste", capital: "São Luís", ibge: "21" },
  MG: { name: "Minas Gerais", region: "Sudeste", capital: "Belo Horizonte", ibge: "31" },
  MS: { name: "Mato Grosso do Sul", region: "Centro-Oeste", capital: "Campo Grande", ibge: "50" },
  MT: { name: "Mato Grosso", region: "Centro-Oeste", capital: "Cuiabá", ibge: "51" },
  PA: { name: "Pará", region: "Norte", capital: "Belém", ibge: "15" },
  PB: { name: "Paraíba", region: "Nordeste", capital: "João Pessoa", ibge: "25" },
  PE: { name: "Pernambuco", region: "Nordeste", capital: "Recife", ibge: "26" },
  PI: { name: "Piauí", region: "Nordeste", capital: "Teresina", ibge: "22" },
  PR: { name: "Paraná", region: "Sul", capital: "Curitiba", ibge: "41" },
  RJ: { name: "Rio de Janeiro", region: "Sudeste", capital: "Rio de Janeiro", ibge: "33" },
  RN: { name: "Rio Grande do Norte", region: "Nordeste", capital: "Natal", ibge: "24" },
  RO: { name: "Rondônia", region: "Norte", capital: "Porto Velho", ibge: "11" },
  RR: { name: "Roraima", region: "Norte", capital: "Boa Vista", ibge: "14" },
  RS: { name: "Rio Grande do Sul", region: "Sul", capital: "Porto Alegre", ibge: "43" },
  SC: { name: "Santa Catarina", region: "Sul", capital: "Florianópolis", ibge: "42" },
  SE: { name: "Sergipe", region: "Nordeste", capital: "Aracaju", ibge: "28" },
  SP: { name: "São Paulo", region: "Sudeste", capital: "São Paulo", ibge: "35" },
  TO: { name: "Tocantins", region: "Norte", capital: "Palmas", ibge: "17" },
};
