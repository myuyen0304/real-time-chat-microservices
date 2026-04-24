const callTimeouts = new Map<string, NodeJS.Timeout>();

export const setCallRingTimeout = (callId: string, timeout: NodeJS.Timeout) => {
  callTimeouts.set(callId, timeout);
};

export const clearCallRingTimeout = (callId: string) => {
  const timeout = callTimeouts.get(callId);

  if (timeout) {
    clearTimeout(timeout);
    callTimeouts.delete(callId);
  }
};
