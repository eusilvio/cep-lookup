module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@eusilvio/cep-lookup$': '<rootDir>/../cep-lookup/src/index.ts',
    '^@eusilvio/cep-lookup/(.*)$': '<rootDir>/../cep-lookup/src/$1',
  },
  testEnvironmentOptions: {
    customExportConditions: ["node", "node-addons"],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
