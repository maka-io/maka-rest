import assert from 'assert';
import { Route } from '../lib/route';
import Codes from '../lib/codes';

declare const describe: any;
declare const it: any;
declare const afterEach: any;

/**
 * Route only reaches for a handful of fields on its api, so a literal stands in
 * for a real MakaRest instance. That keeps these cases clear of the process-wide
 * MakaRest.Settings latches (root instance, default auth endpoints).
 */
function fakeApi(authUser: any = () => ({ token: undefined })) {
  return {
    _config: {
      apiRoot: 'api',
      paths: [] as string[],
      debug: false,
      rateLimitOptions: undefined,
      auth: { token: 'services.resume.loginTokens.hashedToken', user: authUser },
    },
    partialApiPath: 'api/v1/unit',
  } as any;
}

const ctx = (over: any = {}) => ({
  urlParams: {},
  queryParams: {},
  bodyParams: {},
  request: {} as any,
  response: {} as any,
  done: () => {},
  ...over,
});

describe('Route', function () {
  describe('extractUrlParams', function () {
    const route: any = new Route(fakeApi(), 'unused', {}, { get: () => undefined });
    const extract = (url: string, path: string) => route.extractUrlParams(url, path);

    it('pulls a single named parameter', function () {
      assert.deepStrictEqual(extract('/api/v1/post/5', 'api/v1/post/:_id'), { _id: '5' });
    });

    it('pulls multiple named parameters', function () {
      assert.deepStrictEqual(
        extract('/api/v1/post/5/comments/100', 'api/v1/post/:_id/comments/:commentId'),
        { _id: '5', commentId: '100' }
      );
    });

    it('ignores a query string', function () {
      assert.deepStrictEqual(extract('/api/v1/post/5?q=1', 'api/v1/post/:_id'), { _id: '5' });
    });

    it('returns an empty object for a static path', function () {
      assert.deepStrictEqual(extract('/api/v1/post', 'api/v1/post'), {});
    });
  });

  describe('endpoint resolution', function () {
    it('promotes a bare function to an action', function () {
      const handler = () => undefined;
      const route: any = new Route(fakeApi(), 'thing', {}, { get: handler });
      route._resolveEndpoints();
      assert.strictEqual(route.endpoints.get.action, handler);
    });
  });

  describe('endpoint configuration', function () {
    it('inherits authRequired from the route', function () {
      const route: any = new Route(
        fakeApi(),
        'thing',
        { authRequired: true },
        { get: { action: async () => undefined } }
      );
      route._configureEndpoints();
      assert.strictEqual(route.endpoints.get.authRequired, true);
    });

    it('lets an endpoint override the route', function () {
      const route: any = new Route(
        fakeApi(),
        'thing',
        { authRequired: true },
        { get: { authRequired: false, action: async () => undefined } }
      );
      route._configureEndpoints();
      assert.strictEqual(route.endpoints.get.authRequired, false);
    });

    it('merges route and endpoint roles', function () {
      const route: any = new Route(
        fakeApi(),
        'thing',
        { roleRequired: ['admin'] },
        { get: { roleRequired: ['dev'], action: async () => undefined } }
      );
      route._configureEndpoints();
      assert.deepStrictEqual(route.endpoints.get.roleRequired.sort(), ['admin', 'dev']);
    });

    it('leaves roleRequired undefined when nothing requires a role', function () {
      const route: any = new Route(fakeApi(), 'thing', {}, { get: { action: async () => undefined } });
      route._configureEndpoints();
      assert.strictEqual(route.endpoints.get.roleRequired, undefined);
    });

    it('treats roleRequired as implying authRequired', function () {
      const route: any = new Route(
        fakeApi(),
        'thing',
        {},
        { get: { roleRequired: ['admin'], action: async () => undefined } }
      );
      route._configureEndpoints();
      assert.strictEqual(route.endpoints.get.authRequired, true);
    });
  });

  describe('_callEndpoint', function () {
    it('returns whatever the action returns', async function () {
      const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
      const res = await route._callEndpoint(ctx(), {
        authRequired: false,
        action: async () => Codes.success200({ a: 1 }),
      });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.data, { a: 1 });
    });

    // Regression: an endpoint that returns nothing must answer 204, not 205.
    it('answers 204 when the action returns nothing', async function () {
      const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
      const res = await route._callEndpoint(ctx(), {
        authRequired: false,
        action: async () => undefined,
      });
      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(res.status, 'No Content');
    });

    it('rejects a response missing statusCode/data', async function () {
      const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
      await assert.rejects(
        () => route._callEndpoint(ctx(), { authRequired: false, action: async () => ({ nope: true }) }),
        /must contain a statusCode and data/
      );
    });

    it('answers 401 when auth is required and no token is presented', async function () {
      const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
      const res = await route._callEndpoint(ctx(), {
        authRequired: true,
        action: async () => Codes.success200(),
      });
      assert.strictEqual(res.statusCode, 401);
    });

    it('does not run the action when auth fails', async function () {
      let ran = false;
      const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
      await route._callEndpoint(ctx(), {
        authRequired: true,
        action: async () => {
          ran = true;
          return Codes.success200();
        },
      });
      assert.strictEqual(ran, false);
    });

    describe('role gating', function () {
      const realRoles = (globalThis as any).Roles;
      afterEach(function () {
        // Restore true absence, not a defined-but-undefined property: the
        // former makes a bare `Roles` reference a ReferenceError, the latter a
        // TypeError, and the case below depends on the difference.
        if (realRoles === undefined) {
          delete (globalThis as any).Roles;
        } else {
          (globalThis as any).Roles = realRoles;
        }
      });

      it('answers 403 when the user lacks the role', async function () {
        (globalThis as any).Roles = { userIsInRole: () => false, getScopesForUser: () => [] };
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(ctx({ user: { _id: 'u1' } }), {
          authRequired: false,
          roleRequired: ['admin'],
          action: async () => Codes.success200(),
        });
        assert.strictEqual(res.statusCode, 403);
      });

      it('runs the action when the user holds the role', async function () {
        (globalThis as any).Roles = { userIsInRole: () => true, getScopesForUser: () => [] };
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(ctx({ user: { _id: 'u1' } }), {
          authRequired: false,
          roleRequired: ['admin'],
          action: async () => Codes.success200({ ok: true }),
        });
        assert.strictEqual(res.statusCode, 200);
      });

      /*
       * Characterisation, not an endorsement. `Roles` is referenced as a bare
       * global in lib/route.ts and Package.onUse declares no roles dependency,
       * so with alanning:roles absent every role-gated endpoint throws rather
       * than answering 403 -- over HTTP that surfaces as a 500. This is the
       * same defect class that `Accounts` had; fixing it means either
       * depending on alanning:roles or resolving it defensively, so it is left
       * as a maintainer decision. Change this test when that is decided.
       */
      it('throws rather than 403s when alanning:roles is absent', async function () {
        delete (globalThis as any).Roles;
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        await assert.rejects(
          () =>
            route._callEndpoint(ctx({ user: { _id: 'u1' } }), {
              authRequired: false,
              roleRequired: ['admin'],
              action: async () => Codes.success200(),
            }),
          /Roles is not defined/
        );
      });

      it('requires scope as well as role when scopeRequired is set', async function () {
        (globalThis as any).Roles = {
          userIsInRole: () => true,
          getScopesForUser: () => ['other'],
        };
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(ctx({ user: { _id: 'u1' } }), {
          authRequired: false,
          roleRequired: ['admin'],
          scopeRequired: ['billing'],
          action: async () => Codes.success200(),
        });
        assert.strictEqual(res.statusCode, 403);
      });
    });
  });

  describe('rate limit configuration', function () {
    it('refuses a per-route limit when the api has none configured', function () {
      assert.throws(
        () => new Route(fakeApi(), 'thing', { rateLimit: { points: 1, duration: 1 } }, { get: () => undefined }),
        /Rate limiting is not enabled/
      );
    });
  });
});
