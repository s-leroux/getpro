const debug = require("debug")("getpro:tests");

const Promise = require("bluebird");
const MemoryStream = require('memorystream');
const assert = require('chai').assert;
const semver = require('semver');

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

          if (semver.satisfies(process.version, '>= 7.6.0')) {
            require("./extra/async.js")(BASE, gp);
          }
          
        });
      });
    }
});
