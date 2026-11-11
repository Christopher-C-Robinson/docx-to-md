module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(archiver|zip-stream|compress-commons|crc32-stream|is-stream)/)',
  ],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
    '^.+\\.js$': 'babel-jest',
  },
};
