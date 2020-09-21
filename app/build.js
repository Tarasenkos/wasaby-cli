const fs = require('fs-extra');
const path = require('path');
const logger = require('./util/logger');
const Base = require('./base');
const Sdk = require('./util/sdk');
const Project = require('./xml/project');
const walkDir = require('./util/walkDir');
const getPort = require('./net/getPort');

const BUILDER_CONFIG_NAME = 'builderConfig.json';
const BUILDER_BASE_CONFIG = '../builderConfig.base.json';
const HOT_RELOAD_SERVER = 'HotReload/eventStream/third-party/server';
const RELEASE_FLAGS = {
   minimize: true,
   wml: true,
   customPack: true,
   dependenciesGraph: true
};
const HOT_RELOAD_PORT = 10777;
/**
 * Класс отвечающий за сборку ресурсов для тестов
 * @author Ганшин Я.О
 */

class Build extends Base {
   constructor(cfg) {
      super({ ...cfg, ...{ reBuildMap: true } });
      this._store = cfg.store;
      this._builderCfg = path.join(process.cwd(), 'builderConfig.json');
      if (cfg.builderBaseConfig) {
         this._builderBaseConfig = path.relative(__dirname, path.join(process.cwd(), cfg.builderBaseConfig));
      } else {
         this._builderBaseConfig = BUILDER_BASE_CONFIG;
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
         if (this._options.buildTools === 'builder') {
            this._hotReloadPort = await getPort(HOT_RELOAD_PORT);
            await Promise.all([
               this._startHotReloadServer(),
               this._initWithBuilder()
            ]);
         } else {
            await this._initWithJinnee();
         }
         await this._linkCDN();
         logger.log('Подготовка тестов завершена успешно');
      } catch (e) {
         if (e.message) {
            e.message = `Сборка ресурсов завершена с ошибкой: ${e}`;
         } else {
            e = `Сборка ресурсов завершена с ошибкой: ${e}`;
         }
         throw e;
      }
   }

   /**
    * Сборка ресурсов через билдер
    * @returns {Promise<void>}
    * @private
    */
   async _initWithBuilder() {
      const gulpPath = require.resolve('gulp/bin/gulp.js');
      const builderPath = require.resolve('sbis3-builder/gulpfile.js');
      const build = this._options.watcher ? 'buildOnChangeWatcher' : 'build';
      await this._makeBuilderConfig();
      await this._shell.execute(
         `node ${gulpPath} --gulpfile=${builderPath} ${build} --config=${this._builderCfg}`,
         process.cwd(), {
            name: 'builder',
            errorLabel: '[ERROR]'
         }
      );
   }

   /**
    * Запускает сервер hot reload
    * @returns {Promise<void>}
    * @private
    */
   async _startHotReloadServer() {
      const hotReload = path.join(this._options.resources, HOT_RELOAD_SERVER);
      if (this._options.watcher && fs.existsSync(hotReload)) {
         logger.log('hot reload server started', 'hotReload');
         await this._shell.execute(
            `node ${hotReload} --port=${this._hotReloadPort}`,
            process.cwd(), {
               name: 'hotReload'
            }
         );
      }
   }

   /**
    * Запускает сборку джином
    * @returns {Promise<void>}
    * @private
    */
   async _initWithJinnee() {
      const logs = path.join(this._options.workDir, 'logs');
      const sdk = new Sdk({
         rc: this._options.rc,
         workspace: this._options.workspace,
         pathToJinnee: this._options.pathToJinnee
      });

      const project = new Project({
         file: this._options.projectPath,
         modulesMap: this._modulesMap,
         workDir: this._options.workDir,
         builderCache: this._options.builderCache
      });

      await project.prepare();

      await sdk.jinneeDeploy(await project.getDeploy(), logs, project.file);

      if (this._options.copy) {
         Build._copySymlincResources(this._options.resources);
      }
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
         logger.error(`Ошибка копирования tslib: ${e}`);
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
         const pathLink = path.join(this._options.resources, 'cdn', name);
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
   _makeBuilderConfig() {
      let builderConfig = require(this._builderBaseConfig);
      const testList = this._modulesMap.getRequiredModules();

      this._modulesMap.getChildModules(testList).forEach((moduleName) => {
         const cfg = this._modulesMap.get(moduleName);

         // TODO Удалить, довабил по ошибке https://online.sbis.ru/opendoc.html?guid=4c7b5d67-6afa-4222-b3cd-22b2e658b3a8
         if (cfg !== undefined) {
            const isNameInConfig = builderConfig.modules.find(item => (item.name === moduleName));
            if (!isNameInConfig) {
               builderConfig.modules.push({
                  name: moduleName,
                  path: cfg.path,
                  required: cfg.required
               });
            }
         }
      });

      builderConfig = this._options.release ? { ...builderConfig, ...RELEASE_FLAGS } : builderConfig;
      builderConfig.output = this._options.resources;
      builderConfig.symlinks = !this._options.copy;
      if (this._hotReloadPort) {
         builderConfig.staticServer = `localhost:${this._hotReloadPort}`;
      }
      builderConfig.logs = path.join(this._options.workDir, 'logs');

      return fs.outputFile(`./${BUILDER_CONFIG_NAME}`, JSON.stringify(builderConfig, null, 4));
   }

   static _copySymlincResources(resources) {
      walkDir(resources, (file) => {
         const fullPath = path.join(resources, file);
         const lstat = fs.lstatSync(fullPath);
         if (lstat.isSymbolicLink()) {
            const realpath = fs.realpathSync(fullPath);
            const stat = fs.statSync(fullPath);
            fs.unlinkSync(fullPath);
            fs.copySync(realpath, fullPath);
            if (stat.isDirectory()) {
               Build._copySymlincResources(resources);
            }
         }
      });
   }
}

module.exports = Build;
