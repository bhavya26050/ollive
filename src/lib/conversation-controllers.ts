const conversationControllers = new Map<string, AbortController>();

export function getConversationAbortController(conversationId: string) {
  const existingController = conversationControllers.get(conversationId);

  if (existingController && !existingController.signal.aborted) {
    return existingController;
  }

  const controller = new AbortController();
  const currentController = conversationControllers.get(conversationId);

  if (currentController && !currentController.signal.aborted) {
    return currentController;
  }

  conversationControllers.set(conversationId, controller);
  return controller;
}

export function abortConversationRequest(conversationId: string) {
  const controller = conversationControllers.get(conversationId);

  if (!controller) {
    return false;
  }

  controller.abort();
  conversationControllers.delete(conversationId);
  return true;
}

export function clearConversationAbortController(conversationId: string, controller: AbortController) {
  const currentController = conversationControllers.get(conversationId);

  if (currentController === controller) {
    conversationControllers.delete(conversationId);
  }
}