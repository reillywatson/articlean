var http = require('http');
var fs = require('fs');
var phantom = require('phantom');
var url = require('url');

var app = http.createServer(handler);

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});

var get_clean_article = function(url, res, inlineImages) {
	phantom.create(function(ph) {
		return ph.createPage(function(page) {
			page.set('settings.webSecurityEnabled', false);
			return page.open(url, function(status) {
				return page.injectJs('./readability.js', function() {
					return page.evaluate(function(inlineImages) {
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
						return document.documentElement.innerHTML;
					}, function(result) {
						res.end(result);
						return ph.exit();
					}, inlineImages);
				});
			});
		});
	});
};

function handler (req, res) {
	var url_parts = url.parse(req.url, true);
	var article_url = url_parts.query.url;
	var inline_images = url_parts.query.inlineImages === 'true';
	var api_key = url_parts.query.apiKey;
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
	get_clean_article(article_url, res, inlineImages);
}
