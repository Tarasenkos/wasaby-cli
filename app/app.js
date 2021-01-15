/* global requirejs */
/* eslint-disable no-console */
const isolated = require('saby-units/lib/isolated.js');
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const serveStatic = require('serve-static');
const getPort = require('./net/getPort');
const path = require('path');

const global = (function() {
   // eslint-disable-next-line no-eval
   return this || (0, eval)('this');
})();
const resourceRoot = '/';

/**
 * Запускает сервер приложения
 * @param {String} resources Путь до ресурсов
 * @param {Number} port Порт на котором будет запущен сервер
 * @param {Object} config Конфиг приложения
 */

async function run(resources, port, config) {
   const app = express();
   const availablePort = await getPort(port || 1024);
   const workDir = process.cwd();
   process.chdir(resources);

   app.use(bodyParser.json());
   app.use(cookieParser());
   app.use('/', serveStatic('./'));
   app.listen(availablePort);

   let requirejs = isolated.prepareTestEnvironment(
       '',
       undefined,
       false,
       undefined,
       false
   );

   global.require = requirejs;
   console.log('start init');

   const ready = new Promise((resolve, reject) => {
      requirejs(['Env/Env', 'Application/Initializer', 'SbisEnv/PresentationService', 'Application/State', 'Core/core-init', 'UI/State'], function(Env, AppInit, PS,  AppState, CoreInit, UIState) {
         Env.constants.resourceRoot = resourceRoot;
         Env.constants.modules = requirejs('json!/contents').modules;

         if (!AppInit.isInit()) {
            // eslint-disable-next-line new-cap
            AppInit.default({ resourceRoot }, new PS.default({ resourceRoot }), new AppState.StateReceiver(UIState.Serializer));
         }

         console.log(`server started http://localhost:${availablePort}`);
         resolve();
      }, function(err) {
         console.error(err);
         console.error('core init failed');
         reject(err);
      });
   });

   if (config && config.expressRoute) {
      Object.keys(config.expressRoute).forEach((route) => {
         let module = require(path.join(path.relative(__dirname, workDir), config.expressRoute[route]));
         app.use(route, module);
      });
   }

   /* server side render */
   /** Костлище решается в задаче https://online.sbis.ru/opendoc.html?guid=c3b9523f-1ea2-4dc8-aa03-27dd82e77a2d */
   app.get('/ParametersWebAPI/Scope.js', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end("define('ParametersWebAPI/Scope', [], function(){})\n");
   });

   app.get('/*', (req, res) => {
      ready.then(() => {
         serverSideRender(req, res);
      });
   });
}


function serverSideRender(req, res) {
   req.compatible = false;

   if (!process.domain) {
      process.domain = {
         enter: () => undefined,
         exit: () => undefined
      };
   }

   process.domain.req = req;
   process.domain.res = res;

   const AppInit = requirejs('Application/Initializer');
   const UIBase = requirejs('UI/Base');
   const AppState = requirejs('Application/State');
   const UIState = requirejs('UI/State');
   AppInit.startRequest(undefined, new AppState.StateReceiver(UIState.Serializer));

   const sabyRouter = requirejs('Router/ServerRouting');
   const moduleName = sabyRouter.getAppName(req);

   try {
      if (typeof requirejs(moduleName) === 'undefined') {
         throw new Error();
      }
   } catch (e) {
      res.status(404).end(JSON.stringify(e, null, 2));

      return;
   }

   const rendering = UIBase.BaseRoute({
      lite: true,
      wsRoot: '/WS.Core/',
      resourceRoot,
      application: moduleName,
      appRoot: '/',
      _options: {
         preInitScript: 'window.wsConfig.debug = true;window.wsConfig.userConfigSupport = false;'
      }
   });

   Promise.resolve(rendering).then((html) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
   }).catch((e) => {
      res.status(500).end(JSON.stringify(e, null, 2));
   });
   setDebugCookie(req, res);
}

function setDebugCookie(req, res) {
   if (req.cookies.s3debug === undefined) {
      res.cookie('s3debug', true, { maxAge: 900000, httpOnly: true });
      console.log('cookie s3debug created successfully');
   }
}

module.exports = {
   run: run
};
