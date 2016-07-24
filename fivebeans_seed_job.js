var fivebeans = require("fivebeans");
var host = 'challenge.aftership.net';
var port = '11300';
var tubename = 'davis-ip-20160713';
var client = new fivebeans.client(host, port);

var from = process.argv[2];
var to = process.argv[3];

console.log(from, to);
if(from === undefined || from.length != 3 || to === undefined || to.length != 3) {
  console.error('Either "from" argument or "to" argument is invalid, should be 3 letters');
  process.exit(1);
}

var job = {
  type: 'processExchangeRate',
  payload: JSON.stringify({
    "from": from,
    "to": to
  })
};

client.on('connect', function() {
  console.log('connected');
  client.use(tubename, function(err, tubename) {
    console.log(tubename + ' is used');
    client.put(0, 0, 0, JSON.stringify(job), function(err, jobid) {
      console.log(jobid + ' is returned');
    });
    client.quit();
  });
}).on('error', function(err) {
  //
  console.error(err);
}).on('close', function() {
  //
  console.log('closing');
}).connect();