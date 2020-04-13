FROM ubuntu:16.04

ENV NODE_VERSION=v12.6.0

RUN echo NODE_VERSION=$NODE_VERSION
RUN apt-get update && apt-get install -y curl build-essential python git
RUN curl https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.gz -o node.tar.gz && tar xf node.tar.gz
RUN mv node-* /node
ENV PATH="/node/bin/:${PATH}"

CMD cd /app/ && npm install --only=prod --unsafe --scripts-prepend-node-path
