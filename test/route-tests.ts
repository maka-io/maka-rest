import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

import { Route } from '../lib/route';
import Codes from '../lib/codes';
import MakaRest from '../lib/maka-rest';

declare const describe: any;
declare const it: any;
declare const before: any;
declare const after: any;
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
      // alanning:roles is a weak dependency, reached through the Package
      // registry rather than as a scope symbol -- so that is where a stub goes.
      const registry = () => (globalThis as any).Package;
      const REAL = registry()['alanning:roles'];

      afterEach(function () {
        if (REAL === undefined) {
          delete registry()['alanning:roles'];
        } else {
          registry()['alanning:roles'] = REAL;
        }
      });

      const stub = (Roles: any) => {
        registry()['alanning:roles'] = { Roles };
      };

      const gated = (over: any = {}) => ({
        authRequired: false,
        roleRequired: ['admin'],
        action: async () => Codes.success200({ ok: true }),
        ...over,
      });

      // Also guards the await: a promise is always truthy, so without it a
      // denied role would sail through the gate as a 200.
      it('answers 403 when the user lacks the role', async function () {
        stub({ userIsInRoleAsync: async () => false, getScopesForUserAsync: async () => [] });
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(ctx({ user: { _id: 'u1' } }), gated());
        assert.strictEqual(res.statusCode, 403);
      });

      it('runs the action when the user holds the role', async function () {
        stub({ userIsInRoleAsync: async () => true, getScopesForUserAsync: async () => [] });
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(ctx({ user: { _id: 'u1' } }), gated());
        assert.strictEqual(res.statusCode, 200);
      });

      it('skips the check entirely when there is no authenticated user', async function () {
        delete registry()['alanning:roles'];
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(ctx(), gated());
        assert.strictEqual(res.statusCode, 200);
      });

      it('explains itself when alanning:roles is not installed', async function () {
        delete registry()['alanning:roles'];
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        await assert.rejects(
          () => route._callEndpoint(ctx({ user: { _id: 'u1' } }), gated()),
          /roleRequired needs the alanning:roles package/
        );
      });

      it('requires scope as well as role when scopeRequired is set', async function () {
        stub({
          userIsInRoleAsync: async () => true,
          getScopesForUserAsync: async () => ['other'],
        });
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(
          ctx({ user: { _id: 'u1' } }),
          gated({ scopeRequired: ['billing'] })
        );
        assert.strictEqual(res.statusCode, 403);
      });

      it('passes when both the role and the scope are held', async function () {
        stub({
          userIsInRoleAsync: async () => true,
          getScopesForUserAsync: async () => ['billing'],
        });
        const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
        const res = await route._callEndpoint(
          ctx({ user: { _id: 'u1' } }),
          gated({ scopeRequired: ['billing'] })
        );
        assert.strictEqual(res.statusCode, 200);
      });

      /*
       * Against the package itself, not a stub. The stubs above would happily
       * keep passing if the real API were named something else -- which is
       * exactly the trap here, since the sync userIsInRole/getScopesForUser
       * that this code used to call are client-only in alanning:roles v4.
       */
      describe('against the real alanning:roles package', function () {
        const USERNAME = 'maka-rest-roles-test';
        const HELD = 'maka-rest-test-held';
        const NOT_HELD = 'maka-rest-test-not-held';
        let user: any;

        before(async function () {
          this.timeout(15000);
          const Roles = REAL.Roles;
          await Meteor.users.removeAsync({ username: USERNAME });
          const userId = await Accounts.createUserAsync({
            username: USERNAME,
            password: 'correct-horse-battery',
          });
          await Roles.createRoleAsync(HELD, { unlessExists: true });
          await Roles.createRoleAsync(NOT_HELD, { unlessExists: true });
          await Roles.addUsersToRolesAsync(userId, [HELD]);
          user = await Meteor.users.findOneAsync(userId);
        });

        after(async function () {
          await Meteor.users.removeAsync({ username: USERNAME });
        });

        it('allows a user holding the role', async function () {
          const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
          const res = await route._callEndpoint(ctx({ user }), gated({ roleRequired: [HELD] }));
          assert.strictEqual(res.statusCode, 200);
        });

        it('denies a user not holding the role', async function () {
          const route: any = new Route(fakeApi(), 'thing', {}, { get: () => undefined });
          const res = await route._callEndpoint(ctx({ user }), gated({ roleRequired: [NOT_HELD] }));
          assert.strictEqual(res.statusCode, 403);
        });
      });
    });

    /*
     * The global verified-email gate. Unlike loginType -- which the MakaRest
     * constructor consumes and Settings then latches -- this flag is read on
     * every call, so it can simply be toggled and restored around a test.
     */
    describe('verified email gate', function () {
      const SAVED = MakaRest.auth.requireVerifiedEmail;

      afterEach(function () {
        MakaRest.auth.requireVerifiedEmail = SAVED;
      });

      /*
       * Reaching the predicate at all proves MakaRest.auth resolves at runtime
       * from inside route.ts. route.ts and maka-rest.ts import each other, and
       * until this gate landed the MakaRest binding was used only as a type --
       * so this is the first runtime read across that cycle.
       */
      const accepted = (user: any, endpoint: any = {}, routeOptions: any = {}) => {
        const route: any = new Route(fakeApi(), 'thing', routeOptions, { get: () => undefined });
        return route._verifiedEmailAccepted(ctx({ user }), { authRequired: true, ...endpoint });
      };

      const verified = { emails: [{ address: 'jo@example.com', verified: true }] };
      const unverified = { emails: [{ address: 'jo@example.com', verified: false }] };

      it('is off by default', function () {
        assert.strictEqual(SAVED, false);
      });

      it('passes an unverified user while the flag is off', function () {
        MakaRest.auth.requireVerifiedEmail = false;
        assert.strictEqual(accepted(unverified), true);
      });

      it('passes a user holding a verified email', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(accepted(verified), true);
      });

      it('denies a user whose only email is unverified', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(accepted(unverified), false);
      });

      // Fail closed: "no email at all" is not "verified".
      it('denies a user with no emails field', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(accepted({ _id: 'u1' }), false);
      });

      it('denies a user with an empty emails array', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(accepted({ emails: [] }), false);
      });

      it('accepts any verified address, not just the first', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(
          accepted({
            emails: [
              { address: 'old@example.com', verified: false },
              { address: 'new@example.com', verified: true },
            ],
          }),
          true
        );
      });

      it('leaves endpoints that do not require auth alone', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(accepted(unverified, { authRequired: false }), true);
      });

      it('honours the internal exemption used by the logout endpoints', function () {
        MakaRest.auth.requireVerifiedEmail = true;
        assert.strictEqual(accepted(unverified, {}, { _skipVerifiedEmailCheck: true }), true);
      });

      /*
       * The predicate above is pure; these go through _callEndpoint with a real
       * authenticated user, so they also cover the wiring: _authenticate has to
       * have put the user on the context before the gate reads it.
       */
      describe('through _callEndpoint, against a real user', function () {
        const USERNAME = 'maka-rest-verified-email-test';
        const PASSWORD = 'correct-horse-battery';
        let hashedToken = '';

        const authedRoute = (options: any = {}): any =>
          new Route(
            fakeApi(() => ({ token: hashedToken })),
            'thing',
            options,
            { get: () => undefined }
          );

        const setVerified = (value: boolean) =>
          Meteor.users.updateAsync({ username: USERNAME }, { $set: { 'emails.0.verified': value } });

        before(async function () {
          this.timeout(15000);
          await Meteor.users.removeAsync({ username: USERNAME });
          const userId = await Accounts.createUserAsync({
            username: USERNAME,
            email: 'maka-rest-verified-email-test@example.com',
            password: PASSWORD,
          });
          const stamped = Accounts._generateStampedLoginToken();
          hashedToken = Accounts._hashLoginToken(stamped.token);
          await Accounts._insertHashedLoginToken(userId, { hashedToken, when: new Date() });
        });

        after(async function () {
          await Meteor.users.removeAsync({ username: USERNAME });
        });

        it('answers 403 -- not 401 -- and never runs the action', async function () {
          MakaRest.auth.requireVerifiedEmail = true;
          await setVerified(false);
          let ran = false;
          const res = await authedRoute()._callEndpoint(ctx(), {
            authRequired: true,
            action: async () => {
              ran = true;
              return Codes.success200();
            },
          });
          assert.strictEqual(res.statusCode, 403);
          assert.strictEqual(res.data, 'Email address must be verified');
          assert.strictEqual(ran, false);
        });

        it('runs the action once the address is verified', async function () {
          MakaRest.auth.requireVerifiedEmail = true;
          await setVerified(true);
          const res = await authedRoute()._callEndpoint(ctx(), {
            authRequired: true,
            action: async () => Codes.success200({ ok: true }),
          });
          assert.strictEqual(res.statusCode, 200);
          await setVerified(false);
        });

        // Ordering: the email gate runs before _roleAccepted, which throws when
        // alanning:roles is absent. An unverified user must get a clean 403
        // rather than trip that throw.
        it('refuses before the role check is reached', async function () {
          const registry = (globalThis as any).Package;
          const REAL = registry['alanning:roles'];
          delete registry['alanning:roles'];
          try {
            MakaRest.auth.requireVerifiedEmail = true;
            await setVerified(false);
            const res = await authedRoute()._callEndpoint(ctx(), {
              authRequired: true,
              roleRequired: ['admin'],
              action: async () => Codes.success200(),
            });
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.data, 'Email address must be verified');
          } finally {
            if (REAL !== undefined) registry['alanning:roles'] = REAL;
          }
        });
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
