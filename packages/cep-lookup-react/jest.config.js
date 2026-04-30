module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  moduleNameMapper: {
    '^@eusilvio/cep-lookup$': '<rootDir>/../cep-lookup/src/index.ts',
    '^@eusilvio/cep-lookup/(.*)$': '<rootDir>/../cep-lookup/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
