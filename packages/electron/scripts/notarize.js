require('dotenv').config();
const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== 'darwin') {
        return;
    }

    const appName = context.packager.appInfo.productFilename;
    console.log('Notarizing ...');

    if (process.env.PUBLISH === '0') {
        console.log('no notarizing');
        return;
    }
    if (!process.env.APPLEIDPASS) {
        console.log('APPLEIDPASS is not set. Use the app-specific password as environment variable!');
    }

    return await notarize({
        appBundleId: 'ai.deepkit.app',
        appPath: `${appOutDir}/${appName}.app`,
        appleId: 'apple@deepkit.ai',
        appleIdPassword: process.env.APPLEIDPASS,
    });
};
