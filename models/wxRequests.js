var bodyParser = require("body-parser");
var request = require('request');

var APP_ID = 'wxcd0f36fe91014ed9';
var APP_SECRET = '1b4b72c87fccc0d433ee864f8644e3f1';


/*
 * 	获取用户的 openId
 */
function getUserOpenId(jsCode, callback){
	var url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + APP_ID + '&secret=' + APP_SECRET + '&js_code=' + jsCode + '&grant_type=authorization_code';
	var options = {
		method: 'get',
		url: url
	};
	request(options, function (err, res, body) {
		if (err) {
			console.log('error on wxRequest url: ', url, 'error: ', err)
		}else {
			//console.log('result body: ', body);
			body = JSON.parse(body);
			var openid = body.openid;
			if(openid){
				//console.log('result openid: ', body.openid);
				callback(openid);
			}
		}
	})
}

/*
 * 	获取 access_token
 */
function getAccessToken(callback){
	var url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' + APP_ID + '&secret=' + APP_SECRET;
	var options = {
		method: 'get',
		url: url
	};
	request(options, function (err, res, body) {
		if (err) {
			console.log('error on wxRequest.getAccessToken url: ', url, 'error: ', err)
		}else {
			console.log('wxRequests.getAccessToken result body: ', body);
			body = JSON.parse(body);
			if(body.access_token){
				//console.log('result openid: ', body.openid);
				callback(body);
			}
		}
	})
}

/*
 * 发送模板消息
 * https://developers.weixin.qq.com/miniprogram/dev/api/notice.html#模版消息管理
 */
function sendTemplate(access_token, param, callback){
	var url = 'https://api.weixin.qq.com/cgi-bin/message/wxopen/template/send?access_token=' + access_token;
	var options = {
		method: 'POST',
		url: url,
		body: JSON.stringify(param)
	};
	request(options, function (err, res, body) {
		if (err) {
			console.log('error on wxRequest.sendTemplate url: ', url, 'error: ', err)
		}else {
			console.log('wxRequest.sendTemplate - \n\t param: ', param, '\n\t result: ', body);
			callback(body);
		}
	})
}


module.exports = {
	APP_ID: APP_ID,
	APP_SECRET: APP_SECRET,
	getUserOpenId: getUserOpenId,
	getAccessToken: getAccessToken,
	sendTemplate: sendTemplate
};
