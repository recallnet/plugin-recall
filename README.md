# Recall Eliza Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE-APACHE)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg)](https://github.com/RichardLitt/standard-readme)

![Recall Eliza Plugin](./images/banner.jpg)

> Integrate **Recall storage** with Eliza AI agents, providing persistent memory capabilities.

## Table of Contents

- [Background](#background)
  - [Flow of Operations](#flow-of-operations)
  - [Actions](#actions)
  - [Example Triggers](#example-triggers)
  - [Key Implementation Notes](#key-implementation-notes)
  - [Providers](#providers)
    - [How it Works](#how-it-works)
  - [Services](#services)
- [Usage](#usage)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Security Considerations](#security-considerations)
- [Contributing](#contributing)
- [License](#license)

## Background

The Recall `@elizaos-plugins/plugin-recall` package is a drop in Chain-of-Thought and storage plugin for the [Eliza agent framework](https://elizaos.github.io/). It enables:

1. **Chain-of-Thought Logging:** The agent logs reasoning steps into a local database.
2. **Periodic Syncing to Recall:** Logs are periodically uploaded to Recall buckets.
3. **Retrieving Thought Logs for Context:** Before each inference cycle, thought logs are retrieved and injected into the agent's state.
4. **Efficient Storage Management:** The agent can create, list, add, and retrieve objects within Recall buckets.

> [!NOTE]
> This plugin is part of the Eliza framework and can be used as the official `@elizaos-plugins/plugin-recall` plugin. It is not currently published to npm under the `@recallnet` namespace.

### **🔄 Flow of Operations**

- 1️⃣ User requests an action (e.g., "Create a bucket named 'logs'"), or simply sends a query to the agent.
- 2️⃣ The **RecallService** processes the request and interacts with the Recall API if an action has been invoked.
- 3️⃣ Chain-of-thought logs are stored and periodically synced using the modified database structure.
- 4️⃣ The **Recall Provider** fetches chain-of-thought logs before each agent loop.

### 📌 Actions

Actions define how the agent interacts with Recall. Each action is triggered based on user intent.

| **Action**        | **Trigger Format**                                                                                 | **Description**                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Create Bucket** | `"Create a bucket for me named \"bucket-alias\""` `OR` `"Create a bucket called \"bucket-alias\""` | Creates a new Recall bucket (or retrieves an existing one).                                                                                        |
| **List Buckets**  | `"Get a list of my buckets"` `OR` `"Show my Recall buckets"`                                       | Retrieves a list of all available Recall buckets.                                                                                                  |
| **Add Object**    | `"Add object \"file.txt\" to bucket \"bucket-alias\""`                                             | Uploads an object (file, text, data) to a specified bucket. **Object must come first in quotes, followed by bucket name.**                         |
| **Get Object**    | `"Get object \"file.txt\" from bucket \"bucket-alias\""`                                           | Downloads an object from a specified bucket and stores in the /downloads directory. **Object must come first in quotes, followed by bucket name.** |
| **Get Account**   | `"Get my account details"` `OR` `"Retrieve my Recall account"`                                     | Fetches the agent's Recall account information.                                                                                                    |
| **Get Balance**   | `"Check my Recall credit balance"` `OR` `"How many credits do I have?"`                            | Retrieves the agent’s available Recall credits.                                                                                                    |
| **Buy Credit**    | `"Buy 3 credits"` `OR` `"Purchase 0.5 Recall credits"`                                             | Purchases additional credits for storage & usage. **Requires a numerical amount.**                                                                 |

### **🔍 Example Triggers**

> ✅ **"Get object \"data.json\" from bucket \"backup\""**  
> ✅ **"Add object \"newFile.txt\" to bucket \"storage-bucket\""**  
> ✅ **"Create a bucket for me named \"project-logs\""**  
> ✅ **"Buy 2 Recall credits"**  
> ✅ **"How many credits do I have?"**

### **🔄 Key Implementation Notes**

- **Order Matters for Add/Get Object**

  - The **object key must always be first**, followed by `"from bucket"` and then the **bucket alias**.
  - Example: `"Get object \"data.json\" from bucket \"backup\""` ✅
  - Incorrect: `"Get bucket \"backup\" and retrieve object \"data.json\""` ❌

- **Bucket Creation Auto-Validates**

  - If a **bucket with the alias already exists**, the system will **return its existing address** instead of creating a new one.

- **Buy Credit Requires Numbers**
  - `"Buy Recall credits"` → **Invalid** ❌
  - `"Buy 0.2 Recall credits"` → **Valid** ✅

---

### 📌 Providers

Providers inject **external data** into the agent’s **context** before inference. The **Recall Provider** retrieves thought logs before the agent processes user input.

```typescript
export const recallCotProvider: Provider = {
  get: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
  ): Promise<Error | string> => {
    if (!process.env.RECALL_BUCKET_ALIAS) {
      elizaLogger.error("RECALL_BUCKET_ALIAS is not set");
    }
    try {
      const recallService = _runtime.services.get(
        "recall" as ServiceType,
      ) as RecallService;
      const res = await recallService.retrieveOrderedChainOfThoughtLogs(
        process.env.RECALL_BUCKET_ALIAS,
      );
      return JSON.stringify(res, null, 2);
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Unable to get storage provider";
    }
  },
};
```

#### **📌 How it Works**

- **Before every agent inference cycle**, the provider **retrieves past chain-of-thought logs**.
- The logs are **appended to the agent’s context**, improving **long-term memory recall**.
- The **Recall bucket alias** is configurable via `.env`.

---

### 📌 Services

The **RecallService** manages interaction with the **Recall API**, handling:

- **Bucket Management** (`listBuckets()`, `getOrCreateBucket()`)
- **Object Storage & Retrieval** (`addObject()`, `getObject()`)
- **Credit Management** (`getCreditInfo()`, `buyCredit()`)
- **Chain-of-Thought Syncing** (`syncLogsToRecall()`)

```typescript
const recallService = new RecallService();
await recallService.getOrCreateBucket("my-bucket");
await recallService.addObject("my-bucket", "log.txt", "Sample log data");
const retrieved = await recallService.getObject("my-bucket", "log.txt");
```

## Usage

### Installation

To use the plugin, you need to add it to your Eliza OS project:

```bash
pnpm add @elizaos-plugins/plugin-recall
```

### Environment Setup

**Note:** The Recall private key you use for this application must have a positive Recall parent balance.

You must also purchase credits with your parent balance before performing write operations (creating buckets, etc.). You can use the `buyCreditAction` with your agent to have it purchase credits for you.

To receive testnet tokens, use the same public address when requesting tokens from the [Recall Faucet](https://faucet.recall.network/).

```bash
cp .env.example .env
```

Fill in your Recall credentials and configuration.

```dotenv
RECALL_PRIVATE_KEY="your-private-key"
RECALL_BUCKET_ALIAS="your-default-bucket"
RECALL_COT_LOG_PREFIX="cot/"

# Provider configuration, defined in the `characters/eliza.character.json` file
OPENAI_API_KEY="your-api-key"
```

Optionally, you can override the CoT sync period, batch size, and network:

```dotenv
RECALL_SYNC_INTERVAL="120000" # In milliseconds, defaults to 2 minutes
RECALL_BATCH_SIZE="4" # In kilobytes, defaults to 4KB
RECALL_NETWORK="testnet" # Defaults to the Recall testnet
```

### Security Considerations

- Never share your wallet address or private keys

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT OR Apache-2.0, © 2025 Recall Contributors
