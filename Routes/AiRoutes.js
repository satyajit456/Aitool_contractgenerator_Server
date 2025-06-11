const express = require('express');
const { prompGenerate } = require('../Controller/PromptController');
const Router = express.Router();




Router.post('/generate',prompGenerate );


module.exports = Router;