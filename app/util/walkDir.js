const fs = require('fs-extra');
const path = require('path');
const ENOENT = 'ENOENT';

/**
 * Рекурсивно обходит дректории исключая симлинки
 * @param {String} rootDir - Директория которую надо обойти
 * @param {Function} callback - Коллбек, вызывается для файлов
 * @param {Array} exclude - Пути которые надо исключить
 * @param currentDir {String}
 * @function walkDir
 * @author Ганшин Я.О
 */
function walkDir(rootDir, callback, exclude = [], currentDir = '') {
   const defCurrentDir = currentDir || rootDir;
   const relativePath = path.relative(rootDir, defCurrentDir);
   if (fs.existsSync(defCurrentDir)) {
      fs.readdirSync(defCurrentDir).forEach((file) => {
         // пропускаем скрытые файлы
         if (file[0] === '.') {
            return;
         }

         const fullPath = path.join(defCurrentDir, file);
         try {
            const lstat = fs.lstatSync(fullPath);
            if (!exclude.includes(fullPath)) {
               if (lstat.isDirectory()) {
                  walkDir(rootDir, callback, exclude, fullPath);
               } else {
                  callback(path.join(relativePath, file));
               }
            }
         } catch (error) {
            // игнорируем ошибки существования файла
            if (!String(error).includes(ENOENT)) {
               throw error;
            }
         }
      });
   }
}

module.exports = walkDir;
