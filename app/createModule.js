const fs = require('fs-extra');
const path = require('path');
const Base = require('./base');
const xml = require('./xml/xml');

const DEFAULT_MODULE = path.normalize(path.join(__dirname, '../resources/module.s3mod'));
const DEFAULT_DEPENDS = ['Controls', 'Types', 'Env']

/**
 * Класс для создания модуля s3mod
 * @class CreateModule
 * @author Ганшин Я.О
 */
class CreateModule extends Base {
   constructor(cfg) {
      super(cfg);
      let modulePath = cfg.path;
      if (!path.isAbsolute(modulePath)) {
         modulePath = path.normalize(path.join(process.cwd(), modulePath));
      }
      this._moduleName = path.basename(modulePath);
      this._modulePath = path.join(cfg.path, this._moduleName + '.s3mod');
   }

   async _run() {
      const module = await this._getModuleTemplate();
      const moduleDepends = {module: []};
      module.ui_module.depends = [moduleDepends];
      module.ui_module.$.id = CreateModule.createGuid();
      module.ui_module.$.name = this._moduleName;
      DEFAULT_DEPENDS.forEach(name => {
         const cfg = this._modulesMap.get(name);
         moduleDepends.module.push({
            $: {
               name: name,
               id: cfg.id
            }
         });
      });
      await xml.writeXmlFile(this._modulePath, module)
   }

   /**
    * Возвращает шаблон модуля
    * @returns {Promise<*>}
    * @private
    */
   _getModuleTemplate() {
      return xml.readXmlFile(DEFAULT_MODULE);
   }

   /**
    * Генерация Guid
    * @returns {string}
    */
   static createGuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
         // tslint:disable-next-line:no-bitwise
         const r = Math.random() * 16 | 0;
         // tslint:disable-next-line:no-bitwise
         const v = c === 'x' ? r : (r & 0x3 | 0x8);
         return v.toString(16);
      });
   }

}

module.exports = CreateModule;
