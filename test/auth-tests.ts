import assert from 'assert';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

import { Auth } from '../lib/auth';

declare const describe: any;
declare const it: any;
declare const before: any;
declare const after: any;

describe('Auth', function () {
  describe('extractUser', function () {
    it('reads a username', function () {
      assert.deepStrictEqual(Auth.extractUser({ username: 'jo', password: 'p' }), { username: 'jo' });
    });

    it('reads an email', function () {
      assert.deepStrictEqual(Auth.extractUser({ email: 'jo@example.com', password: 'p' }), {
        emails: [{ address: 'jo@example.com', verified: false }],
      });
    });

    it('prefers username when both are present', function () {
      assert.deepStrictEqual(
        Auth.extractUser({ username: 'jo', email: 'jo@example.com', password: 'p' }),
        { username: 'jo' }
      );
    });

    it('throws when neither is present', function () {
      assert.throws(() => Auth.extractUser({ password: 'p' } as any), /Username or email must be provided/);
    });
  });

  describe('extractPassword', function () {
    it('passes a plain password straight through', function () {
      assert.strictEqual(Auth.extractPassword({ password: 'secret' }), 'secret');
    });

    it('wraps a client-hashed password as sha-256', function () {
      assert.deepStrictEqual(Auth.extractPassword({ password: 'abc123', hashed: true }), {
        digest: 'abc123',
        algorithm: 'sha-256',
      });
    });
  });

  describe('getUserQuerySelector', function () {
    it('selects by _id', function () {
      assert.deepStrictEqual(Auth.getUserQuerySelector({ _id: 'x' } as any), { _id: 'x' });
    });

    it('selects by username', function () {
      assert.deepStrictEqual(Auth.getUserQuerySelector({ username: 'jo' } as any), { username: 'jo' });
    });

    it('selects by email address', function () {
      assert.deepStrictEqual(
        Auth.getUserQuerySelector({ emails: [{ address: 'jo@example.com' }] } as any),
        { 'emails.address': 'jo@example.com' }
      );
    });

    it('prefers _id over the others', function () {
      assert.deepStrictEqual(
        Auth.getUserQuerySelector({ _id: 'x', username: 'jo' } as any),
        { _id: 'x' }
      );
    });

    it('throws on a user with no identifier', function () {
      assert.throws(() => Auth.getUserQuerySelector({} as any), /Cannot create selector from invalid user/);
    });
  });

  describe('loginWithPassword', function () {
    const USERNAME = 'maka-rest-auth-test';
    const PASSWORD = 'correct-horse-battery';

    before(async function () {
      this.timeout(10000);
      await Meteor.users.removeAsync({ username: USERNAME });
      await Accounts.createUserAsync({ username: USERNAME, password: PASSWORD });
    });

    after(async function () {
      await Meteor.users.removeAsync({ username: USERNAME });
    });

    it('returns an error object rather than throwing on missing input', async function () {
      const res = await Auth.loginWithPassword(null as any, null as any);
      assert.ok(res.error, 'expected an error field');
      assert.strictEqual(res.authToken, '');
      assert.strictEqual(res.userId, '');
    });

    it('rejects an unknown user', async function () {
      const res = await Auth.loginWithPassword({ username: 'nobody-here' } as any, 'whatever');
      assert.ok(res.error);
      assert.strictEqual(res.authToken, '');
    });

    it('rejects a wrong password', async function () {
      const res = await Auth.loginWithPassword({ username: USERNAME } as any, 'wrong-password');
      assert.ok(res.error);
      assert.strictEqual(res.authToken, '');
    });

    it('issues a token for correct credentials', async function () {
      const res = await Auth.loginWithPassword({ username: USERNAME } as any, PASSWORD);
      assert.strictEqual(res.error, undefined);
      assert.ok(res.authToken.length > 0, 'expected an auth token');
      assert.ok(res.userId.length > 0, 'expected a userId');
    });

    it('stores the issued token hashed, never in the clear', async function () {
      const res = await Auth.loginWithPassword({ username: USERNAME } as any, PASSWORD);
      const hashed = Accounts._hashLoginToken(res.authToken);
      const byHash = await Meteor.users.findOneAsync({
        'services.resume.loginTokens.hashedToken': hashed,
      });
      assert.ok(byHash, 'token should be findable by its hash');

      const raw = JSON.stringify(byHash.services.resume.loginTokens);
      assert.strictEqual(raw.includes(res.authToken), false, 'raw token must not be stored');
    });
  });
});
