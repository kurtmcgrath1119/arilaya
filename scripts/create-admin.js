require('dotenv').config();
const readline = require('readline');
const db = require('../db');

function question(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

function secretQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise(resolve => {
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = () => {};
    process.stdout.write(query);
    rl.question('', answer => {
      rl._writeToOutput = originalWrite;
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const user = data.users.find(item => item.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || await question('Admin email: ')).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
  let password = process.env.ADMIN_PASSWORD || await secretQuestion('Admin password: ');
  if (!process.env.ADMIN_PASSWORD) {
    const confirm = await secretQuestion('Confirm password: ');
    if (password !== confirm) throw new Error('Passwords do not match.');
  }
  if (password.length < 8) throw new Error('Use at least 8 characters for the admin password.');

  let user = await findUserByEmail(email);
  if (user) {
    const { data, error } = await db.supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw new Error(error.message);
    user = data.user;
  } else {
    const { data, error } = await db.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: email.split('@')[0] }
    });
    if (error) throw new Error(error.message);
    user = data.user;
  }

  const updated = await db.query("UPDATE profiles SET role = 'admin' WHERE id = $1", [user.id]);
  if (!updated.rowCount) {
    await db.query("INSERT INTO profiles (id, email, name, role) VALUES ($1, $2, $3, 'admin')",
      [user.id, user.email, user.user_metadata?.name || email.split('@')[0]]);
  }
  console.log(`Admin access is ready for ${email}.`);
}

main().catch(error => {
  console.error(`Admin setup failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await db.pool.end();
});
