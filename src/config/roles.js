/**
 * System-Wide Roles Definition
 */
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  MANAGER: 'MANAGER',
  AGENT: 'AGENT',
  STAFF: 'STAFF',
  CUSTOMER: 'CUSTOMER',
};

const ALL_ROLES = Object.values(ROLES);

module.exports = {
  ROLES,
  ALL_ROLES,
};
