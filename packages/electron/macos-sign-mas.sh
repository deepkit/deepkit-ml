#!/bin/bash

# Name of your app.
APP="Deepkit"
# The path of your app to sign.
APP_PATH="./dist/mas/$APP.app"
# The name of certificates you requested.
APP_KEY="3rd Party Mac Developer Application: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
# The path of your plist files.

ENTITLEMENTS="./entitlements/mas.plist"
ENTITLEMENTS_CHILD="./entitlements/mas.inherit.plist"
LOGINHELPER_PLIST="./entitlements/loginhelper.plist"
FRAMEWORKS_PATH="$APP_PATH/Contents/Frameworks"
ARGS="-f --timestamp"

plutil -insert ElectronTeamID -string "MQF837S5D6" $APP_PATH/Contents/Info.plist

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libnode.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libswiftshader_libEGL.dylib"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Libraries/libswiftshader_libGLESv2.dylib"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Resources/crashpad_handler"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework/Versions/A/Electron Framework"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Electron Framework.framework"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Mantle.framework/Versions/A/Mantle"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Mantle.framework"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/ReactiveCocoa.framework/Versions/A/ReactiveCocoa"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/ReactiveCocoa.framework"

#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Squirrel.framework/Versions/A/Resources/ShipIt"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Squirrel.framework/Versions/A/Squirrel"
#codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/Squirrel.framework"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper.app/Contents/MacOS/$APP Helper"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper.app/"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (GPU).app/Contents/MacOS/$APP Helper (GPU)"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (GPU).app/"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Plugin).app/Contents/MacOS/$APP Helper (Plugin)"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Plugin).app/"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Renderer).app/Contents/MacOS/$APP Helper (Renderer)"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$FRAMEWORKS_PATH/$APP Helper (Renderer).app/"


codesign -s "$APP_KEY" $ARGS --entitlements "$LOGINHELPER_PLIST" "$APP_PATH/Contents/Library/LoginItems/$APP Login Helper.app/Contents/MacOS/$APP Login Helper"
codesign -s "$APP_KEY" $ARGS --entitlements "$LOGINHELPER_PLIST" "$APP_PATH/Contents/Library/LoginItems/$APP Login Helper.app/"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/deepkit-server/node_modules/bson-ext/build/Release/bson.node"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/deepkit-server/node_modules/fsevents/fsevents.node"

codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/Resources/app/dist/deepkit-server/libs/mongod-darwin-x64"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS_CHILD "$APP_PATH/Contents/MacOS/$APP"
codesign -s "$APP_KEY" $ARGS --entitlements $ENTITLEMENTS "$APP_PATH"
