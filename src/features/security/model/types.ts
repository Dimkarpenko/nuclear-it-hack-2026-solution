export interface DeviceIdentity {
  deviceId: string;
  displayName: string;
  publicKey: string;
  privateKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface PairingInvitePayload {
  version: 1;
  deviceId: string;
  displayName: string;
  publicKey: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  challenge: string;
}

export interface PairingInvite {
  token: string;
  codePhrase: string;
  fingerprint: string;
  expiresAt: number;
  payload: PairingInvitePayload;
}

export interface PairingAcceptance {
  peerId: string;
  displayName: string;
  publicKey: string;
  fingerprint: string;
}
