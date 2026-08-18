const bcrypt = require('bcryptjs');
const environment = require('../config/environment');

class PasswordUtil {
  static async hash(plainPassword) {
    const salt = await bcrypt.genSalt(environment.bcryptSaltRounds);
    return bcrypt.hash(plainPassword, salt);
  }

  static async compare(plainPassword, hashedPassword) {
    if (!plainPassword || !hashedPassword) return false;
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

module.exports = PasswordUtil;
