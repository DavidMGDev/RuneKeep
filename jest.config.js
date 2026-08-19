/** Jest setup. The pure-logic modules (stage scale, pip resolver) are unit-tested here. */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // A .css import is a web build detail; see scripts/jest-style-stub.js.
  moduleNameMapper: { '\\.css$': '<rootDir>/scripts/jest-style-stub.js' },
};
