const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return [year, month, day].map(formatNumber).join('/') + ' ' + [hour, minute, second].map(formatNumber).join(':')
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : '0' + n
}


/**
 * 获取时间戳，单位：秒。如果没有参数，则返回当前时间戳。如: 1501086181
 */
function timeStamp(date){
  return Math.floor((date ? date : (new Date).getTime()) / 1000)
}

//随机生成一段长度为n的字符串
function getRandomString(n) {
  var str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var s = "";
  for (var i = 0; i < n; i++) {
    var rand = Math.floor(Math.random() * str.length);
    s += str.charAt(rand);
  }
  return s;
}


/**
 * 将服务器mysql传递回来的 含有 T 字母的timestamp字符串转换成正常的时间字符串
 */
function formatMySqlDateString(dateStr){
  return dateStr.split('.')[0].replace('T', ' ')
}

module.exports = {
  formatTime: formatTime,
  timeStamp: timeStamp,
  getRandomString: getRandomString,
	formatMySqlDateString: formatMySqlDateString
}
