const express = require('express');
const { getUserContracts } = require('../Controller/ContractsController');
const Router = express.Router();


Router.post('/contracts',getUserContracts );

module.exports = Router;


