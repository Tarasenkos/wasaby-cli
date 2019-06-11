const chai = require('chai');
const Cli = require('./../cli');
const sinon = require('sinon');
const fs = require('fs-extra');
const path = require('path');
let cli;
let stubArgv;

let getProcess = () => {
   return {
      on(prop, callback) {
         this[prop] = callback;
      },

      kill(result) {
         this.exit && this.exit(result);
         this.close && this.close(result);
      },

      stdout: {
         on(prop, callback) {
            this[prop] = callback;
         }
      },

      stderr: {
         on(prop, callback) {
            this[prop] = callback;
         }
      }

   }
};

describe('CLI', () => {
   beforeEach(() => {
      stubArgv = sinon.stub(process, 'argv');
      stubArgv.value(['','', '--rep=types', '--branch=200/feature', '--rc=rc-200']);
      cli = new Cli();
   });

   afterEach(() => {
      stubArgv.restore();
   });

   describe('.constructor()', () => {
      it('should throw error _testModule is empty', () => {
         let config = cli.readConfig();
         stubArgv.value(['','', '--branch=200/feature', '--rc=rc-200']);
         chai.expect(() => {new Cli()}).to.throw();
      });
   });

   describe('.readConfig()', () => {
      it('should return config', () => {
         let config = cli.readConfig();
         chai.expect(config).to.be.an('object').to.deep.equal(require('./../config.json'));
      });

   });

   describe('._getArgvOptions()', () => {
      it('should return argv options', () => {
         stubArgv.value(['','','--a=12', '--b=15']);
         let config = cli._getArgvOptions();
         chai.expect(config).to.be.an('object').to.deep.equal({a:'12',b:'15'});
      });
   });

   describe('.init()', () => {
      it('should throw error when rep is empty', () => {
         stubArgv.value(['','']);
         chai.expect(() => cli.init()).to.throw();
      });
      it('should set params from argv', () => {
         chai.expect(cli._testBranch).to.equal('200/feature');
         chai.expect(cli._testModule).to.equal('types');
         chai.expect(cli._rc).to.equal('rc-200');
      });
      it('should set params from config', () => {
         const config = require('./../config.json');
         chai.expect(cli._repos).to.deep.equal(config.repositories);
         chai.expect(cli._store).to.equal(config.store);
         chai.expect(cli._workDir).to.equal(config.workDir);
      });
   });

   describe('._makeBuilderConfig()', () => {
      it('should throw error when rep is empty', (done) => {
         let baseConfig = require('../builderConfig.base.json');
         let stubfs = sinon.stub(fs, 'outputFile').callsFake((fileName, config) => {
            config = JSON.parse(config);
            chai.expect(config).to.deep.include(baseConfig);
            done();
         });
         stubArgv.value(['','']);
         let stubModules = sinon.stub(cli, '_getModulesByRepName').callsFake((name) => {
            return [name];
         });
         cli._makeBuilderConfig();
         stubModules.restore();
         stubfs.restore();
      });
   });

   describe('._makeTestConfig()', () => {
      it('should make a config files for each modules in confing', (done) => {
         let baseConfig = require('../testConfig.base.json');
         let configFiles = {};
         let stubfs = sinon.stub(fs, 'outputFile').callsFake((fileName, config) => {
            configFiles[fileName] = JSON.parse(config);
         });
         stubArgv.value(['','']);
         cli._makeTestConfig().then(() => {
            cli._repos[cli._testModule].dependTest.forEach((key) => {
               chai.expect(configFiles).to.have.property('./testConfig_'+key+'.json');
            });
            let config = configFiles['./testConfig_types.json'];
            Object.keys(baseConfig).forEach((key) => {
               chai.expect(config).to.have.property(key);
            });
            done();
         });
         stubfs.restore();
      });
   });

   describe('._findModulesInRepDir()', () => {
      it('should find all modules in repository', () => {
         let stubfs = sinon.stub(fs, 'readdirSync').callsFake((path) => {
            if (path.includes('tttModule')) {
               return ['ttt.txt', 'ttt.s3mod']
            }
            return ['tttModule']
         });
         let stubStat = sinon.stub(fs, 'statSync').callsFake((path) => {
            return {
               isDirectory: () => /.*tttModule$/.test(path)
            }
         });

         chai.expect(['tttModule']).to.deep.equal(cli._findModulesInRepDir('types'));

         stubfs.restore();
         stubStat.restore();
      });
   });
   describe('._getModulesByRepName()', () => {
      let stubFind, stubRepos;
      beforeEach(() => {
         stubFind = sinon.stub(cli, '_findModulesInRepDir').callsFake((path) => {
            return ['test']
         });
         stubRepos = sinon.stub(cli, '_repos').value({
            'test': {
               modules: ['test_config']
            }
         });
      });
      it('should concat modules from config and repository', () => {
         chai.expect(['test', 'test_config']).to.deep.equal(cli._getModulesByRepName('test'));
      });
      it('should return result from cache', () => {
         chai.expect(cli._getModulesByRepName('test')).to.equal(cli._getModulesByRepName('test'));
      });
      afterEach(() => {
         stubFind.restore();
         stubRepos.restore();
      });
   });

   describe('._closeChildProcess()', () => {

      it('should close all child process', (done) => {
         let stubcli = sinon.stub(cli, '_childProcessMap').value([getProcess()]);

         cli._closeChildProcess().then(() => {
            done();
         });

         stubcli.restore();
      });
   });

   describe('._getModuleNameByPath()', () => {
      it('should return name with posix separator', () => {
         chai.expect(cli._getModuleNameByPath('client/str')).to.equal('str');
      });
      it('should return name with windows separator', () => {
         chai.expect(cli._getModuleNameByPath('client\\str')).to.equal('str');
      });
   });

   describe('._getModuleNameByPath()', () => {
      it('should return name with posix separator', () => {
         chai.expect(cli._getModuleNameByPath('client/str')).to.equal('str');
      });
      it('should return name with windows separator', () => {
         chai.expect(cli._getModuleNameByPath('client\\str')).to.equal('str');
      });
   });

   describe('._startBrowserTest()', () => {
      let stubcli, stubfsjson, stubexecute, stubOutputFile;
      beforeEach(() => {
         stubcli = sinon.stub(cli, '_repos').value({
            'test': {
               unitInBrowser: true
            }
         });
         stubfsjson = sinon.stub(fs, 'readJsonSync').callsFake(() => {
            return require('../testConfig.base.json');
         });
      });

      it('shouldnt start test if it node only', () => {
         stubexecute = sinon.stub(cli, '_execute').callsFake(() => {});
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {
            throw new Error();
         });
         stubcli = sinon.stub(cli, '_repos').value({
            'test': {
               unitInBrowser: false
            }
         });

         chai.expect(() => cli._startBrowserTest('test')).to.not.throw();
      });

      it('should make config', (done) => {
         stubexecute = sinon.stub(cli, '_execute').callsFake(() => {});
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake((file, config) => {
            config = JSON.parse(config);

            chai.expect(config.htmlCoverageReport).to.includes('_browser');
            chai.expect(config.jsonCoverageReport).to.includes('_browser');
            done();
         });

         cli._startBrowserTest('test');
      });

      it('should run test', (done) => {
         stubOutputFile = sinon.stub(fs, 'outputFileSync').callsFake(() => {});
         stubexecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            chai.expect(cmd).to.includes('--browser');
            done();
         });

         cli._startBrowserTest('test');
      });

      afterEach(() => {
         stubcli.restore();
         stubfsjson.restore();
         stubexecute.restore();
         stubOutputFile.restore();
      });
   });

   describe('_execute', () => {
      const shell = require('shelljs');
      let stubExec, stubConsole;
      it('should execute command', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill();
            });
            chai.expect(cmd).to.equal('cd path && help');
            done();
            return process;
         });
         cli._execute('help', 'path');
      });

      it('should return resolved promise if command result ok', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill();
            });
            return process;
         });
         cli._execute('help', 'path').then(() => {
            done();
         });
      });

      it('should return resolved promise if command result is ok', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill();
            });
            return process;
         });
         cli._execute('help', 'path').then(() => {
            done();
         });
      });

      it('should return rejected promise if command result is fail', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill(2);
            });
            return process;
         });
         cli._execute('help', 'path').catch(() => {
            done();
         });
      });

      it('should return resolved promise if command result is fail and it need force', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            setTimeout(() => {
               process.kill(2);
            });
            return process;
         });
         cli._execute('help', 'path', true).then(() => {
            done();
         });
      });

      it('should return rejected promise if process will be killed', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            process.withErrorKill = true;
            setTimeout(() => {
               process.kill();
            });
            return process;
         });
         cli._execute('help', 'path').catch(() => {
            done();
         });
      });

      it('should log info', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            process.withErrorKill = true;
            setTimeout(() => {
               process.stdout.data('ttttt');
               process.kill();
            });
            return process;
         });
         stubConsole = sinon.stub(cli, 'log').callsFake((log) => {
            chai.expect(log).to.equal('ttttt');
            done();
         });
         cli._execute('help', 'path');
      });

      it('should log error', (done) => {
         stubExec = sinon.stub(shell, 'exec').callsFake((cmd) => {
            let process = getProcess();
            process.withErrorKill = true;
            setTimeout(() => {
               process.stderr.data('ttttt');
               process.kill();
            });
            return process;
         });
         stubConsole = sinon.stub(cli, 'log').callsFake((log) => {
            chai.expect(log).to.equal('ttttt');
            done();
         });
         cli._execute('help', 'path');
      });

      afterEach(()=> {
         stubExec.restore();
         stubConsole && stubConsole.restore();
      })
   });

   describe('_copyUnit', () => {
      let stumbsUnitModules, copySync, stubReaddirSync, stubStat;
      it('should execute command', () => {
         stumbsUnitModules = sinon.stub(cli, '_unitModules').value(['test']);
         let copyFiles = [];
         copySync = sinon.stub(fs, 'copySync').callsFake((name) => {
            copyFiles.push(name);
         });
         stubReaddirSync = sinon.stub(fs, 'readdirSync').callsFake((path) => {
            if (path.includes('test')) {
               return ['ttt.js', 'ttt.test.js']
            }
            return ['test']
         });
         stubStat = sinon.stub(fs, 'statSync').callsFake((path) => {
            return {
               isDirectory: () => /.*test$/.test(path)
            }
         });
         cli._copyUnit();
         chai.expect(copyFiles).to.deep.equal([path.join('test','ttt.js')])
      });
      afterEach(() => {
         stumbsUnitModules.restore();
         copySync.restore();
         stubReaddirSync.restore();
         stubStat.restore();
      });
   });

   describe('.checkReport()', () => {
      let stubTestReports, stubexistsSync;
      it('should throw an error', () => {
         stubTestReports = sinon.stub(cli, '_testReports').value(['test', 'test1']);
         stubexistsSync = sinon.stub(fs, 'existsSync').callsFake((name) => {
            if (name == 'test1') {
               return false;
            }
            return true;
         });

         chai.expect(() => {cli.checkReport()}).to.throw();
      });
      it('should not throw an error', () => {
         stubTestReports = sinon.stub(cli, '_testReports').value(['test', 'test1']);
         stubexistsSync = sinon.stub(fs, 'existsSync').callsFake((name) => {
            return true;
         });

         chai.expect(() => {cli.checkReport()}).to.not.throw();
      });
      afterEach(() => {
         stubTestReports.restore();
         stubexistsSync.restore();
      });
   });
   describe('initRepStore', () => {
      var stubCheckout, stubClone;
      it('initRepStore', (done) => {
         stubCheckout = sinon.stub(cli, 'checkout').callsFake((name, branch, pathToRepos) => {
            chai.expect(name).to.equal('test');
            chai.expect(branch).to.equal(cli._rc);
            chai.expect(pathToRepos).to.equal('testPath');
            done();
         });
         stubClone = sinon.stub(cli, 'cloneRepToStore').callsFake((name) => {
            chai.expect(name).to.equal('test');
            return Promise.resolve('testPath')
         });
         cli.initRepStore('test');
      });
      it('initRepStore', (done) => {
         stubCheckout = sinon.stub(cli, 'checkout').callsFake((name, branch, pathToRepos) => {
            chai.expect(branch).to.equal('19.999/test');
            done();
         });
         stubClone = sinon.stub(cli, 'cloneRepToStore').callsFake((name) => {
            return Promise.resolve()
         });
         let stubArgv = sinon.stub(cli, '_argvOptions').value({test: '19.999/test'});
         cli.initRepStore('test');
         stubArgv.restore();
      });
      it('initRepStore', (done) => {
         stubClone = sinon.stub(cli, 'copyRepToStore').callsFake((path) => {
            chai.expect(path).to.equal('pathToTest');
            done();
         });
         let stubArgv = sinon.stub(cli, '_argvOptions').value({test: 'pathToTest'});
         let stubfs = sinon.stub(fs, 'existsSync').callsFake(() => {
            return true;
         });

         cli.initRepStore('test');

         stubArgv.restore();
         stubfs.restore();
      });

      afterEach(() => {
         stubCheckout.restore();
         stubClone.restore();
      });
   });
   describe('.copyRepToStore()', () => {
      it('should copy rep', (done) => {
         let stubfs = sinon.stub(fs, 'ensureSymlink').callsFake((from, to) => {
            chai.expect(from).to.equal('pathToTest');
            chai.expect(to).to.equal(path.join('store', '_repos', 'test'));
            done();
            return Promise.resolve();
         });

         cli.copyRepToStore('pathToTest', 'test');

         stubfs.restore();
      });

      it('should throw error if copy is failed', (done) => {
         let stubfs = sinon.stub(fs, 'ensureSymlink').callsFake((from, to) => {
            return Promise.reject();
         });

         cli.copyRepToStore('pathToTest', 'test').catch(() => {
            done();
         });

         stubfs.restore();
      });
   });
   describe('.cloneRepToStore()', () => {
      let stubRepos, stubExecute;
      beforeEach(() => {
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {
               url: 'test@test.git'
            }
         });
      });

      it('cloneRepToStore', (done) => {
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            chai.expect(cmd).to.equal('git clone test@test.git test');
            done();
            return Promise.resolve();
         });

         cli.cloneRepToStore('test');

         stubfs.restore();
      });

      it('cloneRepToStore2', (done) => {
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            return Promise.reject();
         });

         cli.cloneRepToStore('pathToTest', 'test').catch(() => {
            done();
         });
      });

      afterEach(() => {
         stubExecute.restore();
         stubRepos.restore();
      })
   });

   describe('.checkout()', () => {
      let stubExecute, stubModule;

      it('should checkout branch', (done) => {
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            chai.expect(cmd).to.equal('git checkout branch');
            done();
            return Promise.resolve();
         });

         cli.checkout('name', 'branch', 'pathToRep');
      });

      it('should throw error if checkoutBranch is undefined', (done) => {
         cli.checkout('name').catch(() => {
            done();
         });
      });

      it('should merge branch with rc', (done) => {
         let commandsArray = [];
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            commandsArray.push(cmd);
            return Promise.resolve();
         });
         stubModule = sinon.stub(cli, '_testModule').value('test');
         cli.checkout('test', 'branch', 'pathToRep').then(() => {
            chai.expect(`git merge origin/${cli._rc}`).to.equal(commandsArray[1]);
            done();
         });
      });

      it('should throw error if merge is failed', (done) => {
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            if (cmd.includes('merge')) {
               return Promise.reject();
            } else {
               return Promise.resolve();
            }
         });
         stubModule = sinon.stub(cli, '_testModule').value('test');
         cli.checkout('test', 'branch', 'pathToRep').catch(() => {
            done();
         });
      });

      it('should throw error if checkout is failed', (done) => {
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            if (cmd.includes('checkout')) {
               return Promise.reject();
            } else {
               return Promise.resolve();
            }
         });
         stubModule = sinon.stub(cli, '_testModule').value('test');
         cli.checkout('test', 'branch', 'pathToRep').catch(() => {
            done();
         });
      });


      afterEach(() => {
         stubExecute.restore();
         stubModule && stubModule.restore();
      });
   });

   describe('.initWorkDir()', () => {
      let stubBuilderConfig, stubExecute, stubCopyUnit, stubLinkFolder;
      beforeEach(()=> {
         stubBuilderConfig = sinon.stub(cli, '_makeBuilderConfig').callsFake(() => {
            return Promise.resolve();
         });
         stubExecute = sinon.stub(cli, '_execute').callsFake(() => {
            return Promise.resolve();
         });
      });
      it('should copy unit test', (done) => {
         stubLinkFolder = sinon.stub(cli, '_linkFolder').callsFake(() => {});
         stubCopyUnit = sinon.stub(cli, '_copyUnit').callsFake(() => {
            done();
         });
         cli.initWorkDir();
      });
      it('should copy folder', (done) => {
         stubLinkFolder = sinon.stub(cli, '_linkFolder').callsFake(() => {
            done();
         });
         stubCopyUnit = sinon.stub(cli, '_copyUnit').callsFake(() => {});
         cli.initWorkDir();
      });
      it('should throw error when copy folder is failed', (done) => {
         stubLinkFolder = sinon.stub(cli, '_linkFolder').callsFake(() => {
            return Promise.reject();
         });
         stubCopyUnit = sinon.stub(cli, '_copyUnit').callsFake(() => {});
         cli.initWorkDir().catch(() => {
            done();
         });
      });
      afterEach(() => {
         stubBuilderConfig.restore();
         stubExecute.restore();
         stubCopyUnit.restore();
         stubLinkFolder.restore();
      });
   });

   describe('.startTest()', () => {
      let stubmakeTestConfig, stubtslibInstall, stubstartBrowserTest, stubtestList, stubExecute;
      beforeEach(() => {
         stubmakeTestConfig = sinon.stub(cli, '_makeTestConfig').callsFake(() => {
            return Promise.resolve();
         });
         stubtslibInstall = sinon.stub(cli, '_tslibInstall').callsFake(() => {
            return Promise.resolve();
         });
         stubstartBrowserTest = sinon.stub(cli, '_startBrowserTest').callsFake(() => {
            return Promise.resolve();
         });
         stubtestList = sinon.stub(cli, '_testList').value(['engine']);
      });
      it('should start test', (done) => {
         let commandsArray = [];
         stubExecute = sinon.stub(cli, '_execute').callsFake((cmd) => {
            commandsArray.push(cmd);
            chai.expect(commandsArray).to.includes('node node_modules/saby-units/cli.js --isolated --report --config="./testConfig_engine.json"');

            return Promise.resolve();
         });
         cli.startTest().then(() => {
            done();
         });
      });

      afterEach(() => {
         stubmakeTestConfig.restore();
         stubtslibInstall.restore();
         stubstartBrowserTest.restore();
         stubtestList.restore();
         stubExecute && stubExecute.restore();
      });
   });

   describe('.initStore()', () => {
      let stubmkdirs, stubRemove, stubRepos, stubExistsSync, initRepStore, stubCopy;
      beforeEach(() => {

      });
      it('should remove work dirs', (done) => {
         let removeArray = [];
         stubmkdirs = sinon.stub(fs, 'mkdirs').callsFake((path) => {
         });
         stubRemove = sinon.stub(fs, 'remove').callsFake((path) => {
            removeArray.push(path);
         });
         stubRepos = sinon.stub(cli, '_repos').value({});
         cli.initStore().then(() => {
            chai.expect(removeArray).to.includes('builder-ui');
            chai.expect(removeArray).to.includes('store');
            chai.expect(removeArray).to.includes('application');
            done();
         });
      });
      it('should make store dir', (done) => {
         let makeDir;
         stubmkdirs = sinon.stub(fs, 'mkdirs').callsFake((path) => {
            makeDir = path;
         });
         stubRemove = sinon.stub(fs, 'remove').callsFake((path) => {
         });
         stubRepos = sinon.stub(cli, '_repos').value({});
         cli.initStore().then(() => {
            chai.expect(makeDir).to.equal(path.join('store', '_repos'));
            done();
         });
      });

      it('should not init store if it exists', (done) => {
         let makeDir;
         stubmkdirs = sinon.stub(fs, 'mkdirs').callsFake((path) => {
         });
         stubRemove = sinon.stub(fs, 'remove').callsFake((path) => {
         });
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {}
         });
         stubExistsSync = sinon.stub(fs, 'existsSync').callsFake((path) => {
            return true;
         });
         initRepStore = sinon.stub(cli, 'initRepStore').callsFake((path) => {
            throw new Error();
         });
         cli.initStore().then(() => {
            done();
         });
      });

      it('should init store', (done) => {
         let makeDir;
         stubmkdirs = sinon.stub(fs, 'mkdirs').callsFake((path) => {
         });
         stubRemove = sinon.stub(fs, 'remove').callsFake((path) => {
         });
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {}
         });
         stubExistsSync = sinon.stub(fs, 'existsSync').callsFake((path) => {
            return false;
         });
         stubCopy = sinon.stub(cli, 'copy').callsFake(() => {
         });
         initRepStore = sinon.stub(cli, 'initRepStore').callsFake((name) => {
            chai.expect(name).to.equal('test');
            done();
            return Promise.resolve();
         });
         cli.initStore();
      });

      it('should copy to store', (done) => {
         let makeDir;
         stubmkdirs = sinon.stub(fs, 'mkdirs').callsFake((path) => {
         });
         stubRemove = sinon.stub(fs, 'remove').callsFake((path) => {
         });
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {}
         });
         stubExistsSync = sinon.stub(fs, 'existsSync').callsFake((path) => {
            return false;
         });
         stubCopy = sinon.stub(cli, 'copy').callsFake((name) => {
            chai.expect(name).to.equal('test');
            done();
         });
         initRepStore = sinon.stub(cli, 'initRepStore').callsFake((name) => {
            return Promise.resolve();
         });
         cli.initStore();
      });

      it('should thorw error when remove failed', (done) => {
         let makeDir;
         stubRemove = sinon.stub(fs, 'remove').callsFake((path) => {
            return Promise.reject();
         });
         cli.initStore().catch(() => {
            done();
         });
      });

      afterEach(() => {
         stubmkdirs && stubmkdirs.restore();
         stubRemove && stubRemove.restore();
         stubRepos && stubRepos.restore();
         stubExistsSync && stubExistsSync.restore();
         initRepStore && initRepStore.restore();
         stubCopy && stubCopy.restore();
      });
   });

   describe('.copy()', () => {
      let stubRepos, stubModulesByRep, stubmkDir, stubensureSymlink;
      it('should create dir in store', (done) => {
         let mkdir;
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {}
         });
         stubModulesByRep = sinon.stub(cli, '_getModulesByRepName').callsFake((path) => {
            return [];
         });
         stubmkDir = sinon.stub(fs, 'mkdirs').callsFake((path) => {
            mkdir = path;
         });
         cli.copy('test').then(() => {
            chai.expect(mkdir).to.equal(path.join('store', 'test'));
            done()
         });
      });

      it('should copy test modules', (done) => {
         let from, to;
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {
               test: 'unit'
            }
         });
         stubModulesByRep = sinon.stub(cli, '_getModulesByRepName').callsFake(() => []);
         stubmkDir = sinon.stub(fs, 'mkdirs').callsFake(() => {});
         stubensureSymlink = sinon.stub(fs, 'ensureSymlink').callsFake((f,t) => {
            from = f;
            to = t;
         });
         cli.copy('test').then(() => {
            chai.expect(from).to.equal(path.join('store', '_repos', 'test', 'unit'));
            chai.expect(to).to.equal(path.join('store', 'test', 'test_test'));
            done()
         });
      });

      it('should save unit modules', (done) => {
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {
               test: 'unit'
            }
         });
         stubModulesByRep = sinon.stub(cli, '_getModulesByRepName').callsFake(() => ['unit']);
         stubmkDir = sinon.stub(fs, 'mkdirs').callsFake(() => {});
         stubensureSymlink = sinon.stub(fs, 'ensureSymlink').callsFake(() => {});
         cli.copy('test').then(() => {
            chai.expect(cli._unitModules).to.deep.equal([path.join('store','_repos','test','unit')]);
            done();
         });
      });

      it('should copy modules', (done) => {
         let from, to;
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {}
         });
         stubModulesByRep = sinon.stub(cli, '_getModulesByRepName').callsFake(() => ['app']);
         stubmkDir = sinon.stub(fs, 'mkdirs').callsFake(() => {});
         stubensureSymlink = sinon.stub(fs, 'ensureSymlink').callsFake((f,t) => {
            from = f;
            to = t;
            return Promise.resolve();
         });
         cli.copy('test').then(() => {
            chai.expect(from).to.equal(path.join('store', '_repos', 'test', 'app'));
            chai.expect(to).to.equal(path.join('store', 'test', 'module', 'app'));
            done();
         });
      });

      it('should throw error when copy modules is failed', (done) => {
         let from, to;
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {}
         });
         stubModulesByRep = sinon.stub(cli, '_getModulesByRepName').callsFake(() => ['app']);
         stubmkDir = sinon.stub(fs, 'mkdirs').callsFake(() => {});
         stubensureSymlink = sinon.stub(fs, 'ensureSymlink').callsFake((f,t) => {
            return Promise.reject();
         });
         cli.copy('test').catch(() => {
            done();
         });
      });

      afterEach(() => {
         stubRepos.restore();
         stubModulesByRep.restore();
         stubmkDir.restore();
         stubensureSymlink && stubensureSymlink.restore();
      });
   });

   describe('._linkFolder()', () => {
      let stubRepos, stubEnsureSymlink;
      beforeEach(() => {
         stubRepos = sinon.stub(cli, '_repos').value({
            test: {
               linkFolders: {
                  "/" : "cdn"
               }
            }
         });
      });
      it('should copy folder from config', (done) => {
         let from, to;
         stubEnsureSymlink = sinon.stub(fs, 'ensureSymlink').callsFake((f,t) => {
            from = f;
            to = t;
            return Promise.resolve();
         });
         cli._linkFolder().then(() => {
            chai.expect(from).to.equal(path.join('store', '_repos', 'test', '/'));
            chai.expect(to).to.equal(path.join('application', 'cdn'));
            done();
         });
      });
      afterEach(() => {
         stubRepos.restore();
         stubEnsureSymlink.restore();
      });
   });

   describe('.run()', () => {
      let stubInitStore, stubInitWorkDir, stubStartTest, stubClose;
      it('should run test', (done) => {
         let i=0;
         stubInitStore = sinon.stub(cli, 'initStore').callsFake(() => {
            i++;
            return Promise.resolve();
         });
         stubInitWorkDir = sinon.stub(cli, 'initWorkDir').callsFake(() => {
            i++;
            return Promise.resolve();
         });
         stubStartTest = sinon.stub(cli, 'startTest').callsFake(() => {
            i++;
            return Promise.resolve();
         });
         cli.run().then(() => {
            chai.expect(i).to.equal(3);
            done();
         });
      });

      it('should close process after error', (done) => {
         stubInitStore = sinon.stub(cli, 'initStore').callsFake(() => {
            return Promise.reject();
         });
         stubClose = sinon.stub(cli, '_closeChildProcess').callsFake(() => {
            done();
         });
         cli.run().catch(() => {});
      });

      it('should throw error when process close with error', (done) => {
         stubInitStore = sinon.stub(cli, 'initStore').callsFake(() => {
            return Promise.reject();
         });
         stubClose = sinon.stub(cli, '_closeChildProcess').callsFake(() => {});
         cli.run().catch(() => {
            done();
         });
      });

      afterEach(() => {
         stubInitStore.restore();
         stubInitWorkDir && stubInitWorkDir.restore();
         stubStartTest && stubStartTest.restore();
         stubClose && stubClose.restore();
      });
   });
   describe('._tslibInstall()', () => {
      let stubExecute;
      it('should copy ts config', (done) => {
         let cmd;
         stubExecute = sinon.stub(cli, '_execute').callsFake((c) => {
            cmd = c;
            return Promise.resolve();
         });
         cli._tslibInstall().then(() => {
            chai.expect(cmd).to.equal('node node_modules/saby-typescript/install.js --tslib=application/WS.Core/ext/tslib.js');
            done();
         });
      });

      afterEach(() => {
         stubExecute.restore();
      })
   });
});