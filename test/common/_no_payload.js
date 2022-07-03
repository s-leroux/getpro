"use strict";
const debug = require("debug")("getpro:post");
const assert = require("chai").assert;

const data = require("../data.js");

module.exports = function(endpoint, method) {
  it("should contact the endpoint", async () => {
    const req = method(endpoint);
    const res = await req.end();
    assert.equal(res.statusCode, 200);
  });

};
