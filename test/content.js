"use strict";
const assert = require("chai").assert;

const fs = require("fs");

const {
  createFormStream,
  createMultipartStream,
} = require("../lib/content.js");

describe("Content", () => {
  const FORM = {
    hello: "& world",
    a: 1,
    b: 2,
  };

  describe("Form", () => {

    it("Should create forms", async () => {
      /*const form =*/ await createFormStream(FORM);
    });

    it("Should be a readable stream", async () => {
      const form = await createFormStream(FORM);

      const str = form.read(16*1024);
      assert.equal(str, "hello=%26+world&a=1&b=2");
    });

    it("Should pipe to a writable stream", async () => {
      const form = await createFormStream(FORM);
      const out = fs.createWriteStream("/tmp/tmp");

      form.pipe(out);
    });

  });

  describe("Multipart", () => {

    it("Should create forms", async () => {
      /*const form =*/ await createMultipartStream(FORM);
    });

    it("Should be a readable stream", async () => {
      const form = await createMultipartStream(FORM);

      const str = form.read(16*1024).toString("utf8");
      assert.match(str, /^(--)(--------[0-9a-f]{20})\r\n/);
      const boundary = str.substring(2, 30);
      const expected =
        "--" + boundary + "\r\n" +
        "Content-Disposition: form-data; name=\"hello\"\r\n" +
        "\r\n" +
        "& world" + "\r\n" +
        "--" + boundary + "\r\n" +
        "Content-Disposition: form-data; name=\"a\"\r\n" +
        "\r\n" +
        "1" + "\r\n" +
        "--" + boundary + "\r\n" +
        "Content-Disposition: form-data; name=\"b\"\r\n" +
        "\r\n" +
        "2" + "\r\n" +
        "--" + boundary + "--\r\n";

      assert.equal(str, expected);
    });

    it("Should pipe to a writable stream", async () => {
      const form = await createMultipartStream(FORM);
      const out = fs.createWriteStream("/tmp/tmp");

      form.pipe(out);
    });

  });

});
