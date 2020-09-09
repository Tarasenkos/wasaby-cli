const fs = require('fs-extra');
const path = require('path');
const Base = require('./base');
const logger = require('./util/logger');
const BASE_CONFIG = require.resolve('saby-typescript/configs/es5.dev.json');

const TS_CONFIG_TEMPLATE = require('../resources/tsconfig.template.json');
const TSCONFIG_PATH = path.join(process.cwd(), 'tsconfig.json');

/**
 * Класс отвечающий за генерацию tsconfig
 * @author Ганшин Я.О
 */

class Prepare extends Base {
   constructor(cfg) {
      super(cfg);
      this._tsconfig = cfg.tsconfig || BASE_CONFIG;
   }

   async _run() {
      await this.makeTsConfig();
      await this.tsInstall();
   }

   /**
    * Создает tsconfig
    * @returns {Promise<void>}
    */
   async makeTsConfig() {
      const config = { ...TS_CONFIG_TEMPLATE };

      config.extends = `.${path.sep}` + path.relative(process.cwd(), this._tsconfig);
      config.compilerOptions.paths = await this._getPaths();
      config.exclude = this._getExclude();

      Prepare.writeConfig(config);
   }

   /**
    * Копирует tslib в Core
    * @returns {Promise<*>}
    */
   async tsInstall() {
      const wsCore = this._modulesMap.get('WS.Core');
      const wsTslib = path.join(wsCore.path, 'ext', 'tslib.js');
      const tsPath = require.resolve('saby-typescript/cli/install.js');

      return this._shell.execute(
         `node ${tsPath} --tslib=${wsTslib} --tsconfig=skip`,
         process.cwd(), {
            force: true,
            name: 'typescriptInstall'
         }
      );
   }


   /**
    * Возвращает пути до модулей
    * @returns {Promise<*>}
    * @private
    */
   async _getPaths() {
      const testList = this._modulesMap.getRequiredModules();
      const paths = {};
      this._modulesMap.getChildModules(testList).forEach((moduleName) => {
         const relativePath = this._getRelativePath(moduleName);
         if (relativePath !== moduleName) {
            paths[moduleName + '/*'] = [relativePath + '/*'];
         }
      });

      const configPaths = await this._getPathsFromConfig(this._tsconfig);
      Object.keys(configPaths).forEach((name) => {
         configPaths[name] = configPaths[name].map((pathFromConfig) => {
            let splitedPath = pathFromConfig.split('/');
            if (this._modulesMap.has(splitedPath[0])) {
               splitedPath = [this._getRelativePath(splitedPath[0])].concat(splitedPath);
            }
            return splitedPath.join('/');
         });
         paths[name] = configPaths[name];
      });

      return paths;
   }

   /**
    * Возвращет относительный путь до модуля в формате unix
    * @param {String} moduleName Название модуля
    * @returns {String}
    * @private
    */
   _getRelativePath(moduleName) {
      const cfg = this._modulesMap.get(moduleName);
      if (cfg !== undefined) {
         return `.${path.sep}` + path.relative(process.cwd(), cfg.path);
      }
   }

   /**
    * Возвращает секцию exclude
    * @returns {string[]}
    * @private
    */
   _getExclude() {
      return [path.relative(process.cwd(), this._options.resources), this._options.builderCache];
   }

   /**
    * Возвращает секцию paths из базового конфига
    * @param pathToConfig
    * @returns {Promise<*>}
    * @private
    */
   async _getPathsFromConfig(pathToConfig) {
      const config = await fs.readJSON(pathToConfig);
      let result = {};

      if (config.compilerOptions && config.compilerOptions.paths) {
         result = config.compilerOptions.paths;
      }

      if (config.extends) {
         result = {...result, ...this._getPathsFromConfig(path.join(process.cwd(), config.extends))};
      }

      return result;
   }

   /**
    * Сохраняет конфиг
    * @param {Object} config
    * @returns {Promise<void>}
    * @private
    */
   static async writeConfig(config) {
      if (!fs.existsSync(TSCONFIG_PATH)) {
         await fs.writeJSON(TSCONFIG_PATH, config, { spaces: 4, EOL: '\n' });
      } else {
         logger.log('tsconfig уже существует');
      }
   }
}

module.exports = Prepare;
