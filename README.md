# Deepkit

<p align="center">
 <img src="https://raw.githubusercontent.com/deepkit/deepkit/master/assets/logo-white.png" />
</p>

Deepkit is an open-source platform and desktop application to execute, track, and debug machine learning experiments. The integrated server management tools
enables to execute experiments on any Linux server by just entering their SSH credentials. 

## Features

- Experiment execution using uniform experiment definition
- Execute experiments locally or in the cloud, seamlessly
- Pipelining (to increase execution time and reduce hardware costs)
- Layer debugger for Keras2 and Pytorch
- Automatic source code versioning
- Experiment artifacts (aka output: weights, snapshots, etc)
- Experiment execution via Docker container with auto-build
- Server job scheduling with resource assignment (and NVIDIA Docker GPU support)
- Real-time experiment tracking: Log metrics, text, images, numpy arrays, and more
- [Python SDK](https://github.com/deepkit/deepkit-python-sdk)
- Project management: Issue tracker, Kanban board, notes
- Real-time desktop (and web) app with analytical tools to manage experiments
- Centralized server for teams
- Free community server at https://app.deepkit.ai to share your experiments with thr world

## Development

Deepkit is written entirely in Typescript and consists of following main packages:

- cli: command line interface tools
- app: The desktop and web app interface
- server: The server component that stores all the data using the filesystem and mongodb

Following open-source packages have been created for Deepkit that wouldn't exist otherwise and were absolutely necessary:

- [Marshal.ts](https://github.com/marcj/marshal.ts) - The fastest universal Typescript data serializer and validator
- [Glut.ts](https://github.com/marcj/glut.ts) - A real-time server framework with entity/file abstraction based on ReactJS
- [angular-desktop-ui](https://github.com/marcj/angular-desktop-ui) - A GUI library for native-like GUI widget based on Angular 9+

### Development app

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
