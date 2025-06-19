const express = require('express');
const Router = express.Router();
const multer = require('multer');
const { redirectionController, sendToWesignature, sendToWefile, navlinkController, sendToSaveTemplate } = require('../Controller/FilemanageController');


// Use memory storage to avoid saving the file on disk
const storage = multer.memoryStorage();
const upload = multer({ storage });

Router.route('/redirect_to_ai').get(redirectionController).post(redirectionController);
Router.get('/navlinks', navlinkController);
Router.post('/send_to_wesignature', upload.single('file'),sendToWesignature);
Router.post('/send_to_wefile', upload.single('file'),sendToWefile);
Router.post('/send_to_savetemplate', upload.single('file'),sendToSaveTemplate);


module.exports = Router;


