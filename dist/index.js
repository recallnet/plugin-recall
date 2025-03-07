// src/services/recall.service.ts
import {
  elizaLogger as elizaLogger2,
  Service
} from "@elizaos/core";
import { getChain, testnet } from "@recallnet/chains";
import { RecallClient, walletClientFromPrivateKey } from "@recallnet/sdk/client";
import { parseEther } from "viem";

// src/utils.ts
import { elizaLogger } from "@elizaos/core";

// ../../node_modules/uuid/dist/esm-node/rng.js
import crypto from "crypto";
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    crypto.randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// ../../node_modules/uuid/dist/esm-node/regex.js
var regex_default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

// ../../node_modules/uuid/dist/esm-node/validate.js
function validate(uuid) {
  return typeof uuid === "string" && regex_default.test(uuid);
}
var validate_default = validate;

// ../../node_modules/uuid/dist/esm-node/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).substr(1));
}
function stringify(arr, offset = 0) {
  const uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
  if (!validate_default(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}
var stringify_default = stringify;

// ../../node_modules/uuid/dist/esm-node/v4.js
function v4(options, buf, offset) {
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return stringify_default(rnds);
}
var v4_default = v4;

// src/utils.ts
async function logMemoryPostgres(db, params) {
  const roomCheck = await db.query("SELECT id FROM rooms WHERE id = $1", [params.roomId]);
  if (roomCheck.rows.length === 0) {
    await db.query("INSERT INTO rooms (id) VALUES ($1)", [params.roomId]);
  }
  await db.query(
    `INSERT INTO logs (id, body, "userId", "agentId", "roomId", type, "isSynced")
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
    [v4_default(), params.body, params.userId, params.agentId, params.roomId, params.type]
  );
}
async function logMemorySqlite(db, params) {
  const sql = `
            INSERT INTO logs (id, userId, agentId, roomId, type, body, isSynced)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `;
  db.prepare(sql).run(v4_default(), params.userId, params.agentId, params.roomId, params.type, params.body);
}
async function getUnsyncedLogsPostgres(db) {
  const { rows } = await db.query(
    `SELECT id, body, "userId", "agentId", "roomId", type, "createdAt"
         FROM logs WHERE "isSynced" = FALSE
         ORDER BY "createdAt" ASC
         LIMIT 100`
  );
  return rows.map((row) => ({
    ...row,
    body: typeof row.body === "string" ? row.body : JSON.stringify(row.body)
  }));
}
async function markLogsAsSyncedPostgres(db, logIds) {
  if (logIds.length === 0) {
    elizaLogger.warn("\u26A0 No log IDs provided for marking as synced.");
    return;
  }
  elizaLogger.info(`\u2705 Marking logs as synced: ${JSON.stringify(logIds)}`);
  const placeholders = logIds.map((_, i) => `$${i + 1}`).join(", ");
  try {
    await db.query(`UPDATE logs SET "isSynced" = TRUE WHERE id IN (${placeholders})`, logIds);
    elizaLogger.info(`\u2705 Successfully marked ${logIds.length} logs as synced.`);
  } catch (error) {
    elizaLogger.error(`\u274C Failed to mark logs as synced: ${error.message}`, {
      logIds,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
async function getUnsyncedLogsSqlite(db) {
  const sql = "SELECT id, type, body FROM logs WHERE isSynced = 0 ORDER BY createdAt ASC";
  return db.prepare(sql).all();
}
async function markLogsAsSyncedSqlite(db, logIds) {
  if (logIds.length === 0) return;
  const placeholders = logIds.map(() => "?").join(", ");
  const sql = `UPDATE logs SET isSynced = 1 WHERE id IN (${placeholders})`;
  db.prepare(sql).run(...logIds);
}

// src/services/recall.service.ts
var privateKey = process.env.RECALL_PRIVATE_KEY;
var envAlias = process.env.RECALL_BUCKET_ALIAS;
var envPrefix = process.env.RECALL_COT_LOG_PREFIX;
var network = process.env.RECALL_NETWORK;
var intervalPeriod = process.env.RECALL_SYNC_INTERVAL;
var batchSize = process.env.RECALL_BATCH_SIZE;
var RecallService = class _RecallService extends Service {
  static serviceType = "recall";
  client;
  runtime;
  syncInterval;
  alias;
  prefix;
  intervalMs;
  batchSizeKB;
  getInstance() {
    return _RecallService.getInstance();
  }
  async initialize(_runtime) {
    try {
      if (!privateKey) {
        throw new Error("RECALL_PRIVATE_KEY is required");
      }
      if (!envAlias) {
        throw new Error("RECALL_BUCKET_ALIAS is required");
      }
      if (!envPrefix) {
        throw new Error("RECALL_COT_LOG_PREFIX is required");
      }
      const chain = network ? getChain(network) : testnet;
      const wallet = walletClientFromPrivateKey(privateKey, chain);
      this.client = new RecallClient({ walletClient: wallet });
      this.alias = envAlias;
      this.prefix = envPrefix;
      this.runtime = _runtime;
      this.intervalMs = intervalPeriod ? parseInt(intervalPeriod, 10) : 2 * 60 * 1e3;
      this.batchSizeKB = batchSize ? parseInt(batchSize, 10) : 4;
      await this.ensureRequiredColumns();
      this.startPeriodicSync(this.intervalMs, this.batchSizeKB);
      elizaLogger2.success("RecallService initialized successfully, starting periodic sync.");
    } catch (error) {
      elizaLogger2.error(`Error initializing RecallService: ${error.message}`);
    }
  }
  /**
   * Ensures that the isSynced column exists in the logs table.
   * If it doesn't exist, it adds the column with a default value of false.
   */
  async ensureRequiredColumns() {
    try {
      const db = this.runtime.databaseAdapter;
      await this.ensureColumn(db, "isSynced", "BOOLEAN", "INTEGER", "FALSE", "0");
      await this.ensureColumn(db, "agentId", "TEXT", "TEXT", "NULL", "NULL");
    } catch (error) {
      elizaLogger2.error(`Error ensuring required columns: ${error.message}`);
      throw error;
    }
  }
  async ensureColumn(db, columnName, pgType, sqliteType, pgDefault, sqliteDefault) {
    try {
      let columnExists = false;
      if ("pool" in db) {
        const result = await db.pool.query(
          `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name='logs' AND column_name=$1
        `,
          [columnName]
        );
        columnExists = result.rowCount > 0;
      } else if ("db" in db) {
        const result = db.db.prepare(`PRAGMA table_info(logs)`).all();
        columnExists = result.some((col) => col.name === columnName);
      } else {
        throw new Error("Unsupported database adapter");
      }
      if (!columnExists) {
        elizaLogger2.info(`Adding ${columnName} column to logs table`);
        if ("pool" in db) {
          await db.pool.query(`
            ALTER TABLE logs 
            ADD COLUMN "${columnName}" ${pgType} DEFAULT ${pgDefault}
          `);
        } else if ("db" in db) {
          await db.db.prepare(
            `
            ALTER TABLE logs 
            ADD COLUMN ${columnName} ${sqliteType} DEFAULT ${sqliteDefault}
          `
          ).run();
        }
        elizaLogger2.info(`Successfully added ${columnName} column to logs table`);
      } else {
        elizaLogger2.info(`${columnName} column already exists in logs table`);
      }
    } catch (error) {
      elizaLogger2.error(`Error ensuring ${columnName} column: ${error.message}`);
      throw error;
    }
  }
  /**
   * Utility function to handle timeouts for async operations.
   * @param promise The promise to execute.
   * @param timeoutMs The timeout in milliseconds.
   * @param operationName The name of the operation for logging.
   * @returns The result of the promise.
   */
  async withTimeout(promise, timeoutMs, operationName) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  /**
   * Gets the account information for the current user.
   * @returns The account information.
   */
  async getAccountInfo() {
    try {
      const info = await this.client.accountManager().info();
      return info.result;
    } catch (error) {
      elizaLogger2.error(`Error getting account info: ${error.message}`);
      throw error;
    }
  }
  /**
   * Lists all buckets in Recall.
   * @returns The list of buckets.
   */
  async listBuckets() {
    try {
      const info = await this.client.bucketManager().list();
      return info.result;
    } catch (error) {
      elizaLogger2.error(`Error listing buckets: ${error.message}`);
      throw error;
    }
  }
  /**
   * Gets the credit information for the account.
   * @returns The credit information.
   */
  async getCreditInfo() {
    try {
      const info = await this.client.creditManager().getAccount();
      return info.result;
    } catch (error) {
      elizaLogger2.error(`Error getting credit info: ${error.message}`);
      throw error;
    }
  }
  /**
   * Buys credit for the account.
   * @param amount The amount of credit to buy.
   * @returns The result of the buy operation.
   */
  async buyCredit(amount) {
    try {
      const info = await this.client.creditManager().buy(parseEther(amount));
      return info;
    } catch (error) {
      elizaLogger2.error(`Error buying credit: ${error.message}`);
      throw error;
    }
  }
  /**
   * Gets or creates a log bucket in Recall.
   * @param bucketAlias The alias of the bucket to retrieve or create.
   * @returns The address of the log bucket.
   */
  async getOrCreateBucket(bucketAlias) {
    try {
      elizaLogger2.info(`Looking for bucket with alias: ${bucketAlias}`);
      const buckets = await this.client.bucketManager().list();
      if (buckets?.result) {
        const bucket = buckets.result.find((b) => b.metadata?.alias === bucketAlias);
        if (bucket) {
          elizaLogger2.info(`Found existing bucket "${bucketAlias}" at ${bucket.addr}`);
          return bucket.addr;
        } else {
          elizaLogger2.info(`Bucket with alias "${bucketAlias}" not found, creating a new one.`);
        }
      }
      const query = await this.client.bucketManager().create({
        metadata: { alias: bucketAlias }
      });
      const newBucket = query.result;
      if (!newBucket) {
        elizaLogger2.error(`Failed to create new bucket with alias: ${bucketAlias}`);
        throw new Error(`Failed to create bucket: ${bucketAlias}`);
      }
      elizaLogger2.info(`Successfully created new bucket "${bucketAlias}" at ${newBucket.bucket}`);
      return newBucket.bucket;
    } catch (error) {
      elizaLogger2.error(`Error in getOrCreateBucket: ${error.message}`);
      throw error;
    }
  }
  /**
   * Adds an object to a bucket.
   * @param bucket The address of the bucket.
   * @param key The key under which to store the object.
   * @param data The data to store (string, File, or Uint8Array).
   * @param options Optional parameters:
   *   - overwrite: Whether to overwrite existing object with same key (default: false)
   *   - ttl: Time-to-live in seconds (must be >= MIN_TTL if specified)
   *   - metadata: Additional metadata key-value pairs
   * @returns A Result object containing:
   *   - result: Empty object ({})
   *   - meta: Optional metadata including transaction receipt
   * @throws {InvalidValue} If object size exceeds MAX_OBJECT_SIZE or TTL is invalid
   * @throws {ActorNotFound} If the bucket or actor is not found
   * @throws {AddObjectError} If the object addition fails
   */
  async addObject(bucket, key, data, options) {
    try {
      const info = await this.client.bucketManager().add(bucket, key, data, {
        overwrite: options?.overwrite ?? false
      });
      return info;
    } catch (error) {
      elizaLogger2.error(`Error adding object: ${error.message}`);
      throw error;
    }
  }
  /**
   * Gets an object from a bucket.
   * @param bucket The address of the bucket.
   * @param key The key under which the object is stored.
   * @returns The data stored under the specified key.
   */
  async getObject(bucket, key) {
    try {
      const info = await this.client.bucketManager().get(bucket, key);
      return info.result;
    } catch (error) {
      elizaLogger2.warn(`Error getting object: ${error.message}`);
      return void 0;
    }
  }
  /**
   * Fetches unsynchronized logs based on the isSynced field.
   * @returns Array of logs that haven't been synced yet.
   */
  async getUnsyncedLogs() {
    try {
      const db = this.runtime.databaseAdapter;
      if ("pool" in db) {
        return await getUnsyncedLogsPostgres(db.pool);
      } else if ("db" in db) {
        return await getUnsyncedLogsSqlite(db.db);
      } else {
        throw new Error("Unsupported database adapter");
      }
    } catch (error) {
      elizaLogger2.error(`Error getting unsynced logs: ${error.message}`);
      return [];
    }
  }
  /**
   * Marks logs as synced in the database.
   * @param logIds The IDs of the logs to mark as synced.
   * @returns Whether the operation was successful.
   */
  async markLogsAsSynced(logIds) {
    if (logIds.length === 0) {
      return true;
    }
    try {
      const db = this.runtime.databaseAdapter;
      if ("pool" in db) {
        await markLogsAsSyncedPostgres(db.pool, logIds);
      } else if ("db" in db) {
        await markLogsAsSyncedSqlite(db.db, logIds);
      } else {
        throw new Error("Unsupported database adapter");
      }
      return true;
    } catch (error) {
      elizaLogger2.error(`Error marking logs as synced: ${error.message}`);
      return false;
    }
  }
  async runRawQuery(dbAdapter, query, params) {
    if ("pool" in dbAdapter) {
      return (await dbAdapter.pool.query(query, params)).rows;
    } else if ("db" in dbAdapter) {
      return dbAdapter.db.prepare(query).all(...params || []);
    } else {
      throw new Error("Unsupported database adapter");
    }
  }
  /**
   * Stores a batch of logs to Recall.
   * @param bucketAddress The address of the bucket to store logs.
   * @param batch The batch of logs to store.
   * @param timestamp The timestamp to use in the key.
   * @returns The key under which the logs were stored.
   */
  async storeBatchToRecall(bucketAddress, batch, timestamp) {
    try {
      const nextLogKey = `${this.prefix}${timestamp}.jsonl`;
      const batchData = batch.join("\n");
      const addObject = await this.withTimeout(
        this.client.bucketManager().add(bucketAddress, nextLogKey, new TextEncoder().encode(batchData)),
        3e4,
        // 30 second timeout
        "Recall batch storage"
      );
      if (!addObject?.meta?.tx) {
        elizaLogger2.error("Recall API returned invalid response for batch storage");
        return void 0;
      }
      elizaLogger2.info(`Successfully stored batch at key: ${nextLogKey}`);
      return nextLogKey;
    } catch (error) {
      if (error.message.includes("timed out")) {
        elizaLogger2.error(`Recall API timed out while storing batch`);
      } else {
        elizaLogger2.error(`Error storing JSONL logs in Recall: ${error.message}`);
      }
      return void 0;
    }
  }
  /**
   * Syncs logs to Recall in batches.
   * @param bucketAlias The alias of the bucket to store logs.
   * @param batchSizeKB The maximum size of each batch in kilobytes.
   */
  async syncLogsToRecall(bucketAlias, batchSizeKB = 4) {
    try {
      const bucketAddress = await this.withTimeout(
        this.getOrCreateBucket(bucketAlias),
        15e3,
        // 15 second timeout
        "Get/Create bucket"
      );
      const unsyncedLogs = await this.getUnsyncedLogs();
      if (unsyncedLogs.length === 0) {
        elizaLogger2.info("No unsynced logs to process.");
        return;
      }
      elizaLogger2.info(`Found ${unsyncedLogs.length} unsynced logs.`);
      let batch = [];
      let batchSize2 = 0;
      let processedLogIds = [];
      let batchTimestamp = Date.now().toString();
      unsyncedLogs.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      for (const log of unsyncedLogs) {
        try {
          const parsedLog = JSON.parse(log.body);
          const jsonlEntry = JSON.stringify({
            userId: parsedLog.userId,
            agentId: parsedLog.agentId,
            userMessage: parsedLog.userMessage,
            log: parsedLog.log,
            createdAt: log.createdAt
            // Include createdAt in the stored log
          });
          const logSize = new TextEncoder().encode(jsonlEntry).length;
          elizaLogger2.info(`Processing log entry of size: ${logSize} bytes`);
          elizaLogger2.info(`New batch size: ${batchSize2 + logSize} bytes`);
          if (batchSize2 > 0 && batchSize2 + logSize > batchSizeKB * 1024) {
            elizaLogger2.info(
              `Batch size ${batchSize2 + logSize} bytes exceeds ${batchSizeKB} KB limit. Attempting sync...`
            );
            const logFileKey = await this.storeBatchToRecall(bucketAddress, batch, batchTimestamp);
            if (logFileKey) {
              elizaLogger2.info(`Successfully synced batch of ${batch.length} logs`);
              if (processedLogIds.length > 0) {
                const success = await this.markLogsAsSynced(processedLogIds);
                if (!success) {
                  elizaLogger2.warn(`Failed to mark logs as synced - will retry on next sync`);
                }
              }
            } else {
              elizaLogger2.warn(
                `Failed to sync batch of ${batch.length} logs - will retry on next sync`
              );
              continue;
            }
            batch = [];
            batchSize2 = 0;
            processedLogIds = [];
            batchTimestamp = Date.now().toString();
          }
          batch.push(jsonlEntry);
          batchSize2 += logSize;
          processedLogIds.push(log.id);
        } catch (error) {
          elizaLogger2.error(`Error processing log entry ${log.id}: ${error.message}`);
        }
      }
      if (batch.length > 0) {
        elizaLogger2.info(`Storing final batch of ${batch.length} logs (${batchSize2} bytes)`);
        const logFileKey = await this.storeBatchToRecall(bucketAddress, batch, batchTimestamp);
        if (logFileKey) {
          if (processedLogIds.length > 0) {
            const success = await this.markLogsAsSynced(processedLogIds);
            if (!success) {
              elizaLogger2.warn(`Failed to mark logs as synced - will retry on next sync`);
            }
          }
        } else {
          elizaLogger2.warn(`Failed to sync final batch of ${batch.length} logs`);
        }
      }
      const logSyncInterval = this.intervalMs < 6e4 ? `${this.intervalMs / 1e3} seconds` : `${this.intervalMs / 1e3 / 60} minutes`;
      elizaLogger2.info(`Sync cycle complete. Next sync in ${logSyncInterval}.`);
    } catch (error) {
      if (error.message.includes("timed out")) {
        elizaLogger2.error(`Recall sync operation timed out: ${error.message}`);
      } else {
        elizaLogger2.error(`Error in syncLogsToRecall: ${error.message}`);
      }
    }
  }
  /**
   * Retrieve and order all chain-of-thought logs from Recall.
   * @param bucketAlias The alias of the bucket to query.
   * @returns An array of ordered chain-of-thought logs.
   */
  async retrieveOrderedChainOfThoughtLogs(bucketAlias) {
    try {
      const bucketAddress = await this.getOrCreateBucket(bucketAlias);
      elizaLogger2.info(`Retrieving chain-of-thought logs from bucket: ${bucketAddress}`);
      const queryResult = await this.client.bucketManager().query(bucketAddress, { prefix: this.prefix });
      if (!queryResult.result?.objects.length) {
        elizaLogger2.info(`No chain-of-thought logs found in bucket: ${bucketAlias}`);
        return [];
      }
      const logFiles = queryResult.result.objects.map((obj) => obj.key).filter((key) => key.startsWith(this.prefix) && key.endsWith(".jsonl")).sort((a, b) => {
        const timeA = parseInt(a.slice(this.prefix.length, -6), 10);
        const timeB = parseInt(b.slice(this.prefix.length, -6), 10);
        return timeA - timeB;
      });
      elizaLogger2.info(`Retrieving ${logFiles.length} ordered chain-of-thought logs...`);
      let allLogs = [];
      for (const logFile of logFiles) {
        try {
          const logData = await this.client.bucketManager().get(bucketAddress, logFile);
          if (!logData.result) continue;
          const decodedLogs = new TextDecoder().decode(logData.result).trim().split("\n");
          const parsedLogs = decodedLogs.map((line) => JSON.parse(line));
          allLogs.push(...parsedLogs);
        } catch (error) {
          elizaLogger2.error(`Error retrieving log file ${logFile}: ${error.message}`);
        }
      }
      allLogs.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        return 0;
      });
      elizaLogger2.info(
        `Successfully retrieved and ordered ${allLogs.length} chain-of-thought logs.`
      );
      return allLogs;
    } catch (error) {
      elizaLogger2.error(`Error retrieving ordered chain-of-thought logs: ${error.message}`);
      throw error;
    }
  }
  /**
   * Starts the periodic log syncing.
   * @param intervalMs The interval in milliseconds for syncing logs.
   * @param batchSizeKB The maximum size of each batch in kilobytes.
   */
  startPeriodicSync(intervalMs = 2 * 60 * 1e3, batchSizeKB = 4) {
    if (this.syncInterval) {
      elizaLogger2.warn("Log sync is already running.");
      return;
    }
    elizaLogger2.info("Starting periodic log sync...");
    this.syncInterval = setInterval(async () => {
      try {
        await this.syncLogsToRecall(this.alias, batchSizeKB);
      } catch (error) {
        elizaLogger2.error(`Periodic log sync failed: ${error.message}`);
      }
    }, intervalMs);
    this.syncLogsToRecall(this.alias, batchSizeKB).catch(
      (error) => elizaLogger2.error(`Initial log sync failed: ${error.message}`)
    );
  }
  /**
   * Stops the periodic log syncing.
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = void 0;
      elizaLogger2.info("Stopped periodic log syncing.");
    }
  }
};

// src/actions/buy-credit.ts
import {
  elizaLogger as elizaLogger3
} from "@elizaos/core";
var keywords = ["buy", "credit", "credits", "purchase", "add credit", "add credits"];
var buyCreditAction = {
  name: "BUY_CREDIT",
  similes: [
    "BUY_CREDIT",
    "buy credit",
    "buy credits",
    "purchase credit",
    "purchase credits",
    "add credit",
    "add credits",
    "ADD_CREDIT",
    "RELOAD_CREDIT",
    "PURCHASE_CREDIT",
    "BUY RECALL CREDITS",
    "GET MORE CREDITS",
    "RECHARGE ACCOUNT"
  ],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    const amountMatch = text.match(/([\d.]+)/);
    if (!amountMatch) {
      return false;
    }
    const amount = parseFloat(amountMatch[1]);
    if (isNaN(amount) || amount <= 0) {
      return false;
    }
    if (!keywords.some((keyword) => text.includes(keyword))) {
      elizaLogger3.error("BUY_CREDIT failed: No valid keyword found in message.");
      return false;
    }
    elizaLogger3.info(`BUY_CREDIT Validation Passed! Amount: ${amount}`);
    return true;
  },
  description: "Buys Recall credits for the agent's wallet",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger3.info(`BUY_CREDIT Handler: ${message.content.text}`);
      const amountMatch = message.content.text.trim().match(/([\d.]+)/);
      if (!amountMatch) {
        text = "\u274C Invalid credit request. Please specify an amount.";
        elizaLogger3.error("BUY_CREDIT failed: No amount provided.");
      } else {
        const amount = parseFloat(amountMatch[1]);
        if (isNaN(amount) || amount <= 0) {
          text = "\u274C Invalid credit amount. Please enter a number greater than 0.";
          elizaLogger3.error("BUY_CREDIT failed: Invalid amount.");
        } else {
          elizaLogger3.info(`Attempting to purchase ${amount} credits...`);
          const result = await recallService.buyCredit(amount.toString());
          if (result?.meta?.tx) {
            text = `\u2705 Successfully purchased ${amount} Recall credits! Transaction hash: ${result.meta.tx.transactionHash}`;
            elizaLogger3.info(
              `BUY_CREDIT success: ${amount} credits added. TX: ${result.meta.tx.transactionHash}`
            );
          } else {
            text = "\u274C Credit purchase failed. Please try again later.";
            elizaLogger3.error("BUY_CREDIT failed: Transaction unsuccessful");
          }
        }
      }
    } catch (error) {
      text = "\u26A0\uFE0F An error occurred while purchasing credits. Please try again later.";
      elizaLogger3.error(`BUY_CREDIT error: ${error.message}`);
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "BUY_CREDIT",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({
      text
    });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Please buy 0.1 credits for my account" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u2705 Successfully purchased 0.1 Recall credits! Transaction hash: 0x...",
          action: "BUY_CREDIT"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Please buy 1.5 credits for my account" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u2705 Successfully bought 1.5 Recall credits! Transaction hash: 0x...",
          action: "BUY_CREDIT"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Please add 3 credits to my account" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u2705 Successfully added 3 Recall credits to your account! Transaction hash: 0x...",
          action: "BUY_CREDIT"
        }
      }
    ]
  ]
};

// src/actions/get-balance.ts
import {
  elizaLogger as elizaLogger4
} from "@elizaos/core";
var balanceKeywords = [
  "balance",
  "credit balance",
  "account balance",
  "how many credits",
  "check my credits",
  "my available credits",
  "how much credit",
  "how much do I have",
  "do I have credits"
];
var getCreditBalanceAction = {
  name: "GET_CREDIT_BALANCE",
  similes: [
    "GET_CREDIT_BALANCE",
    "CHECK_CREDIT",
    "ACCOUNT_CREDIT_BALANCE",
    "CREDIT_BALANCE",
    "BALANCE_CHECK",
    "AVAILABLE_CREDITS"
  ],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    if (!balanceKeywords.some((keyword) => text.includes(keyword))) {
      return false;
    }
    const amountMatch = text.match(/([\d.]+)/);
    if (amountMatch) {
      elizaLogger4.error(
        "GET_CREDIT_BALANCE validation failed: Message contains numeric values (possible buy request)."
      );
      return false;
    }
    elizaLogger4.info("GET_CREDIT_BALANCE Validation Passed!");
    return true;
  },
  description: "Checks the user's Recall credit balance",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger4.info("Fetching credit balance...");
      const balanceInfo = await recallService.getCreditInfo();
      if (balanceInfo?.creditFree !== void 0) {
        const balance = balanceInfo.creditFree.toString();
        elizaLogger4.info(`Credit Balance Retrieved: ${balance}`);
        text = `\u{1F4B0} Your current Recall credit balance is **${balance} credits**.`;
      } else {
        elizaLogger4.error("GET_CREDIT_BALANCE failed: No balance info received.");
        text = "\u26A0\uFE0F Unable to retrieve your credit balance. Please try again later.";
      }
    } catch (error) {
      elizaLogger4.error(`GET_CREDIT_BALANCE error: ${error.message}`);
      text = "\u26A0\uFE0F An error occurred while fetching your credit balance. Please try again later.";
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "GET_CREDIT_BALANCE",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({
      text
    });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "What is my account credit balance?" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4B0} Your current Recall credit balance is **X credits**.",
          action: "GET_CREDIT_BALANCE"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "How many credits are in my account?" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4B0} Your current Recall credit balance is **X credits**.",
          action: "GET_CREDIT_BALANCE"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Can you check my available credits?" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4B0} Your current Recall credit balance is **X credits**.",
          action: "GET_CREDIT_BALANCE"
        }
      }
    ]
  ]
};

// src/actions/get-account.ts
import {
  elizaLogger as elizaLogger5
} from "@elizaos/core";
var accountInfoKeywords = [
  "account data",
  "account info",
  "check my account",
  "get my account",
  "account details",
  "retrieve account",
  "what's my account"
];
var getAccountInfoAction = {
  name: "GET_ACCOUNT_INFO",
  similes: [
    "GET_ACCOUNT_INFO",
    "CHECK_ACCOUNT",
    "ACCOUNT_INFORMATION",
    "ACCOUNT_DETAILS",
    "RETRIEVE_ACCOUNT_INFO"
  ],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    if (!accountInfoKeywords.some((keyword) => text.includes(keyword))) {
      return false;
    }
    elizaLogger5.info("GET_ACCOUNT_INFO Validation Passed!");
    return true;
  },
  description: "Retrieves the user's Recall account information.",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger5.info("Fetching account information...");
      const accountInfo = await recallService.getAccountInfo();
      if (accountInfo) {
        const { address, nonce, balance, parentBalance } = accountInfo;
        const formattedBalance = balance !== void 0 ? `${balance.toString()} credits` : "Unknown";
        const formattedParentBalance = parentBalance !== void 0 ? `${parentBalance.toString()} credits` : "N/A";
        elizaLogger5.info(
          `Account Info Retrieved: Address: ${address}, Balance: ${formattedBalance}`
        );
        text = `\u{1F4DC} **Your Recall Account Information:**

\u{1F539} **Address:** ${address}
\u{1F539} **Nonce:** ${nonce}
\u{1F539} **Balance:** ${formattedBalance}
\u{1F539} **Parent Balance:** ${formattedParentBalance}`;
      } else {
        elizaLogger5.error("GET_ACCOUNT_INFO failed: No account info received.");
        text = "\u26A0\uFE0F Unable to retrieve your account information. Please try again later.";
      }
    } catch (error) {
      elizaLogger5.error(`GET_ACCOUNT_INFO error: ${error.message}`);
      text = "\u26A0\uFE0F An error occurred while fetching your account information. Please try again later.";
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "GET_ACCOUNT_INFO",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({
      text
    });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Check my account data" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4DC} **Your Recall Account Information:**\n\u{1F539} **Address:** 0x123...456\n\u{1F539} **Nonce:** 5\n\u{1F539} **Balance:** 100 credits\n\u{1F539} **Parent Balance:** 500 credits",
          action: "GET_ACCOUNT_INFO"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Get my account information" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4DC} **Your Recall Account Information:**\n\u{1F539} **Address:** 0xABC...DEF\n\u{1F539} **Nonce:** 3\n\u{1F539} **Balance:** 200 credits\n\u{1F539} **Parent Balance:** N/A",
          action: "GET_ACCOUNT_INFO"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Retrieve my account details" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4DC} **Your Recall Account Information:**\n\u{1F539} **Address:** 0x789...XYZ\n\u{1F539} **Nonce:** 2\n\u{1F539} **Balance:** 50 credits\n\u{1F539} **Parent Balance:** 300 credits",
          action: "GET_ACCOUNT_INFO"
        }
      }
    ]
  ]
};

// src/actions/list-buckets.ts
import {
  elizaLogger as elizaLogger6
} from "@elizaos/core";
var bucketKeywords = [
  "list buckets",
  "get my buckets",
  "retrieve my buckets",
  "show my buckets",
  "fetch my buckets",
  "available buckets"
];
var listBucketsAction = {
  name: "LIST_BUCKETS",
  similes: ["LIST_BUCKETS", "GET_BUCKETS", "SHOW_BUCKETS", "FETCH_BUCKETS", "AVAILABLE_BUCKETS"],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    if (!bucketKeywords.some((keyword) => text.includes(keyword))) {
      return false;
    }
    elizaLogger6.info("LIST_BUCKETS Validation Passed!");
    return true;
  },
  description: "Retrieves and lists all available Recall buckets.",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger6.info("Fetching bucket list...");
      const bucketList = await recallService.listBuckets();
      if (bucketList && bucketList.length > 0) {
        const bucketDetails = bucketList.map((bucket) => `\u{1F539} **${bucket.kind}** (Address: ${bucket.addr})`).join("\n");
        text = `\u{1F4C2} **Your Recall Buckets:**

${bucketDetails}`;
        elizaLogger6.info(`LIST_BUCKETS success: Retrieved ${bucketList.length} buckets.`);
      } else {
        text = "\u{1F4C2} You currently have no Recall buckets.";
        elizaLogger6.info("LIST_BUCKETS success: No buckets found.");
      }
    } catch (error) {
      text = "\u26A0\uFE0F An error occurred while retrieving your buckets. Please try again later.";
      elizaLogger6.error(`LIST_BUCKETS error: ${error.message}`);
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "LIST_BUCKETS",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({ text });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Get a list of my buckets" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4C2} **Your Recall Buckets:**\n\u{1F539} **Bucket Type 1** (Address: 0x123...456)\n\u{1F539} **Bucket Type 2** (Address: 0x789...ABC)",
          action: "LIST_BUCKETS"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Show me my buckets" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4C2} **Your Recall Buckets:**\n\u{1F539} **Data Storage** (Address: 0xDEF...789)\n\u{1F539} **AI Memory** (Address: 0x123...ABC)",
          action: "LIST_BUCKETS"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Do I have any buckets?" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "\u{1F4C2} You currently have no Recall buckets.",
          action: "LIST_BUCKETS"
        }
      }
    ]
  ]
};

// src/actions/create-bucket.ts
import {
  elizaLogger as elizaLogger7
} from "@elizaos/core";
var createBucketKeywords = [
  "create a bucket",
  "make a bucket",
  "new bucket",
  "generate a bucket",
  "add a bucket"
];
var createBucketAction = {
  name: "CREATE_BUCKET",
  similes: ["CREATE_BUCKET", "MAKE_BUCKET", "NEW_BUCKET", "GENERATE_BUCKET", "ADD_BUCKET"],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    if (!createBucketKeywords.some((keyword) => text.includes(keyword))) {
      return false;
    }
    const aliasMatch = message.content.text.match(/["']([^"']+)["']/);
    if (!aliasMatch || !aliasMatch[1]) {
      elizaLogger7.error("CREATE_BUCKET validation failed: No alias detected in quotes.");
      return false;
    }
    elizaLogger7.info(`CREATE_BUCKET Validation Passed! Alias: ${aliasMatch[1]}`);
    return true;
  },
  description: "Creates a new Recall bucket with a given alias.",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger7.info(`CREATE_BUCKET Handler triggered: ${message.content.text}`);
      const aliasMatch = message.content.text.match(/["']([^"']+)["']/);
      if (!aliasMatch || !aliasMatch[1]) {
        text = "\u274C Invalid bucket request. Please specify an alias in quotes.";
        elizaLogger7.error("CREATE_BUCKET failed: No alias found.");
      } else {
        const bucketAlias = aliasMatch[1].trim();
        elizaLogger7.info(`Creating bucket with alias: ${bucketAlias}`);
        const bucketAddress = await recallService.getOrCreateBucket(bucketAlias);
        if (bucketAddress) {
          text = `\u2705 Successfully created or retrieved bucket **"${bucketAlias}"** at address: **${bucketAddress}**`;
          elizaLogger7.info(
            `CREATE_BUCKET success: Bucket "${bucketAlias}" created at ${bucketAddress}`
          );
        } else {
          text = "\u274C Bucket creation failed. Please try again later.";
          elizaLogger7.error("CREATE_BUCKET failed: No response from RecallService.");
        }
      }
    } catch (error) {
      text = "\u26A0\uFE0F An error occurred while creating your bucket. Please try again later.";
      elizaLogger7.error(`CREATE_BUCKET error: ${error.message}`);
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "CREATE_BUCKET",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({ text });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: 'Create a bucket for me named "new-bucket"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully created or retrieved bucket **"new-bucket"** at address: **0x123...456**',
          action: "CREATE_BUCKET"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Make a bucket for me with the alias 'backup-data'" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully created or retrieved bucket **"backup-data"** at address: **0xDEF...789**',
          action: "CREATE_BUCKET"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Generate a new bucket called 'logs'" }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully created or retrieved bucket **"logs"** at address: **0xAAA...BBB**',
          action: "CREATE_BUCKET"
        }
      }
    ]
  ]
};

// src/actions/add-object.ts
import {
  elizaLogger as elizaLogger8
} from "@elizaos/core";
import * as fs from "fs";
import * as path from "path";
var addObjectKeywords = ["add object", "store object", "upload object", "save object"];
var addObjectAction = {
  name: "ADD_OBJECT",
  similes: ["ADD_OBJECT", "STORE_OBJECT", "UPLOAD_OBJECT", "SAVE_OBJECT", "ADD_TO_BUCKET"],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    if (!addObjectKeywords.some((keyword) => text.includes(keyword))) {
      return false;
    }
    const matches = message.content.text.match(/"([^"]+)"\s+.*?"([^"]+)"/);
    if (!matches || matches.length < 3) {
      elizaLogger8.error(
        "ADD_OBJECT validation failed: No valid object path and bucket alias detected."
      );
      return false;
    }
    elizaLogger8.info(
      `ADD_OBJECT Validation Passed! Object: ${matches[1]}, Bucket Alias: ${matches[2]}`
    );
    return true;
  },
  description: "Adds an object to a specified Recall bucket.",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger8.info(`ADD_OBJECT Handler triggered: ${message.content.text}`);
      const matches = message.content.text.match(/"([^"]+)"\s+.*?"([^"]+)"/);
      if (!matches || matches.length < 3) {
        text = "\u274C Invalid request. Please specify both the object file and the bucket alias in double quotes.";
        elizaLogger8.error("ADD_OBJECT failed: Missing object or bucket alias.");
      } else {
        const objectPath = matches[1].trim();
        const bucketAlias = matches[2].trim();
        elizaLogger8.info(`Looking up bucket for alias: ${bucketAlias}`);
        const bucketAddress = await recallService.getOrCreateBucket(bucketAlias);
        if (!bucketAddress) {
          text = `\u274C Failed to find or create bucket with alias "${bucketAlias}".`;
          elizaLogger8.error(`ADD_OBJECT failed: No bucket found for alias "${bucketAlias}".`);
        } else {
          elizaLogger8.info(`Found bucket ${bucketAddress} for alias "${bucketAlias}".`);
          const filePath = path.resolve(process.cwd(), objectPath);
          if (!fs.existsSync(filePath)) {
            text = `\u274C Object file not found: ${objectPath}`;
            elizaLogger8.error(`ADD_OBJECT failed: File "${filePath}" does not exist.`);
          } else {
            const fileData = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            elizaLogger8.info(`Uploading object "${fileName}" to bucket "${bucketAlias}"...`);
            const result = await recallService.addObject(
              bucketAddress,
              fileName,
              fileData
            );
            if (result?.meta?.tx) {
              text = `\u2705 Successfully added object **"${fileName}"** to bucket **"${bucketAlias}"**. Transaction hash: ${result.meta.tx.transactionHash}`;
              elizaLogger8.info(
                `ADD_OBJECT success: "${fileName}" added to bucket "${bucketAlias}". TX: ${result.meta.tx.transactionHash}`
              );
            } else {
              text = "\u274C Failed to add object to the bucket. Please try again later.";
              elizaLogger8.error("ADD_OBJECT failed: Transaction unsuccessful");
            }
          }
        }
      }
    } catch (error) {
      text = "\u26A0\uFE0F An error occurred while adding the object. Please try again later.";
      elizaLogger8.error(`ADD_OBJECT error: ${error.message}`);
      if (error.cause) {
        elizaLogger8.error(`ADD_OBJECT error cause: ${error.cause.message}`);
      }
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "ADD_OBJECT",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({ text });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: 'Add object "./object.txt" to "my-bucket"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully added object **"object.txt"** to bucket **"my-bucket"**. Transaction hash: 0x...',
          action: "ADD_OBJECT"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: 'Store object "./data.json" in "backup"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully added object **"data.json"** to bucket **"backup"**. Transaction hash: 0x...',
          action: "ADD_OBJECT"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: 'Upload "./logs.txt" into "logs"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully added object **"logs.txt"** to bucket **"logs"**. Transaction hash: 0x...',
          action: "ADD_OBJECT"
        }
      }
    ]
  ]
};

// src/actions/get-object.ts
import {
  elizaLogger as elizaLogger9
} from "@elizaos/core";
import * as fs2 from "fs";
import * as path2 from "path";
var getObjectKeywords = ["get object", "retrieve object", "fetch object", "download object"];
var getObjectAction = {
  name: "GET_OBJECT",
  similes: ["GET_OBJECT", "RETRIEVE_OBJECT", "FETCH_OBJECT", "DOWNLOAD_OBJECT", "GET_FROM_BUCKET"],
  validate: async (_runtime, message) => {
    const text = message.content.text.toLowerCase();
    if (!getObjectKeywords.some((keyword) => text.includes(keyword))) {
      return false;
    }
    const matches = message.content.text.match(/"([^"]+)"\s+from bucket\s+"([^"]+)"/);
    if (!matches || matches.length < 3) {
      elizaLogger9.error(
        "GET_OBJECT validation failed: No valid object key and bucket alias detected."
      );
      return false;
    }
    elizaLogger9.info(
      `GET_OBJECT Validation Passed! Object: ${matches[1]}, Bucket Alias: ${matches[2]}`
    );
    return true;
  },
  description: "Retrieves an object from a specified Recall bucket.",
  handler: async (runtime, message, state, _options, callback) => {
    const recallService = runtime.services.get("recall");
    let text = "";
    try {
      let currentState = state;
      if (!currentState) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(currentState);
      }
      elizaLogger9.info(`GET_OBJECT Handler triggered: ${message.content.text}`);
      const matches = message.content.text.match(/"([^"]+)"\s+from bucket\s+"([^"]+)"/);
      if (!matches || matches.length < 3) {
        text = "\u274C Invalid request. Please specify both the object key and the bucket alias in double quotes.";
        elizaLogger9.error("GET_OBJECT failed: Missing object key or bucket alias.");
      } else {
        const objectKey = matches[1].trim();
        const bucketAlias = matches[2].trim();
        elizaLogger9.info(`Looking up bucket for alias: ${bucketAlias}`);
        const bucketAddress = await recallService.getOrCreateBucket(bucketAlias);
        if (!bucketAddress) {
          text = `\u274C Failed to find or create bucket with alias "${bucketAlias}".`;
          elizaLogger9.error(`GET_OBJECT failed: No bucket found for alias "${bucketAlias}".`);
        } else {
          elizaLogger9.info(`Found bucket ${bucketAddress} for alias "${bucketAlias}".`);
          const downloadsDir = path2.resolve(process.cwd(), "downloads");
          if (!fs2.existsSync(downloadsDir)) {
            fs2.mkdirSync(downloadsDir, { recursive: true });
          }
          const objectData = await recallService.getObject(bucketAddress, objectKey);
          if (objectData) {
            const filePath = path2.join(downloadsDir, objectKey);
            fs2.writeFileSync(filePath, Buffer.from(objectData));
            text = `\u2705 Successfully retrieved object **"${objectKey}"** from bucket **"${bucketAlias}"**.
\u{1F4C2} File saved at: \`${filePath}\``;
            elizaLogger9.info(
              `GET_OBJECT success: "${objectKey}" retrieved and saved to "${filePath}".`
            );
          } else {
            text = `\u274C Object **"${objectKey}"** not found in bucket **"${bucketAlias}"**.`;
            elizaLogger9.error(`GET_OBJECT failed: Object "${objectKey}" not found.`);
          }
        }
      }
    } catch (error) {
      text = "\u26A0\uFE0F An error occurred while retrieving the object. Please try again later.";
      elizaLogger9.error(`GET_OBJECT error: ${error.message}`);
    }
    const newMemory = {
      ...message,
      userId: message.agentId,
      content: {
        text,
        action: "GET_OBJECT",
        source: message.content.source
      }
    };
    await runtime.messageManager.createMemory(newMemory);
    await callback?.({ text });
    return true;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: 'Get object "object.txt" from bucket "my-bucket"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully retrieved object **"object.txt"** from bucket **"my-bucket"**.\n\u{1F4C2} File saved at: `/path/to/object.txt`',
          action: "GET_OBJECT"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: 'Retrieve object "data.json" from bucket "backup"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully retrieved object **"data.json"** from bucket **"backup"**.\n\u{1F4C2} File saved at: `/path/to/data.json`',
          action: "GET_OBJECT"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: 'Fetch object "logs.txt" from bucket "logs"' }
      },
      {
        user: "{{agentName}}",
        content: {
          text: '\u2705 Successfully retrieved object **"logs.txt"** from bucket **"logs"**.\n\u{1F4C2} File saved at: `/path/to/logs.txt`',
          action: "GET_OBJECT"
        }
      }
    ]
  ]
};

// src/providers/cot.ts
import {
  elizaLogger as elizaLogger10,
  ModelClass,
  composeContext,
  generateText
} from "@elizaos/core";
var systemPrompt = `You are an AI assistant helping with a conversation.
Before answering, please explicitly write out your step-by-step reasoning process starting with "REASONING:" and ending with "ANSWER:".
Always include both sections, even for simple questions.`;
var messageHandlerTemplate = `# Action Examples
{{actionExamples}}
(Action examples are for reference only. Do not use the information from them in your response.)

# Knowledge
{{knowledge}}

# Task: Generate a detailed response and actions for the character {{agentName}}.
About {{agentName}}:
{{bio}}
{{lore}}

{{providers}}

{{attachments}}

# Capabilities
Note that {{agentName}} is capable of reading/seeing/hearing various forms of media, including images, videos, audio, plaintext and PDFs. Recent attachments have been included above under the "Attachments" section.

{{messageDirections}}

{{recentMessages}}

{{actions}}

# Instructions: Think step-by-step before responding.

Please follow these steps in your reasoning:
1. Identify the key elements in the conversation, including any knowledge and recent messages.
2. Break down the problem into smaller logical steps.
3. Analyze the relevant details, context, and past interactions.
4. Formulate a preliminary response that addresses the requirements.
5. If the user's message aligns with any actions you can take, consider which is most appropriate.

## Formatting Requirements

Your response MUST have two parts:

REASONING:
(Write your step-by-step analysis here)

ANSWER:
(Provide your final answer in the JSON format below)

# Response format should be formatted in a valid JSON block like this:
\`\`\`json
{ "user": "{{agentName}}", "text": "<string>", "action": "<string>" }
\`\`\`

The "action" field should be one of the options in [Available Actions] and the "text" field should be the response you want to send.
`;
function extractChainOfThought(text) {
  const reasoningMatch = text.match(/REASONING:\s*([\s\S]*?)(?=ANSWER:|$)/i);
  if (reasoningMatch && reasoningMatch[1]) {
    const reasoning = reasoningMatch[1].trim();
    if (reasoning.length > 0) {
      elizaLogger10.info(`[extractChainOfThought] Successfully extracted REASONING section`);
      return reasoning;
    }
  }
  const answerMatch = text.match(/ANSWER:/i);
  if (answerMatch) {
    const answerIndex = text.indexOf(answerMatch[0]);
    if (answerIndex > 20) {
      const beforeAnswer = text.substring(0, answerIndex).trim();
      elizaLogger10.info(`[extractChainOfThought] Extracted everything before ANSWER marker`);
      return beforeAnswer;
    }
  }
  const jsonMatch = text.match(/```json/i);
  if (jsonMatch) {
    const jsonIndex = text.indexOf(jsonMatch[0]);
    if (jsonIndex > 20) {
      const beforeJson = text.substring(0, jsonIndex).trim();
      elizaLogger10.info(`[extractChainOfThought] Extracted text before JSON formatting`);
      return beforeJson;
    }
  }
  elizaLogger10.warn(`[extractChainOfThought] Could not extract chain of thought with any pattern`);
  if (text.length > 500) {
    const firstPortion = text.substring(0, Math.floor(text.length * 0.4));
    elizaLogger10.info(`[extractChainOfThought] Using first 40% of response as fallback`);
    return `[Auto-extracted] ${firstPortion}`;
  }
  return "[Could not extract chain of thought]";
}
var cotProvider = {
  get: async (runtime, message, _state) => {
    const logPrefix = `[CoT Provider]`;
    elizaLogger10.info(`${logPrefix} Starting chain-of-thought generation`);
    try {
      let state = _state;
      if (!state) {
        state = await runtime.composeState(message);
      } else {
        state = await runtime.updateRecentMessageState(state);
      }
      runtime.character.system = systemPrompt;
      state.actions = `# Actions 
${JSON.stringify(runtime.actions)}`;
      const context = composeContext({
        state,
        template: messageHandlerTemplate
      });
      elizaLogger10.info(`${logPrefix} Generating text with LLM model`);
      const gen = await generateText({
        runtime,
        context,
        modelClass: ModelClass.LARGE
      });
      elizaLogger10.info(`${logPrefix} Text generation complete`);
      const previewLength = Math.min(gen.length, 500);
      elizaLogger10.info(`${logPrefix} Response preview: ${gen.substring(0, previewLength)}...`);
      let chainOfThoughtText = extractChainOfThought(gen);
      const userMessageText = message.content && typeof message.content === "object" && message.content.text ? message.content.text : typeof message.content === "string" ? message.content : "";
      const logData = {
        userId: message.userId,
        agentId: message.agentId,
        userMessage: userMessageText,
        log: chainOfThoughtText,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      try {
        const dbAdapter = runtime.databaseAdapter;
        if ("pool" in dbAdapter) {
          elizaLogger10.info(`${logPrefix} Using PostgreSQL to log chain-of-thought`);
          await logMemoryPostgres(dbAdapter.pool, {
            userId: message.userId,
            agentId: message.agentId,
            roomId: message.roomId,
            type: "chain-of-thought",
            body: JSON.stringify(logData)
          });
          elizaLogger10.info(`${logPrefix} Successfully logged chain-of-thought to PostgreSQL`);
        } else if ("db" in dbAdapter) {
          elizaLogger10.info(`${logPrefix} Using SQLite to log chain-of-thought`);
          await logMemorySqlite(dbAdapter.db, {
            userId: message.userId,
            agentId: message.agentId,
            roomId: message.roomId,
            type: "chain-of-thought",
            body: JSON.stringify(logData)
          });
          elizaLogger10.info(`${logPrefix} Successfully logged chain-of-thought to SQLite`);
        } else {
          elizaLogger10.error(`${logPrefix} Unsupported database adapter type`);
        }
      } catch (dbError) {
        elizaLogger10.error(`${logPrefix} Database error while saving CoT log: ${dbError.message}`);
        elizaLogger10.error(`${logPrefix} Error details:`, dbError);
      }
      elizaLogger10.info(`${logPrefix} Chain-of-thought processing complete`);
      return chainOfThoughtText || "";
    } catch (error) {
      elizaLogger10.error(`${logPrefix} Error in chain-of-thought provider:`);
      elizaLogger10.error(`${logPrefix} ${error instanceof Error ? error.stack : "Unknown error"}`);
      return "";
    }
  }
};

// src/index.ts
var recallStoragePlugin = {
  name: "Recall Storage Plugin",
  description: "Provides basic Recall storage functionality",
  actions: [
    buyCreditAction,
    getCreditBalanceAction,
    getAccountInfoAction,
    listBucketsAction,
    addObjectAction,
    getObjectAction,
    createBucketAction
  ],
  providers: [cotProvider],
  services: [RecallService.getInstance()]
};
var index_default = recallStoragePlugin;
export {
  index_default as default,
  recallStoragePlugin
};
//# sourceMappingURL=index.js.map