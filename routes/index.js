var express = require('express');
var mysql = require("../models/mysqlCommands.js");
var wxRequests = require("../models/wxRequests.js");
var util = require("../models/util.js");
var router = express.Router();
var COS = require('cos-nodejs-sdk-v5');

var COS_APPID = 1254015132;//腾讯云的appid
var UNREAD_MSG_TEMPLATE_ID = 'UsHqvUs1ck00gbZTkWy5FSbb4L2qLXIJLPJ5Mi3imVo'; //未读回信提醒 	模板ID

var cos = new COS({
    SecretId: 'AKIDAEAylPAvqcEj5NTSHvQk7WlrnZDioHwQ',
    SecretKey: 'VFtPjWBgz75E2hGfy78zfAXmrksCVilh',
});

//检查用户的未读消息，推送模板消息
var unreadMsgTask = setInterval(function(){
	getUnreadMsg();
}, 10 * 1000); //10秒循环一次

//检查用户是否还有可用formId，以正常获取模板消息
var noMoreFormIdTask = setInterval(function(){
	checkAllUserFormIds();
}, 24 * 3600);//一天执行一次

function getUnreadMsg(){
	getAccessToken(function(access_token){
		var sql = `SELECT count(m.mid) as unread_count, 
									m.gid,u.uid as receiver_uid,
									m.content,
									u.open_id, 
									su.uid as sender_uid, 
									su.nickname as sender_name, 
									f.form_id, 
									max(m.create_time) as create_time 
								FROM group_last_read g
								LEFT JOIN messages m on (g.gid = m.gid and g.last_time < m.create_time)
								LEFT JOIN users u on g.uid = u.uid 
								LEFT JOIN users su on su.uid = m.uid 
								LEFT JOIN user_form_ids f on (u.uid = f.uid and TIMESTAMPADD(second,7 * 24 * 3600,f.create_time) > CURRENT_TIMESTAMP)
								WHERE su.uid != u.uid
								group by m.uid 
								order by m.gid, m.mid asc;`;
		// group by m.gid, m.uid 可以按照不同分组查看各个分组里用户的未读信息
		mysql.query(sql, function(err, result){
			//console.log('unread analysis: ', result);
			if(result && result.length > 0){
				var i = 0, len = result.length
				for(i = 0; i < len; i++){
					var unreadObj = result[i];
					
					(function(unreadObj){
						var receiverUid = unreadObj.receiver_uid;
						
						//检查是否要发送模板消息（是否已经在用户阅读前再次发送过）
						var sql2 = 'select * from template_msg where uid = ' + receiverUid;
						mysql.query(sql2, function(err, result2){
							if((result2 && result2.length > 0 && result2.readed) || //已经阅读过消息
								(!result2 || result2.length == 0) || //从未发送过模板消息
								( result2 && result2.length > 0 && !result2.resent && //已经发送过一次，还未再次发送
									((util.timeStamp(result2.create_time) + 24 * 3600) <= util.timeStamp()) ) //并且距离上次发送已经过去24小时，以免快速消耗formId
								){//发送
								
								//console.log('unread msg [' + i + ']: ', unreadObj);
								var unreadCount = unreadObj.unread_count;
								var userOpenId = unreadObj.open_id;
								var formId = unreadObj.form_id;
								var content = unreadObj.content;
								var senderName = unreadObj.sender_name;
								var createTime = util.formatTime(unreadObj.create_time);
								
								//发送模板消息
								var lcContent = content.toLowerCase();
								if(lcContent.indexOf('jpg') != -1 || lcContent.indexOf('png') != -1 || lcContent.indexOf('jpeg') != -1 || lcContent.indexOf('gif') != -1){
									content = '[图片]';
								}
								var templateMsgData = {
									touser: userOpenId,
									template_id: UNREAD_MSG_TEMPLATE_ID,
									page: 'index',
									form_id: formId,
									data: {
										keyword1:{
											value: unreadCount > 1 ? '多条消息' : senderName
										},
										keyword2:{
											value: createTime
										},
										keyword3:{
											value: unreadCount > 1 ? '共多条未读消息(' + unreadCount + '条)，请进组查看' : content
										}
									}
								}
								
								wxRequests.sendTemplate(access_token, templateMsgData, function(res){
									if(res.errcode == 0){
										//成功
										
										//增加发送模板消息的记录
										var sql3 = '';
										if(result2.readed){
											sql3 = 'insert into template_msg (template_id, uid, resent, readed, create_time, resent_time) value ("'+UNREAD_MSG_TEMPLATE_ID+
												'", '+unreadObj.receiver_uid+', 0, 0, CURRENT_TIMESTAMP, "0000-00-00 00:00:00") on duplicate key update readed = 0, resent = 0, create_time = CURRENT_TIMESTAMP';
										}else{
											sql3 = 'insert into template_msg (template_id, uid, resent, readed, create_time, resent_time) value ("'+UNREAD_MSG_TEMPLATE_ID+
												'", '+unreadObj.receiver_uid+', 0, 0, CURRENT_TIMESTAMP, "0000-00-00 00:00:00") on duplicate key update resent = 1, resent_time = CURRENT_TIMESTAMP';
										}
										mysql.query(sql3, function(err, result){ });
										
										
										//删除已使用的formId
										var sql4 = 'delete from user_form_ids where form_id = ' + formId + ' and uid = ' + unreadObj.receiver_uid;
										mysql.query(sql4, function(err, result){ });
										
									}
								})
								
							}else{//不发送
								console.log('未发送模板消息给用户：uid=' + receiverUid)
							}
							
						});
						
					})(unreadObj)
					
				}
			}
		});
	});
	
}

function checkAllUserFormIds(){
	var sql1 = `
		select 
			u.uid, 
			u.nickname, 
			u.open_id, 
			count(f.fid) as fn 
		from users u 
		left join user_form_ids f on f.uid = u.uid and TIMESTAMPADD(second,7 * 24 * 3600, f.create_time) > CURRENT_TIMESTAMP 
		group by u.uid 
		order by fn asc`; //获取全部用户的有效form_id数量(fn)
		
	var sql2 = `
		select 
			u.uid, 
			u.nickname, 
			u.open_id, 
			count(f.fid) as fn 
		from users u 
		left join user_form_ids f on f.uid = u.uid and TIMESTAMPADD(second,7 * 24 * 3600, f.create_time) > CURRENT_TIMESTAMP 
		group by u.uid 
		having fn <= 0 
		order by fn asc`; //获取没有有效form_id的用户(fn)
	
	mysql.query(sql2, function(err, result){
		if(result && result.length > 0){
			console.log('以下用户没有可用form_id: ', result)
		}
	});
}

function getAccessToken(callback){
	var sql = 'SELECT access_token FROM wxa_access_token where app_id = "' + wxRequests.APP_ID + '" and TIMESTAMPADD(second,at_exp,at_create_time) > CURRENT_TIMESTAMP';
  mysql.query(sql, function(err, result){
		var access_token = 'none';
    if(result && result.length > 0){
			access_token = result[0].access_token + '';
			//console.log('current access_token: ', access_token);
			callback(access_token);
		}else{
			//console.log('requesting new access_token');
			wxRequests.getAccessToken(function(res){
				access_token = res.access_token;
				sql = 'insert into wxa_access_token (app_id, access_token, at_exp, at_create_time) value ("' + wxRequests.APP_ID + '", "' + 
					access_token + '", ' + res.expires_in + ', CURRENT_TIMESTAMP)  on duplicate key update access_token = "' + access_token + '"';
				mysql.query(sql, function(err, result){ });
					
				callback(access_token);
			})
		}
  });
}

/* GET home page. */
router.get('/', function(req, res) {
	var sql = 'SELECT * FROM users';
  mysql.query(sql, function(err, result){
    res.render('index', { allContent: result }); 
  });
});


router.get('/templateTest', function(req, res) {
	getUnreadMsg();
	res.send('200');
});

router.get('/add', function(req, res) {
  var content = req.query.content;
  var todo = new Todo(content, true);
  todo.save(todo, function(err, todoBack){
    if (err) {
        res.writeHead(500);
    } else {
        res.writeHead(200);
    }
    res.write(todoBack.id);
    res.end();
  });
});

router.get('/delete', function(req, res) {
    var id = req.query.id;
    var todo = new Todo();
    todo.delete(id, function(err){
      if (err) {
          res.writeHead(500);
      } else {
          res.writeHead(200);
      }
      res.end();
    });
});

router.get('/all', function(req, res) {
  var todo = new Todo();
  todo.getAll(function(err, todoBack){
    res.render('all', { allContent: todoBack.reverse() }); 
  });
});


router.post('/cosAccessAuth', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var token = content.token || '';
	var region = content.region || [];
	var bucketName = content.bucketName || [];
	var cosPath = content.cosPath || [];
	var accessType = content.accessType || [];
	var appInfo = content.appInfo || [];
	
	//获取cos签名
	var key = cosPath;
	var auth = cos.getV4Auth({
			Bucket: bucketName + '-' + COS_APPID,
			Key: key,
			Expires: 60,
	});
	// 注意：这里的 Bucket 格式是 test-1250000000
	
	var result = encodeURIComponent(auth);
	//console.log('http://' + bucketName + '.cos.' + region + '.myqcloud.com' + '/' + encodeURIComponent(key).replace(/%2F/g, '/') + '?sign=' + result);
	
	res.send({sign: result});
	
});

module.exports = router;
