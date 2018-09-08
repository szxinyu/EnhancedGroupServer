var express = require('express');
var mysql = require("../models/mysqlCommands.js");
var wxRequests = require("../models/wxRequests.js");
var moment = require('moment');
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
}, 12 * 1000); //12秒循环一次，大于2次客户端自动刷新消息列表的时间。以免服务器在客户端刷新间隔误以为用户未阅读

//检查用户是否还有可用formId，以正常获取模板消息
var noMoreFormIdTask = setInterval(function(){
	checkAllUserFormIds();
}, 24 * 3600);//一天执行一次

function getUnreadMsg(){
	getAccessToken(function(access_token){
		var sql = `SELECT count(distinct m.mid) as unread_count, 
									g.gid,
									g.gname,
									u.uid as receiver_uid,
									u.nickname as receiver_name,
									m.content,
									u.open_id, 
									su.uid as sender_uid, 
									su.nickname as sender_name, 
									f.form_id, 
									max(m.create_time) as create_time 
								FROM messages m
								LEFT JOIN group_last_read gl on gl.gid = m.gid 
								LEFT JOIN groups g on g.gid = gl.gid 
								LEFT JOIN users u on gl.uid = u.uid 
								LEFT JOIN users su on su.uid = m.uid 
								LEFT JOIN user_form_ids f on u.uid = f.uid
								WHERE su.uid != u.uid and g.state = 1 and m.uid != gl.uid and gl.last_time < m.create_time and TIMESTAMPADD(second,7 * 24 * 3600,f.create_time) > CURRENT_TIMESTAMP
								group by u.uid 
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
						var receiver_name = unreadObj.receiver_name;
						
						//检查是否要发送模板消息（是否已经在用户阅读前再次发送过）
						var sql2 = 'select * from template_msg where uid = ? and template_id = ?';
						mysql.query(sql2, [receiverUid, UNREAD_MSG_TEMPLATE_ID], function(err, result2){
							
							var neverSendTemplate = 0, readedTemplate = 0, didNotResend = 0, didNotResendButIn24HourLimit = 0, didNotReadResentMsg = 0
							neverSendTemplate = !result2 || result2.length == 0 //从未发送过模板消息
							if(!neverSendTemplate) readedTemplate = result2[0].readed //已经阅读过消息
							if(!neverSendTemplate && !readedTemplate){
								var lastSentTimeStr = result2[0].create_time
								if(typeof(lastSentTimeStr) == 'string'){
									lastSentTimeStr = util.formatMySqlDateString(lastSentTimeStr)
								}
								
								var lastSentTimeDate = moment(lastSentTimeStr)

								var timeDiff = lastSentTimeDate.diff(new Date(), 'hours')
								
								if(!result2[0].resent){
									if(timeDiff > 24){
										didNotResend = 1 //已经发送过一次，还未再次发送 //并且距离上次发送已经过去24小时，以免快速消耗formId
									}else{
										didNotResendButIn24HourLimit = 1 //距离上次发送还未过去24小时
									}
								}
								
							}
							if(!neverSendTemplate && !readedTemplate && result2[0].resent){ //已经再次发送，用户一直未阅读
								didNotReadResentMsg = 1
							}
							if((neverSendTemplate) || 
								 (readedTemplate) ||
								 (didNotResend) ){//发送
								sendUnreadNotiTemplate(unreadObj, access_token, result2)
							}else{//不发送
								console.log('未发送模板消息给用户：[' + receiver_name + '](uid:' + receiverUid + '), \n原因：', 
								'\n\t Sent once but not read in 24 hours: ' + didNotResendButIn24HourLimit, 
								'\n\t sent twice but not read: ' + didNotReadResentMsg)
							}
							
						});
						
					})(unreadObj)
					
				}
			}
		});
	});
	
}

function sendUnreadNotiTemplate(unreadObj, access_token, result2){
	//console.log('unread msg [' + i + ']: ', unreadObj);
	var unreadCount = unreadObj.unread_count;
	var userOpenId = unreadObj.open_id;
	var formId = unreadObj.form_id;
	var content = unreadObj.content;
	var senderName = unreadObj.sender_name;
	var groupName = unreadObj.gname;
	var createTime = util.formatTime(unreadObj.create_time);
	
	//发送模板消息
	var lcContent = content.toLowerCase();
	if(lcContent.indexOf('jpg') != -1 || lcContent.indexOf('png') != -1 || lcContent.indexOf('jpeg') != -1 || lcContent.indexOf('gif') != -1){
		content = '[图片]';
	}
	var templateMsgData = {
		touser: userOpenId,
		template_id: UNREAD_MSG_TEMPLATE_ID,
		page: 'pages/index/index',
		form_id: formId,
		data: {
			keyword1:{
				value: unreadCount > 1 ? '多条消息' : groupName + ' - ' + senderName
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
		if(typeof(res) == 'string'){
			res = JSON.parse(res)
		}
		
		var errorCode = res.errcode
		if(errorCode == 0){
			//成功
			
			//增加发送模板消息的记录
			var sql3 = '';
			if(result2 && result2.length > 0 && result2[0].readed){
				sql3 = 'insert into template_msg (template_id, uid, resent, readed, create_time, resent_time) value (?, ?, 0, 0, CURRENT_TIMESTAMP, "0000-00-00 00:00:00") on duplicate key update readed = 0, resent = 0, create_time = CURRENT_TIMESTAMP';
			}else{
				sql3 = 'insert into template_msg (template_id, uid, resent, readed, create_time, resent_time) value (?, ?, 0, 0, CURRENT_TIMESTAMP, "0000-00-00 00:00:00") on duplicate key update resent = 1, resent_time = CURRENT_TIMESTAMP';
			}
			mysql.query(sql3, [UNREAD_MSG_TEMPLATE_ID, unreadObj.receiver_uid], function(err, result){ });
			
			
			//删除已使用的formId
			var sql4 = 'delete from user_form_ids where form_id = ? and uid = ?';
			mysql.query(sql4, [formId, unreadObj.receiver_uid], function(err, result){ });
			
		}else if(errorCode == 41030){ //模板消息参数设置的page不正确
			console.log('模板消息参数设置的page不正确')
		}else if(errorCode == 41029 || errorCode == 41028){ //41028	form_id不正确，或者过期 //41029	form_id已被使用
			
			//删除已使用的formId
			var sql4 = 'delete from user_form_ids where form_id = ? and uid = ?';
			mysql.query(sql4, [formId, unreadObj.receiver_uid], function(err, result){ });
			
		}else if(errorCode == 45009){ //接口调用超过限额（目前默认每个帐号日调用限额为100万）
			console.log('接口调用超过限额（目前默认每个帐号日调用限额为100万）')
		}else{
			console.log('模板消息发送失败：', res)
		}
	})
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
	var sql = 'SELECT access_token FROM wxa_access_token where app_id = ? and TIMESTAMPADD(second,at_exp,at_create_time) > CURRENT_TIMESTAMP';
  mysql.query(sql, [wxRequests.APP_ID, ], function(err, result){
		var access_token = 'none';
    if(result && result.length > 0){
			access_token = result[0].access_token + '';
			//console.log('current access_token: ', access_token);
			callback(access_token);
		}else{
			//console.log('requesting new access_token');
			wxRequests.getAccessToken(function(res){
				access_token = res.access_token;
				sql = 'insert into wxa_access_token (app_id, access_token, at_exp, at_create_time) value (?, ?, ?, CURRENT_TIMESTAMP)  on duplicate key update access_token = ?';
				mysql.query(sql, [wxRequests.APP_ID, access_token, res.expires_in, access_token], function(err, result){ });
					
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

router.get('/logs', function(req, res) {
    res.writeHead(200, {"Content-Type": "text/html"});
		fs.readFile('./out.log',function (err, data){
			res.end(data);
		});
});

router.get('/dbdate', function(req, res) {
  var sql = 'SELECT CURRENT_TIMESTAMP';
  mysql.query(sql, function(err, result){
    res.send(result);
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
