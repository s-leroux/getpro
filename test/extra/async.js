const debug = require("debug")("getpro:async");
const assert = require('chai').assert;

module.exports = function(BASE, gp) {

  describe("ECMAScript 2017 async/await", function() {
    it("should be supported by the consumer interface", function() {
      const SIZE = 2048;
      let length = 0;

      return gp.get(BASE+'/stream-bytes/'+SIZE)
        .then(async function (res) {
          let chunk = null;

          while (chunk = await res.consume()) {
            length += chunk.length;
            debug("chunk len=%d", chunk.length);
          };
          
          assert.equal(length, SIZE);
        });
    })
  })

}
