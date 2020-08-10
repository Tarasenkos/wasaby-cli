const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const Base = require('./base');
const Sdk = require('./util/sdk');
const Project = require('./xml/project');

const builderConfigName = 'builderConfig.json';
const builderBaseConfig = '../builderConfig.base.json';
const RELEASE_FLAGS = {
   minimize: true,
   wml: true,
   customPack: true,
   dependenciesGraph: true
};

/**
 * Класс отвечающий за сборку ресурсов для тестов
 * @author Ганшин Я.О
 */

class Build extends Base {
   constructor(cfg) {
      super({ ...cfg, ...{ reBuildMap: true } });
      this._store = cfg.store;
      this._rc = cfg.rc;
      this._reposConfig = cfg.reposConfig;
      this._buildTools = cfg.buildTools;
      this._buildRelease = cfg.release;
      this._resources = cfg.resources;
      this._workDir = cfg.workDir;
      this._builderCache = cfg.builderCache;
      this._workspace = cfg.workspace;
      this._projectPath = cfg.projectPath;
      this._pathToJinnee = cfg.pathToJinnee;
      this._watcher = cfg.watcher;
      this._copyResources = cfg.copy;
      this._builderCfg = path.join(process.cwd(), 'builderConfig.json');
      if (cfg.builderBaseConfig) {
         this._builderBaseConfig = path.relative(__dirname, path.join(process.cwd(), cfg.builderBaseConfig));
      } else {
         this._builderBaseConfig = builderBaseConfig;
      }
   }

   /**
    * Запускает сборку стенда
    * @return {Promise<void>}
    */
   async _run() {
      try {
         logger.log('Подготовка тестов');

         await this._tslibInstall();
         if (this._buildTools === 'builder') {
            await this._initWithBuilder();
         } else {
            await this._initWithJinnee();
         }
         await this._linkCDN();
         logger.log('Подготовка тестов завершена успешно');
      } catch (e) {
         e.message = `Сборка ресурсов завершена с ошибкой: ${e.message}`;
         throw e;
      }
   }

   /**
    * Сборка ресурсов через билдер
    * @param {String} builderOutput Папка в которую складыватся результат работы билдера
    * @returns {Promise<void>}
    * @private
    */
   async _initWithBuilder(builderOutput) {
      const gulpPath = require.resolve('gulp/bin/gulp.js');
      const builderPath = require.resolve('sbis3-builder/gulpfile.js');
      const build = this._watcher ? 'buildOnChangeWatcher' : 'build';
      await this._makeBuilderConfig(builderOutput);
      await this._shell.execute(
         `node ${gulpPath} --gulpfile=${builderPath} ${build} --config=${this._builderCfg}`,
         process.cwd(), {
            name: 'builder',
            errorLabel: '[ERROR]'
         }
      );
   }

   /**
    * Запускает сборку джином
    * @returns {Promise<void>}
    * @private
    */
   async _initWithJinnee() {
      const logs = path.join(this._workDir, 'logs');
      const sdk = new Sdk({
         rc: this._rc,
         workspace: this._workspace,
         pathToJinnee: this._pathToJinnee
      });

      const project = new Project({
         file: this._projectPath,
         modulesMap: this._modulesMap,
         workDir: this._workDir,
         builderCache: this._builderCache
      });

      await project.prepare();

      await sdk.jinneeDeploy(await project.getDeploy(), logs, project.file);
   }

   /**
    * Копирует tslib
    * @private
    */
   async _tslibInstall() {
      const wsCore = this._modulesMap.get('WS.Core');

      // If there is no WS.Core in the project therefore nothing to install
      if (!wsCore) {
         return;
      }

      const wsTslib = path.join(wsCore.path, 'ext', 'tslib.js');
      const tsLib = require.resolve('saby-typescript/tslib.js');
      logger.log(tsLib, 'tslib_path');
      try {
         await fs.symlink(tsLib, wsTslib);
      } catch (e) {
         logger.error(`Ошбка копирования tslib: ${e}`);
      }
   }

   /**
    * Создает симлинки на cdn ресурсы
    * @return {Promise<void>}
    * @private
    */
   _linkCDN() {
      const promises = [];
      this._modulesMap.getCDNModules().forEach((name) => {
         const cfg = this._modulesMap.get(name);
         const pathLink = path.join(this._resources, 'cdn', name);
         promises.push(fs.copy(cfg.path, pathLink).catch((e) => {
            logger.error(`Ошибка копирования модуля ${name}:  ${e}`);
         }));
      });
      return Promise.all(promises);
   }

   /**
    * Создает конфиг для билдера
    * @return {Promise<void>}
    * @private
    */
   _makeBuilderConfig(output) {
      let builderConfig = require(this._builderBaseConfig);
      const testList = this._modulesMap.getRequiredModules();

      this._modulesMap.getChildModules(testList).forEach((moduleName) => {
         const cfg = this._modulesMap.get(moduleName);
         const isNameInConfig = builderConfig.modules.find(item => (item.name === moduleName));
         if (!isNameInConfig) {
            builderConfig.modules.push({
               name: moduleName,
               path: cfg.path,
               required: cfg.required
            });
         }
      });

      builderConfig = this._buildRelease ? { ...builderConfig, ...RELEASE_FLAGS } : builderConfig;
      builderConfig.output = output || this._resources;
      builderConfig.symlinks = !this._copyResources;

      builderConfig.logs = path.join(this._workDir, 'logs');

      return fs.outputFile(`./${builderConfigName}`, JSON.stringify(builderConfig, null, 4));
   }
}

module.exports = Build;
