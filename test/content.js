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

  const FORM_WITH_OBJECT = {
    nested: true,
    vars: {
      item: 1,
    }
  };

  const FORM_WITH_ARRAY = {
    array: true,
    items: [3,2,1],
  };

  describe("Form", () => {

    it("Should create forms", async () => {
      /*const form =*/ await createFormStream(FORM);
    });

    it("Should be a readable stream", async () => {
      const form = await createFormStream(FORM);

      await form.readAsync(16*1024);
      const str = form.read(16*1024);
      assert.equal(str.toString("utf8"), "hello=%26+world&a=1&b=2");
    });

    it("Should support arrays", async () => {
      const form = await createFormStream(FORM_WITH_ARRAY);

      await form.readAsync(16*1024);
      const str = form.read(16*1024);
      assert.equal(str.toString("utf8"), "array=true&items=3&items=2&items=1");
    });

    it("Should throw an error in case of nested objects", async () => {
      const form = await createFormStream(FORM_WITH_OBJECT);

      let ok = false;
      try {
        await form.readAsync(16*1024);
        form.read(16*1024);

        ok = true;
      }
      catch(err) {
        assert.equal(err.message, "Nested data structure are not supported in forms");
        // ok
      }
      if (ok) {
        assert.fail("Should have thrown an error");
      }
    });

    it("Should support nested objects via custom filters", async () => {
      const form = await createFormStream(FORM_WITH_OBJECT, {
        filters: {
          object(kv) {
            return {
              key: kv.key,
              value: JSON.stringify(kv.value),
            };
          },
        },
      });

      await form.readAsync(16*1024);
      const str = form.read(16*1024);
      assert.equal(str.toString("utf8"),"nested=true&vars=%7B%22item%22%3A1%7D");
    });

    it("Should pipe to a writable stream", async () => {
      const form = await createFormStream(FORM);
      const out = fs.createWriteStream("/tmp/tmp");

      form.pipe(out);
    });

  });

  describe("Multipart", () => {

    async function testMultipartEncoding(form, expected) {
      const formStream = await createMultipartStream(form);

      await formStream.readAsync(16*1024);
      const str = formStream.read(16*1024).toString("utf8");
      assert.match(str, /^(--)(--------[0-9a-f]{20})\r\n/);
      const boundary = str.substring(2, 30);

      expected = expected.replace(/--BOUNDARY/g, boundary);

      assert.equal(str.toString("utf8"), expected);
    }

    it("Should create forms", async () => {
      /*const form =*/ await createMultipartStream(FORM);
    });

    it("Should be a readable stream", async () => {
      await testMultipartEncoding(FORM,
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"hello\"\r\n" +
        "\r\n" +
        "& world" + "\r\n" +
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"a\"\r\n" +
        "\r\n" +
        "1" + "\r\n" +
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"b\"\r\n" +
        "\r\n" +
        "2" + "\r\n" +
        "----BOUNDARY--\r\n"
      );
    });

    it("Should support arrays", async () => {
      await testMultipartEncoding(FORM_WITH_ARRAY,
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"array\"\r\n" +
        "\r\n" +
        "true" + "\r\n" +
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"items\"\r\n" +
        "\r\n" +
        "3" + "\r\n" +
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"items\"\r\n" +
        "\r\n" +
        "2" + "\r\n" +
        "----BOUNDARY\r\n" +
        "Content-Disposition: form-data; name=\"items\"\r\n" +
        "\r\n" +
        "1" + "\r\n" +
        "----BOUNDARY--\r\n"
      );
    });

    it("Should throw an error in case of nested objects", async () => {
      const form = await createMultipartStream(FORM_WITH_OBJECT);

      let ok = false;
      try {
        await form.readAsync(16*1024);
        form.read(16*1024);

        ok = true;
      }
      catch(err) {
        assert.equal(err.message, "Nested data structure are not supported in forms");
        // ok
      }
      if (ok) {
        assert.fail("Should have thrown an error");
      }
    });

    it("Should pipe to a writable stream", async () => {
      const form = await createMultipartStream(FORM);
      const out = fs.createWriteStream("/tmp/tmp");

      form.pipe(out);
    });

  });

});
