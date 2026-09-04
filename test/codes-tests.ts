import assert from 'assert';
import Codes from '../lib/codes';

declare const describe: any;
declare const it: any;

/** [factory, expected status code, expected reason phrase] */
const MAPPINGS: Array<[string, number, string]> = [
  ['continue100', 100, 'Continue'],
  ['success200', 200, 'OK'],
  ['success201', 201, 'Created'],
  ['noContent204', 204, 'No Content'],
  ['badRequest400', 400, 'Bad Request'],
  ['unauthorized401', 401, 'Unauthorized'],
  ['forbidden403', 403, 'Forbidden'],
  ['notFound404', 404, 'Not Found'],
  ['notAllowed405', 405, 'Method Not Allowed'],
  ['unsupported415', 415, 'Unsupported Media Type'],
  ['teapot418', 418, "I'm a teapot"],
  ['tooManyRequests429', 429, 'Too Many Requests'],
  ['serverError500', 500, 'Internal Server Error'],
];

describe('Codes', function () {
  describe('status code mappings', function () {
    MAPPINGS.forEach(([name, code, reason]) => {
      it(`${name} -> ${code}`, function () {
        const res = (Codes as any)[name]();
        assert.strictEqual(res.statusCode, code, `${name} statusCode`);
        assert.strictEqual(res.status, reason, `${name} status`);
      });
    });

    // Regression: this was mapped to RESET_CONTENT (205) and reported its
    // status as "Reset Content".
    it('noContent204 is 204 and not 205', function () {
      const res = Codes.noContent204();
      assert.strictEqual(res.statusCode, 204);
      assert.notStrictEqual(res.statusCode, 205);
      assert.strictEqual(res.status, 'No Content');
    });
  });

  describe('response shape', function () {
    it('carries the body through as data', function () {
      const res = Codes.success200({ hello: 'world' });
      assert.deepStrictEqual(res.data, { hello: 'world' });
    });

    it('defaults headers to an empty object', function () {
      assert.deepStrictEqual(Codes.success200().headers, {});
    });

    it('passes headers through', function () {
      const res = Codes.success200({}, undefined, { 'X-Custom': 'v' });
      assert.deepStrictEqual(res.headers, { 'X-Custom': 'v' });
    });

    it('omits extra unless provided', function () {
      assert.strictEqual('extra' in Codes.success200(), false);
      assert.strictEqual(Codes.success200({}, { trace: 1 }).extra.trace, 1);
    });

    it('defaults noContent204 data to null', function () {
      assert.strictEqual(Codes.noContent204().data, null);
    });
  });

  describe('movedPermanently301', function () {
    it('sets the Location header and a 301', function () {
      const res = Codes.movedPermanently301('https://example.com/new');
      assert.strictEqual(res.statusCode, 301);
      assert.strictEqual(res.headers!['Location'], 'https://example.com/new');
    });
  });
});
