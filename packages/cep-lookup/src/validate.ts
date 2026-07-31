import { CepValidationError } from "./errors";

/**
 * @function validateCep
 * @description Validates and cleans a CEP string strictly.
 * @param {string} cep - The CEP string to validate.
 * @returns {string} The cleaned, 8-digit CEP string.
 * @throws {CepValidationError} If the CEP format is invalid.
 */
export function validateCep(cep: string): string {
  const cepRegex = /^(\d{8}|\d{5}-\d{3})$/;
  if (!cepRegex.test(cep)) {
    throw new CepValidationError(cep);
  }
  return cep.replace("-", "");
}
