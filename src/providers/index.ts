import { IAgentRuntime, Memory, Provider, State, ServiceType, elizaLogger } from '@elizaos/core';
import { RecallService } from '../services/recall.service.js';

export const recallCotProvider: Provider = {
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ): Promise<Error | string> => {
    try {
      const bucketAlias = process.env.RECALL_BUCKET_ALIAS;
      if (!bucketAlias) {
      elizaLogger.error('RECALL_BUCKET_ALIAS is not set');
      throw new Error('RECALL_BUCKET_ALIAS is not set');
    }
      const recallService = runtime.services.get('recall' as ServiceType) as RecallService;
      const res = await recallService.retrieveOrderedChainOfThoughtLogs(bucketAlias);
      return JSON.stringify(res, null, 2);
    } catch (error: any) {
      return error instanceof Error ? error.message : 'Unable to get storage provider';
    }
  },
};
