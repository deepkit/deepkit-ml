#!/bin/sh

set -e

B2_APPKEY_ID="000f48281d29bf60000000002"
DIR=`dirname $0`

if [ "$B2_APPKEY" == "" ]; then
  echo B2_APPKEY env not defined.
  exit 1
fi

VERSION=`$DIR/../../release-version-file-path.sh`

echo "Authorize-account ..."
python -m b2 authorize-account $B2_APPKEY_ID $B2_APPKEY

echo "Upload version $VERSION ..."

echo "Upload Deepkit-${VERSION}.AppImage ..."
python -m b2 upload-file deepkit-releases release-builds/Deepkit-${VERSION}.AppImage releases/Deepkit-${VERSION}.AppImage

echo "Upload deepkit_${VERSION}_amd64.snap ..."
python -m b2 upload-file deepkit-releases release-builds/deepkit_${VERSION}_amd64.snap releases/deepkit_${VERSION}_amd64.snap

echo "Upload latest-linux.yml"
python -m b2 upload-file deepkit-releases release-builds/latest-linux.yml releases/latest-linux.yml
