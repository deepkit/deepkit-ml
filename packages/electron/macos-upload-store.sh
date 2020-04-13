# ➜ security find-identity -v
#  1) 42604E818888E076D53449452DD9D6DB2047B6CD "Mac Developer: office@marcjschmidt.de (7E39CUFWV5)"
#  2) B8726B49DF621A0F2D2ECE20063258BE82CBA0F5 "Developer ID Application: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#  3) 890B90135017D3B1D6A3BC8497CD24EAAF63141B "3rd Party Mac Developer Application: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#  4) B4EE43C8C974BB51C9AD643665E6EE4080375640 "3rd Party Mac Developer Installer: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#  5) 5C9FA5E0FC77E1BC0715113B090FA0C01F218DAF "Developer ID Installer: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
#     5 valid identities found
set -e

APP="Deepkit"
APP_KEY="3rd Party Mac Developer Installer: DeepKit UG haftungsbeschrnkt (MQF837S5D6)"
APP_PATH="dist/mas/$APP.app"
RESULT_PATH="dist/mas/$APP.pkg"


USER=apple@deepkit.ai
echo -n "Password: "
read -s PW

# team ids
xcrun altool --list-providers -u $USER -p $PW

# verify and upload to shizzle mac store
echo "Product $APP_PATH to $RESULT_PATH ..."
productbuild --component "$APP_PATH" /Applications --sign "$APP_KEY" "$RESULT_PATH"
#echo "Validate app ..."
#xcrun altool --validate-app -f $RESULT_PATH -t platform -u $USER -p $PW
echo "Upload $RESULT_PATH ..."
xcrun altool --upload-app -f $RESULT_PATH -t platform -u $USER -p $PW
