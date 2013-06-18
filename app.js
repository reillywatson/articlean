require('nodetime').profile({
	accountKey: '24e45f192591e4c06a15942d87750984ee0aa308'
});
var express = require('express');
var http = require('http');
var phantom = require('phantom');
var url = require('url');
var zlib = require('zlib');
var os = require('os');
var stripe = require('stripe')('sk_live_LHNZk4cb75MT0mxUVKqcSUfO')
var pg = require('pg');
var memjs = require('memjs').Client.create();


var totalMem = 512*1024*1024;//os.totalmem();
// 5 phantoms per server, they use waaay too much memory :(
// maybe we'll have to replace it with jsdom.
var activePhantoms = 0;
var maxActivePhantoms = Math.floor(totalMem / (100*1024*1024));
http.globalAgent.maxSockets = 3;

var app = express();
var port = process.env.PORT || 5000;
var dbConnectString = process.env.DATABASE_URL || 'postgres://admin:admin@localhost';


app.configure(function() {
	if (!process.env.DEMOMODE) {
		app.use(express.static(__dirname + '/site'));
	}
	app.use(express.bodyParser());
	app.use(app.router);
});
app.listen(port);

app.get('/article', handler);

var createUser = function(req, res, id, requestsPerMonth) {
	console.log('Success! Customer with Stripe ID ' + id + ' just signed up!');
	pg.connect(dbConnectString, function(err, client, done) {
		if (err) {
			console.log("can't connect", err);
		}
		var apiKey = randomString(192);
		var resetDate = new Date();
		resetDate.setMonth(resetDate.getMonth() + 1);
		client.query('INSERT INTO Users(CustomerId, EmailAddress, NumQueries, MaxQueries, BillingStart, ApiKey) VALUES($1,$2,$3,$4,$5,$6)', [id, req.body.email, 0, requestsPerMonth, resetDate, apiKey], function(err, result) {
			done && done(client);
			if (err) {
				console.log('err',err);
				res.send("This email address is in use");
			}
			else {
				res.send('ok ' + apiKey);
			}
		});
	});
};

app.post("/plans/signup", function(req, res) {
	if (process.env.DEMOMODE) {
		res.end('404');
		return;
	}
	var requestsPerMonth = 200;
	if (req.body.plan === 'Basic') {
		requestsPerMonth = 5000;
	}
	else if (req.body.plan === 'Professional') {
		requestsPerMonth = 50000;
	}
	else if (req.body.plan === 'Enterprise') {
		requestsPerMonth = 500000;
	}
	console.log('body', req.body);
	if (req.body.plan === 'Free') {
		createUser(req, res, randomString(256), requestsPerMonth);
	}
	else {
		stripe.customers.create({
			card : req.body.stripeToken,
			email : req.body.email,
			plan : req.body.plan+req.body.billingPeriod
		}, function (err, customer) {
			if (err) {
				console.log('err',err);
				console.log('customer',customer);
				var msg = (customer && customer.error.message) || "unknown";
				res.send("Error while processing your payment: " + msg);
			}
			else {
				createUser(req, res, customer.id, requestsPerMonth);
			}
		});
	}
});

function randomString(bits){
	var chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	var ret='';
	while(bits > 0) {
		var rand=Math.floor(Math.random()*0x100000000)
		for (var i=26; i>0 && bits>0; i-=6, bits-=6) {
			ret+=chars[0x3F & rand >>> i];
		}
	}
	return ret;
}

// this jazz really doesn't work for big images, because canvas.toDataURL() fails all over the place
var inline_images = function(inline) {
	var scripts = Array.prototype.slice.call(document.documentElement.getElementsByTagName('script'));
	scripts = scripts.concat(Array.prototype.slice.call(document.documentElement.getElementsByTagName('link')));
	scripts = scripts.concat(Array.prototype.slice.call(document.documentElement.getElementsByTagName('meta')));
	for (var i = 0; i < scripts.length; i++) {
		scripts[i].parentNode.removeChild(scripts[i]);
	}
	var meta=document.createElement('meta');
	meta.setAttribute('charset','utf-8');
	document.getElementsByTagName('head')[0].appendChild(meta);
	if (inline) {
		var canvas = document.createElement('canvas');
		var ctx = canvas.getContext('2d');
		var images = document.documentElement.getElementsByTagName('img');
		for (var i = 0; i < images.length; i++) {
			canvas.width = images[i].width;
			canvas.height = images[i].height;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(images[i], 0, 0);
			var dataURL=canvas.toDataURL('image/jpeg', 0.8);
			images[i].src = dataURL;
		}
	}
	return document.documentElement.outerHTML;
}

var compress = function(data, res, acceptEncoding, callback) {
	var writeData = function(err, buffer, headOptions) {
		headOptions['content-length'] = buffer.length;
		res.writeHead(200, headOptions);
		res.end(buffer);
	}
	if (acceptEncoding.match(/\bdeflate\b/)) {
		zlib.deflateRaw(data, function(err, buffer){writeData(err, buffer, {'content-encoding':'deflate'});});
	} else if (acceptEncoding.match(/\bgzip\b/)) {
		zlib.gzip(data, function(err, buffer){writeData(err, buffer, {'content-encoding':'gzip'});});
	} else {
		writeData(null, data, {});
	}
}

var phantomPort = 10000;
var get_phantom_port = function() {
	phantomPort++;
	if (phantomPort > 50000) {
		phantomPort = 10000;
	}
	return phantomPort;
};

var waitFor = function(fn, callback, timeoutCallback, timeout, maxTimeout) {
	var waitForRec = function(timeSoFar) {
		if (timeSoFar > maxTimeout) {
			console.log('waited too long');
			timeoutCallback();
		}
		else if (fn()) {
			callback();
		}
		else {
			setTimeout(function() {
				waitForRec(timeSoFar + timeout);
			}, timeout);
		}
	};
	waitForRec(0);
};

var killPhantom = function(ph, page) {
	if (ph && ph.running) {
		page && page.close();
		ph.exit();
		ph.running = false;
		activePhantoms--;
	}
};

var get_clean_article = function(url, req, res, inlineImages, acceptEncoding) {
	waitFor(function() { return activePhantoms < maxActivePhantoms; }, function() {
		activePhantoms++;
		var creatingPhantom = true;
		setTimeout(function() { if (creatingPhantom) { console.log("didn't create?"); activePhantoms--; } }, 30000);
		phantom.create(function(ph) {
			creatingPhantom = false;
			ph.running = true;
			setTimeout(function() { killPhantom(ph, null); }, 35000);
			console.log('active phantoms: ', activePhantoms);
			console.log('active sockets: ', http.globalAgent.requests.length);
			return ph.createPage(function(page) {
				req.on('close', function() {
					killPhantom(ph, page);
					console.log('closed!!!!!!!!!');
				});
				setTimeout(function() { killPhantom(ph, page); }, 30000);
				page.set('settings.webSecurityEnabled', false);
				return page.open(url, function(status) {
					console.log('status: ', status);
					var startTime = new Date().getTime();
					return page.injectJs('./readability.js', function() {
						return page.evaluate(function() { readability.init(); }, function() {
							console.log('initialized');
							var isLoadFinished = function() { return readability.loadFinished; }
							var checkLoadFinished = function(fin) {
								if (!fin && (new Date().getTime()) - startTime < 20000) {
									setTimeout(function() { page.evaluate(isLoadFinished, checkLoadFinished); }, 100);
								}
								else {
									console.log('finished:', fin);
									page.evaluate(inline_images, function(html) {
										console.log('inlined those suckers!');
										html = html.replace(/\s+/g, " ");
										//memjs.set(url+inlineImages, html);
										compress(html, res, acceptEncoding);
										killPhantom(ph, page);
									}, inlineImages);
								}
							};
							checkLoadFinished('');
						});
					});
				});
			});
		}, 'phantomjs', get_phantom_port());
	}, function() {
		res.writeHead(408);
		res.end('Timeout');
	}, 250, 20000);
};

var getArticle = function(article_url, req, res, inline_images, accept_encoding) {
/*	memjs.get(article_url + inline_images, function(err, value) {
		console.log("got it");
		if (value) {
			compress(value, res, accept_encoding);
		}
		else {*/
			get_clean_article(article_url, req, res, inline_images, accept_encoding);
//		}
//	});
};

function handler(req, res, next) {
	var url_parts = url.parse(req.url, true);
	var escapedUrl = url_parts.query.url;
	if (!escapedUrl) {
		res.writeHead('400');
		res.end('Please specify a URL.');
		return;
	}
	var article_url = unescape(escapedUrl);
	var inline_images = url_parts.query.inlineImages === 'true';
	var api_key = url_parts.query.apiKey;
	var accept_encoding = req.headers['accept-encoding'];
	if (!accept_encoding) {
		accept_encoding = '';
	}
	if (process.env.DEMOMODE) {
		getArticle(article_url, req, res, inline_images, accept_encoding);
		return;
	}
	pg.connect(dbConnectString, function(err, client, done) {
		if (err) {
			getArticle(article_url, req, res, inline_images, accept_encoding);
			return;
		}
		client.query('SELECT * FROM Users WHERE ApiKey=$1', [api_key], function(err, result) {
			done && done(client);
			if (err) {
				console.log('err',err);
			}
			if (err || (result.rows && result.rows.length > 0)) {
				var customerId = result.rows[0].customerid;
				var maxQueries = result.rows[0].maxqueries;
				var numQueries = result.rows[0].numqueries;
				var billingStart = result.rows[0].billingstart;
				var currentDate = new Date();
				if (currentDate.toISOString() > billingStart) {
					console.log('resetting!!!!');
					billingStart = currentDate;
					billingStart.setMonth(billingStart.getMonth() + 1);
					client.query('UPDATE USERS SET NumQueries = 0, BillingStart=$1 WHERE CustomerId=$2', [billingStart, customerId], function(err, result){});
				}
				else {
					if (numQueries > maxQueries) {
						res.writeHead('403');
						res.end('Too many requests! Email info@articlean.net to upgrade your plan.');
						return;
					}
					client.query('UPDATE Users SET NumQueries = NumQueries + 1 WHERE CustomerId=$1', [customerId], function(err, result){});
				}
				getArticle(article_url, req, res, inline_images, accept_encoding);
			}
			else {
				res.writeHead('403');
				res.end('Invalid API key!');
			}
		});
	});
};
