# ➜ security find-identity -v
#  1) 42604E818888E076D53449452DD9D6DB2047B6CD "Mac Developer: office@marcjschmidt.de (7E39CUFWV5)"
#  2) B8726B49DF621A0F2D2ECE20063258BE82CBA0F5 "Developer ID Application: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#  3) 890B90135017D3B1D6A3BC8497CD24EAAF63141B "3rd Party Mac Developer Application: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#  4) B4EE43C8C974BB51C9AD643665E6EE4080375640 "3rd Party Mac Developer Installer: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#  5) 5C9FA5E0FC77E1BC0715113B090FA0C01F218DAF "Developer ID Installer: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#     5 valid identities found

#NOT IN USE ANYMORE. We use scripts/notarize.js with electron-builder now.

APP="Deepkit"
APP_KEY="3rd Party Mac Developer Installer: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
APP_PATH="dist/mac/$APP.app"
RESULT_PATH="dist/mac/$APP.pkg"

echo "Zip Deepkit.app ..."

cd dist/mac && ditto -c -k --keepParent Deepkit.app Deepkit.zip && cd -

echo "Notarize app ..."

USER=apple@deepkit.ai
PW=LOLOLOLOL

# verify and upload to shizzle mac store
productbuild --component "$APP_PATH" /Applications --sign "$APP_KEY" "$RESULT_PATH"
xcrun altool --validate-app -f $RESULT_PATH -t platform -u $USER -p $PW
xcrun altool --upload-app -f $RESULT_PATH -t platform -u $USER -p $PW

# notarize for third party distrbuti

# maybe use electron-notarize npm package
# account app-specific password
xcrun altool --notarize-app --primary-bundle-id "ai.deepkit.app" -u $USER -p $PW --file Deepkit-darwin-x64/Deepkit.zip


xcrun altool --notarization-history 0 -u $USER -p $PW

# wait
NOTAR_ID=$(xcrun altool --notarization-history 0 -u $USER -p $PW| grep in-progress | awk '{print $4}')
echo Wait for notarization ...
#sleep 300
#NOTAR_ID=""
xcrun altool --notarization-info $NOTAR_ID -u $USER -p $PW

#xcrun stapler staple Deepkit-darwin-x64/Deepkit.app

# last check
spctl --assess --verbose=4  Deepkit-darwin-x64/Deepkit.app

