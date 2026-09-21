// Lets a blocking "please wait / Cancel" dialog abort whichever write request is in flight.
let activeSignal: AbortSignal | null = null;

export function setMutationSignal(signal: AbortSignal | null) {
  activeSignal = signal;
}

export function getMutationSignal() {
  return activeSignal;
}
