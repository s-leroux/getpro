const Promise = require("bluebird");
const debug = require("debug")("getpro:");
const http = require("http");
const https = require("https");

const { parse: urlParse, resolve: urlResolve } = require("url"); // legacy Node API

const MAX_REDIRECTS = 10;
const CHARSET_RE = /charset=([^\s;]*)/;

function gpGet(url) {
  let canRedirect = MAX_REDIRECTS;

  return _gpGet(url);

  function _gpGet(url) {
    debug("GET %s", url);
    
    if (typeof url == "string") {
      url = urlParse(url);
    }
    
    if (url.protocol == "http:")
      protocol = http;
    else if (url.protocol == "https:")
      protocol = https;
    else
      return Promise.reject({message: "Unsupported protocol "+protocol, url:url});

    return new Promise(function(resolve, reject) {
      protocol.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const contentType = res.headers['content-type'];
          let matches;

          if (contentType && (matches = CHARSET_RE.exec(contentType))) {
            res.setEncoding(matches[1]);
          }
          return resolve(res);
        }
        else if (res.statusCode >= 300 && res.statusCode < 400) {
          const location = res.headers['location'];

          if (location && canRedirect) {
            return resolve(_gpGet(urlResolve(url, location)));
          }

          // else
          if (!location) {
            return reject({message: "http redirect without a location", response: res });
          } else {
            return reject({message: "Maximum redirects exceeded"});
          }
        } else {
          reject({message: "Bad status: " + res.statusCode, response: res});
        }
      });
    });
  }
}

module.exports = {
  get: gpGet,
}
