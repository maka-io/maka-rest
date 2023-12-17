import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

interface Password {
  digest: string;
  algorithm: "sha-256";
}

class Auth {
  static async loginWithPassword(user: Partial<Meteor.User>, password: string | Password) {
    if (!user || !password) {
      throw new Error('Unauthorized');
    }

    // Validate the login input
    this.validateUser(user);
    this.validatePassword(password);

    console.log(user);
    console.log(password);

    // Retrieve the user from the database
    const authenticatingUserSelector = this.getUserQuerySelector(user);
    const authenticatingUser = await Meteor.users.findOneAsync(authenticatingUserSelector);

    if (!authenticatingUser) {
      throw new Error('Unauthorized');
    }
    if (!authenticatingUser.services?.password) {
      throw new Error('Unauthorized');
    }

    // Authenticate the user's password
    const passwordVerification = await Accounts._checkPassword(authenticatingUser, password);
    if (passwordVerification.error) {
      throw new Error('Unauthorized');
    }

    // Add a new auth token to the user's account
    const authToken = await Accounts._generateStampedLoginToken();
    const hashedToken = await Accounts._hashLoginToken(authToken.token);
    Accounts._insertHashedLoginToken(authenticatingUser._id, { hashedToken, when: new Date() });

    return { authToken: authToken.token, userId: authenticatingUser._id, when: authToken.when };
  }

  private static validateUser(user: Partial<Meteor.User>): void {
    let identifierCount = 0;

    if (user._id) identifierCount++;
    if (user.username) identifierCount++;
    if (user.emails && user.emails.length > 0) identifierCount++;

    if (identifierCount !== 1) {
      throw new Error('User must have exactly one identifier field');
    }
  }

  private static validatePassword(password: string | Password): void {
    if (typeof password === 'string') return;
    if (!password.digest || !password.algorithm) {
      throw new Error('Invalid password format');
    }
  }

  static getUserQuerySelector(user: Partial<Meteor.User>) {
    if (user._id) {
      return { '_id': user._id };
    } else if (user.username) {
      return { 'username': user.username };
    } else if (user.emails && user.emails.length > 0 && user.emails[0].address) {
      return { 'emails.address': user.emails[0].address };
    }

    throw new Error('Cannot create selector from invalid user');
  }
}

export { Auth };
