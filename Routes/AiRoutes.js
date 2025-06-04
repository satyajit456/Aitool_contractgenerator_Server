const express = require('express');
const {  prompGenerate } = require('../Controller/aiController');
const Router = express.Router();




Router.post('/generate',prompGenerate );


module.exports = Router;