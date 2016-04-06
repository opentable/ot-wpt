"use strict";

exports.__esModule = true;
exports.default = makeRequest;

var _webpagetest = require("webpagetest");

var WebPageTest = _interopRequireWildcard(_webpagetest);

var _hipchatClient = require("hipchat-client");

var Hipchat = _interopRequireWildcard(_hipchatClient);

var _stringFormat = require("string-format");

var format = _interopRequireWildcard(_stringFormat);

var _async = require("async");

var async = _interopRequireWildcard(_async);

var _logstashRedis = require("logstash-redis");

var logstashRedis = _interopRequireWildcard(_logstashRedis);

var _nodeStatsd = require("node-statsd");

var Statsd = _interopRequireWildcard(_nodeStatsd);

var _os = require("os");

var os = _interopRequireWildcard(_os);

var _assert = require("assert");

var assert = _interopRequireWildcard(_assert);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function notifyHipchat(message, options, done) {
  var hipchatClient = new Hipchat(options.hipchatApiKey);
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
  var logger = logstashRedis.createLogger(options.logstashHost, options.logstashPort, "logstash");

  logger.log({
    "@timestamp": new Date().toISOString(),
    servicetype: "wpt-service",
    logname: "result",
    formatversion: "v1",
    type: "wpt-service-result-v1",
    host: os.hostname(),
    wpt: data
  }, function () {
    logger.close(done);
  });
}

function notifyStatsd(data, options, done) {
  var client = new Statsd({
    host: options.statsdHost,
    port: options.statsdPort,
    prefix: options.statsdPrefix
  });

  async.series([
    // TBC
  ], function () {
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

    var message = format("WPT results: <a href='{0}'>{0}</a><br />Page under test: {1}<br /> Load Time: {2} <br />TTFB: {3}", data.data.summary, options.testUrl, data.data.median.firstView.loadTime, data.data.median.firstView.TTFB);
    console.log(message);

    async.series([function (callback) {
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
  assert(options.hipchatApiKey !== undefined && options.wptApiKey !== undefined, "Please provide both hipchatApiKey and wptApiKey");

  var wpt = new WebPageTest(options.instanceUrl, options.wptApiKey);

  wpt.runTest(options.testUrl, options.wptOptions, function (err, data) {
    if (data.statusCode === 200) {
      var testId = data.data.testId;
      checkTestStatus(wpt, testId, options, done);
    }
  });
}