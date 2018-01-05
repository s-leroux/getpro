const express = require("express");
const app = express();

app.get('/index', (request, response) => {
  response.send("Hello");
});

exports.listen = function () {
  this.server.listen.apply(this.server, arguments);
};

exports.close = function (callback) {
  this.server.close(callback);
};

exports.listen = function(port) {
  app.server = app.listen(port);
}

exports.close = function() {
  app.server.close();
}
