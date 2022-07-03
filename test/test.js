"use strict";
const debug = require("debug")("getpro:tests");

const Promise = require("bluebird");
const MemoryStream = require("memorystream");
const assert = require("chai").assert;
const semver = require("semver");

const data = require("./data.js");

/* temporary patch for https://github.com/chaijs/chai/issues/1116 */
assert.fail = require("assert").fail;

const HTTP_TEST_SERVER = process.env.HTTP_TEST_SERVER || "httpbingo.org";
const HTTP_SERVER_TIMEOUT = +process.env.HTTP_SERVER_TIMEOUT || 5000;

describe("module", function() {
  let gp = null;

  it("should be loadable", function() {
    gp = require("../index.js");
  });

  it("should export the get method", function() {
    assert.typeOf(gp.get, "function");
  });

  for(let protocol of ["http", "https"]) {
    describe(protocol.toUpperCase(), function() {
      this.timeout(HTTP_SERVER_TIMEOUT); // extends timeout since we are using an external service
      const BASE = protocol + "://" + HTTP_TEST_SERVER;

      describe("GET", function() {
        gp = require("../index.js");

        it("should load text", function() {
          let buffer = "";
          return gp.get(BASE+"/encoding/utf8")
            .then((res) => new Promise(function(resolve, reject) {

              res._stream.on("error", (err) => reject(err));
              res._stream.on("data", (chunk) => { buffer+=chunk; });
              res._stream.on("end", () => resolve());
            }))
            .then(() => {
              assert.isAbove(buffer.length, 0);
              assert.match(buffer, /⡌⠁⠧⠑ ⠼⠁⠒ {2}⡍⠜⠇⠑⠹⠰⠎ ⡣⠕⠌/);
            });
        });

        it("should implement the data interface (stream of bytes)", async function() {
          const SIZE = 2048;

          const res = await gp.get(BASE+"/stream-bytes/"+SIZE);
          for(let i =0; i <2; ++i) {
            const data = await res.data; // data should cache the result for subsequent calls (is it in the specs?)

            assert.equal(data.length, SIZE);
            assert.instanceOf(data, Buffer);
          }
        });

        it("should implement the text interface", async function() {
          const res = await gp.get(BASE+"/html");
          for(let i =0; i <2; ++i) {
            const text = await res.text; // data should cache the result for subsequent calls (is it in the specs?)

            assert.equal(typeof text, "string");
            assert.isAbove(text.length, 0);
          }
        });

        it("should implement the json interface", async function() {
          const res = await gp.get(BASE+"/json");
          for(let i =0; i <2; ++i) {
            const json = await res.json; // data should cache the result for subsequent calls (is it in the specs?)

            assert.equal(typeof json, "object");
          }
        });

        it("should stream", function() {
          const SIZE = 2048;
          const memStream = MemoryStream.createWriteStream();

          return gp.get(BASE+"/stream-bytes/"+SIZE)
            .then((res) => new Promise(function(resolve, /*reject*/) {
              res.pipe(memStream)
                .on("finish", () => {
                  assert.equal(memStream.toBuffer().length, SIZE);
                  resolve();
                });
            }));
        });

        it("should follow redirects", async function() {
          const REDIRECTS = 5;
          this.timeout(REDIRECTS*HTTP_SERVER_TIMEOUT);

          const res = await gp.get(BASE+"/redirect/"+REDIRECTS);
          const json = await res.json;

          assert.equal(res.statusCode, 200);
          assert.match(json.url, /\/get$/);
        });

        it("should limit redirects", function() {
          const REDIRECTS = 50;
          this.timeout(REDIRECTS*HTTP_SERVER_TIMEOUT);

          return gp.get(BASE+"/redirect/"+REDIRECTS)
            .then(
              () => { assert.fail("Not supposed to succeed"); },
              (err) => { debug(err); assert.equal(err.response.statusCode, 302); }
            );
        });

        it("should reject 4xx", function() {
          return gp.get(BASE+"/status/418")
            .then(() => { assert.fail("Not supposed to succeed"); })
            .catch((err) => { debug(err); assert.equal(err.response.statusCode, 418); });
        });

        it("should reject 5xx", function() {
          return gp.get(BASE+"/status/500")
            .then(() => { assert.fail("Not supposed to succeed"); })
            .catch((err) => { debug(err); assert.equal(err.response.statusCode, 500); });
        });

        it("should reject 1xx [exotic]", function() {
          return gp.get(BASE+"/status/101")
            .then(() => { throw("Not supposed to succeed"); })
            .catch((err) => { assert.equal(err.response.statusCode, 101); });
        });

        it("should honor the failOnError option", function() {
          return gp.get(BASE+"/status/418", { failOnError: false  })
            .then((res) => { assert.equal(res.statusCode, 418); });
        });

        it("should support chunked encoding", function() {
          const SIZE = 2048;

          return gp.get(BASE+"/stream-bytes/"+SIZE)
            .then((res) => new Promise(function(resolve, reject) {
              let length = 0;
              res._node_res.on("error", (err) => reject(err));
              res._node_res.on("data", (chunk) => length += chunk.length);
              res._node_res.on("end", () => {
                assert.equal(res.statusCode, 200);
                assert.equal(length, SIZE);
                resolve();
              });
            }));
        });

        it("should implement consume", function() {
          return gp.get(BASE+"/encoding/utf8")
            .then(Promise.coroutine(function*(res) {
              let chunk = null;

              while ((chunk = yield res.consume())) {
                debug("chunk len=%d", chunk.length);
              }
            }));
        });

        it("should implement consume (await)", async function() {
          const res = await gp.get(BASE+"/encoding/utf8");

          let chunk = null;
          while ((chunk = await res.consume())) {
            debug("chunk len=%d", chunk.length);
          }
        });

        it("should implement the flush interface", async function() {
          const res = await gp.get(BASE+"/encoding/utf8");
          await res.flush();

          assert.isUndefined(await res.consume());
        });

        it("allow mixing consume and flush", async function() {
          const res = await gp.get(BASE+"/encoding/utf8");
          const chunk = await res.consume();
          await res.flush();

          assert.isDefined(chunk);
          assert.isUndefined(await res.consume());
        });

        it("should consume chunked encoding", function() {
          const SIZE = 2048;
          let length = 0;

          return gp.get(BASE+"/stream-bytes/"+SIZE)
            .then(Promise.coroutine(function*(res) {
              let chunk = null;

              while ((chunk = yield res.consume())) {
                length += chunk.length;
                debug("chunk len=%d", chunk.length);
              }

              assert.equal(length, SIZE);
            }));
        });

        it("should accepts gzip-encoded responses", async function() {
          const res = await  gp.get(BASE+"/gzip");
          const json = await res.json;

          assert.include(json.headers["Accept-Encoding"][0].split(/,\s*/), "gzip");
        });

        it("should reject non-existant hosts", function(done) {
          gp.get("https://xxxxxxx.yesik.it/index.html")
            .then(assert.fail)
            .catch(()=>{
              done();
            });
        });


        if (semver.satisfies(process.version, ">= 7.6.0")) {
          require("./extra/async.js")(BASE, gp);
        }

      });

      describe("DELETE", () => {
        require("./common/_payload.js")(BASE+"/delete",gp.request.delete);
      });

      describe("HEAD", () => {
        require("./common/_no_payload.js")(BASE+"/head",gp.request.head);
      });

      describe("PATCH", () => {
        require("./common/_payload.js")(BASE+"/patch",gp.request.patch);
      });

      describe("POST", () => {
        require("./common/_payload.js")(BASE+"/post",gp.request.post);
      });

      describe("PUT", () => {
        require("./common/_payload.js")(BASE+"/put",gp.request.put);
      });

    });
  }
});
