/**
 * Brazilian address text normalization.
 *
 * The same logradouro reaches a form in dozens of spellings - "Av. Brig. Faria
 * Lima", "AVENIDA BRIGADEIRO FARIA LIMA", "av brigadeiro faria lima". These
 * helpers fold them into one canonical word list, so a comparison measures real
 * differences instead of typing habits.
 */

/** Canonical word and the abbreviations that stand for it (folded, without dots). */
const ABBREVIATIONS: ReadonlyArray<readonly [string, readonly string[]]> = [
  // Street types
  ["avenida", ["av", "ave", "aven", "avn"]],
  ["rua", ["r"]],
  ["alameda", ["al", "alam"]],
  ["praca", ["pc", "pca", "prc"]],
  ["travessa", ["tv", "trav", "trv"]],
  ["rodovia", ["rod"]],
  ["estrada", ["est", "estr"]],
  ["largo", ["lg", "lgo"]],
  ["vila", ["vl"]],
  ["beco", ["bc", "bco"]],
  ["ladeira", ["ld", "lad"]],
  ["viaduto", ["vd", "viad"]],
  ["parque", ["pq", "pque", "prq"]],
  ["jardim", ["jd", "jdm", "jard"]],
  ["residencial", ["res", "resid"]],
  ["condominio", ["cond"]],
  ["conjunto", ["cj", "conj"]],
  ["quadra", ["qd", "qda"]],
  ["loteamento", ["lot", "loteam"]],
  ["chacara", ["ch", "chac"]],
  ["cidade", ["cid"]],
  // Titles
  ["doutor", ["dr"]],
  ["doutora", ["dra"]],
  ["professor", ["prof"]],
  ["professora", ["profa"]],
  ["engenheiro", ["eng", "engo"]],
  ["general", ["gen", "gal"]],
  ["coronel", ["cel"]],
  ["capitao", ["cap", "cpt"]],
  ["tenente", ["ten", "tte"]],
  ["sargento", ["sgt", "sarg"]],
  ["major", ["maj"]],
  ["marechal", ["mal"]],
  ["brigadeiro", ["brig"]],
  ["almirante", ["alm"]],
  ["comendador", ["com", "comend"]],
  ["desembargador", ["des", "desemb"]],
  ["deputado", ["dep"]],
  ["senador", ["sen"]],
  ["vereador", ["ver"]],
  ["governador", ["gov"]],
  ["presidente", ["pres", "pdte"]],
  ["ministro", ["min"]],
  ["padre", ["pe"]],
  ["frei", ["fr"]],
  ["monsenhor", ["mons"]],
  ["conselheiro", ["cons"]],
  ["comandante", ["cmt", "cmte"]],
  ["visconde", ["visc"]],
  ["dom", ["d"]],
  ["dona", ["dna"]],
  ["senhor", ["sr"]],
  ["senhora", ["sra"]],
  ["santo", ["sto"]],
  ["santa", ["sta"]],
  ["sao", ["s"]],
  ["junior", ["jr"]],
];

const EXPANSIONS = new Map<string, string>(
  ABBREVIATIONS.flatMap(([word, abbreviations]) => abbreviations.map((abbreviation) => [abbreviation, word] as const))
);

/** Street types recognized as the leading word of a logradouro (DNE "tipos de logradouro"). */
export const STREET_TYPES: ReadonlySet<string> = new Set([
  "rua", "avenida", "alameda", "praca", "travessa", "rodovia", "estrada", "largo", "vila", "viela",
  "beco", "ladeira", "viaduto", "ponte", "passarela", "parque", "jardim", "residencial", "condominio",
  "conjunto", "quadra", "loteamento", "setor", "escadaria", "caminho", "chacara", "sitio", "fazenda",
  "nucleo", "boulevard", "rotatoria", "via", "acesso", "marginal", "passagem", "servidao", "trevo",
  "vereda", "galeria", "patio", "esplanada", "contorno", "corredor", "ramal", "subida", "tunel",
  "trecho", "recanto", "morro", "colonia", "distrito", "vale", "campo", "lagoa",
]);

/** Titles people routinely drop when typing a street name ("Faria Lima" for "Brigadeiro Faria Lima"). */
export const HONORIFICS: ReadonlySet<string> = new Set([
  "doutor", "doutora", "professor", "professora", "engenheiro", "general", "coronel", "capitao",
  "tenente", "sargento", "major", "marechal", "brigadeiro", "almirante", "comendador", "desembargador",
  "deputado", "senador", "vereador", "governador", "presidente", "prefeito", "ministro", "padre",
  "frei", "monsenhor", "bispo", "cardeal", "conselheiro", "comandante", "visconde", "barao", "conde",
  "marques", "duque", "dom", "dona", "madre", "irma", "pastor", "maestro", "cabo", "soldado",
]);

const STOPWORDS: ReadonlySet<string> = new Set(["de", "da", "do", "das", "dos"]);

const OUR_LADY_TAIL: ReadonlySet<string> = new Set(["s", "sr", "sra", "senhora"]);

const NUMBER_WORDS = new Map<string, number>([
  ["zero", 0], ["um", 1], ["uma", 1], ["dois", 2], ["duas", 2], ["tres", 3], ["quatro", 4],
  ["cinco", 5], ["seis", 6], ["sete", 7], ["oito", 8], ["nove", 9], ["dez", 10], ["onze", 11],
  ["doze", 12], ["treze", 13], ["quatorze", 14], ["catorze", 14], ["quinze", 15], ["dezesseis", 16],
  ["dezasseis", 16], ["dezessete", 17], ["dezassete", 17], ["dezoito", 18], ["dezenove", 19],
  ["dezanove", 19], ["primeiro", 1], ["primeira", 1], ["segundo", 2], ["segunda", 2],
  ["terceiro", 3], ["terceira", 3], ["quarto", 4], ["quarta", 4], ["quinto", 5], ["quinta", 5],
  ["sexto", 6], ["sexta", 6], ["setimo", 7], ["setima", 7], ["oitavo", 8], ["oitava", 8],
  ["nono", 9], ["nona", 9], ["decimo", 10], ["decima", 10],
]);

const TENS = new Map<string, number>([
  ["vinte", 20], ["trinta", 30], ["quarenta", 40], ["cinquenta", 50],
  ["sessenta", 60], ["setenta", 70], ["oitenta", 80], ["noventa", 90],
]);

/** Roman numerals from II to XXXIX - "XV de Novembro", "Pio XII". Single letters stay letters. */
const ROMAN_NUMERAL = /^(x{0,3})(ix|iv|v?i{0,3})$/;

/**
 * @function foldText
 * @description Lowercases, strips accents, drops ordinal indicators and apostrophes
 * ("1º" → "1", "Sant'Ana" → "santana") and turns any other punctuation into a space.
 */
export function foldText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[ºª°]/g, "")
    .replace(/['’‘`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Longest text compared per field. Far above any Correios street name, and a hard
 * ceiling on the cost of hostile input: similarity is quadratic in length.
 */
export const MAX_FIELD_LENGTH = 200;

function words(value: string): string[] {
  const folded = foldText(String(value ?? "").slice(0, MAX_FIELD_LENGTH).replace(/\([^)]*\)/g, " "));
  return folded ? folded.split(" ") : [];
}

function expandAbbreviations(tokens: string[]): string[] {
  const expanded: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    // "N. Sra.", "N. S.", "Nsa. Sra." → nossa senhora
    if ((token === "n" || token === "ns" || token === "nsa") && next !== undefined && OUR_LADY_TAIL.has(next)) {
      expanded.push("nossa", "senhora");
      i++;
    } else if (token === "ns" || token === "nsra") {
      expanded.push("nossa", "senhora");
    } else if (token === "nsa") {
      expanded.push("nossa");
    } else {
      expanded.push(EXPANSIONS.get(token) ?? token);
    }
  }
  return expanded;
}

function romanValue(token: string): number | undefined {
  const match = token.length > 1 ? ROMAN_NUMERAL.exec(token) : null;
  if (!match) return undefined;
  const [, tens, units] = match;
  let value = tens.length * 10;
  if (units === "ix") value += 9;
  else if (units === "iv") value += 4;
  else value += (units.startsWith("v") ? 5 : 0) + units.replace("v", "").length;
  return value;
}

function toDigits(tokens: string[]): string[] {
  const converted: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const tens = TENS.get(token);
    if (tens !== undefined) {
      const unitWord = tokens[i + 1] === "e" ? tokens[i + 2] : undefined;
      const unit = unitWord === undefined ? undefined : NUMBER_WORDS.get(unitWord);
      if (unit !== undefined && unit > 0 && unit < 10) {
        converted.push(String(tens + unit));
        i += 2;
      } else {
        converted.push(String(tens));
      }
      continue;
    }
    const value = NUMBER_WORDS.get(token) ?? romanValue(token) ?? (/^\d+$/.test(token) ? Number(token) : undefined);
    converted.push(value === undefined ? token : String(value));
  }
  return converted;
}

/**
 * @function tokenizeAddressText
 * @description Canonical word list of an address fragment: folded, parenthesized
 * notes removed, abbreviations expanded, numbers written as digits and the
 * connectives de/da/do/das/dos dropped.
 */
export function tokenizeAddressText(value: string): string[] {
  return toDigits(expandAbbreviations(words(value))).filter((token) => !STOPWORDS.has(token));
}

/**
 * @function normalizeAddressText
 * @description Canonical form of any address fragment - a stable key for deduplication
 * and search indexes.
 * @example
 * normalizeAddressText("Av. Brig. Faria Lima");     // "avenida brigadeiro faria lima"
 * normalizeAddressText("R. XV de Novembro");        // "rua 15 novembro"
 * normalizeAddressText("Rua Quinze de Novembro");   // "rua 15 novembro"
 */
export function normalizeAddressText(value: string): string {
  return tokenizeAddressText(value).join(" ");
}

/**
 * @function streetSearchPhrase
 * @description Street name for a reverse search: abbreviations expanded, the street type
 * dropped, everything else as typed. ViaCEP matches literal words, so "Dr Arnaldo" finds
 * nothing while "doutor arnaldo" does.
 */
export function streetSearchPhrase(street: string): string {
  const tokens = expandAbbreviations(words(street));
  const name = tokens.length > 1 && STREET_TYPES.has(tokens[0]) ? tokens.slice(1) : tokens;
  return name.join(" ");
}

/**
 * @function streetSearchKeyword
 * @description The most distinctive word of a street name - the longest one that is not a
 * street type, title, connective or number. Broadens a reverse search whose full phrase is
 * spelled differently in the Correios database ("15 de Novembro" / "XV de Novembro").
 */
export function streetSearchKeyword(street: string): string | undefined {
  let keyword: string | undefined;
  for (const token of expandAbbreviations(words(street))) {
    if (token.length < 3 || /^\d+$/.test(token) || STOPWORDS.has(token) || STREET_TYPES.has(token) || HONORIFICS.has(token)) {
      continue;
    }
    if (keyword === undefined || token.length > keyword.length) {
      keyword = token;
    }
  }
  return keyword;
}
