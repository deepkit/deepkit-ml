FROM node:12-alpine3.9

RUN apk --no-cache add git
RUN npm config set unsafe-perm true
RUN npm install -g lerna npm-local-development
ADD lerna.json /deepkit/lerna.json
ADD package.json /deepkit/package.json
ADD packages/website/package.json /deepkit/packages/website/package.json
ADD packages/website/package-lock.json /deepkit/packages/website/package-lock.json
RUN cd /deepkit && lerna bootstrap --nohoist \* --ci --scope @deepkit/website

ADD . /deepkit
RUN cd /deepkit/packages/website && npm run build:ssr && npm prune --production

ENV PORT=80
EXPOSE 80
CMD cd /deepkit/packages/website && node dist/server/main.js
