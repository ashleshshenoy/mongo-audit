# Mongo-Audit


**Mongo-Audit** is a Node.js package for auditing MongoDB collections using change streams.  
It captures **before and after document states** for insert, update, and delete operations, and stores them in an audit collection.  

This allows you to **track changes**, **debug issues**, or **implement compliance logging** for your MongoDB applications.

---

## ⚡ Installation

```bash
npm install mongo-audit
```
---



## 🚀 Features

- Supports multiple collections
- Tracks `before` and `after` document states
- Optional transform function for customized audit logs
- Works with MongoDB Atlas 
- Emits events when an audit log is created (`audit` event)

---

## 💡 Use Case

- **Compliance and Auditing**: Maintain a history of all changes for legal or regulatory compliance.  
- **Debugging & Recovery**: Recover previous document states in case of accidental updates or deletions.  
- **Analytics & Monitoring**: Monitor how your data changes over time.  
- **Application Logging**: Keep a centralized log of database operations for operational transparency.


## 📝 Quick Hono Integration Example

```js
import { Hono } from 'hono';
import { MongoAudit } from 'mongo-audit';

const app = new Hono();

// Initialize audit manager
await MongoAudit.initialize({
  uri: 'mongodb://localhost:27017/mydb',
  collections: ['users'],
  auditCollection: "audit_logs"
});

// Listen for audit events
audit.on('audit', (log) => console.log('Audit log:', log));

// Start change stream listener
await audit.start();

// Hono API route example
app.post('/hello', async (c) => {
    // route handler
});

app.listen({ port: 3000 });
