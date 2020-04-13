#!/bin/sh

DIR=`dirname $0`
cd $DIR

COMMIT=$(git log -n 1 --pretty=format:%h packages/core packages/core-node packages/deepkit packages/cli packages/server packages/electron libs)
APP_VERSION=$(git describe --tag $COMMIT)

LAST_TAG=$(git describe --abbrev=0 --tag)

# APP_VERSION=v0.0.5-278-ga76283b
# APP_VERSION=v2020.1.1-1-ga76283b
# LAST_TAG=v2020.1.1
if echo "$APP_VERSION" | grep -q "$LAST_TAG"; then
    # app_version is a legit next version it contains the latest tag name
    echo $APP_VERSION
else
    # app_version does not contain last_tag, so it is even older. We use last_tag instead
    echo $LAST_TAG
fi
