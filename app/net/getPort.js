const net = require('net');

const MAX_ATTEMPT = 666;

const busyPorts = new Set();

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
   return 40000 + Math.ceil(Math.random() * 10000);
};

/**
 * Возвращает свободный порт
 * @returns {Promise<Number>}
 */
module.exports = async function getPort(userPort) {
   if (userPort && !busyPorts.has(userPort) && await checkPort(userPort)) {
      busyPorts.add(userPort);

      return userPort;
   }

   for (let attempt = 0; attempt <= MAX_ATTEMPT; attempt++) {
      const port = randomPort();

      if (!busyPorts.has(port) && await checkPort(port)) {
         busyPorts.add(port);

         return port;
      }
   }

   throw new Error('Нет свободных портов');
};
