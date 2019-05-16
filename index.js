const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv')
  .config();
const config = require('./config');
const app = express();
const server = require('http').createServer(app);
const routes = require('./routes');
app.use(helmet());
app.use(bodyParser.urlencoded({
  limit: '50mb',
  extended: true
}));
app.use(bodyParser.json({
  limit: '50mb'
}));
app.use(morgan('tiny'));

const siteURL = process.env.SITE_URL || 'http://localhost:3000';
const apiURL = process.env.API_URL || 'http://localhost:8000';
const whitelist = [siteURL, apiURL, 'http://localhost:3000'];
const corsOptionsDelegate = (req, callback) => {
  req.url = req.url.replace(/\/\//, '/');
  req.path = req.path.replace(/\/\//, '/');
  req.originalUrl = req.originalUrl.replace(/\/\//, '/');
  let corsOptions;
  if (whitelist.indexOf(req.header('Origin')) !== -1) {
    corsOptions = {
      origin: true
    }; // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = {
      origin: false
    }; // disable CORS for this request
  }
  callback(null, corsOptions); // callback expects two parameters: error and options
};

app.use(cors(corsOptionsDelegate), (req, res, next) => {
  next();
});

app.use('/', routes);

server.listen(config.server.port, () => {
  console.log('Drive Server');
});

module.exports = app;
