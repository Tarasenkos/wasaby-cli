const logger = require('./util/logger');
const ModulesMap = require('./util/modulesMap');
const xml = require('./xml/xml');
const Git = require('./util/git');

const fs = require('fs-extra');
const path = require('path');
const pMap = require('p-map');
const Base = require('./base');
const getPort = require('./net/getPort');
const fsUtil = require('./util/fs');

const BROWSER_SUFFIX = '_browser';
const NODE_SUFFIX = '_node';
const PARALLEL_TEST_COUNT = 2;
const TEST_TIMEOUT = 60 * 5 * 1000;
const REPORT_PATH = '{workspace}/artifacts/{module}/xunit-report.xml';
const _private = {

   /**
    * Возвращает шаблон xml файла
    * @returns {{testsuite: {$: {failures: string, tests: string, name: string, errors: string}, testcase: []}}}
    */
   getReportTemplate: () => ({
      testsuite: {
         $: {
            errors: '0',
            failures: '0',
            name: 'Mocha Tests',
            tests: '1'
         },
         testcase: []
      }
   }),

   /**
    * Возвращает шаблон тескейса c ошибкой для xml
    * @param {String} testName Название теста
    * @param {String} details Детализация ошибки
    * @returns {{$: {classname: string, name: string, time: string}, failure: *}}
    */
   getErrorTestCase: (testName, details) => ({
      $: {
         classname: `[${testName}]: Test runtime error`,
         name: 'Some test has not been run, see details',
         time: '0'
      },
      failure: details
   }),

   /**
    * Возвращает шаблон тескейса для xml
    * @param {String} testName Название теста
    * @returns {{$: {classname: string, name: string}}}
    */
   getSuccessTestCase: testName => ({
      $: {
         classname: `[${testName}]: Tests has not been run`,
         name: 'Tests has not been run, because can\'t found any changes in modules'
      }
   }),

   /**
    * Возвращает путь до конфига юнит тестов
    * @param {String} repName Название репозитрия
    * @param {Boolean} isBrowser - Юниты в браузере
    * @returns {string}
    * @private
    */
   getPathToTestConfig: (repName, isBrowser) => {
      const browser = isBrowser ? '_browser' : '';
      return fsUtil.relative(
         process.cwd(),
         path.normalize(path.join(__dirname, '..', `testConfig_${repName}${browser}.json`))
      );
   }
};

/**
 * Кслас запускающий юнит тестирование
 * @class Test
 * @author Ганшин Я.О
 */
class Test extends Base {
   constructor(cfg) {
      super(cfg);
      this._testReports = new Map();
      this._resources = cfg.resources;
      this._reposConfig = cfg.reposConfig;
      this._workspace = cfg.workspace || cfg.workDir;
      this._testErrors = {};
      this._rc = cfg.rc;
      this._server = cfg.server;
      this._testRep = cfg.testRep;
      this._isUseDiff = cfg.diff;
      this._coverage = cfg.coverage;
      this._realResources = cfg.realResources;
      this._ignoreLeaks = !cfg.checkLeaks;
      this._report = cfg.report || 'xml';
      this._only = cfg.only;
      this._testOnlyNode = cfg.node;
      this._workDir = cfg.workDir;
      this._testOnlyBrowser = cfg.browser || cfg.server;
      this._modulesMap = new ModulesMap({
         reposConfig: cfg.reposConfig,
         store: cfg.store,
         testRep: cfg.testRep,
         workDir: cfg.workDir,
         only: cfg.only
      });
      this._diff = new Map();
      this._portMap = new Map();
      if (this._report === 'console') {
         logger.silent();
      }
   }

   /**
    * Дописывает в отчеты название репозитория
    */
   prepareReport() {
      let promisArray = [];

      logger.log('Подготовка отчетов');
      this._testReports.forEach((filePath, name) => {
         if (fs.existsSync(filePath)) {
            let errorText = '';
            if (this._testErrors[name]) {
               errorText = this._testErrors[name].join('<br/>');
            }
            let readPromise = xml.readXmlFile(filePath).then((xmlObject) => {
               let result = xmlObject;
               if (result.testsuite && result.testsuite.testcase) {
                  result.testsuite.testcase.forEach((item) => {
                     item.$.classname = `[${name}]: ${item.$.classname}`;
                  });
               } else {
                  result = {
                     $: { errors: '0' },
                     testsuite: {
                        testcase: []
                     }
                  };
               }

               // этим ошибкам верить нельзя, добавляем только если нет упавших юнитов
               if (errorText && xmlObject.testsuite.$.tests === '1') {
                  result.testsuite.testcase.push(_private.getErrorTestCase(name, errorText));
               }

               xml.writeXmlFile(filePath, result);
            }).catch(error => logger.error(error));

            promisArray.push(readPromise);
         }
      });
      return Promise.all(promisArray);
   }

   /**
    * Проверяет наличие отчетов по юнит тестам, если какого-то отчета нет кидает ошибку
    */
   checkReport() {
      let error = [];

      logger.log('Проверка существования отчетов');
      this._testReports.forEach((pathToReport, name) => {
         if (!fs.existsSync(pathToReport)) {
            error.push(name);
            xml.writeXmlFile(pathToReport, _private.getReportTemplate());
         }
      });
      if (error.length > 0) {
         logger.error(`Сгенерированы отчеты с ошибками: ${error.join(', ')}`);
      }
      logger.log('Проверка пройдена успешно');
   }

   /**
    * Возвращает конфиг юнит тестов на основе базового testConfig.base.json
    * @param {String} name - Название репозитория
    * @param {String} suffix - browser/node
    * @param {Array<String>} testModules - модули с юнит тестами
    * @private
    */
   async _getTestConfig(name, suffix, testModules) {
      const testConfig = require('../testConfig.base.json');
      let cfg = { ...testConfig };
      const fullName = name + (suffix || '');
      let workspace = fsUtil.relative(process.cwd(), this._workspace);
      const testModulesArray = testModules instanceof Array ? testModules : [testModules];
      workspace = workspace || '.';
      cfg.url = { ...cfg.url };
      cfg.url.port = await getPort();
      this._portMap.set(name, cfg.url.port);
      cfg.tests = testModulesArray;
      cfg.root = fsUtil.relative(process.cwd(), this._resources);
      cfg.htmlCoverageReport = cfg.htmlCoverageReport.replace('{module}', fullName).replace('{workspace}', workspace);
      cfg.jsonCoverageReport = cfg.jsonCoverageReport.replace('{module}', fullName).replace('{workspace}', workspace);
      cfg.report = this.getReportPath(fullName);
      cfg.ignoreLeaks = this._ignoreLeaks;
      cfg.nyc = {
         'include': [],
         'reportDir': path.dirname(cfg.jsonCoverageReport),
         'cwd': this._workDir
      };
      let nycPath = path.relative(this._workDir, this._realResources || 'build-ui/resources');
      testModulesArray.forEach((testModuleName) => {
         const moduleCfg = this._modulesMap.get(testModuleName);
         if (moduleCfg && moduleCfg.depends) {
            moduleCfg.depends.forEach((dependModuleName) => {
               cfg.nyc.include.push(path.join(nycPath, dependModuleName, '**', '*.js'));
            });
         }
      });
      if (await fs.exists(cfg.report)) {
         await fs.remove(cfg.report);
      }
      this._testReports.set(fullName, cfg.report);
      return cfg;
   }

   /**
    * Возвращает путь до конфига
    * @param {string} fullName - название модуля с тестами
    * @returns {string}
    */
   getReportPath(fullName) {
      const workspace = fsUtil.relative(process.cwd(), this._workspace);
      return REPORT_PATH.replace('{module}', fullName)
         .replace('{workspace}', workspace || '.');
   }

   /**
    * Проверят надо ли запускать юнит тесты по модулю
    * @param {String} moduleName Название модуля
    * @returns {Boolean}
    * @private
    */
   _shouldTestModule(moduleName) {
      const modulesCfg = this._modulesMap.get(moduleName);

      if (this._diff.has(modulesCfg.rep)) {
         const diff = this._diff.get(modulesCfg.rep);

         return diff.some(filePath => filePath.includes(moduleName + path.sep));
      }

      return true;
   }

   /**
    * Создает файл с конфигом для запуска юнит тестов
    * @param params - параметры для запуска юнит тестов
    * @returns {Promise<void>}
    * @private
    */
   async _makeTestConfig(params) {
      const cfg = await this._getTestConfig(
         params.name,
         params.isBrowser ? BROWSER_SUFFIX : NODE_SUFFIX,
         params.testModules
      );
      await fs.outputFile(
         params.path,
         JSON.stringify(cfg, null, 4)
      );
   }

   /**
    * Запускает юнит тесты
    * @returns {Promise<[]>}
    * @private
    */
   _startTest() {
      if (this._only) {
         // если тесты запускаются только по одному репозиторию то не разделяем их по модулям
         logger.log('Запуск тестов', this._testRep);
         return Promise.all([
            this._startNodeTest(this._testRep, this._modulesMap.getTestList()),
            this._startBrowserTest(this._testRep, this._modulesMap.getTestList())
         ]);
      }

      return pMap(this._modulesMap.getTestList(), (moduleName) => {
         if (this._shouldTestModule(moduleName)) {
            logger.log('Запуск тестов', moduleName);
            return Promise.all([
               this._startNodeTest(moduleName),
               this._startBrowserTest(moduleName)
            ]);
         }

         this._createSuccessReport(moduleName);
         logger.log('Тесты не были запущены т.к. нет изменений в модуле', moduleName);

         return undefined;
      }, {
         concurrency: PARALLEL_TEST_COUNT
      });
   }

   /**
    * Создает отчет
    * @param {String} moduleName Название модуля с тестами
    * @private
    */
   _createSuccessReport(moduleName) {
      const report = _private.getReportTemplate();
      report.testsuite.testcase.push(_private.getSuccessTestCase(moduleName));
      xml.writeXmlFile(this.getReportPath(moduleName), report);
   }

   /**
    * Запускает юниты под нодой
    * @param {String} name - Название модуля
    * @param {Array<String>} testModules - Модули с тестами
    * @return {Promise<void>}
    * @private
    */
   async _startNodeTest(name, testModules) {
      if (!this._testOnlyBrowser) {
         try {
            const pathToConfig = _private.getPathToTestConfig(name, false);

            await this._makeTestConfig({
               name: name,
               testModules: testModules || name,
               path: pathToConfig,
               isBrowser: false
            });

            const coverage = this._coverage ? '--coverage' : '';
            const report = this._report === 'xml' ? '--report' : '';
            const unitsPath = require.resolve('saby-units/cli.js');
            let args = [unitsPath, '--isolated', coverage, report, `--config=${pathToConfig}`];
            await this._shell.spawn(
               'node',
               args,
               {
                  processName: `test node ${name}`,
                  timeout: TEST_TIMEOUT,
                  silent: this._report === 'console',
                  stdio: this._report === 'console' ? 'inherit' : 'pipe'
               }
            );
         } catch (e) {
            this._testErrors[name + NODE_SUFFIX] = e;
         }
      }
   }

   /**
    * Запускает тесты в браузере
    * @param {String} name - Название модуля с тестами либо репозиторий
    * @param {Array<String>} testModules - Модули с тестами
    * @return {Promise<void>}
    * @private
    */
   async _startBrowserTest(name, testModules) {
      const moduleCfg = this._modulesMap.get(name);
      if (
         !this._testOnlyNode &&
            (
               (moduleCfg && moduleCfg.testInBrowser) ||
               !moduleCfg ||
               this._testOnlyBrowser
            )
      ) {
         const configPath = _private.getPathToTestConfig(name, true);
         const coverage = this._coverage ? ' --coverage' : '';
         logger.log('Запуск тестов в браузере', name);

         await this._makeTestConfig({
            name: name,
            testModules: testModules || name,
            path: configPath,
            isBrowser: true
         });

         if (this._server) {

            await Promise.all([
               this._executeBrowserTestCmd(
                  `node ${require.resolve('saby-units/cli/server.js')} --config=${configPath}`,
                  name,
                  configPath,
                  0
               ),
               this._openBrowser(name)
            ]);
         } else {
            await this._executeBrowserTestCmd(
               `node ${require.resolve('saby-units//cli.js')} --browser${coverage} --report --config=${configPath}`,
               name,
               configPath,
               TEST_TIMEOUT
            );
         }

         logger.log('тесты в браузере завершены', name);
      }
   }

   /**
    * Открывает браузер
    * @param {String} moduleName - Название модуля
    * @returns {Promise<any>}
    * @private
    */
   _openBrowser(moduleName) {
      const url = `http://localhost:${this._portMap.get(moduleName)}`;
      const start = process.platform === 'win32' ? 'start' : 'xdg-open';
      return this._shell.execute(start + ' ' + url, process.cwd());
   }

   /**
    *
    * @param {String} cmd - shell команда которую надо выполнить
    * @param {String} moduleName - Название модуля
    * @param {String} configPath - Путь до конфига
    * @param {Number} timeout - таймаут для выполнения тестов
    * @returns {Promise<void>}
    * @private
    */
   async _executeBrowserTestCmd(cmd, moduleName, configPath, timeout) {
      try {
         await this._shell.execute(
            cmd,
            process.cwd(),
            {
               processName: `test browser ${moduleName}`,
               timeout: timeout
            }
         );
      } catch (errors) {
         if (errors.some(error => (error.includes('EADDRINUSE') || error.includes('ECHROMEDRIVER')))) {
            logger.log('Ошибка окружения, повторный запуск тестов', moduleName);
            await this._executeBrowserTestCmd(cmd, moduleName, configPath);
         } else {
            this._testErrors[moduleName + BROWSER_SUFFIX] = errors;
         }
      }
   }

   /**
    * Запускает тестирование
    * @return {Promise<void>}
    */
   async _run() {
      try {
         logger.log('Запуск тестов');
         await this._modulesMap.build();
         await this._setDiff();
         await this._startTest();
         if (!this._server && this._report === 'xml') {
            await this.checkReport();
            await this.prepareReport();
         }
         logger.log('Тестирование завершено');
      } catch (e) {
         e.message = `Тестирование завершено с ошибкой ${e}`;
         throw e;
      }
   }

   /**
    * Проверяет diff в репозитории для запуска тестов только по измененным модулям
    * @returns {Promise<[]>}
    * @private
    */
   _setDiff() {
      const result = [];
      if (this._isUseDiff) {
         for (const name of this._testRep) {
            if (name !== 'all') {
               result.push(this._setDiffByRep(name));
            }
         }
      }
      return Promise.all(result);
   }

   /**
    * Заполняет diff по репозиторию
    * @param repName Название репозитория
    * @returns {Promise<void>}
    * @private
    */
   async _setDiffByRep(repName) {
      const git = new Git({
         path: this._modulesMap.getRepositoryPath(repName),
         name: repName
      });
      const branch = await git.getBranch();
      if (this._rc && branch !== this._rc) {
         this._diff.set(repName, await git.diff(branch, this._rc));
      }
   }
}

module.exports = Test;
