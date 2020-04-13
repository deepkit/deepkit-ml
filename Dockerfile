FROM node:11-alpine AS build

RUN npm install -g lerna npm-local-development

ADD ./lerna.json /app/
ADD ./package.json /app/

ADD ./packages/core/package.json /app/packages/core/
ADD ./packages/core/package-lock.json /app/packages/core/

ADD ./packages/core-node/package.json /app/packages/core-node/
ADD ./packages/core-node/package-lock.json /apppackages/core-node/

ADD ./packages/deepkit/package.json /app/packages/deepkit/
ADD ./packages/deepkit/package-lock.json /app/packages/deepkit/

ADD ./packages/server/package.json /app/packages/server/
ADD ./packages/server/package-lock.json /app/packages/server/

RUN cd /app && npm run bootstrap

ADD ./packages /app/packages

RUN cd /app && npm-local-development --no-watcher

RUN cd /app/packages/deepkit && ./node_modules/.bin/ng build --prod

RUN cd /app/packages/server && npm run build

RUN rm -r /app/packages/core
RUN rm -r /app/packages/core-node
RUN rm -r /app/packages/cli

RUN cd /app/packages/deepkit && rm -r node_modules/@deepkit && npm prune --production
RUN cd /app/packages/server && rm -r node_modules/@deepkit && npm prune --production






FROM node:11-alpine

EXPOSE 8960

RUN apk --no-cache add tzdata

COPY --from=build /app /app

WORKDIR /app/packages/server

CMD node dist/main.js --server-mode --mongo-host mongo --redis-host redis

