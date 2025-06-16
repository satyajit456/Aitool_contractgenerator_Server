const express = require('express');
const Router = express.Router();
const multer = require('multer');
const { sendDocument, redirectionController } = require('../Controller/FilemanageController');


// Use memory storage to avoid saving the file on disk
const storage = multer.memoryStorage();
const upload = multer({ storage });

Router.route('/redirect_to_ai').get(redirectionController).post(redirectionController);
Router.post('/send-file', upload.single('pdf'),sendDocument);


module.exports = Router;


