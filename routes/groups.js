var express = require('express');
var mysql = require("../models/mysqlCommands.js");
var util = require("../models/util.js");
var router = express.Router();

var PAGE_SIZE = 30;//PAGE_SIZE=每一页数据的数据量。客户端 pageNumber 请求应从 pageNumber=1 开始



/* GET group page. */
router.post('/get', function(req, res) {
  var content = req.body;
	var gid = content.gid;
	if(gid){
		var sql = 'SELECT g.gid, g.gname, count(m.uid) mem_count from group_members m, groups g where g.gid = ? and m.gid = g.gid GROUP BY m.gid';
		mysql.query(sql, [gid], function(err, result){
			if(result && result.length > 0){
				var resultStr = JSON.stringify(result[0]);
				res.send(resultStr);
			}else{
				res.send('error on sql: ', err);
			}
		});
	}else{
		res.send('error request');
	}
});

router.post('/joined', function(req, res) {
  var content = req.body;
	var uid = content.uid;
	if(uid){
		var sql = 'SELECT g.gid, g.gname from group_members m, groups g where m.uid = ? and m.gid = g.gid';
		mysql.query(sql, [uid], function(err, result){
			var list = JSON.stringify(result);
			res.send(list);
		});
	}else{
		res.send('error request');
	}
});


router.post('/create', function(req, res) {
  var content = req.body;
	var uid = content.uid;
	var gname = content.groupName;
	var nickname = content.nickname;
	if(uid && gname){
		//增加组
		var sql = 'insert into groups (gname, create_time, uid, remarks, state) value (?, CURRENT_TIMESTAMP, ?, 0, 1)';
		mysql.query(sql, [gname, uid, ], function(err, result){
			var gIdx = result.insertId;
			if(gIdx){
				
				//更新组成员信息
				var sql2 = 'insert into group_members (gid, uid, u_nickname, create_time) value (?, ?, ?, CURRENT_TIMESTAMP)';
				mysql.query(sql2, [gIdx, uid, nickname], function(err, result){ });
				
				res.send(gIdx + '');
			}else{
				res.send('error creating new group: ' + err);
			}
		});
	}else{
		res.send('error request');
	}
});


router.post('/members', function(req, res) {
  var content = req.body;
	var gid = content.gid;
	if(gid){
		var sql = 'select * from groups where gid = ?';
		mysql.query(sql, [gid], function(err, result){
			if(result){
				res.send(result);
			}else{
				res.send('error getting group members: ' + err);
			}
		});
	}else{
		res.send('error request');
	}
});


router.post('/msgList', function(req, res) {
  var content = req.body;
	var gid = content.gid;
	var uid = content.uid;
	var token = content.token;
	var pageNumber = content.pageNumber || 1;
	if(gid && uid && token){
		
		var sql = 'select uid from groups where gid = ?';
		mysql.query(sql, [gid], function(err, result){
			if(result){
				var ownerId = result[0];
				//选取不同角色可读的信息列表
				if(ownerId && ownerId == uid){//是群主
					sql = 'select m.mid, m.type, m.content, u.uid, u.avatar_url, u.nickname from messages m, users u where m.gid = ?' + 
						' and u.uid = m.uid order by m.create_time asc limit ' + PAGE_SIZE + ' offset ' + PAGE_SIZE * (pageNumber - 1);
				}else{//是普通组员
					sql = 'select m.mid, m.type, m.content, u.uid, u.avatar_url, u.nickname from messages m, users u where m.gid = ?' + 
						' and u.uid = m.uid and u.uid = ' + ownerId + ' order by m.create_time asc limit ' + PAGE_SIZE + ' offset ' + PAGE_SIZE * (pageNumber - 1);
				}
				mysql.query(sql, [gid], function(err, result){
					if(result){
						var list = JSON.stringify(result);
						res.send(list);
					}else{
						res.send('error getting group messages 1: ' + err);
					}
				});
				
				
				//更新最后一次阅读时间
				var sql2 = 'insert into group_last_read (gid, uid, last_time) value (?, ?, CURRENT_TIMESTAMP) on duplicate key update last_time = CURRENT_TIMESTAMP';
				mysql.query(sql2, [gid, uid], function(err, result){ });
				
				//更新模板发送记录，设置模板发送记录为已读，以便下次发送新模板消息
				var sql3 = 'update template_msg set readed = 1 where uid = ' + uid;
				mysql.query(sql3, function(err, result){ });
				
			}else{
				res.send('error getting group messages 2: ' + err);
			}
			
		});
		
	}else{
		res.send('error request');
	}
});


router.post('/addUserToGroup', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var gid = content.gid || '';
	var token = content.token || '';
	var nickname = content.nickname || '';
	if(gid && uid){
		
		//更新组成员信息
		var sql2 = 'insert into group_members (gid, uid, u_nickname, create_time) value (?, ?, ?, CURRENT_TIMESTAMP) on duplicate key update u_nickname = ?';
		mysql.query(sql2, [gid, uid, nickname, nickname], function(err, result){
			if(result){
				res.send('200');
			}else{
				res.send('error adding user to group: ' + err);
			}
		});
	}else{
		res.send('error request');
	}
});

router.post('/removeUsersFromGroup', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var token = content.token || '';
	var gid = content.gid || '';
	var uids = content.uids || [];
	if(gid && uids.length > 0){
		var uidStr = uids.join(' or uid = ')
		var sql = 'delete from group_members where gid = ? and uid = ?';
		mysql.query(sql, [gid, uid], function(err, result){
			if(result){
				res.send('200');
			}else{
				res.send('error removing group members: ' + err);
			}
		});
	}else{
		res.send('error request');
	}
});


router.post('/editGroupName', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var gid = content.gid || '';
	var token = content.token || '';
	var name = content.name || '';
	if(gid){
		var sql = 'update groups set gname = ? where gid = ?';
		mysql.query(sql, [name, gid], function(err, result){
			if(result){
				res.send('200');
			}else{
				res.send('error editing group name: ' + err);
			}
		});
	}else{
		res.send('error request');
	}
});


router.post('/editNickname', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var gid = content.gid || '';
	var token = content.token || '';
	var nickname = content.nickname || '';
	if(gid){
		var sql = 'update group_members set u_nickname = ? where gid = ? and uid = ?';
		mysql.query(sql, [nickname, gid, uid], function(err, result){
			if(result){
				res.send('200');
			}else{
				res.send('error editing  nickname in group: ' + err);
			}
		});
	}else{
		res.send('error request');
	}
});


router.post('/quitGroup', function(req, res) {
  var content = req.body;
	var uid = content.uid || '';
	var gid = content.gid || '';
	var token = content.token || '';
	if(gid){
		var sql = 'select uid from groups where gid = ? and uid = ?';
		mysql.query(sql,[gid, uid], function(err, result){
			if(result && result.length <= 0){
				var sql2 = 'delete from group_members where gid = ? and uid = ?';
				mysql.query(sql2, [gid, uid], function(err, result2){
					if(result2){
						res.send('200');
					}else{
						res.send('error quiting group: ' + err);
					}
				});
			}else{
				res.send('error owner cannot quit group: ' + err);
			}
		});
		
		
	}else{
		res.send('error request');
	}
});




module.exports = router;
