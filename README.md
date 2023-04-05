# Deepkit

<p align="center">
 <img src="https://raw.githubusercontent.com/deepkit/deepkit/master/assets/logo-white.png" />
</p>

Deepkit is an open-source platform and cross-platform desktop application to execute, track, and debug modern machine learning experiments.
With integrated server management tool to execute experiments on any Linux server with a simple click or cli command. 

[Download](https://ml.deepkit.io/download) - 
[Example Python](https://github.com/deepkit/deepkit-python-sdk/tree/master/examples)

## Features

- Experiment execution using uniform experiment definition
- Execute experiments locally or in the cloud, seamlessly
- Pipeline support to increase execution time and reduce hardware costs
- Layer debugger for Keras2 and Pytorch
- Automatic source code versioning
- Experiment artifacts (aka output: weights, snapshots, etc)
- Experiment execution via Docker container with auto-build
- Experiment comparison: Side by side, file diff, metrics diff
- Server job scheduling with resource limitation and assignment (and NVIDIA Docker GPU support)
- Real-time experiment tracking: Log metrics, text, images, numpy arrays, and more
- [Python SDK](https://github.com/deepkit/deepkit-python-sdk)
- Project management: Issue tracker, Kanban board, and notes
- Real-time desktop (and web) app with analytical tools to monitor and organize experiments
- Optional centralized server for teams

## Development

Deepkit is written entirely in Typescript and consists of following main packages:

- packages/cli: command line interface tools
- packages/deepkit: The GUI, desktop and web app interface
- packages/server: The server component that stores all the data using the filesystem and mongodb
- packages/website: The website as SSR Angular 9 SPA app
- packages/core: Common models, functions, services
- packages/core-node: Common models, functions, services for node environment
- packages/electron: The electron bootstrapper for the GUI

Following open-source packages have been created for Deepkit that wouldn't exist otherwise and were absolutely necessary:

- [Marshal.ts](https://github.com/marcj/marshal.ts) - The fastest universal Typescript data serializer and validator
- [Glut.ts](https://github.com/marcj/glut.ts) - A reactive real-time server framework with distributed entity/file abstraction and syncing based on ReactJS
- [angular-desktop-ui](https://github.com/marcj/angular-desktop-ui) - A GUI library for native-like GUI widget based on Angular 9+

### Development app

```
cd deepkit
npm run bootstrap
```

```
cd deepkit
npm-local-development
```

```
cd deepkit
make angular-watch
```

```
cd deepkit
server-watch
```

```
# Open in browser the angular dist
# e.g. file:///Users/marc/bude/deepkit/packages/deepkit/dist/deepkit/index.html
# or electron
cd deepkit
make electron-build
make electron
```

### Development website

Watcher 

```
cd packages/website
ng run website:server:production --watch
```


Server
```
cd packages/website
npm run serve:ssr
```
