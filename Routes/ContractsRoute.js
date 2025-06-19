const express = require('express');
const { getUserContracts, WesignatureRedirectLink } = require('../Controller/ContractsController');
const Router = express.Router();


Router.post('/contracts/:user_id',getUserContracts );
Router.post('/getContracts', WesignatureRedirectLink);

module.exports = Router;


