const chai = require('chai');

const sinon = require('sinon');
const fs = require('fs-extra');
const Test = require('../app/test');
let xml = require('../app/util/xml');
const shell = require('../app/util/shell');

let test;
describe('Test', () => {
   beforeEach(() => {
      test = new Test({
         rc: 'rc-12',
         store: '',
         reposConfig: {
            test1: {},
            test2: {}
         },
         workspace: '',
         workDir: '',
         resources: '',
         testRep: ['test1']
      });
   });
   let stubExecute;
   beforeEach(() => {
      stubExecute = sinon.stub(shell.prototype, 'execute').callsFake(() => {});
   });
   afterEach(() => {
      stubExecute.restore();
   });

   describe('._makeTestConfig()', () => {
      let stubfs, stubTestList;
      beforeEach(() => {
         stubTestList = sinon.stub(test._modulesMap, 'getTestList').callsFake((name) => {
            return ['test1', 'test2'];
         });
      });
      it('should make a config files for each modules in confing', (done) => {
         let baseConfig = require('../testConfig.base.json');
         let configFiles = {};
         stubfs = sinon.stub(fs, 'outputFile').callsFake((fileName, config) => {
            configFiles[fileName] = JSON.parse(config);
         });
         test._makeTestConfig({name:'test1', path: 'test1.json'}).then(() => {
            chai.expect(configFiles).to.have.property('test1.json');
            let config = configFiles['test1.json'];
            Object.keys(baseConfig).forEach((key) => {
               chai.expect(config).to.have.property(key);
            });
            done();
         });
      });
      afterEach(() => {
         stubTestList.restore();
         stubfs.restore();
      });
   });

   describe('._startBrowserTest()', () => {
      let stubcli, stubfsjson, stubOutputFile, stubModuleMapGet;
      beforeEach(() => {
         stubcli = sinon.stub(test, '_reposConfig').value({
            test: {
               unitInBrowser: true
            }
         });
         stubfsjson = sinon.stub(fs, 'readJsonSync').callsFake(() => {
            return require('../testConfig.base.json');
         });
         stubModuleMapGet = sinon.stub(test._modulesMap, 'get').callsFake((name) => {
            return {name: 'test1', testInBrowser: true};
         });
      });

      it('shouldnt start test if it node only', () => {
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {
            throw new Error();
         });
         stubcli = sinon.stub(test, '_reposConfig').value({
            test: {
               unitInBrowser: false
            }
         });

         chai.expect(() => test._startBrowserTest('test')).to.not.throw();
      });

      it('should run test', (done) => {
         stubOutputFile = sinon.stub(fs, 'outputFile').callsFake(() => undefined);
         stubExecute.callsFake((cmd) => {
            chai.expect(cmd).to.includes('--browser');
            done();
         });

         test._startBrowserTest('test', ['test1']);
      });

      it('should start test server', (done) => {
         test = new Test({
            rc: 'rc-12',
            store: '',
            reposConfig: {
               test: {
                  unitInBrowser: true
               }
            },
            workspace: '',
            workDir: '',
            resources: '',
            server: true
         });
         sinon.stub(test._modulesMap, 'get').callsFake((name) => {
            return {name: 'test1', testInBrowser: true};
         })
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => undefined);
         stubExecute.callsFake((cmd) => {
            chai.expect(cmd).to.includes('server.js');
            done();
         });

         test._startBrowserTest('test', ['test1']);
      });

      afterEach(() => {
         stubcli.restore();
         stubfsjson.restore();
         stubOutputFile.restore();
         stubModuleMapGet.restore();
      });
   });

   describe('.checkReport()', () => {
      let stubTestReports, stubexistsSync, stubOtput;
      it('should create report when it not exists', (done) => {
         stubTestReports = sinon.stub(test, '_testReports').value(['test', 'test1']);
         stubexistsSync = sinon.stub(fs, 'existsSync').callsFake((name) => {
            if (name === 'test1') {
               return false;
            }
            return true;
         });
         stubOtput = sinon.stub(fs, 'outputFileSync').callsFake((name, text) => {
            chai.expect(name).to.includes('test1');
            done();
         });
         test.checkReport();
      });
      it('should not throw an error', () => {
         stubTestReports = sinon.stub(test, '_testReports').value(['test', 'test1']);
         stubexistsSync = sinon.stub(fs, 'existsSync').callsFake((name) => {
            return true;
         });

         chai.expect(() => {
            test.checkReport();
         }).to.not.throw();
      });
      afterEach(() => {
         stubTestReports.restore();
         stubexistsSync.restore();
         // tslint:disable-next-line:no-unused-expression
         stubOtput && stubOtput.restore();
      });
   });

   describe('.startTest()', () => {
      let stubmakeTestConfig, stubstartBrowserTest, stubtestList, stubBuild;
      beforeEach(() => {
         stubmakeTestConfig = sinon.stub(test, '_makeTestConfig').callsFake(() => {
            return Promise.resolve();
         });
         stubstartBrowserTest = sinon.stub(test, '_startBrowserTest').callsFake(() => {
            return Promise.resolve();
         });
         stubBuild = sinon.stub(test._modulesMap, 'build').callsFake(() => {});
         stubtestList = sinon.stub(test._modulesMap, 'getTestList').callsFake(() => ['engine']);
      });
      it('should start test', (done) => {
         let commandsArray = [];
         stubExecute.callsFake((cmd) => {
            commandsArray.push(cmd);
            chai.expect(commandsArray).to.includes('node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_engine.json"');
            return Promise.resolve();
         });
         test._startTest().then(() => {
            done();
         });
      });

      afterEach(() => {
         stubmakeTestConfig.restore();
         stubstartBrowserTest.restore();
         stubtestList.restore();
         stubBuild.restore();
      });
   });

   describe('.prepareReport()', () => {
      let stubRead, stubWrite, stubTestReports, fsExistsSync, stubTestError;
      beforeEach(() => {
         stubWrite = sinon.stub(xml, 'writeXmlFile').callsFake(() => undefined);
         stubTestError = sinon.stub(test, '_testErrors').value({});
         stubTestReports = sinon.stub(test, '_testReports').value(new Map([['test', {}], ['test1', {}]]));
         stubRead = sinon.stub(fs, 'readFileSync').callsFake(() => {
            return '<testsuite><testcase classname="test1"></testcase></testsuite>';
         });
         fsExistsSync = sinon.stub(fs, 'existsSync').callsFake(() => true);
      });

      it('should return all test', (done) => {
         stubWrite.callsFake((name, obj) => {
            chai.expect(obj.testsuite.testcase[0].$.classname).to.equal('[test]: test1');
            done();
         });
         test.prepareReport();
      });

      it('should make failure report if it is empty', (done) => {
         stubRead.callsFake(() => '<testsuite></testsuite>');
         stubTestReports = sinon.stub(test._modulesMap, 'getTestModules').callsFake(() => ['test']);
         stubTestError.value({test: ['error']});
         stubWrite.callsFake((name, obj) => {
            chai.expect(obj.testsuite.testcase[0].failure).to.equal('error');
            done();
         });
         test.prepareReport();
      });

      afterEach(() => {
         stubWrite.restore();
         stubRead.restore();
         stubTestReports.restore();
         fsExistsSync.restore();
         stubTestError.restore();
      });
   });
});
