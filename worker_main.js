'use strict';

let worker_id = process.argv[2];
if(worker_id === undefined || worker_id.trim() === '') {
  console.error('worker_id is not provided');
  process.exit(1);
}

const co = require('co');

co(function* main() {
	let Beanworker = require('fivebeans').worker;
	let workerid = 'worker1';
	let tubename = 'davis-ip-20160713';
	let options =
	{
		id: workerid,
		host: 'challenge.aftership.net',
		port: 11300,
		handlers:
		{
			processExchangeRate: require('./ProcessExchangeRateHandler')()
		},
		ignoreDefault: true
	}
	let worker = new Beanworker(options);
	worker.on('error', function(e) {
		console.error(e);
	  })
	  .on('close', function() {
		console.log('worker ' + workerid + ' is now closing', arguments);
	  })
	  .on('started', function() {
		console.log('started', arguments);
	  })
	  .on('stopped', function() {
		console.log('stopped', arguments);
	  })
	  .on('job.reserved', function(jobid) {
		console.log('job.reserved', arguments);
		// fbClient.peek(jobid, function(err, jobid, payload) {
		  // if (err) {
			// console.log(jobid, err);
		  // } else {
			// console.log(payload.toString());
			// var payloadObj = JSON.parse(payload.toString());
			// payloadObj.successfulTrial = (payloadObj.successfulTrial + 1) || 0;
			// fbClient.use(tubename, function(err, tubename) {
			  // if (payloadObj.successfulTrial > 10) {
				// fbClient.put(0, 10, 0, JSON.stringify(payloadObj), function(err, jobid) {
				  // console.log('newly put jobid:', jobid);
				// });
			  // } else {
				// fbClient.bury(jobid, 0, function(err) {
				  // console.log('jobid has been buried', jobid);
				// });
			  // }
			// });
		  // }
		// });
	  })
	  .on('job.handled', function() {
		console.log('job.handled', arguments);
	  })
	  .on('job.deleted', function() {
		console.log('job.deleted', arguments);
	  })
	  .on('job.buried', function() {
		console.log('job.buried', arguments);
	  });
	worker.start([tubename]);
});

/*
var Beanworker = require('fivebeans').worker;
var options =
{
    id: 'worker_4',
    host: 'challenge.aftership.net',
    port: 11300,
    handlers:
    {
        emitkeys: new require('./emitkeyshandler')()
    },
    ignoreDefault: true
}
var worker = new Beanworker(options);
worker.start(['davis-ip-20160713']);


*/