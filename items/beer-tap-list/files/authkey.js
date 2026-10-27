/* Turns a password into the key the server is allowed to see.
 *
 * The server never receives the password. It receives this: 250,000 rounds of PBKDF2
 * over the password, salted with the email address. The reason is the free plan's 10ms
 * CPU limit per request — a hash worth having costs far more than that, and paying for
 * a bigger plan would mean a fixed monthly bill before the first customer. Doing the
 * slow part here keeps the server cheap without making the stored hash cheap to attack.
 *
 * The email is the salt because both sides must derive the same value without a round
 * trip. That means two accounts sharing a password still store different keys, but a
 * per-user random salt is not possible here — the server adds one of those on top.
 */
(function (global) {
  "use strict";

  var ITERATIONS = 250000;
  var enc = new TextEncoder();

  function hex(buf) {
    var out = "", a = new Uint8Array(buf);
    for (var i = 0; i < a.length; i++) out += ("0" + a[i].toString(16)).slice(-2);
    return out;
  }

  /* Returns a promise for a 64-character hex key. Rejects where WebCrypto is missing,
     rather than quietly falling back to something weaker. */
  function authKey(email, password) {
    var subtle = global.crypto && global.crypto.subtle;
    if (!subtle) {
      return Promise.reject(new Error("This browser can't sign in securely (no WebCrypto)."));
    }
    var who = String(email || "").trim().toLowerCase();
    return subtle.digest("SHA-256", enc.encode("ontap:" + who))
      .then(function (salt) {
        return subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"])
          .then(function (key) {
            return subtle.deriveBits(
              { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations: ITERATIONS },
              key, 256);
          });
      })
      .then(hex);
  }

  global.AuthKey = { derive: authKey, iterations: ITERATIONS };
})(this);
