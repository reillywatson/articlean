var http = require('http');
var fs = require('fs');
var phantom = require('phantom');
var url = require('url');

var app = http.createServer(handler);

var port = process.env.PORT || 5000;
app.listen(port, function() {
	console.log("Listening on " + port);
});

var get_clean_article = function(url, res) {
	phantom.create(function(ph) {
		return ph.createPage(function(page) {
			return page.open(url, function(status) {
				console.log("opened url? ", status);
				return page.injectJs('./readability.js', function() {
					console.log('inclued readability');
					return page.evaluate(function() {
						readability.init();
						var canvas = document.createElement('canvas');
						var ctx = canvas.getContext('2d');
						var images = document.documentElement.getElementsByTagName('img');
						canvas.setAttribute('crossOrigin','anonymous');
						for (var i = 0; i < images.length; i++) {
							images[i].setAttribute('crossOrigin','anonymous');
							canvas.width = images[i].width;
							canvas.height = images[i].height;
							ctx.clearRect(0, 0, canvas.width, canvas.height);
							ctx.drawImage(images[i], 0, 0);
							var dataURL=canvas.toDataURL('image/jpg');
							images[i].src = dataURL;//'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==';
						}
						return document.documentElement.innerHTML;
					}, function(result) {
						res.end(result);
						return ph.exit();
					});
				});
			});
		});
	});
};

function handler (req, res) {
	var url_parts = url.parse(req.url, true);
	var article_url = url_parts.query.url;
	console.log("article URL " + article_url);
	if (!article_url) {
		res.writeHead('400');
		res.end('');
		return;
	}
	get_clean_article(article_url, res);
}
