import {
  DEFAULT_TICKET_CONFIG,
  getTicketConfig,
  initTicketConfig,
  type TicketCategoryKind,
} from "./ticket-config";

export type { TicketCategoryKind } from "./ticket-config";

/**
 * Ticket category IDs are shared by Oracle routing and every automated poster.
 * Keeping them in one module prevents a configured ticket channel from also
 * becoming a chest, event, boss, or trader destination.
 */
export const ORACLE_TICKET_CATEGORY_IDS: Record<TicketCategoryKind, string> = {
  ...DEFAULT_TICKET_CONFIG.categories,
};

export { initTicketConfig };

export function isTicketCategoryParentId(parentId: string | null | undefined, guildId?: string | null): boolean {
  if (!parentId) return false;
  return Object.values(guildId ? getTicketConfig(guildId).categories : ORACLE_TICKET_CATEGORY_IDS).includes(parentId);
}