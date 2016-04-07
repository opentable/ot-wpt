# ot-wpt
Initiates a run on a given webpagetest instance and logs to hipchat, statsd, and logstash.

## Usage

```js
var wpt = require("ot-wpt");

wpt({
  testUrl: 'http://google.com',
  wptApiKey: 'API_KEY_HERE',
  hipchatApiKey: 'API_KEY_HERE',
  roomId: 12345,
  logstashHost: 'localhost',
  logstashPort: 6379,
  statsdHost: 'localhost',
  statsdPort: 8125,
  statsdPrefix: 'PREFIX_HERE',
  // These options are passed through to the webpagetest-api module
  wptOptions: {
    runs: 1,
    location: 'Dulles:Chrome'
  }
}, function() {
  // Test finished
});
```
