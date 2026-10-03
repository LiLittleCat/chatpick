import type { createNavigationMotion } from './lib/navigation-motion';
import type { attachConversationExport } from './lib/conversation-export';
import type { WebChatAdapter } from './lib/web-chat-adapters';
import type { NavigatorSettings } from './settings';

export function startNavigator(motion?: ReturnType<typeof createNavigationMotion>, adapter?: WebChatAdapter | null, exporter?: typeof attachConversationExport, initialSettings?: Partial<Omit<NavigatorSettings, 'disabledSites'>> & { enabled?: boolean }): void;
