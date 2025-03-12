import { Plugin } from "@elizaos/core";

import { addObjectAction } from "./actions/add-object.js";
import { buyCreditAction } from "./actions/buy-credit.js";
import { createBucketAction } from "./actions/create-bucket.js";
import { getAccountInfoAction } from "./actions/get-account.js";
import { getCreditBalanceAction } from "./actions/get-balance.js";
import { getObjectAction } from "./actions/get-object.js";
import { listBucketsAction } from "./actions/list-buckets.js";
import { cotProvider } from "./providers/cot.js";
import { RecallService } from "./services/recall.service.js";

export const recallStoragePlugin: Plugin = {
  name: "Recall Storage Plugin",
  description: "Provides basic Recall storage functionality",
  actions: [
    buyCreditAction,
    getCreditBalanceAction,
    getAccountInfoAction,
    listBucketsAction,
    addObjectAction,
    getObjectAction,
    createBucketAction,
  ],
  providers: [cotProvider],
  services: [RecallService.getInstance()],
};

export default recallStoragePlugin;
