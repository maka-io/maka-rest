import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

import { request, testPath, rootPath, authEvents } from './_fixture';

declare const describe: any;
declare const it: any;
declare const before: any;
declare const after: any;

/**
 * JsonRoutes.sendResult writes the StatusResponse's `data` value as the whole
 * body -- there is no {status, data} envelope on the wire, whatever the README
 * shows. So `res.json` below is the payload an endpoint returned to Codes.*.
 */
describe('HTTP', function () {
  this.timeout(15000);

  describe('routing', function () {
    it('serves a route and extracts a url parameter', async function () {
      const res = await request(testPath('echo/7'));
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.json, { id: '7' });
    });

    it('extracts a url parameter alongside a query string', async function () {
      const res = await request(testPath('echo/7?likes=true'));
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.json, { id: '7' });
    });

    it('extracts multiple url parameters', async function () {
      const res = await request(testPath('deep/5/comments/100'));
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.json, { id: '5', commentId: '100' });
    });

    it('matches and extracts consistently across dot segments', async function () {
      // Route matching normalises the path; parameter extraction must agree
      // with it, or the params come out shifted by the extra segments.
      const res = await request(testPath('x/../echo/7'));
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.json, { id: '7' });
    });

    it('404s an unknown path under the api root', async function () {
      const res = await request(testPath('no-such-route'));
      assert.strictEqual(res.status, 404);
    });

    it('404s a path with the wrong segment count', async function () {
      const res = await request(testPath('echo/7/extra'));
      assert.strictEqual(res.status, 404);
    });
  });

  describe('response codes', function () {
    // Regression: an endpoint returning nothing used to answer 205.
    it('answers 204 with an empty body when an endpoint returns nothing', async function () {
      const res = await request(testPath('empty'));
      assert.strictEqual(res.status, 204);
      assert.notStrictEqual(res.status, 205);
      assert.strictEqual(res.body, '');
    });

    it('answers 500 when an endpoint returns a malformed response', async function () {
      const res = await request(testPath('bad-shape'));
      assert.strictEqual(res.status, 500);
    });

    it('answers 401 on an auth-required route with no token', async function () {
      const res = await request(testPath('locked'));
      assert.strictEqual(res.status, 401);
    });
  });

  describe('request bodies', function () {
    it('parses a JSON body and answers 201', async function () {
      const body = JSON.stringify({ friend: { name: 'Jack' } });
      const res = await request(testPath('created'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        body,
      });
      assert.strictEqual(res.status, 201);
      assert.deepStrictEqual(res.json, { got: { friend: { name: 'Jack' } } });
    });
  });

  describe('default auth endpoints', function () {
    const USERNAME = 'maka-rest-http-test';
    const PASSWORD = 'correct-horse-battery';
    let token = '';

    before(async function () {
      await Meteor.users.removeAsync({ username: USERNAME });
      await Accounts.createUserAsync({ username: USERNAME, password: PASSWORD });
    });

    after(async function () {
      await Meteor.users.removeAsync({ username: USERNAME });
    });

    it('logs in and returns an auth token', async function () {
      const body = JSON.stringify({ username: USERNAME, password: PASSWORD });
      const res = await request(rootPath('login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        body,
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.authToken, 'expected an authToken');
      token = res.json.authToken;
    });

    it('fires the onLoggedIn hook', function () {
      assert.ok(authEvents.includes('in'), 'expected an onLoggedIn event');
    });

    it('accepts the token on an auth-required route', async function () {
      const res = await request(testPath('locked'), { headers: { 'X-Auth-Token': token } });
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.userId, 'expected the authenticated userId on the context');
    });

    it('rejects a bogus token with 401 rather than 500', async function () {
      const res = await request(testPath('locked'), {
        headers: { 'X-Auth-Token': 'not-a-real-token' },
      });
      assert.strictEqual(res.status, 401);
    });

    it('logs out and invalidates the token', async function () {
      const res = await request(rootPath('logout'), {
        method: 'POST',
        headers: { 'X-Auth-Token': token },
      });
      assert.strictEqual(res.status, 200);

      const afterLogout = await request(testPath('locked'), {
        headers: { 'X-Auth-Token': token },
      });
      assert.strictEqual(afterLogout.status, 401, 'token should no longer authenticate');
    });
  });
});
