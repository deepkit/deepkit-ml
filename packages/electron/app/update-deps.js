const serverPackage = require(__dirname + '/../../server/package.json');
const cliPackage = require(__dirname + '/../../cli/package.json');
const thisPackage = require(__dirname + '/package.dist.json');
const electronPackage = require(__dirname + '/../package.json');
const {writeFileSync} = require('fs');

const dependencies = {
    ...serverPackage['dependencies'],
    ...cliPackage['dependencies'],
};

delete dependencies['@deepkit/core'];
delete dependencies['@deepkit/core-node'];

//nodegit shouldn't be included in the electron app build
delete dependencies['nodegit'];
delete dependencies['bson-ext'];

console.log('dependencies', dependencies);
thisPackage['dependencies'] = dependencies;
thisPackage['version'] = electronPackage['version'];
thisPackage['description'] = electronPackage['description'];
thisPackage['author'] = electronPackage['author'];
thisPackage['license'] = electronPackage['license'];

writeFileSync(__dirname + '/package.json', JSON.stringify(thisPackage));
