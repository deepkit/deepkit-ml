set -e

# disable auto signing, we need to sign manually
BUILD="../../build"
TARGET="app"

#if [ "$PUBLISH" == "0" ]; then
#    echo "Build without publish."
#else
#    echo "Build with publish. Disable with PUBLISH=0 ./linux-build.sh"
#fi

rm -rf $TARGET/deepkit
mkdir -p $TARGET
cp -r $BUILD/frontend $TARGET/deepkit

cp dist/main.js $TARGET/index.js
rm -rf $TARGET/bin
cp -r bin $TARGET/bin

rm -rf $TARGET/assets
cp -r assets $TARGET/assets

rm -rf $TARGET/deepkit-server
cp -r $BUILD/windows/server $TARGET/deepkit-server
rm -rf $TARGET/deepkit-server/bin

rm -rf $TARGET/deepkit-cli
cp -r $BUILD/linux/cli $TARGET/deepkit-cli
rm -rf $TARGET/deepkit-cli/bin

mkdir -p $TARGET/build/linux
cp $BUILD/linux/deepkit-cli-linux.tar.gz $TARGET/build/linux/deepkit-cli-linux.tar.gz;

rm -rf $TARGET/deepkit/*.map
rm -rf $TARGET/deepkit/assets/icons.sketch
rm -rf $TARGET/deepkit/assets/icons
rm -rf $TARGET/deepkit/statistics.html

node app/update-deps.js
chmod -R 0644 assets/icons
chmod +x assets/icons
chmod +x assets/icons/docker-icon.iconset

#if [ "$PUBLISH" == "0" ]; then
    ./node_modules/.bin/electron-builder --windows --config electron-builder.json
#else
#    ./node_modules/.bin/electron-builder --linux --config electron-builder.json --publish always
#fi
