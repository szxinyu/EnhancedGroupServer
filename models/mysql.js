var mysql = require('mysql');     //引入mysql模块
var connection = mysql.createConnection({      //创建mysql实例
    host:'ynlndshxcjhn.mysql.sae.sina.com.cn',
    port:'10114',
    user:'root',
    //password:'Mingyou2018@',
    password:'Aa123456',
    database:'test_server'
});

connection.connect();

module.exports = connection;