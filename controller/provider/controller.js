class ProviderController {

  static authorize(req, callback) {
    req.service.authorize(req.data.ip, callback);
  }

  static getListFiles(req, callback) {
    req.service.listFiles(req, callback);
  }

  static storeToken(req, callback) {
    req.service.storeToken(req.data.ip, req.data.code, callback);
  }

  static getThumbnail(req, callback) {
    req.service.getThumbnail(req, callback);
  }

  static download(req, callback) {
    req.service.downloadFile(req, callback);
  }

  static upload(req, callback) {
    req.service.uploadFile(req, callback);
  }

}

module.exports = ProviderController;
