const chai = require('chai');
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
const Prepare = require('../app/prepare');

let makeConfig;
let writeJSON;
let existsSync;
describe('Store', () => {
   beforeEach(() => {
      prepare = new Prepare({
         config: {
            repositories: {
               test1: {},
               test2: {}
            }
         },
         store: 'store',
         testRep: ['name'],
         resources: 'application',
         argvOptions: {}
      });
      writeJSON = sinon.stub(fs, 'writeJSON').callsFake(() => undefined);
      existsSync = sinon.stub(fs, 'existsSync').callsFake(() => undefined);
   });
   afterEach(() => {
      writeJSON.restore();
      existsSync.restore();
   });

   describe('_writeConfig', () => {
      it('should write config', (done) => {
         writeJSON.callsFake(() => {
            done();
         });
         Prepare.writeConfig('path/to/config');
      });

      it('should not rewrite config if it exists', () => {
         existsSync.callsFake(() => true);
         Prepare.writeConfig('path/to/config');
         chai.expect(writeJSON.notCalled).is.true;
      });
   });

   describe('_getPathFromConfig', () => {
      let readJSON;
      beforeEach(() => {
         readJSON = sinon.stub(fs, 'readJSON').callsFake(() => ({
            compilerOptions: {
               paths: {
                  module: ['path/to/module']
               }
            }
         }));
      });
      afterEach(() => {
         readJSON.restore();
      });

      it('should return paths', async () => {
         let paths = await prepare._getPathsFromConfig('path/to/config');
         chai.expect({module: ['path/to/module']}).to.deep.equal(paths);
      });
   });

   describe('_getPaths', () => {
      let modulesMapList, modulesMapGet;
      beforeEach(() => {
         modulesMapList = sinon.stub(prepare._modulesMap, 'getChildModules').callsFake(() => (['testModule']));
         modulesMapGet = sinon.stub(prepare._modulesMap, 'get').callsFake(() => ({
            name: 'testModule',
            path: 'path/to/module'
         }));
      });
      afterEach(() => {
         modulesMapList.restore();
      });

      it('should return paths', async () => {
         let paths = await prepare._getPaths();
         chai.expect(paths).to.have.property('testModule/*');
      });
   });


});
