export function mppCallReserveReference(
  threadId: string,
  callId: string,
  tick: number,
) {
  return `mpp-call:${threadId}:${callId}:reserve:${tick}`;
}

export function mppCallSettleReference(threadId: string, callId: string) {
  return `mpp-call:${threadId}:${callId}:settle`;
}

export function mppCallReserveReferenceLike(threadId: string, callId: string) {
  return `${mppCallReserveReference(threadId, callId, 0).replace(/:0$/, "")}:%`;
}
