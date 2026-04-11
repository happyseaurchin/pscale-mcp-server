/**
 * handler-map.ts — Dispatch map from tool names to handler functions.
 *
 * The kernel uses this to wire reef tool definitions to existing handlers.
 * Adapters reshape reef-shaped args into the handler's expected shape
 * where the reef schema differs from the handler signature.
 */

import { handleCreateBlock, handleWrite, handleWalk } from './block-ops.js';
import { handleRemember, handleRecall, handleConcern } from './memory-ops.js';
import { handlePassportPublish, handlePassportRead } from './identity-ops.js';
import { handleBeachMark, handleBeachRead, handleInboxSend, handleInboxCheck } from './discovery-ops.js';
import { handleInvite } from './invite-ops.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler = (args: any) => Promise<any>;

export const HANDLER_MAP: Record<string, ToolHandler> = {
  pscale_create_block: handleCreateBlock,
  pscale_write: handleWrite,
  pscale_walk: handleWalk,
  pscale_remember: handleRemember,
  pscale_recall: handleRecall,
  pscale_concern: handleConcern,
  pscale_passport_publish: handlePassportPublish,
  pscale_passport_read: handlePassportRead,
  pscale_beach_mark: handleBeachMark,
  pscale_beach_read: handleBeachRead,
  pscale_inbox_send: handleInboxSend,
  pscale_inbox_check: handleInboxCheck,
  pscale_invite: handleInvite,
};

/**
 * Adapters for tools where the reef schema shape differs from the handler signature.
 * The adapter transforms reef-shaped args into what the handler expects.
 */
export const ADAPTERS: Record<string, (args: Record<string, any>) => Record<string, any>> = {
  // Reef defines inbox_send with `message` as a single object.
  // Handler expects flat params: message_type, spindle, content, responding_to.
  pscale_inbox_send: (args) => {
    const msg = typeof args.message === 'object' && args.message !== null
      ? args.message
      : {};
    return {
      from_agent: args.from_agent,
      to_agent: args.to_agent,
      message_type: msg.type || msg.message_type || 'general',
      spindle: msg.spindle,
      content: msg.content != null ? (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)) : undefined,
      responding_to: msg.responding_to,
    };
  },
};
