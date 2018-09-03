var mysql = require('mysql');     //引入mysql模块
var connection = mysql.createConnection({      //创建mysql实例
    host:'127.0.0.1',
    port:'3306',
    user:'root',
    password:'Mingyou2018@',
    database:'test_server'
});

connection.connect();

module.exports = connection;