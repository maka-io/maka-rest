import http from 'http';
import { Meteor } from 'meteor/meteor';

import MakaRest from '../lib/maka-rest';
import Codes from '../lib/codes';

/**
 * The default auth endpoints are wired by whichever MakaRest instance is
 * constructed first in the process, and only if `loginType` is already set at
 * that moment -- MakaRest.Settings latches `defaultAuthInitialized` either way.
 * All instance construction is therefore centralised in this file, which is
 * listed first in package.js so nothing can beat it to the latch.
 */
MakaRest.auth.loginType = 'default';

export const authEvents: string[] = [];
MakaRest.auth.onLoggedIn(() => authEvents.push('in'));
MakaRest.auth.onLoggedOut(() => authEvents.push('out'));
MakaRest.auth.onLoginFailure(() => authEvents.push('fail'));

export const api = new MakaRest({ apiPath: 'test', version: 'v1' });

// Mounted under /api/v1/test
api.addRoute('echo/:id', {}, {
  get: (ctx: any) => Codes.success200({ id: ctx.urlParams.id }),
});

api.addRoute('deep/:id/comments/:commentId', {}, {
  get: (ctx: any) => Codes.success200(ctx.urlParams),
});

// Returns nothing: exercises the falsy -> noContent204 path in _callEndpoint.
api.addRoute('empty', {}, {
  get: () => undefined,
});

api.addRoute('created', {}, {
  post: (ctx: any) => Codes.success201({ got: ctx.bodyParams }),
});

api.addRoute('locked', { authRequired: true }, {
  get: (ctx: any) => Codes.success200({ userId: ctx.userId }),
});

// Missing statusCode/data: _callEndpoint throws, handler answers 500.
api.addRoute('bad-shape', {}, {
  get: () => ({ nope: true }),
});

export interface RawResponse {
  status: number;
  headers: Record<string, any>;
  body: string;
  json: any;
}

/**
 * Issues a request with the path sent verbatim. `fetch` would run the path
 * through the WHATWG URL parser and normalise it before it ever hit the wire,
 * which would make dot-segment tests meaningless.
 */
export function request(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const root = new URL(Meteor.absoluteUrl());
    const req = http.request(
      {
        hostname: root.hostname,
        port: root.port || 80,
        path,
        method: opts.method || 'GET',
        headers: opts.headers || {},
        // Node keeps agent sockets alive by default, which holds the event loop
        // open and stops `--once` runs from exiting.
        agent: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let json: any;
          try {
            json = JSON.parse(body);
          } catch (e) {
            json = undefined;
          }
          resolve({ status: res.statusCode as number, headers: res.headers, body, json });
        });
      }
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export const testPath = (p: string) => `/api/v1/test/${p}`;
export const rootPath = (p: string) => `/api/${p}`;
