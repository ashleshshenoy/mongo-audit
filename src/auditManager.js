const { MongoClient } = require("mongodb");
const EventEmitter = require("events");

class AuditManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.db = null;
    this.collections = [];
    this.auditCollection = "audit_logs";
    this.transform = null;
  }

  /**
   * Initialize the audit system
   * @param {Object} options
   * options.uri - MongoDB URI
   * options.collections - Array of collections to audit
   * options.auditCollection - Optional audit collection name
   * options.transform - Optional transform function (doc) => doc
   */
  async initialize(options) {
    const { uri, collections, auditCollection, transform } = options;
    if (!uri) throw new Error("Mongo URI is required");
    if (!collections || collections.length === 0)
      throw new Error("Collections to audit are required");

    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db();
    this.collections = collections;
    if (auditCollection) this.auditCollection = auditCollection;
    if (transform && typeof transform === "function") this.transform = transform;

    console.log("✅ MongoAudit initialized for collections:", collections);

    // Check and enable pre-images for each collection
    for (const collName of collections) {
      await this.ensurePreImageEnabled(collName); 
    }

  }

  /**
   * Ensure pre-images are enabled for a collection
   */
async ensurePreImageEnabled(collectionName) {
  // Step 1: Get authenticated user info
  const connectionInfo = await this.db.command({ connectionStatus: 1 });
  const userInfo = connectionInfo.authInfo.authenticatedUsers[0];
  console.log("🔐 Connected MongoDB user:", userInfo);

  if (!userInfo) {
    console.warn("⚠️ No authenticated user found. Skipping pre-image setup.");
    return;
  }

  const { user, db: userDb } = userInfo;

  // Step 2: Fetch user roles
  const userDoc = await this.db.admin().command({
    usersInfo: { user, db: userDb },
    showPrivileges: true,
  });

  const userData = userDoc.users[0];
  if (!userData) {
    console.warn(`⚠️ User ${user}@${userDb} not found in system.users`);
    return;
  }

  await this.canRunCollMod(userData)


  // Step 4: Attempt to enable pre-images
  try {
    console.log(`⚙️ Enabling pre-images for collection: ${collectionName}`);
    await this.db.command({
      collMod: collectionName,
      changeStreamPreAndPostImages: { enabled: true },
    });
    console.log(`✅ Pre-images enabled for collection: ${collectionName}`);
  } catch (err) {
    console.warn(
      `⚠️ Could not enable pre-images for '${collectionName}': ${err.message}`
    );
  }
}

/**
 * Check if the current user has permission to run `collMod`
 * @param {Object} userData - result from usersInfo
 * @returns {boolean}
 */
async canRunCollMod(userData) {
  if (!userData) return false;

  // 1️⃣ Check inheritedPrivileges
  if (Array.isArray(userData.inheritedPrivileges)) {
    const hasCollModPrivilege = userData.inheritedPrivileges.some((priv) => {
      const actions = priv.actions || [];
      return actions.includes("collMod") || actions.includes("anyAction");
    });
    if (hasCollModPrivilege) return true;
  }

  // 2️⃣ Check privileges (explicit, not inherited)
  if (Array.isArray(userData.privileges)) {
    const hasCollModPrivilege = userData.privileges.some((priv) => {
      const actions = priv.actions || [];
      return actions.includes("collMod") || actions.includes("anyAction");
    });
    if (hasCollModPrivilege) return true;
  }

  // 3️⃣ Check roles
  const roles = userData.roles || [];
  const hasAdminRole = roles.some((role) =>
    [
      "dbAdmin",
      "dbOwner",
      "root",
      "atlasAdmin",
      "dbAdminAnyDatabase",
    ].includes(role.role)
  );
  if (hasAdminRole) return true;

  // 4️⃣ Check inheritedRoles as backup
  const inheritedRoles = userData.inheritedRoles || [];
  const hasInheritedAdmin = inheritedRoles.some((role) =>
    [
      "dbAdmin",
      "dbOwner",
      "root",
      "atlasAdmin",
      "dbAdminAnyDatabase",
    ].includes(role.role)
  );
  if (hasInheritedAdmin) return true;

  return false;
}



  /**
   * Start listening to changes
   */
  async start() {
    if (!this.db) throw new Error("Call initialize() first");

    for (const collName of this.collections) {
      const coll = this.db.collection(collName);

      // Request both before and after states
      const changeStream = coll.watch([], {
        fullDocument: "updateLookup",
        fullDocumentBeforeChange: "required", // 👈 Correct option
      });

      changeStream.on("change", async (change) => {
        const auditDoc = await this.createAuditDoc(change, collName);
        await this.db.collection(this.auditCollection).insertOne(auditDoc);
        this.emit("audit", auditDoc);
      });
    }

    console.log("🚀 MongoAudit started and listening for changes...");
  }

  /**
   * Create before/after audit document
   */
  async createAuditDoc(change, collectionName) {
    const {
      operationType,
      fullDocument,
      fullDocumentBeforeChange,
      documentKey,
    } = change;

    const before = fullDocumentBeforeChange || null;
    const after = fullDocument || null;

    // Apply transform if available
    const transformedBefore = before && this.transform ? this.transform(before) : before;
    const transformedAfter = after && this.transform ? this.transform(after) : after;

    return {
      collection: collectionName,
      documentId: documentKey._id,
      operation: operationType,
      timestamp: new Date(),
      before: transformedBefore,
      after: transformedAfter,
    };
  }
}

module.exports = { AuditManager };
