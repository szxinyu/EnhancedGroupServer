var express = require('express');
var mysql = require("../models/mysqlCommands.js");
var wxRequests = require("../models/wxRequests.js");
var util = require("../models/util.js");
var router = express.Router();

function checkUserToken(uid, token, callback){
	var sql = 'select uid from users where uid = ? and token=?';
	mysql.query(sql, [uid, token], function(err, result){
			callback(result && result.length >= 0)
	});
}

/* GET users listing. */
router.get('/', function(req, res) {
  res.send('respond with a resource');
});



/* 创建新用户 */
router.post('/login', function(req, res) {
  var content = req.body;
	var code = content.code;
	var uname = content.uname || '';
	var avatar_url = content.avatarUrl || '';
	var nickname = content.nickName || '';
	var phone = content.phone || '';
	var remarks = content.remarks || '';
	if(code){
		
		wxRequests.getUserOpenId(code, function(open_id){
			//console.log('getUserOpenId ', 'code: ', code, 'openId: ', open_id);
		
			var randomStr = util.getRandomString(32); //token
			var sql = `
			insert into 
				users (uid, avatar_url, uname, nickname, phone, open_id, create_time, remarks, state, token) 
			value
				(NULL, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 1, ?)
			on duplicate key update
				nickname=?, avatar_url=?, token=?`;
			mysql.query(sql, [avatar_url, uname, nickname, phone, open_id, remarks, randomStr, nickname, avatar_url, randomStr], 
				function(err, result){//result: {"fieldCount":0,"affectedRows":1,"insertId":10000,"serverStatus":2,"warningCount":0,"message":"","protocol41":true,"changedRows":0}
				//console.log(result);
				var gIdx = result.insertId;
				var sampleUser = {
					uid: gIdx,
					token: randomStr
				};
				if(gIdx){
					sampleUser = JSON.stringify(sampleUser)
					res.send(sampleUser);
				}else{
					
					var sql2 = 'select * from users where open_id = ?';
					mysql.query(sql2, [open_id], function(err, result){
						//console.log(result);
						if(result.length > 0){
							sampleUser = {
								uid: result[0].uid,
								token: result[0].token
							};
							sampleUser = JSON.stringify(sampleUser)
							res.send(sampleUser);
						}else{
							res.send('error creating new user: ' + err);
						}
					});
					
				}
			});
		});
		
	}else{
		res.send('error request');
	}
});


router.post('/sendGroupMsg', function(req, res) {
  var content = req.body;
	var type = content.type; //类型，1=文 2=图 3=贴
	var msgContent = content.content || '';
	var uid = content.uid || '';
	var gid = content.gid || '';
	var token = content.token || '';
	
	if(gid && uid){
		checkUserToken(uid, token, function(){
			msgContent = JSON.stringify(msgContent);
			var sql = 'insert into messages (type, content, create_time, state, gid, uid) value (?, ?, CURRENT_TIMESTAMP, 1, ?, ?)';
			
			console.log(sql)
			mysql.query(sql, [type, msgContent, gid, uid], function(err, result){
				if(result){
					res.send('200');
				}else{
					res.send('error getting group members: ' + err);
				}
			});
		});
	}else{
		res.send('error request');
	}
});


router.post('/uploadFormIdList', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var token = content.token || '';
	var formIds = content.formIds || [];
	var idLength = formIds.length;
	if(uid && idLength > 0){
		checkUserToken(uid, token, function(){
			
			var strVal = '';
			for (var i = 0; i < idLength; i++){
				var formId = formIds[i];
				if(formId.indexOf('the formId is a mock one') == -1){ //开发测试时，模拟机生产的formId为 'the formId is a mock one'
					strVal += uid + ',"' + formId + '", CURRENT_TIMESTAMP';
				}
			}
			
			if(strVal != ''){
				var sql = 'insert into user_form_ids (uid, form_id, create_time) values (' + strVal + ')';
				
				console.log(sql)
				mysql.query(sql, function(err, result){
					if(result){
						res.send('200');
					}else{
						res.send('error upload formId list: ' + err);
					}
				});
			}else{
				res.send('error request on development environment'); //开发测试时，产生的formId无效，因此不会被记录
			}
			
		});
	}else{
		res.send('error request');
	}
});

module.exports = router;
