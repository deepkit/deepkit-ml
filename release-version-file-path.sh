#!/bin/sh

DIR=`dirname $0`
VERSION=$($DIR/release-version.sh)

LAST_TAG=$(git describe --abbrev=0 --tag)

if echo "$VERSION" | grep -q "-"; then
    # app_version is a dev version
    echo $LAST_TAG-next;
else
    # tagged version
    echo $VERSION
fi
