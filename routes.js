const express = require('express');
const Router = express.Router;
const router = new Router();
const path = require('path');

const provider = require('./controller/provider/router');

router.route('/').get((req, res) => {
  res.json({ message: 'Welcome to storage cloud API!' });
});

router.use('/v1/provider', provider);
router.use('/documents', express.static(path.join(__dirname, 'documents')));
module.exports = router;
