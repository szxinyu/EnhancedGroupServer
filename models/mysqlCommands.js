var mysqlConnection = require('./mysql');     //引入mysql模块

var mysqlCommands = {
	query: function(sql, callback){
		mysqlConnection.query(sql, function (err, result) {
			if(err){
				console.log('[SELECT ERROR]:',err.message);
			}
			callback(err, result);
		});
	}
	
}

module.exports = mysqlCommands;
