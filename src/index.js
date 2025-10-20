const { AuditManager } = require("./auditManager");

module.exports = {
  MongoAudit: new AuditManager()
};
