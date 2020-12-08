const net = require('net');

const MIN_PORT = 1024;
const MAX_PORT = 65536;
const MAX_ATTEMPT = 666;

/**
 * Поиск свободного порта
 * @author Ганшин Я.О
 */

/**
 * Проверяет занят ли порт
 * @param {Number} port
 * @returns {Promise<Number>}
 */
const checkPort = function(port) {
   return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => {
         resolve(false);
      });
      server.listen(port, () => {
         server.close(() => {
            resolve(true);
         });
      });
   });
};

const randomPort = () => {
   let randomNumber = Math.ceil(Math.random() * 100000);

   if (randomNumber > MAX_PORT) {
      randomNumber = Math.ceil(randomNumber / 2);
   }

   if (randomNumber < MIN_PORT) {
      randomNumber = randomNumber + MIN_PORT;
   }

   return randomNumber;
}

/**
 * Возвращает свободный порт
 * @returns {Promise<Number>}
 */
module.exports = async function getPort() {
   for (let attempt = 0; attempt <= MAX_ATTEMPT; attempt++) {
      const port = randomPort();

      if (await checkPort(port)) {
         return port;
      }
   }

   throw new Error('Нет свободных портов');
};
