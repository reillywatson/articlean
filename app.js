require('nodetime').profile({
	accountKey: '24e45f192591e4c06a15942d87750984ee0aa308'
});
var http = require('http');
var fs = require('fs');
var phantom = require('phantom');
var url = require('url');
var zlib = require('zlib');
var os = require('os');

var app = http.createServer(handler);

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});

var cleanup_html = function(inlineImages) {
	try {
		readability.init();
		if (inlineImages) {
			var canvas = document.createElement('canvas');
			var ctx = canvas.getContext('2d');
			var images = document.documentElement.getElementsByTagName('img');
			for (var i = 0; i < images.length; i++) {
				canvas.width = images[i].width;
				canvas.height = images[i].height;
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(images[i], 0, 0);
				var url = images[i].src;
				var dataURL=canvas.toDataURL('image/png');
				images[i].src = dataURL;
			}
		}
	}
	catch (err) {
	}
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

var totalMem = 512*1024*1024;//os.totalmem();
// 3 phantoms per server, they use waaay too much memory :(
// maybe we'll have to replace it with jsdom.
var activePhantoms = 0;
var maxActivePhantoms = Math.floor(totalMem / 167772160);

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

var killPhantom = function(ph) {
	console.log('killPhantom', ph.running);
	if (ph.running) {
		ph.exit();
		ph.running = false;
		activePhantoms--;
	}
};

var get_clean_article = function(url, res, inlineImages, acceptEncoding) {
	waitFor(function() { return activePhantoms < maxActivePhantoms; }, function() {
		activePhantoms++;
		phantom.create(function(ph) {
			ph.running = true;
			setTimeout(function() { killPhantom(ph); }, 30000);
			console.log('active phantoms: ', activePhantoms);
			return ph.createPage(function(page) {
				page.set('settings.webSecurityEnabled', false);
				return page.open(url, function(status) {
					var startTime = new Date().getTime();
					return page.injectJs('./readability.js', function() {
						return page.evaluate(cleanup_html, function() {
							var isLoadFinished = function() { return readability.loadFinished; }
							var checkLoadFinished = function(fin) {
								console.log(fin);
								if (!fin && (new Date().getTime()) - startTime < 25000) {
									setTimeout(function() { page.evaluate(isLoadFinished, checkLoadFinished); }, 100);
								}
								else {
									page.evaluate(function() { return document.documentElement.outerHTML; }, function(html) {
										compress(html, res, acceptEncoding);
										killPhantom(ph);
									});
								}
							};
							checkLoadFinished('');
						}, inlineImages);
					});
				});
			});
		}, 'phantomjs', get_phantom_port());
	}, function() {
		res.writeHead(408);
		res.end('Timeout');
	}, 250, 20000);
};

function handler(req, res) {
	var url_parts = url.parse(req.url, true);
	var article_url = unescape(url_parts.query.url);
	var inline_images = url_parts.query.inlineImages === 'true';
	var api_key = url_parts.query.apiKey;
	var accept_encoding = req.headers['accept-encoding'];
	if (!accept_encoding) {
		accept_encoding = '';
	}
	if (api_key !== '1e203ad5a027436e9f72e1341cb801d9') {
		res.writeHead('403');
		res.end('Invalid API key!');
		return;
	}
	console.log("article URL " + article_url);
	if (!article_url) {
		res.writeHead('400');
		res.end('');
		return;
	}
	get_clean_article(article_url, res, inline_images, accept_encoding);
};
