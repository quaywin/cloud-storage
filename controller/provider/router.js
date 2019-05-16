const requestIp = require('request-ip');
const ipaddr = require('ipaddr.js');
const Router = require('express')
  .Router;
const router = new Router();

const GoogleService = require('../../service/provider/googledrive.js');
const OneDriveService = require('../../service/provider/onedrive.js');
const Controller = require('./controller');
const googleService = new GoogleService();
const oneDriveService = new OneDriveService();

router.param('providerId', (req, res, next, id) => {
  switch (id) {
    case 'google':
      req.service = googleService;
      break;
    case 'onedrive':
      req.service = oneDriveService;
      break;
    default:
      break;
  }
  next();
});

router.route('/*')
  .get((req, res, next) => {
    let ip = requestIp.getClientIp(req);
    ip = ipaddr.process(ip)
      .toString();
    if (ip === '::1') {
      ip = '127.0.0.1';
    }
    const id = req.query.id;
    const path = req.query.path;
    const code = req.query.code;
    const host = `${req.protocol}://${req.get('host')}`;
    req.data = {
      ip,
      id,
      path,
      code,
      host
    };
    next();
  });

router.route('/:providerId')
  .get((req, res) => {
    Controller.storeToken(req, (error, data) => {
      if (error) {
        res.status(500)
          .json({
            message: error.toString()
          });
      } else {
        const dataResponse = `
            <html><body>
              <a href="${req.data.host}/v1/provider/${req.params.providerId}/files">Show Root ${req.data.host}/v1/provider/${req.params.providerId}/files</a>
            <script>
            let success = ${data};
            window.parent.opener.postMessage({
                loginSuccess: true
            }, '*');
            setTimeout(function() {
              window.close();
            }, 200);

            </script></body></html>`;
        res.writeHead(200, {
          'Content-Type': 'text/html'
        });
        res.end(dataResponse);
      }
    });
  });

router.route('/:providerId/authorize')
  .get((req, res) => {
    Controller.authorize(req, (error, data) => {
      if (error) {
        res.status(500)
          .json({
            message: error.toString()
          });
      } else {
        res.status(200)
          .json(data);
      }
    });
  });

router.route('/:providerId/files')
  .get((req, res) => {
    Controller.getListFiles(req, (error, data) => {
      if (error) {
        res.status(500)
          .json({
            message: error.toString()
          });
      } else {
        res.status(200)
          .json({
            files: data
          });
      }
    });
  });

router.route('/:providerId/thumbnail')
  .get((req, res) => {
    Controller.getThumbnail(req, (error, data) => {
      if (error) {
        res.status(500)
          .json({
            message: error.toString()
          });
      } else {
        res.writeHead(200, {
          'Content-Type': 'image/png'
        });
        res.end(data, 'binary');
      }
    });
  });

router.route('/*')
  .post((req, res, next) => {
    let ip = requestIp.getClientIp(req);
    ip = ipaddr.process(ip)
      .toString();
    if (ip === '::1') {
      ip = '127.0.0.1';
    }
    const id = req.body.id;
    const path = req.body.path;
    const dest = req.body.dest;
    const source = req.body.source;
    const name = req.body.name;
    req.data = {
      ip: ip,
      id: id,
      path: path,
      dest: dest,
      source: source,
      name: name
    };
    next();
  });

router.route('/:providerId/download')
  .post((req, res) => {
    Controller.download(req, (error, data) => {
      if (error) {
        res.status(500)
          .json({
            success: false,
            message: error.toString()
          });
      } else {
        res.status(200)
          .json(data);
      }
    });
  });

router.route('/:providerId/upload')
  .post((req, res) => {
    Controller.upload(req, (error, data) => {
      if (error) {
        res.status(500)
          .json({
            success: false,
            message: error.toString()
          });
      } else {
        res.status(200)
          .json(data);
      }
    });
  });

module.exports = router;
