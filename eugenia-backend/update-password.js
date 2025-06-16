const bcrypt = require('bcryptjs');

const password = 'pussycat13';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error hashing password:', err);
    return;
  }
  console.log('Password hash for "pussycat13":');
  console.log(hash);
  console.log('\nUpdate your .env file with:');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
});