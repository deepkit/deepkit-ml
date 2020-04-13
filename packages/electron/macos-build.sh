set -e

# disable auto signing, we need to sign manually
BUILD="../../build"
TARGET="app"

if [ "$PUBLISH" == "0" ]; then
    echo "Build without publish."
else
    echo "Build with publish. Disable with PUBLISH=0 ./macos-build.sh"
fi

rm -rf $TARGET/deepkit
mkdir -p $TARGET
cp -r $BUILD/frontend $TARGET/deepkit

cp dist/main.js $TARGET/index.js
rm -rf $TARGET/bin
cp -r bin $TARGET/bin

rm -rf $TARGET/deepkit-server
cp -r $BUILD/darwin/server $TARGET/deepkit-server
rm -rf $TARGET/deepkit-server/bin

rm -rf $TARGET/deepkit-cli
cp -r $BUILD/darwin/cli $TARGET/deepkit-cli
rm -rf $TARGET/deepkit-cli/bin

mkdir -p $TARGET/build/linux
cp $BUILD/linux/deepkit-cli-linux.tar.gz $TARGET/build/linux/deepkit-cli-linux.tar.gz;

rm -rf $TARGET/deepkit/*.map
rm -rf $TARGET/deepkit/assets/icons.sketch
rm -rf $TARGET/deepkit/assets/icons
rm -rf $TARGET/deepkit/statistics.html

node app/update-deps.js

#CSC_IDENTITY_AUTO_DISCOVERY=false ./node_modules/.bin/electron-builder --dir
if [ "$PUBLISH" == "0" ]; then
    ./node_modules/.bin/electron-builder --mac --config electron-builder.json
else
    ./node_modules/.bin/electron-builder --mac --config electron-builder.json --publish always
fi

#./node_modules/.bin/electron-packager . Deepkit --overwrite --icon=assets/icons/docker-icon.icns;

# node_modules are not copied per default
# and if we add them all files are signed by electron-builder which takes ages
#cp -rf dist/deepkit-server/node_modules $APP_DIR/Contents/Resources/app/dist/deepkit-server/node_modules
#cp -rf dist/deepkit-cli/node_modules $APP_DIR/Contents/Resources/app/dist/deepkit-cli/node_modules
