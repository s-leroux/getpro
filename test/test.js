const assert = require('chai').assert;

const HTTP_TEST_SERVER = process.env.HTTP_TEST_SERVER || "http://httpbin.org";
const HTTP_SERVER_TIMEOUT = process.env.HTTP_SERVER_TIMEOUT || 5000;

describe("module", function() {
    let gp = null;

    it("should be loadable", function() {
        gp = require("../index.js");
    });

    it("should export the get method", function() {
        assert.typeOf(gp.get, 'function');
    });

    describe("HTTP GET", function() {
      this.timeout(HTTP_SERVER_TIMEOUT); // extends timeout since we are using an external service
      gp = require("../index.js");

      it("should load text", function() {
        return gp.get(HTTP_TEST_SERVER+'/encoding/utf8')
          .then((res) => new Promise(function(resolve, reject) {
            let buffer = "";
            res.on('data', (chunk) => { assert.typeOf(chunk, 'string'); buffer+=chunk; });
            res.on('end', () => {
              assert.isAbove(buffer.length, 0);
              // assert.equal(buffer.length, res.headers['content-length']); // can't be true because of multi-byte encoding
              resolve();
            });
          }));
      });

      it("should follow redirects", function() {
        const REDIRECTS = 5;
        this.timeout(REDIRECTS*HTTP_SERVER_TIMEOUT);
        
        return gp.get(HTTP_TEST_SERVER+'/redirect/'+REDIRECTS)
          .then((res) => new Promise(function(resolve, reject) {
            let length = 0;
            res.on('data', (chunk) => length += chunk.length);
            res.on('end', () => {
              assert.equal(res.statusCode, 200);
              assert.equal(length, res.headers['content-length']);
              resolve();
            });
          }));
      });
    });

});
