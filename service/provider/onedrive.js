const fs = require('fs');
const _path = require('path');
const _ = require('lodash');
const request = require('request');
const Datastore = require('nedb');
const oneDriveAPI = require('onedrive-api');

const rootPath = _path.join(__dirname, '/../..');

const SCOPES = 'onedrive.readwrite wl.signin wl.offline_access';

const db = new Datastore({
  filename: _path.join(rootPath, '/data/onedrive_db.db'),
  autoload: true
});

const ProviderInterface = require('./interface.js');

function formatFile(files) {
  const listData = [];
  for (const key in files) {
    const element = files[key];
    const mimeType = element.folder ? 'folder' : 'file';
    const data = {
      id: element.id,
      name: element.name,
      mimeType: mimeType,
      modifiedTime: element.lastModifiedDateTime,
      size: element.size
    };
    listData.push(data);
  }
  return listData;
}

class OneDriveService extends ProviderInterface {

  initOneDrive() {
    const clientId = process.env.ONEDRIVE_APP_KEY;
    const scopes = SCOPES;
    const domain = process.env.DOMAIN || 'http://localhost:8000';
    const redirectUrl = `${domain}${process.env.ONEDRIVE_REDIRECT}`;
    const secret = process.env.ONEDRIVE_SECRET;
    return {
      clientId: clientId,
      secret: secret,
      scopes: scopes,
      redirectUri: redirectUrl
    };
  }

  constructor() {
    super();
    this.oneDriveCLient = this.initOneDrive();
  }

  authorize(ip, callback) {
    this.refreshToken(ip, () => {
      const authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${this.oneDriveCLient.clientId}&redirect_uri=${this.oneDriveCLient.redirectUri}&response_type=code&scope=${this.oneDriveCLient.scopes}`;
      db.findOne({
        ip: ip
      }, (err, doc) => {
        if (err) {
          callback(err);
        } else if (doc) {
          callback(null, {
            status: true,
            authUrl: authUrl
          });
        } else {
          callback(null, {
            status: false,
            authUrl: authUrl
          });
        }
      });
    });
  }

  refreshToken(ip, callback) {
    const self = this;
    db.findOne({
      ip: ip
    }, (err, doc) => {
      if (err) {
        callback(err);
      } else if (doc) {
        request.post('https://login.live.com/oauth20_token.srf', {
          form: {
            refresh_token: doc.token.refresh_token,
            client_id: self.oneDriveCLient.clientId,
            client_secret: self.oneDriveCLient.secret,
            grant_type: 'refresh_token',
            redirect_uri: self.oneDriveCLient.redirectUri
          }
        }, (error, res, body) => {
          const newToken = JSON.parse(body);
          if (error || (newToken && newToken.error)) {
            db.remove({
              _id: doc._id
            }, {
              multi: true
            }, (deleteError) => {
              callback();
            });
          } else {
            const dataStore = {
              token: {
                ...doc.token,
                ...newToken
              }
            };
            db.update({
              _id: doc._id
            }, {
              $set: dataStore
            }, {}, (errorUpdate) => {
              if (errorUpdate) {
                callback();
              } else {
                callback();
              }
            });
          }
        });
      } else {
        callback();
      }
    });
  }

  storeToken(ip, code, callback) {
    request.post('https://login.live.com/oauth20_token.srf', {
      form: {
        code: code,
        client_id: this.oneDriveCLient.clientId,
        client_secret: this.oneDriveCLient.secret,
        grant_type: 'authorization_code',
        redirect_uri: this.oneDriveCLient.redirectUri
      }
    }, (error, res, body) => {
      const token = JSON.parse(body);
      if (error || !token || (token && token.error)) {
        callback(null, false, 'redirect');
      } else {
        const dataStore = {
          ip: ip,
          token: token
        };
        db.findOne({
          ip: ip
        }, (err, doc) => {
          if (err) {
            callback(err);
          } else {
            db.update({
              _id: doc ? doc._id : null
            }, dataStore, {
              upsert: true
            }, (error) => {
              if (error) {
                callback(error);
              } else {
                callback(null, true, 'redirect');
              }
            });
          }
        });
      }
    });
  }

  listFiles(req, callback) {
    const ip = req.data.ip;
    const id = req.data.id;
    const _param = {};

    if (id) {
      _param.itemId = id;
    } else {
      _param.rootItemId = 'root';
    }

    this.refreshToken(ip, () => {
      db.findOne({
        ip: ip
      }, (err, doc) => {
        if (err) {
          callback(err);
        } else if (doc) {
          _param.accessToken = doc.token.access_token;
          oneDriveAPI.items.listChildren(_param)
            .then((response) => {
              const files = response.value;
              if (files.length === 0) {
                callback('No files found.');
              } else {
                callback(null, formatFile(files));
              }
            })
            .catch((err) => {
              callback(`The API returned an error: ${err}`);
            });

        } else {
          callback(null, {
            status: false
          });
        }
      });
    });
  }

  downloadFile(req, callback) {
    const ip = req.data.ip;
    const id = req.data.id;
    const _dest = req.data.dest;

    function callbackRequest(error, res, body) {
      if (error) {
        callback('Error during download');
      } else {
        callback(null, {
          status: true
        });
      }
    }

    this.refreshToken(ip, () => {
      db.findOne({
        ip: ip
      }, (err, doc) => {
        if (err) {
          callback(err);
        } else if (doc) {
          const folder = _.initial(_dest.split('/'))
            .join('/');
          fs.access(folder, fs.W_OK, (err) => {
            if (err) {
              callback('Can\'t not save to this folder');
            } else {
              try {
                const dest = fs.createWriteStream(_dest);
                const options = {
                  method: 'GET',
                  uri: `https://api.onedrive.com/v1.0/drive/items/${id}/content`,
                  headers: {
                    Authorization: `Bearer ${doc.token.access_token}`
                  }
                };
                request(options, callbackRequest)
                  .pipe(dest);

              } catch (error) {
                callback(error);
              }
            }
          });
        } else {
          callback(null, {
            status: false
          });
        }
      });
    });

  }

  uploadFile(req, callback) {
    const ip = req.data.ip;
    const id = req.data.id;
    const _source = req.data.source;
    const name = req.data.name;

    this.refreshToken(ip, () => {
      db.findOne({
        ip: ip
      }, (err, doc) => {
        if (err) {
          callback(err);
        } else if (doc) {
          try {
            if (fs.existsSync(_source)) {
              const dest = fs.createReadStream(_source);
              const _param = {
                accessToken: doc.token.access_token,
                filename: name,
                readableStream: dest,
                parentId: id
              };
              oneDriveAPI.items.uploadSimple(_param)
                .then((item) => {
                  callback(null, {
                    status: true
                  });
                })
                .catch((err) => {
                  callback(err);
                });
            } else {
              callback('Can not find file path');
            }
          } catch (error) {
            callback(error);
          }

        } else {
          callback(null, {
            status: false
          });
        }
      });
    });
  }
}

module.exports = OneDriveService;
