# ot-wpt
Initiates a run on a given webpagetest instance and logs to hipchat, statsd, and logstash.

## Usage

```js
var wpt = require("ot-wpt");

wpt({
  testUrl: 'http://google.com',
  apiKey: 'API_KEY_HERE',
  // These options are passed through to the webpagetest-api module
  wpt: {
    runs: 1,
    location: 'Dulles:Chrome'
  }
  hipchat: {
    apiKey: 'API_KEY_HERE',
    roomId: 12345
  },
  logstash: {
    host: 'localhost',
    port: 6379
  },
  statsd: {
    host: 'localhost',
    port: 8125,
    prefix: 'PREFIX_HERE'
  }
}, function() {
  // Test finished
});
```
