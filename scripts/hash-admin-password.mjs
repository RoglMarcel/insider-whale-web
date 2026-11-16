// Prints the ADMIN_PASSWORD_HASH verifier for the access Worker. The password is
// read from the terminal without echo and is never stored or sent anywhere.
import { pbkdf2Sync, randomBytes } from 'node:crypto';
if (!process.stdin.isTTY) throw new Error('Run this in an interactive terminal.');
process.stdout.write('Admin password: ');
process.stdin.setRawMode(true);
let password = '';
for await (const chunk of process.stdin) {
  const text = chunk.toString('utf8');
  if (text === '\u0003') process.exit(1);
  if (text === '\r' || text === '\n') break;
  password = text === '\u007f' ? password.slice(0, -1) : password + text;
}
process.stdin.setRawMode(false);
if (!password) throw new Error('Empty password.');
const salt = randomBytes(16).toString('hex');
console.log(`\npbkdf2$100000$${salt}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')}`);
process.exit(0);
