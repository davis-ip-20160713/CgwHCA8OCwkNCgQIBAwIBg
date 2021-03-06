'use strict';

const Promise = require('bluebird');
const fivebeans = require('fivebeans');
const http = require('http');

const mongoClient = require('mongodb').MongoClient;
const mongoDbUrl = 'mongodb://xe_user:LOIKo98i@ds036638.mlab.com:36638/currencydb';

const tubename = 'davis-ip-20160713';

const successCountMax = 10;
const failCountMax = 3; 

const successJobDelay = 60;                // in seconds
const failJobDelay = 3;                    // in seconds

/**
 *  helper function for round number to n decimal place
 */
function roundTo(num, decimalPlace) {
    return +(Math.round(num + "e+".concat(decimalPlace))  + "e-".concat(decimalPlace));
}

/**
 * Get the beanstalk client promise 
 * @returns {Promise} Promise resolving the beanstalk client
 */
function getBeanstalkClientPromise() {
  return new Promise(function(resolve, reject) {
    let client = new fivebeans.client('challenge.aftership.net', 11300);
    client.on('connect', function() {
      // client can now be used
	  console.log('connected to beanstalk server');
      resolve(client);
    }).on('error', function(err) {
      // connection failure
    }).on('close', function() {
      // underlying connection has closed
      console.log('fivebeans client is closed');
    }).connect();
  });
}

/**
 * Get the use tube promise
 * @returns {Promise} Promise resolving the beanstalk client
 */
function getUseTubePromise(client) {
  return new Promise(function(resolve, reject) {
    client.use(tubename, function(err, tubename) {
	  console.log(tubename + ' is used');
	  resolve(client);
	});
  });
}

/**
 * Get the put job promise
 * @param {fivebeans.Client} client
 * @param {Number} priority
 * @param {Number} delay - in seconds
 * @param {Number} time-to-run - in seconds
 * @param {object} payload - the job
 * @returns {Promise} - Promise resolving the jobid
 */
function getPutJobPromise(client, priority, delay, ttr, payload) {
  return new Promise(function(resolve, reject) {
    console.log('Put the payload', payload);
    client.put(priority, delay, ttr, JSON.stringify(payload), function(err, jobid) {
      resolve(jobid);
    });
  });
}

/**
 * Get the exchange rate promise
 * @param {string} [from] - from ISO currency
 * @param {string} [to] - to ISO currency
 * @returns {Promise}
 */
function getExchangeRatePromise(from, to) {

  return new Promise(function(resolve, reject) {
    http.get({
      host: 'www.xe.com',
      path: '/currencyconverter/convert/?Amount=1&From=' + from + '&To=' + to
    }, function(response) {
      let body = '';
      response.on('data', function(d) {
        body += d;
      });
      response.on('end', function() {
        // retrieve the exchange rate
        let exchFrom = body.match(/(?=class="leftCol">).+\d+/i)[0].split('>')[1];
        let exchTo = body.match(/(?=class="rightCol">).+\d+/i)[0].split('>')[1];
        let roundedExchTo = roundTo(exchTo, 2);
		console.log(roundedExchTo); // for debug
        resolve({
          from: from,
          to: to,
          created_at: new Date(),
          rate: roundedExchTo.toString()
        });
      });
    }).on('error', (e) => {
	  console.error(e);
      reject(e);
    });
  });
}

/**
 * Get the connected mongoDb instance promise on successful connection,
 * otherwise get the error
 * @param {mongoClient} [client] - mongoDb Client
 * @param {string} [url] - connection url
 * @returns {Promise} - Promise resolving the mongoDb instance on successful connection, otherwise the error message
 */
function getConnectToMongoDbPromise(client, url) {
  return new Promise(function(resolve, reject) {
    client.connect(url, function(err, db) {
      if (err) {
        console.log('Unable to connect to the mongoDB server. Error:', err);
		reject(err);
      } else {
	    console.log('Connected to mongoDB server');
        resolve(db);
      }
    });
  });
}

/**
 * Get the document insertion action promise
 * @param {mongoDb} [db] - mongoDb
 * @param {object} [exchangeRateObj] - e.g. JSON.stringify({ "from": "HKD", "to": "USD", "created_at": new Date(1347772624825), "rate": "0.13" })
 * @returns {Promise} - Promise resolving nothing
 */
function getInsertDocumentPromise(db, exchangeRateObj) {
  return new Promise(function(resolve, reject) {
    console.log('about to insert into mongoDb', exchangeRateObj);
    db.collection('exchangeRates').insertOne(exchangeRateObj, function(err, result) {
      db.close(function() {
        console.log('db connection is closed');
        resolve();
      });
    });
  });
}

module.exports = function()
{
    function ProcessExchangeRateHandler()
    {
        this.type = 'processExchangeRate';
		console.log('constructor of ProcessExchangeRateHandler');
    }

	ProcessExchangeRateHandler.prototype.work = function(payload, callback) {
	  callback('success'); // this will delete the job to prevent multicast effect
	  var payloadObj = JSON.parse(payload.toString());
	  console.log('in work, payload: ', payloadObj);
	  var from = payloadObj.from;
	  var to = payloadObj.to;
	  getExchangeRatePromise(from, to)
		.then(function(exchRate) {
		  // do the successful get exchange rate path
		  return getConnectToMongoDbPromise(mongoClient, mongoDbUrl)
			.then(function(dbClient) {
			  return getInsertDocumentPromise(dbClient, exchRate);
			})
			.then(function() {
			  var successCount = payloadObj.successCount + 1 || 1;
			  var fbClient = null;
			  if (successCount < successCountMax) {
				payloadObj.successCount = successCount;
				let clientPromise = getBeanstalkClientPromise();
				let useTubePromise = clientPromise.then(function(client) {
				  fbClient = client;
				  return getUseTubePromise(client);
				});
				let putJobPromise = useTubePromise.then(function(client) {
				  var job = { type: 'processExchangeRate', payload: JSON.stringify(payloadObj) };
				  return getPutJobPromise(client, 0, successJobDelay, 0, job);
				});
				callback('success');
				return putJobPromise;
			  } else {
				console.log('this job is completed');
				callback('bury');
			  }
			});
		}, function(e) {
		  console.error('Error throw from request', e);
		  var fbClient = null;
		  var failCount = (payloadObj.failCount + 1) || 1;
		  if(failCount < failCountMax) {
		    payloadObj.failCount = failCount;
			let clientPromise = getBeanstalkClientPromise();
			let useTubePromise = clientPromise.then(function(client) {
			  fbClient = client;
			  return getUseTubePromise(client);
			});
			let putJobPromise = useTubePromise.then(function(client) {
			  var job = { type: 'processExchangeRate', payload: JSON.stringify(payloadObj) };
			  return getPutJobPromise(client, 0, failJobDelay, 0, job);
			});

			return putJobPromise;
		  } else {
		    console.log('this job will be buried');
		    callback('bury');
		  }
		})
		.catch(e => console.error(e));
	  // last guard
	  // callback('success');
	}

    var handler = new ProcessExchangeRateHandler();
    return handler;
};
