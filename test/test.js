const debug = require("debug")("getpro:tests");

const Promise = require("bluebird");
const MemoryStream = require('memorystream');
const assert = require('chai').assert;
const semver = require('semver');

/* temporary patch for https://github.com/chaijs/chai/issues/1116 */
assert.fail = require('assert').fail;

const HTTP_TEST_SERVER = process.env.HTTP_TEST_SERVER || "httpbin.org";
const HTTP_SERVER_TIMEOUT = process.env.HTTP_SERVER_TIMEOUT || 5000;

describe("module", function() {
    let gp = null;

    it("should be loadable", function() {
        gp = require("../index.js");
    });

    it("should export the get method", function() {
        assert.typeOf(gp.get, 'function');
    });

    for(let protocol of ["http", "https"]) {
      describe(protocol.toUpperCase(), function() {
        const BASE = protocol + "://" + HTTP_TEST_SERVER;

        describe("GET", function() {
          this.timeout(HTTP_SERVER_TIMEOUT); // extends timeout since we are using an external service
          gp = require("../index.js");

          it("should load text", function() {
            return gp.get(BASE+'/encoding/utf8')
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

          it("should stream", function() {
            const SIZE = 2048;
            const memStream = MemoryStream.createWriteStream();

            return gp.get(BASE+'/stream-bytes/'+SIZE)
              .then((res) => new Promise(function(resolve, reject) {
                res.pipe(memStream)
                  .on('finish', () => {
                    assert.equal(memStream.toBuffer().length, SIZE);
                    resolve();
                  });
              }));
          });

          it("should follow redirects", function() {
            const REDIRECTS = 5;
            this.timeout(REDIRECTS*HTTP_SERVER_TIMEOUT);

            return gp.get(BASE+'/redirect/'+REDIRECTS)
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

          it("should limit redirects", function() {
            const REDIRECTS = 50;
            this.timeout(REDIRECTS*HTTP_SERVER_TIMEOUT);

            return gp.get(BASE+'/redirect/'+REDIRECTS)
              .then(
                () => { assert.fail("Not supposed to succeed"); },
                (err) => { debug(err); assert.equal(err.response.statusCode, 302); }
              );
          });

          it("should reject 4xx", function() {
            return gp.get(BASE+'/status/418')
              .then(() => { assert.fail("Not supposed to succeed"); })
              .catch((err) => { debug(err); assert.equal(err.response.statusCode, 418); })
          });

          it("should reject 5xx", function() {
            return gp.get(BASE+'/status/500')
              .then(() => { assert.fail("Not supposed to succeed"); })
              .catch((err) => { debug(err); assert.equal(err.response.statusCode, 500); })
          });

          it("should reject 1xx [exotic]", function() {
            return gp.get(BASE+'/status/101')
              .then(() => { throw("Not supposed to succeed"); })
              .catch((err) => { assert.equal(err.response.statusCode, 101); })
          });

          it("should support chunked encoding", function() {
            const SIZE = 2048;

            return gp.get(BASE+'/stream-bytes/'+SIZE)
              .then((res) => new Promise(function(resolve, reject) {
                let length = 0;
                res.on('data', (chunk) => length += chunk.length);
                res.on('end', () => {
                  assert.equal(res.statusCode, 200);
                  assert.equal(length, SIZE);
                  resolve();
                });
              }));
            });

          it("should implement consume", function() {
            return gp.get(BASE+'/encoding/utf8')
              .then(Promise.coroutine(function*(res) {
                let chunk = null;

                while (chunk = yield res.consume()) {
                  debug("chunk len=%d", chunk.length);
                };
              }));
          });

          it("should consume chunked encoding", function() {
            const SIZE = 2048;
            let length = 0;

            return gp.get(BASE+'/stream-bytes/'+SIZE)
              .then(Promise.coroutine(function*(res) {
                let chunk = null;

                while (chunk = yield res.consume()) {
                  length += chunk.length;
                  debug("chunk len=%d", chunk.length);
                };

                assert.equal(length, SIZE);
              }));
          });

          it("should reject non-existant hosts", function(done) {
            gp.get("https://xxxxxxx.yesik.it/index.html")
              .then(assert.fail)
              .catch(()=>{
                done();
              });
          });


          if (semver.satisfies(process.version, '>= 7.6.0')) {
            require("./extra/async.js")(BASE, gp);
          }
          
        });
      });
    }
});
