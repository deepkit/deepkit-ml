module.exports = {
    resolver: __dirname + '/jest-resolver.js',
    "moduleFileExtensions": [
        "ts",
        "tsx",
        "js"
    ],
    "transform": {
        "^.+\\.(ts|tsx)$": "ts-jest"
    },
    "testMatch": [
        "**/*.spec.ts"
    ],
    "transformIgnorePatterns": [
        "node_modules/(?!@deepkit/.*)"
    ],
};
