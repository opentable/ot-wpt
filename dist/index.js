"use strict";

exports.__esModule = true;
exports.default = makeRequest;

var _webpagetest = require("webpagetest");

var _webpagetest2 = _interopRequireDefault(_webpagetest);

var _hipchatClient = require("hipchat-client");

var _hipchatClient2 = _interopRequireDefault(_hipchatClient);

var _stringFormat = require("string-format");

var _stringFormat2 = _interopRequireDefault(_stringFormat);

var _async = require("async");

var _async2 = _interopRequireDefault(_async);

var _logstashRedis = require("logstash-redis");

var _logstashRedis2 = _interopRequireDefault(_logstashRedis);

var _nodeStatsd = require("node-statsd");

var _nodeStatsd2 = _interopRequireDefault(_nodeStatsd);

var _os = require("os");

var _os2 = _interopRequireDefault(_os);

var _assert = require("assert");

var _assert2 = _interopRequireDefault(_assert);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function notifyHipchat(message, options, done) {
  var hipchatClient = new _hipchatClient2.default(options.hipchatApiKey);
  var params = {
    message: message,
    room_id: options.roomId,
    from: "WebPageTest",
    color: "yellow"
  };

  hipchatClient.api.rooms.message(params, function (err) {
    if (err) {
      console.error("Error: " + err);
    }
    done();
  });
}

function notifyLogstash(data, options, done) {
  var logger = _logstashRedis2.default.createLogger(options.logstashHost, options.logstashPort, "logstash");

  logger.log({
    "@timestamp": new Date().toISOString(),
    servicetype: "wpt-service",
    logname: "result",
    formatversion: "v1",
    type: "wpt-service-result-v1",
    host: _os2.default.hostname(),
    wpt: data
  }, function () {
    logger.close(done);
  });
}

function notifyStatsd(data, options, done) {
  var client = new _nodeStatsd2.default({
    host: options.statsdHost,
    port: options.statsdPort,
    prefix: options.statsdPrefix
  });

  _async2.default.series([function (callback) {
    client.gauge("fv.speedindex", data.data.average.firstView.SpeedIndex, callback);
  }, function (callback) {
    client.gauge("rv.speedindex", data.data.average.repeatView.SpeedIndex, callback);
  }], function () {
    client.close();
    done();
  });
}

function getTestResults(wpt, testId, options, done) {
  return wpt.getTestResults(testId, function (err, data) {
    console.log("http://www.webpagetest.org/result/" + testId + "/");

    if (err > 0) {
      done(err);
      return;
    }

    var message = (0, _stringFormat2.default)("WPT results: <a href='{0}'>{0}</a><br />Page under test: {1}<br /> Load Time: {2} <br />TTFB: {3}", data.data.summary, options.testUrl, data.data.median.firstView.loadTime, data.data.median.firstView.TTFB);
    console.log(message);

    _async2.default.series([function (callback) {
      if (options.notifyHipchat) {
        notifyHipchat(message, options, callback);
      } else {
        callback();
      }
    }, function (callback) {
      if (options.notifyLogstash) {
        notifyLogstash(data, options, callback);
      } else {
        callback();
      }
    }, function (callback) {
      if (options.notifyStatsd) {
        notifyStatsd(data, options, callback);
      } else {
        callback();
      }
    }], done);
  });
}

function checkTestStatus(wpt, testId, options, done) {
  wpt.getTestStatus(testId, function (err, data) {
    if (err) {
      done(err);
      return;
    }

    console.log("Status for " + testId + ": " + data.data.statusText);

    if (!data.data.completeTime) {
      setTimeout(function () {
        checkTestStatus(wpt, testId, options, done);
      }, 50000);
    } else {
      getTestResults(wpt, testId, options, done);
    }
  });
}

function makeRequest(options, done) {
  (0, _assert2.default)(options.hipchatApiKey !== undefined && options.wptApiKey !== undefined, "Please provide both hipchatApiKey and wptApiKey");

  var wpt = new _webpagetest2.default(options.instanceUrl, options.wptApiKey);

  wpt.runTest(options.testUrl, options.wptOptions, function (err, data) {
    if (data.statusCode === 200) {
      var testId = data.data.testId;
      checkTestStatus(wpt, testId, options, done);
    }
  });
}