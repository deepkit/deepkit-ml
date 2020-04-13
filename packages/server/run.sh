#!/bin/sh

ARGS="--local-server"

if [ "${SERVER_MODE:-0}" = "1" ]; then
    ARGS=""
fi

DEEPKIT_FRONTEND_DIR=../deepkit/dist/deepkit NODE_PRESERVE_SYMLINKS=1 ./node_modules/.bin/nodemon \
--watch dist --watch node_modules/@marcj/glut-server/dist dist/main.js $ARGS
