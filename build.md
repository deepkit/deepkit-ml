## Build

- First tack the version. e.g. `git tag 2020.3.1`
- run `npm run bootstrap`
- run `npm-local-development`

- Run `electron-*-local` build for each platform
- use PUBLISH=0 env for testing

```
PUBLISH=0 make electron-darwin-local -j 4
PUBLISH=0 make electron-linux-local -j 4
PUBLISH=0 make electron-windows-local -j 4
```

```
# macos
export APPLEIDPASS=<app-specific password>
PUBLISH=1 make electron-darwin-local -j 4

PUBLISH=1 make electron-linux-local -j 4
PUBLISH=1 make electron-windows-local -j 4 # windows has no publish yet
```
