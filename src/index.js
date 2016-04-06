import * as WebPageTest from "webpagetest"
import * as Hipchat from "hipchat-client"
import * as format from "string-format"
import * as async from "async"
import * as logstashRedis from "logstash-redis"
import * as Statsd from "node-statsd"
import * as os from "os"
import * as assert from "assert"

function notifyHipchat(message, options, done) {
  const hipchatClient = new Hipchat(options.hipchatApiKey)
  const params = {
    message,
    room_id: options.roomId,
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
  const logger = logstashRedis.createLogger(options.logstashHost, options.logstashPort, "logstash")

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
    host: options.statsdHost,
    port: options.statsdPort,
    prefix: options.statsdPrefix
  })

  async.series([
    // TBC
  ], () => {
    client.close()
    done()
  })
}

function getTestResults(wpt, testId, options, done) {
  return wpt.getTestResults(testId, (err, data) => {
    console.log(`http://www.webpagetest.org/result/${testId}/`)

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

    async.series([
      (callback) => {
        if (options.notifyHipchat) {
          notifyHipchat(message, options, callback)
        } else {
          callback()
        }
      },
      (callback) => {
        if (options.notifyLogstash) {
          notifyLogstash(data, options, callback)
        } else {
          callback()
        }
      },
      (callback) => {
        if (options.notifyStatsd) {
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

export default function makeRequest(options, done) {
  assert(
    options.hipchatApiKey !== undefined && options.wptApiKey !== undefined,
    "Please provide both hipchatApiKey and wptApiKey"
  )

  const wpt = new WebPageTest(options.instanceUrl, options.wptApiKey)

  wpt.runTest(options.testUrl, options.wptOptions, (err, data) => {
    if (data.statusCode === 200) {
      const testId = data.data.testId
      checkTestStatus(wpt, testId, options, done)
    }
  })
}
