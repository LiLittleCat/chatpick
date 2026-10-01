import type { createNavigationMotion } from './lib/navigation-motion';
import type { WebChatAdapter } from './lib/web-chat-adapters';

export function startNavigator(motion?: ReturnType<typeof createNavigationMotion>, adapter?: WebChatAdapter | null): void;
