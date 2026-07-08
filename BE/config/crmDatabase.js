// config/crmDatabase.js
const mongoose = require("mongoose");

let crmDB;
let isConnecting = false;
let connectionPromise = null;

async function connectCRMDatabase() {
  // If connection already exists and is ready, return it
  if (crmDB && crmDB.readyState === 1) {
    return crmDB;
  }

  // If connection is in progress (connecting state), wait for it
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // If connection exists but is connecting (readyState === 2), wait for it
  if (crmDB && crmDB.readyState === 2) {
    return new Promise((resolve, reject) => {
      crmDB.once('connected', () => resolve(crmDB));
      crmDB.once('error', reject);
    });
  }

  // If connection exists but is not ready (disconnected/broken), try to reconnect
  if (crmDB && crmDB.readyState !== 1) {
    try {
      await crmDB.close();
    } catch (err) {
      // Ignore close errors
    }
    crmDB = null;
  }

  // Create new connection with proper pooling
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      crmDB = await mongoose.createConnection(process.env.CRMDATABASE, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10, // Maximum number of connections in the pool
        minPoolSize: 2, // Minimum number of connections in the pool
        serverSelectionTimeoutMS: 5000, // How long to try selecting a server
        socketTimeoutMS: 45000, // How long to wait for a socket to be available
        connectTimeoutMS: 10000, // How long to wait for initial connection
      });

      // Handle connection events
      crmDB.on('connected', () => {
        console.log("✅ CRM Database connected");
        isConnecting = false;
      });

      crmDB.on('error', (err) => {
        console.error("❌ CRM Database connection error:", err);
        isConnecting = false;
        crmDB = null;
      });

      crmDB.on('disconnected', () => {
        console.warn("⚠️ CRM Database disconnected");
        crmDB = null;
        isConnecting = false;
      });

      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        if (crmDB.readyState === 1) {
          resolve();
        } else {
          crmDB.once('connected', resolve);
          crmDB.once('error', reject);
        }
      });

      return crmDB;
    } catch (error) {
      console.error("❌ CRM Database connection error:", error);
      isConnecting = false;
      crmDB = null;
      throw error;
    }
  })();

  return connectionPromise;
}

// Function to get the current connection (for graceful shutdown)
function getCRMDatabase() {
  return crmDB;
}

// Function to close the connection gracefully
async function closeCRMDatabase() {
  if (crmDB && crmDB.readyState === 1) {
    try {
      await crmDB.close();
      console.log("✅ CRM Database connection closed gracefully");
      crmDB = null;
      isConnecting = false;
      connectionPromise = null;
    } catch (error) {
      console.error("❌ Error closing CRM Database connection:", error);
    }
  }
}

module.exports = connectCRMDatabase;
module.exports.getCRMDatabase = getCRMDatabase;
module.exports.closeCRMDatabase = closeCRMDatabase;