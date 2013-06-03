require('nodetime').profile({
	accountKey: '24e45f192591e4c06a15942d87750984ee0aa308'
});
var http = require('http');
var fs = require('fs');
var phantom = require('phantom');
var url = require('url');
var zlib = require('zlib');

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
	return document.documentElement.innerHTML;
}

var compress = function(data, res, acceptEncoding, callback) {
	var writeData = function(err, buffer) { res.end(buffer); }
	if (acceptEncoding.match(/\bdeflate\b/)) {
		res.writeHead(200, { 'content-encoding': 'deflate' });
		zlib.deflateRaw(data, writeData);
	} else if (acceptEncoding.match(/\bgzip\b/)) {
		res.writeHead(200, { 'content-encoding': 'gzip' });
		zlib.gzip(data, writeData);
	} else {
		res.writeHead(200, {});
		writeData(null, data);
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

// 3 phantoms per server, they use waaay too much memory :(
// maybe we'll have to replace it with jsdom.
var activePhantoms = 0;
var maxActivePhantoms = 3;

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
			console.log('waiting', timeout);
			setTimeout(function() {
				waitForRec(timeSoFar + timeout);
			}, timeout);
		}
	};
	waitForRec(0);
};

var get_clean_article = function(url, res, inlineImages, acceptEncoding) {
	waitFor(function() { return activePhantoms < maxActivePhantoms; }, function() {
		phantom.create(function(ph) {
			activePhantoms++;
			return ph.createPage(function(page) {
				page.set('settings.webSecurityEnabled', false);
				return page.open(url, function(status) {
					return page.injectJs('./readability.js', function() {
						return page.evaluate(cleanup_html, function(html) {
							compress(html, res, acceptEncoding);
							activePhantoms--;
							return ph.exit();
						}, inlineImages);
					});
				});
			});
		}, 'phantomjs', get_phantom_port());
	}, function() {
		res.writeHead(408);
		res.end('Timeout');
	}, 250, 10000);
};

function handler(req, res) {
	var url_parts = url.parse(req.url, true);
	var article_url = url_parts.query.url;
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
