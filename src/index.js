import WebPageTest from "webpagetest"
import Hipchat from "hipchat-client"
import format from "string-format"
import async from "async"
import logstashRedis from "logstash-redis"
import Statsd from "node-statsd"
import os from "os"
import assert from "assert"

function gaugeStats(prefix, client, data, done) {
  let c = 0
  const keys = Object.keys(data)
  keys.forEach((key) => {
    client.gauge(`${prefix}.${key}`, data[key], () => {
      if (++c === keys.length) {
        done()
      }
    })
  })
}

function notifyHipchat(message, options, done) {
  const hipchatClient = new Hipchat(options.hipchat.apiKey)
  const params = {
    message,
    room_id: options.hipchat.roomId,
    from: "WebPageTest",
    color: "yellow"
  }

  hipchatClient.api.rooms.message(params, (err) => {
    if (err) {
      console.error(`Error: ${err}`)
    }
    done()
  })
}

function notifyLogstash(data, options, done) {
  const logger = logstashRedis.createLogger(options.logstash.host, options.logstash.port, "logstash")

  logger.log({
    "@timestamp": (new Date).toISOString(),
    servicetype: "wpt-service",
    logname: "result",
    formatversion: "v1",
    type: "wpt-service-result-v1",
    host: os.hostname(),
    wpt: data
  }, () => { logger.close(done) })
}

function notifyStatsd(data, options, done) {
  const client = new Statsd({
    host: options.statsd.host,
    port: options.statsd.port,
    prefix: options.statsd.prefix
  })

  client.socket.on("close", () => {
    done()
  })

  async.series([
    (callback) => {
      gaugeStats("firstView", client, data.data.average.firstView, callback)
    },
    (callback) => {
      gaugeStats("repeatView", client, data.data.average.repeatView, callback)
    }
  ], () => {
    client.close()
  })
}

function getTestResults(wpt, testId, options, done) {
  wpt.getTestResults(testId, (err, data) => {
    console.log(`http://www.webpagetest.org/result/${testId}/`)

    if (options.wpt.runs !== data.data.successfulFVRuns) {
      err = 1
    }

    if (err > 0) {
      done(err)
      return
    }

    const message = format(
      "WPT results: <a href='{0}'>{0}</a><br />Page under test: {1}<br /> Load Time: {2} <br />TTFB: {3}",
      data.data.summary,
      options.testUrl,
      data.data.median.firstView.loadTime,
      data.data.median.firstView.TTFB
    )
    console.log(message)

    delete data.data.runs

    async.series([
      (callback) => {
        if (options.hipchat) {
          notifyHipchat(message, options, callback)
        } else {
          callback()
        }
      },
      (callback) => {
        if (options.logstash) {
          notifyLogstash(data, options, callback)
        } else {
          callback()
        }
      },
      (callback) => {
        if (options.statsd) {
          notifyStatsd(data, options, callback)
        } else {
          callback()
        }
      }
    ], done)
  })
}

function checkTestStatus(wpt, testId, options, done) {
  wpt.getTestStatus(testId, (err, data) => {
    if (err) {
      done(err)
      return
    }

    console.log(`Status for ${testId}: ${data.data.statusText}`)

    if (!data.data.completeTime) {
      setTimeout(() => {
        checkTestStatus(wpt, testId, options, done)
      }, 50000)
    } else {
      getTestResults(wpt, testId, options, done)
    }
  })
}

function makeRequest(options, done) {
  assert(options.instanceUrl || options.apiKey, "Please provide a valid webpagetest api key")

  const wpt = new WebPageTest(options.instanceUrl, options.apiKey)

  function errorHandler(err) {
    console.error(err)
    done(err)
  }

  wpt.runTest(options.testUrl, options.wpt, (err, data) => {
    if (err) {
      errorHandler(err)
      return
    }
    if (data.statusCode === 200) {
      const testId = data.data.testId
      checkTestStatus(wpt, testId, options, done)
    } else {
      errorHandler(data)
    }
  })
}

makeRequest.WebPageTest = WebPageTest

// Support require statement
module.exports = makeRequest

// Support es6 imports
export default makeRequest
