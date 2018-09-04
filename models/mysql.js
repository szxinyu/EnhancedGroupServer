var config = require("../config.js");
var mysql = require('mysql');
var connection = mysql.createConnection({
		host: config.DB_HOST,
		port:config.DB_PORT,
    user:'root',
    password:'Aa123456',
    database:'test_server'
});

connection.connect();

module.exports = connection;