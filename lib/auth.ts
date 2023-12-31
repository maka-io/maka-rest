/**
 * auth.ts
 * This module provides authentication functionalities for the Maka:rest package.
 * It includes methods for user login validation and token generation.
 */
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

import {
  Auth as IAuth
} from '@maka/types';


/**
 * Class handling authentication processes.
 */
class Auth implements IAuth {
  /**
   * Authenticates a user with a password.
   * @param user - Partial Meteor.User object.
   * @param password - User's password or Password object.
   * @returns AuthToken object containing authToken, userId, and token creation time.
   * @throws AuthToken with an error if authentication fails.
   */
  static async loginWithPassword(user: Partial<Meteor.User>, password: string | IAuth.Password): Promise<IAuth.AuthToken> {
    try {
      if (!user || !password) {
        throw new Error('Unauthorized');
      }

      // Validate the login input
      this.validateUser(user);
      this.validatePassword(password);

      // Retrieve the user from the database
      const authenticatingUserSelector = this.getUserQuerySelector(user);
      const authenticatingUser = Meteor.users.findOne(authenticatingUserSelector);

      if (!authenticatingUser) {
        throw 'Unauthorized';
      }
      if (!authenticatingUser.services?.password) {
        throw 'Unauthorized';
      }

      // Authenticate the user's password
      const passwordVerification = Accounts._checkPassword(authenticatingUser, password);
      if (passwordVerification.error) {
        throw 'Unauthorized';
      }

      // Add a new auth token to the user's account
      const authToken = Accounts._generateStampedLoginToken();
      const hashedToken = Accounts._hashLoginToken(authToken.token);
      Accounts._insertHashedLoginToken(authenticatingUser._id, { hashedToken, when: new Date() });

      return { authToken: authToken.token, userId: authenticatingUser._id, when: authToken.when };
    } catch (error: any) {
      return { authToken: '', userId: '', when: new Date(), error };
    }
  }

  /**
   * Validates a Meteor user object to ensure it contains exactly one unique identifier.
   * The user object can be identified by _id, username, or email, but only one of these
   * should be present to pass validation.
   *
   * @param user - A partial object representing a Meteor user.
   * @throws Error if the user does not have exactly one identifier.
   */
  private static validateUser(user: Partial<Meteor.User>): void {
    let identifierCount = 0;

    if (user._id) identifierCount++;
    if (user.username) identifierCount++;
    if (user.emails && user.emails.length > 0) identifierCount++;

    if (identifierCount !== 1) {
      throw new Error('User must have exactly one identifier field');
    }
  }

  /**
   * Validates the password format for authentication.
   * This method supports two types of password formats: a plain string and a Password object.
   * If the password is an object, it must contain both 'digest' and 'algorithm' properties.
   *
   * @param password - The user's password, either as a plain string or as a Password object.
   * @throws Error if the password object does not have the required 'digest' and 'algorithm' properties.
   */
  private static validatePassword(password: string | IAuth.Password): void {
    if (typeof password === 'string') return;
    if (!password.digest || !password.algorithm) {
      throw new Error('Invalid password format');
    }
  }

  /**
   * Constructs a query selector for identifying a user in the database.
   * This method creates a selector based on the available user identifier: _id, username, or email.
   * Only one identifier is used to create the selector. If multiple identifiers are provided,
   * the method prioritizes them in the order of _id, username, and then email.
   *
   * @param user - A partial object representing a Meteor.User with potential identifier fields.
   * @returns An object representing the query selector for the database.
   * @throws Error if no valid identifier is found in the user object.
   */
  static getUserQuerySelector(user: Partial<Meteor.User>): Partial<Meteor.User> {
    if (user._id) {
      return { '_id': user._id };
    } else if (user.username) {
      return { 'username': user.username };
    } else if (user.emails && user.emails.length > 0 && user.emails[0].address) {
      return { 'emails.address': user.emails[0].address };
    }

    throw new Error('Cannot create selector from invalid user');
  }

  static extractUser(body: BodyParams): Partial<Meteor.User> {
    if (body.username) {
      return { username: body.username };
    } else if (body.email) {
      return { emails: [{ address: body.email, verified: false }] };
    } else {
      throw new Error('Username or email must be provided');
    }
  }

  static extractPassword(body: IAuth.BodyParams): string | IAuth.Password {
    return body.hashed ? { digest: body.password, algorithm: 'sha-256' } : body.password;
  }
}

export { Auth };
