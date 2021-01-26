const path = require('path');
const fs = require('fs-extra');

const CONFIG = path.normalize(path.join(__dirname, '../../config.json'));
const WASABYCLI = 'wasaby-cli.json';
const isUrl = /(git|ssh|https?|git@[-\w.]+):/;

/**
 * Модуль для работы с конфигом test-cli
 * @author Ганшин Я.О
 */


/**
 * Возвращает конфиг
 * @param {Object} argvOptions Параметры из командной строки
 * return Object
 */
function get(argvOptions = {}) {
   const packageConfig = getPackageConfig(process.cwd());
   const config = fs.readJSONSync(CONFIG);

   config.rc = getVersion();
   prepareReposUrl(config, argvOptions.protocol, argvOptions.gitMirror || config.gitMirror);
   setRepPathFromArgv(config, argvOptions);

   if (packageConfig.name !== 'wasaby-cli') {
      if (packageConfig.devDependencies) {
         for (const name of Object.keys(packageConfig.devDependencies)) {
            if (config.repositories[name]) {
               config.repositories[name].path = path.join(process.cwd(), 'node_modules', name);
            }
         }
      }

      config.testRep = [packageConfig.name];
      if (!config.repositories.hasOwnProperty(packageConfig.name)) {
         config.repositories[packageConfig.name] = {};
      }
      config.repositories[packageConfig.name].skipStore = true;
      config.repositories[packageConfig.name].localeRep = true;
      config.repositories[packageConfig.name].path = process.cwd();
      const wsSection = packageConfig['wasaby-cli'] || {};
      wsSection.repositories = Object.assign(config.repositories, getRepsFromConfig(wsSection));
      Object.assign(config, wsSection);
   }

   const wasabyConfig = loadWasabyConfig();
   wasabyConfig.repositories = Object.assign(config.repositories, getRepsFromConfig(wasabyConfig));
   Object.assign(config, wasabyConfig);

   if (config.links) {
      Object.keys(config.links).forEach((name) => {

      });
   }

   return config;
}

/**
 * преобразует версию от npm к стандартной
 * @param {String} version
 * @return {*}
 */
function normalizeVersion(version) {
   const res = version.split('.');
   res.splice(-1, 1);
   return res.join('.');
}

/**
 * Возыращает версию rc ветки
 * @return {String}
 */
function getVersion() {
   const packageConfig = getPackageConfig(path.normalize(path.join(__dirname, '../..')));

   return `rc-${normalizeVersion(packageConfig.version)}`;
}

/**
 * Возвращает package.json
 * @param {String} pathToRep Путь до репозитория
 * return Object|undefined
 */
function getPackageConfig(pathToRep) {
   const configPath = path.join(pathToRep, 'package.json');
   if (fs.existsSync(configPath)) {
      return fs.readJSONSync(configPath);
   }
   return undefined;
}

/**
* возвращает объект с путями до репозитриев
* @param {Object} config Конфиг приложения
* @param {Object} argvOptions Параметры из командной строки
*/
function setRepPathFromArgv(config, argvOptions) {
   for (const name of Object.keys(config.repositories)) {
      if (argvOptions[name]) {
         let repPath = argvOptions[name];

         if (!path.isAbsolute(repPath)) {
            repPath = path.normalize(path.join(process.cwd(), repPath));
         }

         if (fs.existsSync(repPath)) {
            config.repositories[name].path = repPath;
         }
      }
   }
}

/**
 * Собирает ссылку на репозиторий в зависимости от протокола https или ssh
 * @param {Object} config Конфиг приложения
 * @param {String} protocol Протокол ssh или https
 * @param {String} gitMirror гит сервер по умолчанию
 */
function prepareReposUrl(config, protocol, gitMirror) {
   let suffix;
   let prefix;

   if (protocol === 'ssh') {
      prefix = 'git@';
      suffix = ':';
   } else {
      prefix = 'https://';
      suffix = '/';
   }

   for (let name of Object.keys(config.repositories)) {
      const cfg = config.repositories[name];
      cfg.url = `${prefix}${cfg.mirror || gitMirror}${suffix}${cfg.url}.git`;
   }
}

/**
 * Возвращает список репозиториев из package.json
 * @param {Object} wsSection секциия wasaby-cli из package.json
 * return Object
 */
function getRepsFromConfig(wsSection) {
   const result = {};

   if (wsSection.repositories) {
      Object.keys(wsSection.repositories).forEach((name) => {
         let link = wsSection.repositories[name];

         if (isUrl.test(link)) {
            link = link.split('#');
            result[name] = {
               url: link[0],
               version: link[1],
               load: true
            };
         } else {
            result[name] = {
               path: path.isAbsolute(link) ? link : path.normalize(path.join(process.cwd(), link)),
               skipStore: true
            };
         }
      });
   }

   return result;
}

function loadWasabyConfig() {
   const configPath = path.join(process.cwd(), WASABYCLI);
   if (fs.existsSync(configPath)) {
      return fs.readJSONSync(configPath);
   }
   return {};
}

module.exports = {
   get: get,
   getVersion: getVersion,
   getPackageConfig: getPackageConfig,
   getRepsFromConfig: getRepsFromConfig
};
