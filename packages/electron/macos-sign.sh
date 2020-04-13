#!/bin/bash

# Name of your app.
APP="Deepkit"
# The path of your app to sign.
APP_PATH="./dist/mac/$APP.app"
# The name of certificates you requested.
APP_KEY="Developer ID Application: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
# The path of your plist files.
ENTITLEMENTS="./entitlements/mac.plist"
ENTITLEMENTS_CHILD="./entitlements/mac.inherit.plist"

FRAMEWORKS_PATH="$APP_PATH/Contents/Frameworks"
ARGS="-f --timestamp -o runtime"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libnode.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libswiftshader_libEGL.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libswiftshader_libGLESv2.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Resources/crashpad_handler"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Electron Framework"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Mantle.framework/Versions/A/Mantle"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Mantle.framework"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/ReactiveCocoa.framework/Versions/A/ReactiveCocoa"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/ReactiveCocoa.framework"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Squirrel.framework/Versions/A/Resources/ShipIt"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Squirrel.framework/Versions/A/Squirrel"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Squirrel.framework"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper.app/Contents/MacOS/$APP Helper"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper.app/"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (GPU).app/Contents/MacOS/$APP Helper (GPU)"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (GPU).app/"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Plugin).app/Contents/MacOS/$APP Helper (Plugin)"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Plugin).app/"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Renderer).app/Contents/MacOS/$APP Helper (Renderer)"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Renderer).app/"

#codesign -s "$APP_KEY" --deep -f --entitlements "$LOGINHELPER_PLIST" "$APP_PATH/Contents/Library/LoginItems/$APP Login Helper.app/Contents/MacOS/$APP Login Helper"
#codesign -s "$APP_KEY" --deep -f --entitlements "$LOGINHELPER_PLIST" "$APP_PATH/Contents/Library/LoginItems/$APP Login Helper.app/"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/bin/node"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/deepkit-server/node_modules/bson-ext/build/Release/bson.node"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/deepkit-server/node_modules/fsevents/fsevents.node"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/deepkit-server/libs/mongod-darwin-x64"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/MacOS/$APP"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS "$APP_PATH"
