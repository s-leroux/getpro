"use strict";
const debug = require("debug")("getpro:post");
const assert = require("chai").assert;

const data = require("../data.js");

module.exports = function(endpoint, method) {
  it("should send raw strings using the stream interface", async () => {
    const req = method(endpoint);

    req.setHeader("content-length", Buffer.byteLength(data.TEXT));
    req.setHeader("content-type", "text/plain; encoding=utf8");
    req.write(data.TEXT);
    const res = await req.end();
    //res.setEncoding('utf8');

    const payload = await res.json;

    assert.equal(payload.data, data.TEXT);
  });

  it("should implement the text interface", async () => {
    const res = await method(endpoint)
      .text(data.TEXT);

    const payload = await res.json;

    assert.equal(payload.data, data.TEXT);
  });

  it("should implement the json interface", async () => {
    const MESSAGE = {
      hello: "&world !",
      answer: 42,
    };

    const res = await method(endpoint)
      .json(MESSAGE);

    const payload = await res.json;

    assert.deepEqual(payload.json, MESSAGE);
    assert.equal(payload.headers["Content-Type"][0], "application/json");
  });

  it("should implement the form interface (multipart/form-data)", async () => {
    const MESSAGE = {
      hello: [ "&world !" ], // The arrays are here because httpbingo always returns form value in arrays
      answer: [ "42" ],
    };

    const res = await method(/*"http://localhost:1234"/*/endpoint, { failOnError: false })
      .form(MESSAGE);

    const payload = await res.json;

    assert.equal(res.statusCode, 200);
    assert.deepEqual(payload.form, MESSAGE);
    assert.match(payload.headers["Content-Type"][0], /multipart\/form-data; boundary=/);
  });

  it("should implement the data interface (application/x-www-form-urlencoded)", async () => {
    const MESSAGE = {
      hello: [ "&world !" ], // The arrays are here because httpbingo always returns form value in arrays
      answer: [ "42" ],
    };
    const expected = "hello=%26world+!\u0026answer=42";

    const res = await method(endpoint, { failOnError: false })
      .data(MESSAGE);

    const payload = await res.json;

    assert.equal(res.statusCode, 200);
    //assert.deepEqual(payload.form, MESSAGE);
    assert.equal(payload.data, expected);
    assert.equal(payload.headers["Content-Type"][0], "application/x-www-form-urlencoded");
  });


};
