const fs = require('fs');
const {google} = require('googleapis');
const _path = require('path');
const _ = require('lodash');
const Datastore = require('nedb');
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.appdata'];

const rootPath = _path.join(__dirname, '/../..');
const db = new Datastore({
  filename: _path.join(rootPath, '/data/google_drive_db.db'),
  autoload: true
});

const ProviderInterface = require('./interface.js');

function formatFile(files) {
  const listData = [];
  for (const key in files) {
    const element = files[key];
    const mimeType = element.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file';
    const data = {
      id: element.id,
      name: element.name,
      mimeType: mimeType,
      modifiedTime: element.modifiedTime,
      size: element.size,
      thumbnailLink: element.thumbnailLink
    };
    listData.push(data);
  }
  return listData;
}

class GoogleDriver extends ProviderInterface {
  constructor() {
    super();
    this.o2C = this.oauth2Client();
  }
  oauth2Client() {
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const domain = process.env.DOMAIN || 'http://localhost:8000';
    const redirectUrl = `${domain}${process.env.GOOGLE_REDIRECT}`;
    return new google.auth.OAuth2(clientId, clientSecret, redirectUrl);
  }

  authorize(ip, callback) {
    this.refreshToken.call(this, ip, () => {
      const authUrl = this.o2C.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
      });

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
    db.findOne({
      ip: ip
    }, (err, doc) => {
      if (err) {
        callback(err);
      } else if (doc) {
        this.o2C.refreshToken(doc.token.refresh_token).then((data) => {
          const dataStore = {
            ip: ip,
            token: {
              ...doc.token,
              ...data.tokens
            }
          };
          db.update({
            _id: doc._id
          }, dataStore, {}, (errorUpdate) => {
            if (errorUpdate) {
              callback();
            } else {
              callback();
            }
          });
        });
      } else {
        callback();
      }
    });
  }

  storeToken(ip, code, callback) {
    this.o2C.getToken(code, (err, token) => {
      if (err) {
        callback(err);
      } else if (!token) {
        callback(null, false);
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
                callback(null, true);
              }
            });
          }
        });
      }
    });
  }

  listFiles(req, callback) {
    const ip = req.data.ip;
    const id = req.data.id || 'root';
    this.refreshToken(ip, () => {
      db.findOne({
        ip: ip
      }, (err, doc) => {
        if (err) {
          callback(err);
        } else if (doc) {
          this.o2C.setCredentials(doc.token)
          const service = google.drive({
            version: 'v3',
            auth: this.o2C
          });
          service.files.list({
            pageSize: 100,
            q: `'${id}' in parents and 'me' in owners`,
            fields: 'files(id, name, size, kind, modifiedTime, thumbnailLink, webViewLink, iconLink, ownedByMe, parents, mimeType)'
          }, (err, response) => {
            if (err) {
              callback(`The API returned an error: ${err}`);
            } else {
              const files = response.data.files;
              if (files.length === 0) {
                callback('No files found.');
              } else {
                callback(null, formatFile(files));
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

  downloadFile(req, callback) {
    const ip = req.data.ip;
    const id = req.data.id;
    const _dest = req.data.dest;

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
              this.o2C.setCredentials(doc.token)
              const service = google.drive({
                version: 'v3',
                auth: this.o2C
              });
              try {
                const dest = fs.createWriteStream(_dest);
                const _param = {
                  fileId: id,
                  alt: 'media'
                };
                service.files.get(_param)
                  .on('end', () => {
                    callback(null, {
                      status: true
                    });
                  })
                  .on('error', (err) => {
                    callback('Error during download', err);
                  })
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
          this.o2C.setCredentials(doc.token);
          const service = google.drive({
            version: 'v3',
            auth: this.o2C
          });
          try {
            fs.open(_source, 'r', (error) => {
              if (err) {
                callback(error);
              } else {
                const dest = fs.createReadStream(_source);
                const media = {
                  body: dest
                };
                const fileMetadata = {
                  name: name,
                  parents: [id]
                };
                service.files.create({
                  resource: fileMetadata,
                  media: media,
                  fields: 'id'
                }, (err, file) => {
                  if (err) {
                    callback(err);
                  } else {
                    callback(null, {
                      status: true
                    });
                  }
                });
              }
            });
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

module.exports = GoogleDriver;
